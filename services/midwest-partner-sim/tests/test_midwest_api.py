from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.api.dependencies import get_load_repository
from app.api.routes import readiness
from app.core.config import get_settings
from app.edi import parse_midwest_204
from app.infrastructure import database
from app.main import app
from app.repositories.loads import DuplicateLoadError


PROJECT_ROOT = Path(__file__).resolve().parents[3]
MIDWEST_204 = (PROJECT_ROOT / 'sample-data' / 'x12' / 'midwest' / '204-valid.edi').read_text(
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
      tenderStatus='PENDING',
      carrierLoadNumber=None,
    )
