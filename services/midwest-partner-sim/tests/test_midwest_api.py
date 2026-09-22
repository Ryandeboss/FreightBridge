from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.api.dependencies import get_load_repository
from app.api.routes import readiness
from app.core.config import get_settings
from app.edi.generator_990 import ControlNumbers, Midwest990Source, generate_990
from app.edi import parse_midwest_204
from app.infrastructure import database
from app.main import app
from app.repositories.loads import DuplicateLoadError
from app.repositories.loads import LoadNotFoundError, TenderAlreadyDecidedError


PROJECT_ROOT = Path(__file__).resolve().parents[3]
MIDWEST_204 = (PROJECT_ROOT / 'sample-data' / 'x12' / 'midwest' / '204-valid.edi').read_text(
  encoding='utf-8'
)
MIDWEST_990_ACCEPTED = (PROJECT_ROOT / 'sample-data' / 'x12' / 'midwest' / '990-accepted.edi').read_text(
  encoding='utf-8'
)
MIDWEST_990_REJECTED = (PROJECT_ROOT / 'sample-data' / 'x12' / 'midwest' / '990-rejected.edi').read_text(
  encoding='utf-8'
)


@pytest.fixture(autouse=True)
def clear_state(monkeypatch):
  get_settings.cache_clear()
  monkeypatch.setenv('MIDWEST_API_BEARER_TOKEN', 'test-token')
  monkeypatch.setenv('MIDWEST_API_READONLY_TOKEN', 'read-token')
  app.dependency_overrides.clear()
  yield
  app.dependency_overrides.clear()
  get_settings.cache_clear()


def test_health_returns_service_status() -> None:
  response = TestClient(app).get('/health')

  assert response.status_code == 200
  assert response.json() == {'status': 'ok', 'service': 'midwest-partner-sim'}


def test_readiness_returns_ready(monkeypatch) -> None:
  monkeypatch.setenv('APP_ENV', 'test')
  monkeypatch.setattr(readiness, 'check_database_connectivity', lambda: None)
  monkeypatch.setattr(readiness, 'check_midwest_schema', lambda: None)

  response = TestClient(app).get('/readiness')

  assert response.status_code == 200
  assert response.json()['dependencies'] == {
    'database': 'ok',
    'midwest_schema': 'ok',
  }


def test_missing_and_invalid_tokens_are_rejected() -> None:
  client = TestClient(app)

  missing = client.post('/v1/edi/inbound/204', content=MIDWEST_204)
  invalid = client.post(
    '/v1/edi/inbound/204',
    content=MIDWEST_204,
    headers={'Authorization': 'Bearer wrong'},
  )

  assert missing.status_code == 401
  assert missing.json()['error']['code'] == 'AUTHENTICATION_ERROR'
  assert invalid.status_code == 401
  assert invalid.json()['error']['code'] == 'AUTHENTICATION_ERROR'


def test_valid_204_receipt_extracts_and_persists_load500() -> None:
  repository = FakeRepository()
  app.dependency_overrides[get_load_repository] = lambda: repository

  response = TestClient(app).post(
    '/v1/edi/inbound/204',
    content=MIDWEST_204,
    headers={'Authorization': 'Bearer test-token', 'Content-Type': 'application/edi-x12'},
  )

  assert response.status_code == 202
  body = response.json()
  assert body['status'] == 'ACCEPTED'
  assert body['documentType'] == '204'
  assert body['customerShipmentNumber'] == 'LOAD500'
  assert body['transactionControlNumber'] == '0001'
  assert repository.load.cust_ship_no == 'LOAD500'
  assert repository.load.bol_ref == 'BOL900'
  assert repository.load.po_ref == 'PO111'
  assert repository.load.gross_weight_lb == 42000
  assert repository.load.handling_units == 22
  assert repository.accepted_documents == 1


def test_get_load_returns_midwest_owned_shape() -> None:
  repository = FakeRepository()
  repository.create_load_from_204(parse_midwest_204(MIDWEST_204))
  app.dependency_overrides[get_load_repository] = lambda: repository

  response = TestClient(app).get(
    '/v1/loads/LOAD500',
    headers={'Authorization': 'Bearer test-token'},
  )

  assert response.status_code == 200
  body = response.json()
  assert body['customerShipmentNumber'] == 'LOAD500'
  assert body['bolReference'] == 'BOL900'
  assert body['purchaseOrderReference'] == 'PO111'
  assert body['grossWeightLb'] == '42000'
  assert body['handlingUnits'] == 22
  assert body['shipper']['name'] == 'ABC Factory'
  assert body['consignee']['name'] == 'XYZ Warehouse'
  assert body['tenderStatus'] == 'PENDING'
  assert body['carrierLoadNumber'] is None


def test_990_generator_matches_golden_accepted_and_rejected_fixtures() -> None:
  decided_at = datetime(2026, 9, 19, 14, 45, tzinfo=timezone.utc)
  accepted = generate_990(
    Midwest990Source(
      cust_ship_no='LOAD500',
      bol_ref='BOL900',
      po_ref='PO111',
      decision='ACCEPTED',
      carrier_load_no='MWC900500',
      reason_code=None,
      decided_at=decided_at,
    ),
    ControlNumbers('000000906', '906', '0001'),
  )
  rejected = generate_990(
    Midwest990Source(
      cust_ship_no='LOAD500',
      bol_ref='BOL900',
      po_ref='PO111',
      decision='REJECTED',
      carrier_load_no=None,
      reason_code='NO_CAP',
      decided_at=decided_at,
    ),
    ControlNumbers('000000916', '916', '0001'),
  )

  assert _compact_x12(accepted) == _compact_x12(MIDWEST_990_ACCEPTED)
  assert _compact_x12(rejected) == _compact_x12(MIDWEST_990_REJECTED)


def test_create_accepted_tender_decision_generates_outbound_990() -> None:
  repository = FakeRepository()
  repository.create_load_from_204(parse_midwest_204(MIDWEST_204))
  app.dependency_overrides[get_load_repository] = lambda: repository

  response = TestClient(app).post(
    '/v1/loads/LOAD500/tender-decisions',
    headers={'Authorization': 'Bearer test-token'},
    json={'decision': 'ACCEPTED'},
  )

  assert response.status_code == 200
  body = response.json()
  assert body['customerShipmentNumber'] == 'LOAD500'
  assert body['decision'] == 'ACCEPTED'
  assert body['carrierLoadNumber'] == 'MWC900500'
  assert 'ST*990*0001' in repository.outbound['raw_x12']
  assert repository.load_tender_status == 'ACCEPTED'


def test_create_rejected_tender_decision_requires_reason() -> None:
  repository = FakeRepository()
  repository.create_load_from_204(parse_midwest_204(MIDWEST_204))
  app.dependency_overrides[get_load_repository] = lambda: repository

  response = TestClient(app).post(
    '/v1/loads/LOAD500/tender-decisions',
    headers={'Authorization': 'Bearer test-token'},
    json={'decision': 'REJECTED'},
  )

  assert response.status_code == 422


def test_create_tender_decision_unknown_and_duplicate_loads() -> None:
  repository = FakeRepository()
  app.dependency_overrides[get_load_repository] = lambda: repository

  missing = TestClient(app).post(
    '/v1/loads/LOAD404/tender-decisions',
    headers={'Authorization': 'Bearer test-token'},
    json={'decision': 'ACCEPTED'},
  )
  assert missing.status_code == 404
  assert missing.json()['error']['code'] == 'LOAD_NOT_FOUND'

  repository.create_load_from_204(parse_midwest_204(MIDWEST_204))
  assert TestClient(app).post(
    '/v1/loads/LOAD500/tender-decisions',
    headers={'Authorization': 'Bearer test-token'},
    json={'decision': 'ACCEPTED'},
  ).status_code == 200
  duplicate = TestClient(app).post(
    '/v1/loads/LOAD500/tender-decisions',
    headers={'Authorization': 'Bearer test-token'},
    json={'decision': 'REJECTED', 'reasonCode': 'NO_CAP'},
  )

  assert duplicate.status_code == 409
  assert duplicate.json()['error']['code'] == 'TENDER_ALREADY_DECIDED'


def test_dispatch_tender_response_direct_delivers_generated_990(monkeypatch) -> None:
  repository = FakeRepository()
  repository.create_load_from_204(parse_midwest_204(MIDWEST_204))
  repository.create_tender_decision(
    'LOAD500',
    type('Decision', (), {'decision': type('Value', (), {'value': 'ACCEPTED'})(), 'reason_code': None, 'message': None})(),
  )
  app.dependency_overrides[get_load_repository] = lambda: repository
  monkeypatch.setenv('FREIGHTBRIDGE_API_BASE_URL', 'https://freightbridge.example.test')
  monkeypatch.setenv('FREIGHTBRIDGE_MIDWEST_BEARER_TOKEN', 'midwest-outbound-token')
  get_settings.cache_clear()
  captured: dict[str, object] = {}

  class FakeResponse:
    status_code = 202

    def json(self):
      return {'status': 'ACCEPTED'}

  def fake_post(url: str, **kwargs):
    captured['url'] = url
    captured.update(kwargs)
    return FakeResponse()

  monkeypatch.setattr('app.api.routes.tender_decisions.httpx.post', fake_post)

  response = TestClient(app).post(
    '/v1/loads/LOAD500/tender-response/dispatch-direct',
    headers={'Authorization': 'Bearer test-token', 'X-Correlation-ID': 'corr-990'},
  )

  assert response.status_code == 202
  assert response.json()['status'] == 'DELIVERED_TO_FREIGHTBRIDGE_TEST_GATEWAY'
  assert captured['url'] == 'https://freightbridge.example.test/api/integrations/midwest/tender-responses'
  assert captured['headers']['Authorization'] == 'Bearer midwest-outbound-token'
  assert captured['content'].decode('utf-8') == repository.outbound['raw_x12']
  assert repository.outbound_statuses == ['DELIVERING', 'DELIVERED']


@pytest.mark.parametrize(
  ('payload', 'expected_code'),
  [
    ('ISA*bad~', 'INVALID_X12'),
    (MIDWEST_204.replace('SE*16*0001', 'SE*15*0001'), 'INVALID_X12'),
    (MIDWEST_204.replace('IEA*1*000000905', 'IEA*1*000000999'), 'INVALID_X12'),
    (MIDWEST_204.replace('ST*204*0001', 'ST*990*0001'), 'BUSINESS_VALIDATION_ERROR'),
    (MIDWEST_204.replace('*00401*', '*00501*', 1), 'UNSUPPORTED_X12_VERSION'),
    (
      MIDWEST_204.replace('L11*BOL900*BM~', '').replace('SE*16*0001', 'SE*15*0001'),
      'BUSINESS_VALIDATION_ERROR',
    ),
    (
      MIDWEST_204.replace('N1*CN*XYZ Warehouse~', '').replace('SE*16*0001', 'SE*15*0001'),
      'BUSINESS_VALIDATION_ERROR',
    ),
  ],
)
def test_invalid_204_payloads_return_422(payload: str, expected_code: str) -> None:
  repository = FakeRepository()
  app.dependency_overrides[get_load_repository] = lambda: repository

  response = TestClient(app).post(
    '/v1/edi/inbound/204',
    content=payload,
    headers={'Authorization': 'Bearer test-token'},
  )

  assert response.status_code == 422
  assert response.json()['error']['code'] == expected_code
  assert repository.load is None
  assert repository.rejected_documents == 1


def test_duplicate_load_returns_409_and_preserves_original() -> None:
  repository = FakeRepository(duplicate=True)
  app.dependency_overrides[get_load_repository] = lambda: repository

  response = TestClient(app).post(
    '/v1/edi/inbound/204',
    content=MIDWEST_204,
    headers={'Authorization': 'Bearer test-token'},
  )

  assert response.status_code == 409
  assert response.json()['error']['code'] == 'DUPLICATE_LOAD'
  assert repository.rejected_documents == 1


class FakeRepository:
  def __init__(self, duplicate: bool = False) -> None:
    self.duplicate = duplicate
    self.load = None
    self.accepted_documents = 0
    self.rejected_documents = 0
    self.load_tender_status = 'PENDING'
    self.carrier_load_number = None
    self.outbound = None
    self.outbound_statuses: list[str] = []

  def create_inbound_document(self, **kwargs):
    return uuid4()

  def mark_document_accepted(self, document_id, parsed) -> None:
    self.accepted_documents += 1

  def mark_document_rejected(self, document_id, **kwargs) -> None:
    self.rejected_documents += 1

  def create_load_from_204(self, parsed):
    if self.duplicate:
      raise DuplicateLoadError(parsed.cust_ship_no)
    self.load = parsed
    return uuid4()

  def create_tender_decision(self, cust_ship_no, request):
    if self.load is None or self.load.cust_ship_no != cust_ship_no:
      raise LoadNotFoundError(cust_ship_no)
    if self.load_tender_status != 'PENDING':
      raise TenderAlreadyDecidedError(cust_ship_no)

    decision = request.decision.value
    decided_at = datetime(2026, 9, 19, 14, 45, tzinfo=timezone.utc)
    self.carrier_load_number = 'MWC900500' if decision == 'ACCEPTED' else None
    self.load_tender_status = decision
    raw_x12 = generate_990(
      Midwest990Source(
        cust_ship_no=cust_ship_no,
        bol_ref=self.load.bol_ref,
        po_ref=self.load.po_ref,
        decision=decision,
        carrier_load_no=self.carrier_load_number,
        reason_code=request.reason_code,
        decided_at=decided_at,
      ),
      ControlNumbers('000000906', '906', '0001'),
    )
    self.outbound = {'id': uuid4(), 'raw_x12': raw_x12}
    return {
      'customer_shipment_number': cust_ship_no,
      'decision': decision,
      'carrier_load_number': self.carrier_load_number,
      'reason_code': request.reason_code,
      'message': request.message,
      'decided_at': decided_at,
      'outbound_document_id': uuid4(),
    }

  def fetch_outbound_990(self, cust_ship_no):
    if self.load is None or self.load.cust_ship_no != cust_ship_no:
      return None
    return self.outbound

  def mark_outbound_delivering(self, document_id) -> None:
    self.outbound_statuses.append('DELIVERING')

  def mark_outbound_delivered(self, document_id) -> None:
    self.outbound_statuses.append('DELIVERED')

  def mark_outbound_failed(self, document_id, error_code, message) -> None:
    self.outbound_statuses.append('FAILED')

  def fetch_load(self, cust_ship_no):
    if self.load is None or self.load.cust_ship_no != cust_ship_no:
      return None
    from app.models.load import MidwestLoad, Party

    return MidwestLoad(
      id=uuid4(),
      customerShipmentNumber=self.load.cust_ship_no,
      bolReference=self.load.bol_ref,
      purchaseOrderReference=self.load.po_ref,
      grossWeightLb=self.load.gross_weight_lb,
      handlingUnits=self.load.handling_units,
      shipper=Party(
        name=self.load.shipper_name,
        addressLine1=self.load.shipper_addr_line_1,
        city=self.load.shipper_city,
        state=self.load.shipper_state_cd,
        postalCode=self.load.shipper_zip,
      ),
      consignee=Party(
        name=self.load.cons_name,
        addressLine1=self.load.cons_addr_line_1,
        city=self.load.cons_city,
        state=self.load.cons_state_cd,
        postalCode=self.load.cons_zip,
      ),
      pickupAppointment=self.load.pickup_appt_ts,
      deliveryAppointment=self.load.delivery_appt_ts,
      tenderStatus=self.load_tender_status,
      carrierLoadNumber=self.carrier_load_number,
    )


def _compact_x12(payload: str) -> str:
  return payload.replace('\r', '').replace('\n', '').strip()
