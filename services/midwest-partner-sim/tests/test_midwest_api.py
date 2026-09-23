from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from psycopg import OperationalError
from psycopg._queries import _split_query

from app.api.dependencies import get_load_repository
from app.api.routes import readiness
from app.core.config import get_settings
from app.edi.generator_214 import Midwest214Source, generate_214
from app.edi.generator_990 import ControlNumbers, Midwest990Source, generate_990
from app.edi.generator_997 import accepted_204_997_source, generate_997, rejected_204_997_source
from app.edi import parse_midwest_204
from app.infrastructure.sftp_client import MidwestSftpFileConflictError
from app.infrastructure import database
from app.main import app
from app.models.shipment_event import MidwestShipmentEventRequest
from app.repositories.loads import DuplicateLoadError
from app.repositories.loads import LoadNotFoundError, ShipmentEventNotAllowedError, TenderAlreadyDecidedError
from app.services.sftp_transport import (
  MidwestSftpFunctionalAcknowledgmentDispatchService,
  MidwestSftpInboundPollService,
  MidwestSftpShipmentStatusDispatchService,
  MidwestSftpTenderResponseDispatchService,
)


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
MIDWEST_997_ACCEPTED = (PROJECT_ROOT / 'sample-data' / 'x12' / 'midwest' / '997-accepted-204.edi').read_text(
  encoding='utf-8'
)
MIDWEST_997_REJECTED = (PROJECT_ROOT / 'sample-data' / 'x12' / 'midwest' / '997-rejected-204.edi').read_text(
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


def shipment_event_request(status: str):
  return MidwestShipmentEventRequest.model_validate({
    'status': status,
    'occurredAt': '2026-10-07T14:30:00Z',
    'city': 'Aurora',
    'state': 'IL',
  })


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


def test_997_generator_matches_golden_accepted_and_rejected_fixtures() -> None:
  generated_at = datetime(2026, 9, 23, 14, 30, tzinfo=timezone.utc)
  accepted = generate_997(
    accepted_204_997_source(
      original_group_control_number='905',
      original_transaction_control_number='0001',
      generated_at=generated_at,
    ),
    ControlNumbers('000000917', '917', '0001'),
  )
  rejected = generate_997(
    rejected_204_997_source(
      original_group_control_number='905',
      original_transaction_control_number='0001',
      generated_at=datetime(2026, 9, 23, 14, 35, tzinfo=timezone.utc),
    ),
    ControlNumbers('000000918', '918', '0001'),
  )

  assert _compact_x12(accepted) == _compact_x12(MIDWEST_997_ACCEPTED)
  assert _compact_x12(rejected) == _compact_x12(MIDWEST_997_REJECTED)
  assert 'GS*FA*MWCX*FREIGHTBRIDGE*20260923*1430*917*X*004010~' in accepted
  assert 'ST*997*0001~' in accepted
  assert 'AK1*SM*905~' in accepted
  assert 'AK2*204*0001~' in accepted
  assert 'AK5*A~' in accepted
  assert 'AK9*A*1*1*1~' in accepted
  assert 'AK5*R~' in rejected
  assert 'AK9*R*1*1*0~' in rejected
  assert 'SE*6*0001~' in accepted


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


def test_sftp_inbound_poll_processes_204_and_archives_file() -> None:
  repository = FakeRepository()
  fake_sftp = FakeSftpClient({
    '/inbound/APEX_MWCX_204_000000905.edi': MIDWEST_204.encode('utf-8'),
    '/inbound/APEX_MWCX_204_000000905.edi.part': b'partial',
  })

  result = MidwestSftpInboundPollService(
    repository=repository,
    client_factory=lambda: fake_sftp,
  ).poll()

  assert result.processed[0].status == 'ARCHIVED'
  assert result.processed[0].destination_path == '/archive/APEX_MWCX_204_000000905.edi'
  assert result.ignored == ['APEX_MWCX_204_000000905.edi.part']
  assert repository.load.cust_ship_no == 'LOAD500'
  assert repository.accepted_documents == 1
  assert repository.outbound_997 is not None
  assert result.processed[0].functional_acknowledgment_status == 'ACCEPTED'
  assert result.processed[0].functional_acknowledgment_document_id == str(repository.outbound_997['id'])
  assert '/archive/APEX_MWCX_204_000000905.edi' in fake_sftp.files


def test_successful_204_generates_997_without_changing_tender_status() -> None:
  repository = FakeRepository()
  result = repository.create_inbound_document(payload_hash='hash', raw_x12=MIDWEST_204)
  parsed = parse_midwest_204(MIDWEST_204)
  repository.create_load_from_204(parsed)
  acknowledgment = repository.create_functional_acknowledgment_for_204(
    inbound_document_id=result,
    parsed=parsed,
    generated_at=datetime(2026, 9, 23, 14, 30, tzinfo=timezone.utc),
    control_numbers=ControlNumbers('000000917', '917', '0001'),
  )

  assert acknowledgment['acknowledgment_status'] == 'ACCEPTED'
  assert acknowledgment['transaction_ack_code'] == 'A'
  assert acknowledgment['group_ack_code'] == 'A'
  assert repository.load_tender_status == 'PENDING'
  assert repository.outbound_997['inbound_document_id'] == result
  assert repository.outbound_997['document_type'] == '997'
  assert 'AK1*SM*905~' in repository.outbound_997['raw_x12']


def test_sftp_inbound_poll_moves_bad_204_to_error() -> None:
  repository = FakeRepository()
  fake_sftp = FakeSftpClient({'/inbound/APEX_MWCX_204_000000905.edi': b'ISA*bad~'})

  result = MidwestSftpInboundPollService(
    repository=repository,
    client_factory=lambda: fake_sftp,
  ).poll()

  assert result.processed[0].status == 'MOVED_TO_ERROR'
  assert result.processed[0].destination_path == '/error/APEX_MWCX_204_000000905.edi'
  assert repository.rejected_documents == 1
  assert '/error/APEX_MWCX_204_000000905.edi' in fake_sftp.files


def test_sftp_dispatch_tender_response_uploads_990_atomically() -> None:
  repository = FakeRepository()
  repository.create_load_from_204(parse_midwest_204(MIDWEST_204))
  repository.create_tender_decision(
    'LOAD500',
    type('Decision', (), {'decision': type('Value', (), {'value': 'ACCEPTED'})(), 'reason_code': None, 'message': None})(),
  )
  fake_sftp = FakeSftpClient({})

  result = MidwestSftpTenderResponseDispatchService(
    repository=repository,
    client_factory=lambda: fake_sftp,
  ).dispatch('LOAD500')

  assert result['transport'] == 'SFTP'
  assert result['fileName'] == 'MWCX_APEX_990_000000906.edi'
  assert result['remotePath'] == '/outbound/MWCX_APEX_990_000000906.edi'
  assert fake_sftp.uploads[0][0] == '/outbound/MWCX_APEX_990_000000906.edi.part'
  assert fake_sftp.uploads[1] == (
    'rename',
    '/outbound/MWCX_APEX_990_000000906.edi.part',
    '/outbound/MWCX_APEX_990_000000906.edi',
  )
  assert repository.outbound_statuses == ['DELIVERING:SFTP', 'DELIVERED:SFTP:/outbound/MWCX_APEX_990_000000906.edi']


def test_sftp_dispatch_tender_response_marks_failed_on_file_conflict() -> None:
  repository = FakeRepository()
  repository.create_load_from_204(parse_midwest_204(MIDWEST_204))
  repository.create_tender_decision(
    'LOAD500',
    type('Decision', (), {'decision': type('Value', (), {'value': 'ACCEPTED'})(), 'reason_code': None, 'message': None})(),
  )
  fake_sftp = FakeSftpClient({'/outbound/MWCX_APEX_990_000000906.edi': b'existing'})

  with pytest.raises(MidwestSftpFileConflictError):
    MidwestSftpTenderResponseDispatchService(
      repository=repository,
      client_factory=lambda: fake_sftp,
    ).dispatch('LOAD500')

  assert repository.outbound_statuses == [
    'DELIVERING:SFTP',
    'FAILED:SFTP_FILE_CONFLICT',
  ]


def test_generate_214_uses_midwest_status_profile() -> None:
  raw_x12 = generate_214(
    Midwest214Source(
      cust_ship_no='LOAD503',
      carrier_load_no='MWC900503',
      bol_ref='BOL903',
      po_ref='PO114',
      at7_code='AF',
      occurred_at=datetime(2026, 10, 7, 14, 30, tzinfo=timezone.utc),
      city='Aurora',
      state='IL',
    ),
    ControlNumbers('000000907', '907', '0001'),
  )

  assert 'GS*QM*MWCX*FREIGHTBRIDGE*20261007*1430*907*X*004010~' in raw_x12
  assert 'ST*214*0001~' in raw_x12
  assert 'B10*MWC900503*LOAD503*MWCX~' in raw_x12
  assert 'L11*BOL903*BM~' in raw_x12
  assert 'L11*PO114*PO~' in raw_x12
  assert 'AT7*AF****20261007*1430*UT~' in raw_x12
  assert 'MS1*Aurora*IL~' in raw_x12
  assert 'SE*7*0001~' in raw_x12
  assert 'GE*1*907~' in raw_x12
  assert 'IEA*1*000000907~' in raw_x12


def test_create_shipment_event_requires_accepted_load() -> None:
  repository = FakeRepository()
  repository.create_load_from_204(parse_midwest_204(MIDWEST_204))

  with pytest.raises(ShipmentEventNotAllowedError):
    repository.create_shipment_event('LOAD500', shipment_event_request('PICKED_UP'))


def test_create_shipment_event_on_accepted_load_generates_outbound_214() -> None:
  repository = FakeRepository()
  repository.create_load_from_204(parse_midwest_204(MIDWEST_204))
  repository.create_tender_decision(
    'LOAD500',
    type('Decision', (), {'decision': type('Value', (), {'value': 'ACCEPTED'})(), 'reason_code': None, 'message': None})(),
  )

  result = repository.create_shipment_event('LOAD500', shipment_event_request('PICKED_UP'))

  assert result['status'] == 'PICKED_UP'
  assert result['at7_code'] == 'AF'
  assert result['outbound_document_id'] == repository.outbound_214['id']
  assert 'ST*214*0001~' in repository.outbound_214['raw_x12']


def test_sftp_dispatch_shipment_status_uploads_214_atomically() -> None:
  repository = FakeRepository()
  repository.create_load_from_204(parse_midwest_204(MIDWEST_204))
  repository.create_tender_decision(
    'LOAD500',
    type('Decision', (), {'decision': type('Value', (), {'value': 'ACCEPTED'})(), 'reason_code': None, 'message': None})(),
  )
  event = repository.create_shipment_event('LOAD500', shipment_event_request('DELIVERED'))
  fake_sftp = FakeSftpClient({})

  result = MidwestSftpShipmentStatusDispatchService(
    repository=repository,
    client_factory=lambda: fake_sftp,
  ).dispatch('LOAD500', event['event_id'])

  assert result['transport'] == 'SFTP'
  assert result['documentType'] == '214'
  assert result['fileName'] == 'MWCX_APEX_214_000000907.edi'
  assert fake_sftp.uploads[0][0] == '/outbound/MWCX_APEX_214_000000907.edi.part'
  assert fake_sftp.uploads[1] == (
    'rename',
    '/outbound/MWCX_APEX_214_000000907.edi.part',
    '/outbound/MWCX_APEX_214_000000907.edi',
  )
  assert repository.outbound_statuses[-2:] == [
    'DELIVERING:SFTP',
    'DELIVERED:SFTP:/outbound/MWCX_APEX_214_000000907.edi',
  ]


def test_sftp_dispatch_functional_acknowledgment_uploads_997_atomically() -> None:
  repository = FakeRepository()
  document_id = repository.create_inbound_document(payload_hash='hash', raw_x12=MIDWEST_204)
  parsed = parse_midwest_204(MIDWEST_204)
  repository.create_load_from_204(parsed)
  acknowledgment = repository.create_functional_acknowledgment_for_204(
    inbound_document_id=document_id,
    parsed=parsed,
    generated_at=datetime(2026, 9, 23, 14, 30, tzinfo=timezone.utc),
    control_numbers=ControlNumbers('000000917', '917', '0001'),
  )
  fake_sftp = FakeSftpClient({})

  result = MidwestSftpFunctionalAcknowledgmentDispatchService(
    repository=repository,
    client_factory=lambda: fake_sftp,
  ).dispatch(acknowledgment['outbound_document_id'])

  assert result['transport'] == 'SFTP'
  assert result['documentType'] == '997'
  assert result['fileName'] == 'MWCX_APEX_997_000000917.edi'
  assert fake_sftp.uploads[0][0] == '/outbound/MWCX_APEX_997_000000917.edi.part'
  assert fake_sftp.uploads[1] == (
    'rename',
    '/outbound/MWCX_APEX_997_000000917.edi.part',
    '/outbound/MWCX_APEX_997_000000917.edi',
  )
  assert repository.outbound_statuses[-2:] == [
    'DELIVERING:SFTP',
    'DELIVERED:SFTP:/outbound/MWCX_APEX_997_000000917.edi',
  ]


def test_functional_acknowledgment_readback_endpoint() -> None:
  repository = FakeRepository()
  document_id = repository.create_inbound_document(payload_hash='hash', raw_x12=MIDWEST_204)
  parsed = parse_midwest_204(MIDWEST_204)
  repository.create_load_from_204(parsed)
  acknowledgment = repository.create_functional_acknowledgment_for_204(
    inbound_document_id=document_id,
    parsed=parsed,
    generated_at=datetime(2026, 9, 23, 14, 30, tzinfo=timezone.utc),
    control_numbers=ControlNumbers('000000917', '917', '0001'),
  )
  app.dependency_overrides[get_load_repository] = lambda: repository

  response = TestClient(app).get(
    '/v1/loads/LOAD500/functional-acknowledgments',
    headers={'Authorization': 'Bearer read-token'},
  )

  assert response.status_code == 200
  body = response.json()['functionalAcknowledgments'][0]
  assert body['outboundDocumentId'] == str(acknowledgment['outbound_document_id'])
  assert body['documentType'] == '997'
  assert body['acknowledgmentStatus'] == 'ACCEPTED'
  assert body['transactionAckCode'] == 'A'
  assert body['groupAckCode'] == 'A'


def test_functional_acknowledgment_readback_uses_psycopg_safe_sql() -> None:
  outbound_document_id = uuid4()
  inbound_document_id = uuid4()
  generated_at = datetime(2026, 9, 23, 14, 30, tzinfo=timezone.utc)
  connection = PsycopgParsingConnection([
    [{'id': uuid4()}],
    [{
      'outbound_document_id': outbound_document_id,
      'inbound_document_id': inbound_document_id,
      'document_type': '997',
      'acknowledgment_status': 'ACCEPTED',
      'transaction_ack_code': 'A',
      'group_ack_code': 'A',
      'acknowledged_group_control_number': '905',
      'acknowledged_transaction_control_number': '0001',
      'processing_status': 'GENERATED',
      'transport': None,
      'remote_path': None,
      'generated_at': generated_at,
      'delivered_at': None,
    }],
  ])

  acknowledgments = database_repository(connection).fetch_functional_acknowledgments('LOAD500')

  assert acknowledgments == [{
    'outbound_document_id': outbound_document_id,
    'inbound_document_id': inbound_document_id,
    'document_type': '997',
    'acknowledgment_status': 'ACCEPTED',
    'transaction_ack_code': 'A',
    'group_ack_code': 'A',
    'acknowledged_group_control_number': '905',
    'acknowledged_transaction_control_number': '0001',
    'processing_status': 'GENERATED',
    'transport': None,
    'remote_path': None,
    'generated_at': generated_at,
    'delivered_at': None,
  }]
  readback_sql = connection.executed_queries[1]
  assert 'raw_x12 like' not in readback_sql.lower()
  assert "position('AK5*A~' in oed.raw_x12) > 0" in readback_sql
  assert "position('AK9*A*1*1*1~' in oed.raw_x12) > 0" in readback_sql
  assert "position('AK5*R~' in oed.raw_x12) > 0" in readback_sql
  assert "position('AK9*R*1*1*0~' in oed.raw_x12) > 0" in readback_sql


def test_functional_acknowledgment_readback_database_error_returns_safe_503() -> None:
  repository = FailingFunctionalAcknowledgmentRepository()
  app.dependency_overrides[get_load_repository] = lambda: repository

  response = TestClient(app).get(
    '/v1/loads/LOAD500/functional-acknowledgments',
    headers={'Authorization': 'Bearer read-token'},
  )

  assert response.status_code == 503
  assert response.json()['error']['code'] == 'DEPENDENCY_ERROR'
  assert 'select broken_table' not in response.text


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


def test_exact_204_replay_does_not_create_second_load_or_997() -> None:
  repository = ReplayAwareFakeRepository()
  first = repository.create_inbound_document(payload_hash='hash', raw_x12=MIDWEST_204)
  parsed = parse_midwest_204(MIDWEST_204)
  load_id = repository.create_load_from_204(parsed)
  repository.mark_document_accepted(first, parsed)
  repository.create_functional_acknowledgment_for_204(inbound_document_id=first, parsed=parsed)
  service = __import__('app.services.inbound_204', fromlist=['Midwest204ReceiveService']).Midwest204ReceiveService(repository)

  result = service.process(raw_body=MIDWEST_204.encode('utf-8'))

  assert result.response_body()['status'] == 'REPLAY_ACCEPTED'
  assert result.midwest_load_id == load_id
  assert repository.load_create_count == 1
  assert repository.functional_ack_count == 1
  assert repository.replay_documents == 1


def test_204_control_reuse_with_changed_payload_rejects_without_side_effects() -> None:
  repository = ReplayAwareFakeRepository(existing_payload_hash='different-hash')
  service = __import__('app.services.inbound_204', fromlist=['Midwest204ReceiveService', 'Midwest204ReceiveFailure']).Midwest204ReceiveService(repository)
  failure_type = __import__('app.services.inbound_204', fromlist=['Midwest204ReceiveFailure']).Midwest204ReceiveFailure

  with pytest.raises(failure_type) as exc_info:
    service.process(raw_body=MIDWEST_204.encode('utf-8'))

  assert exc_info.value.status_code == 409
  assert exc_info.value.code.value == 'X12_CONTROL_NUMBER_REUSE'
  assert repository.load_create_count == 0
  assert repository.functional_ack_count == 0
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
    self.outbound_214 = None
    self.outbound_997 = None
    self.inbound_document_id = None
    self.shipment_events = []
    self.outbound_statuses: list[str] = []

  def create_inbound_document(self, **kwargs):
    self.inbound_document_id = uuid4()
    return self.inbound_document_id

  def find_accepted_inbound_204_by_controls(self, parsed):
    return None

  def mark_document_replay(self, document_id, parsed, *, replay_of_document_id, archive_path=None) -> None:
    self.accepted_documents += 1

  def mark_document_accepted(self, document_id, parsed, *, archive_path=None) -> None:
    self.accepted_documents += 1

  def mark_document_rejected(self, document_id, **kwargs) -> None:
    self.rejected_documents += 1

  def create_load_from_204(self, parsed):
    if self.duplicate:
      raise DuplicateLoadError(parsed.cust_ship_no)
    self.load = parsed
    return uuid4()

  def create_functional_acknowledgment_for_204(self, *, inbound_document_id, parsed, generated_at=None, control_numbers=None):
    generated_at = generated_at or datetime(2026, 9, 23, 14, 30, tzinfo=timezone.utc)
    controls = control_numbers or ControlNumbers('000000917', '917', '0001')
    source = accepted_204_997_source(
      original_group_control_number=parsed.group_control_number,
      original_transaction_control_number=parsed.transaction_control_number,
      generated_at=generated_at,
    )
    raw_x12 = generate_997(source, controls)
    self.outbound_997 = {
      'id': uuid4(),
      'inbound_document_id': inbound_document_id,
      'document_type': '997',
      'customer_shipment_number': parsed.cust_ship_no,
      'raw_x12': raw_x12,
      'interchange_control_number': controls.interchange_control_number,
      'group_control_number': controls.group_control_number,
      'transaction_control_number': controls.transaction_control_number,
      'processing_status': 'GENERATED',
      'transport': None,
      'remote_path': None,
      'generated_at': generated_at,
      'delivered_at': None,
    }
    return {
      'outbound_document_id': self.outbound_997['id'],
      'inbound_document_id': inbound_document_id,
      'customer_shipment_number': parsed.cust_ship_no,
      'acknowledgment_status': 'ACCEPTED',
      'transaction_ack_code': 'A',
      'group_ack_code': 'A',
      'acknowledged_group_control_number': parsed.group_control_number,
      'acknowledged_transaction_control_number': parsed.transaction_control_number,
      'interchange_control_number': controls.interchange_control_number,
      'group_control_number': controls.group_control_number,
      'transaction_control_number': controls.transaction_control_number,
      'raw_x12': raw_x12,
      'generated_at': generated_at,
    }

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
    self.outbound = {
      'id': uuid4(),
      'raw_x12': raw_x12,
      'interchange_control_number': '000000906',
    }
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

  def create_shipment_event(self, cust_ship_no, request):
    if self.load is None or self.load.cust_ship_no != cust_ship_no:
      raise LoadNotFoundError(cust_ship_no)
    if self.load_tender_status != 'ACCEPTED':
      raise ShipmentEventNotAllowedError(cust_ship_no)
    at7_code = {
      'PICKED_UP': 'AF',
      'IN_TRANSIT': 'X6',
      'ARRIVED': 'X1',
      'DELIVERED': 'D1',
    }[request.status.value]
    event_id = uuid4()
    raw_x12 = generate_214(
      Midwest214Source(
        cust_ship_no=cust_ship_no,
        carrier_load_no=self.carrier_load_number,
        bol_ref=self.load.bol_ref,
        po_ref=self.load.po_ref,
        at7_code=at7_code,
        occurred_at=request.occurred_at,
        city=request.city,
        state=request.state,
      ),
      ControlNumbers('000000907', '907', '0001'),
    )
    self.shipment_events.append({
      'id': event_id,
      'status': request.status.value,
      'at7_code': at7_code,
      'status_description': request.status_description,
      'occurred_at': request.occurred_at,
      'city': request.city,
      'state': request.state,
      'created_at': request.occurred_at,
    })
    self.outbound_214 = {
      'id': uuid4(),
      'raw_x12': raw_x12,
      'interchange_control_number': '000000907',
    }
    return {
      'event_id': event_id,
      'outbound_document_id': self.outbound_214['id'],
      'customer_shipment_number': cust_ship_no,
      'status': request.status.value,
      'at7_code': at7_code,
      'status_description': request.status_description or 'Shipment status update.',
      'occurred_at': request.occurred_at,
      'city': request.city,
      'state': request.state,
    }

  def fetch_shipment_events(self, cust_ship_no):
    if self.load is None or self.load.cust_ship_no != cust_ship_no:
      return None
    return self.shipment_events

  def fetch_shipment_event_with_outbound_214(self, cust_ship_no, event_id):
    if self.load is None or self.load.cust_ship_no != cust_ship_no:
      return None
    if not any(event['id'] == event_id for event in self.shipment_events):
      return None
    return self.outbound_214

  def fetch_functional_acknowledgments(self, cust_ship_no):
    if self.load is None or self.load.cust_ship_no != cust_ship_no:
      return None
    if self.outbound_997 is None:
      return []
    return [{
      'outbound_document_id': self.outbound_997['id'],
      'inbound_document_id': self.outbound_997['inbound_document_id'],
      'document_type': '997',
      'acknowledgment_status': 'ACCEPTED',
      'transaction_ack_code': 'A',
      'group_ack_code': 'A',
      'acknowledged_group_control_number': self.load.group_control_number,
      'acknowledged_transaction_control_number': self.load.transaction_control_number,
      'processing_status': self.outbound_997['processing_status'],
      'transport': self.outbound_997['transport'],
      'remote_path': self.outbound_997['remote_path'],
      'generated_at': self.outbound_997['generated_at'],
      'delivered_at': self.outbound_997['delivered_at'],
    }]

  def fetch_outbound_997_by_id(self, outbound_document_id):
    if self.outbound_997 and self.outbound_997['id'] == outbound_document_id:
      return self.outbound_997
    return None

  def mark_outbound_delivering(self, document_id, *, transport=None) -> None:
    self.outbound_statuses.append(f"DELIVERING:{transport}" if transport else 'DELIVERING')

  def mark_outbound_delivered(self, document_id, *, transport=None, remote_filename=None, remote_path=None) -> None:
    if transport:
      self.outbound_statuses.append(f'DELIVERED:{transport}:{remote_path}')
    else:
      self.outbound_statuses.append('DELIVERED')

  def mark_outbound_failed(self, document_id, error_code, message) -> None:
    self.outbound_statuses.append(f'FAILED:{error_code}')

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


class ReplayAwareFakeRepository(FakeRepository):
  def __init__(self, existing_payload_hash: str | None = None) -> None:
    super().__init__()
    self.existing_payload_hash = existing_payload_hash
    self.accepted_inbound_document_id = None
    self.accepted_load_id = None
    self.load_create_count = 0
    self.functional_ack_count = 0
    self.replay_documents = 0

  def create_inbound_document(self, **kwargs):
    document_id = uuid4()
    self.inbound_document_id = document_id
    return document_id

  def mark_document_accepted(self, document_id, parsed, *, archive_path=None) -> None:
    super().mark_document_accepted(document_id, parsed, archive_path=archive_path)
    self.accepted_inbound_document_id = document_id

  def create_load_from_204(self, parsed):
    self.load_create_count += 1
    self.load = parsed
    self.accepted_load_id = uuid4()
    return self.accepted_load_id

  def create_functional_acknowledgment_for_204(self, *, inbound_document_id, parsed, generated_at=None, control_numbers=None):
    self.functional_ack_count += 1
    return super().create_functional_acknowledgment_for_204(
      inbound_document_id=inbound_document_id,
      parsed=parsed,
      generated_at=generated_at,
      control_numbers=control_numbers,
    )

  def find_accepted_inbound_204_by_controls(self, parsed):
    if self.accepted_inbound_document_id is None:
      if self.existing_payload_hash is None:
        return None
      self.accepted_inbound_document_id = uuid4()
      self.accepted_load_id = uuid4()
    return {
      'id': self.accepted_inbound_document_id,
      'payload_hash': self.existing_payload_hash or __import__('hashlib').sha256(MIDWEST_204.encode('utf-8')).hexdigest(),
      'load_id': self.accepted_load_id,
    }

  def mark_document_replay(self, document_id, parsed, *, replay_of_document_id, archive_path=None) -> None:
    self.replay_documents += 1


class FailingFunctionalAcknowledgmentRepository:
  def fetch_functional_acknowledgments(self, cust_ship_no):
    raise OperationalError('select broken_table with secret detail')


class PsycopgParsingConnection:
  def __init__(self, results: list[list[dict[str, object]]]) -> None:
    self.results = list(results)
    self.executed_queries: list[str] = []

  def cursor(self):
    return PsycopgParsingCursor(self)


class PsycopgParsingCursor:
  def __init__(self, connection: PsycopgParsingConnection) -> None:
    self.connection = connection
    self.rows: list[dict[str, object]] = []

  def __enter__(self):
    return self

  def __exit__(self, exc_type, exc, traceback):
    return None

  def execute(self, query: str, params=None) -> None:
    if params is not None:
      _split_query(query.encode('utf-8'), 'utf-8')
    self.connection.executed_queries.append(query)
    self.rows = self.connection.results.pop(0)

  def fetchone(self):
    return self.rows[0] if self.rows else None

  def fetchall(self):
    return self.rows


def database_repository(connection):
  from app.repositories.loads import MidwestLoadRepository

  return MidwestLoadRepository(connection)


def _compact_x12(payload: str) -> str:
  return payload.replace('\r', '').replace('\n', '').strip()


class FakeSftpClient:
  def __init__(self, files: dict[str, bytes]) -> None:
    self.files = dict(files)
    self.uploads = []

  def __enter__(self):
    return self

  def __exit__(self, exc_type, exc, traceback):
    return None

  def listdir(self, path: str) -> list[str]:
    prefix = path.rstrip('/') + '/'
    return [file_path.removeprefix(prefix) for file_path in self.files if file_path.startswith(prefix)]

  def download_bytes(self, remote_path: str) -> bytes:
    return self.files[remote_path]

  def exists(self, remote_path: str) -> bool:
    return remote_path in self.files

  def rename(self, source_path: str, destination_path: str) -> None:
    self.files[destination_path] = self.files.pop(source_path)

  def upload_bytes_atomic(self, remote_directory: str, final_filename: str, payload: bytes) -> str:
    final_path = remote_directory.rstrip('/') + '/' + final_filename
    temp_path = final_path + '.part'
    if final_path in self.files or temp_path in self.files:
      raise MidwestSftpFileConflictError('exists')
    self.uploads.append((temp_path, payload))
    self.files[temp_path] = payload
    self.uploads.append(('rename', temp_path, final_path))
    self.files[final_path] = self.files.pop(temp_path)
    return final_path
