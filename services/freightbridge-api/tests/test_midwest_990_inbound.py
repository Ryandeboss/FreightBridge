from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from app.api.routes.midwest_integrations import get_midwest_990_ingestion_service
from app.core.config import get_settings
from app.domain import ProcessingStage, ProcessingStatus, ShipmentStatus, TenderDecision, apply_shipment_event
from app.infrastructure.repositories import (
  ShipmentNotFoundForEventError,
  ShipmentNotFoundForTenderError,
  TenderAlreadyDecidedError,
)
from app.integrations.apex.shipment_status_client import (
  ApexShipmentStatusDeliveryError,
  ApexShipmentStatusDeliveryResult,
)
from app.integrations.apex.tender_response_client import (
  ApexTenderResponseDeliveryError,
  ApexTenderResponseDeliveryResult,
)
from app.integrations.common.errors import IntegrationAPIError
from app.integrations.midwest.inbound_214_service import Midwest214IngestionService
from app.integrations.midwest.mapping_214 import Midwest214MappingError, map_midwest_214
from app.integrations.midwest.inbound_990_service import Midwest990IngestionService
from app.integrations.midwest.mapping_990 import Midwest990MappingError, map_midwest_990
from app.integrations.midwest.sftp_poll_service import MidwestSftpOutboundPollService
from app.integrations.x12 import parse_x12, validate_x12_envelopes
from app.main import app


PROJECT_ROOT = Path(__file__).resolve().parents[3]
FIXTURE_DIR = PROJECT_ROOT / 'sample-data' / 'x12' / 'midwest'
MIDWEST_990_ACCEPTED = (FIXTURE_DIR / '990-accepted.edi').read_text(encoding='utf-8')
MIDWEST_990_REJECTED = (FIXTURE_DIR / '990-rejected.edi').read_text(encoding='utf-8')


def midwest_214(
  *,
  shipment_number: str = 'LOAD500',
  carrier_load_number: str = 'MWC900500',
  at7_code: str = 'AF',
  occurred_at: datetime = datetime(2026, 10, 7, 14, 30, tzinfo=timezone.utc),
  city: str = 'Aurora',
  state: str = 'IL',
  interchange_control: str = '000000907',
) -> str:
  date = occurred_at.strftime('%Y%m%d')
  time = occurred_at.strftime('%H%M')
  isa_date = occurred_at.strftime('%y%m%d')
  return (
    f'ISA*00*          *00*          *ZZ*MWCX           *ZZ*FREIGHTBRIDGE  *{isa_date}*{time}*U*00401*{interchange_control}*0*T*:~'
    f'GS*QM*MWCX*FREIGHTBRIDGE*{date}*{time}*907*X*004010~'
    'ST*214*0001~'
    f'B10*{carrier_load_number}*{shipment_number}*MWCX~'
    'L11*BOL900*BM~'
    'L11*PO111*PO~'
    f'AT7*{at7_code}****{date}*{time}*UT~'
    f'MS1*{city}*{state}~'
    'SE*7*0001~'
    'GE*1*907~'
    f'IEA*1*{interchange_control}~'
  )


@pytest.fixture(autouse=True)
def clear_app_state(monkeypatch):
  monkeypatch.setenv('APP_ENV', 'test')
  monkeypatch.setenv('MIDWEST_INBOUND_BEARER_TOKEN', 'midwest-inbound-token')
  get_settings.cache_clear()
  app.dependency_overrides.clear()
  yield
  app.dependency_overrides.clear()
  get_settings.cache_clear()


def test_maps_midwest_990_accepted_and_rejected_fixtures() -> None:
  accepted = _map(MIDWEST_990_ACCEPTED)
  rejected = _map(MIDWEST_990_REJECTED)

  assert accepted.shipment_number == 'LOAD500'
  assert accepted.decision == TenderDecision.ACCEPTED
  assert accepted.carrier_code == 'MWCX'
  assert accepted.carrier_load_number == 'MWC900500'
  assert accepted.reason_code is None
  assert accepted.interchange_control_number == '000000906'
  assert rejected.decision == TenderDecision.REJECTED
  assert rejected.reason_code == 'NO_CAP'
  assert rejected.carrier_load_number is None
  assert rejected.interchange_control_number == '000000916'


@pytest.mark.parametrize(
  ('payload', 'expected_code'),
  [
    (MIDWEST_990_ACCEPTED.replace('ST*990*0001', 'ST*204*0001'), 'UNEXPECTED_TRANSACTION_SET'),
    (MIDWEST_990_ACCEPTED.replace('MWCX           ', 'OTHER          ', 1), 'INVALID_PARTNER_PROFILE'),
    (MIDWEST_990_ACCEPTED.replace('*00401*', '*00501*', 1), 'UNSUPPORTED_X12_VERSION'),
    (MIDWEST_990_ACCEPTED.replace('L11*MWC900500*CN~', '').replace('SE*6*0001', 'SE*5*0001'), 'MISSING_CARRIER_LOAD_NUMBER'),
    (MIDWEST_990_REJECTED.replace('L11*NO_CAP*ZZ~', '').replace('SE*6*0001', 'SE*5*0001'), 'MISSING_REJECTION_REASON'),
  ],
)
def test_midwest_990_mapping_rejects_invalid_profile_or_business_fields(payload: str, expected_code: str) -> None:
  interchange = parse_x12(payload)
  validate_x12_envelopes(interchange)

  with pytest.raises(Midwest990MappingError) as exc_info:
    map_midwest_990(interchange)

  assert exc_info.value.code == expected_code


@pytest.mark.parametrize(
  ('at7_code', 'expected_status'),
  [
    ('AF', ShipmentStatus.PICKED_UP),
    ('X6', ShipmentStatus.IN_TRANSIT),
    ('X1', ShipmentStatus.ARRIVED),
    ('D1', ShipmentStatus.DELIVERED),
  ],
)
def test_maps_midwest_214_supported_status_codes(at7_code: str, expected_status: ShipmentStatus) -> None:
  mapped = _map_214(midwest_214(at7_code=at7_code))

  assert mapped.shipment_number == 'LOAD500'
  assert mapped.carrier_load_number == 'MWC900500'
  assert mapped.status == expected_status
  assert mapped.occurred_at == datetime(2026, 10, 7, 14, 30, tzinfo=timezone.utc)
  assert mapped.city == 'Aurora'
  assert mapped.state == 'IL'
  assert mapped.bol_reference == 'BOL900'
  assert mapped.po_reference == 'PO111'


@pytest.mark.parametrize(
  ('payload', 'expected_code'),
  [
    (midwest_214().replace('ST*214*0001', 'ST*990*0001'), 'UNEXPECTED_TRANSACTION_SET'),
    (midwest_214().replace('MWCX           ', 'OTHER          ', 1), 'INVALID_PARTNER_PROFILE'),
    (midwest_214().replace('FREIGHTBRIDGE  ', 'OTHER          ', 1), 'INVALID_PARTNER_PROFILE'),
    (midwest_214().replace('*00401*', '*00501*', 1), 'UNSUPPORTED_X12_VERSION'),
    (midwest_214().replace('GS*QM*', 'GS*GF*'), 'INVALID_PARTNER_PROFILE'),
    (midwest_214(at7_code='ZZ'), 'UNSUPPORTED_AT7_CODE'),
    (midwest_214().replace('MS1*Aurora*IL~', 'MS1*Aurora*ILL~'), 'INVALID_LOCATION_STATE'),
    (midwest_214().replace('*1430*UT~', '*1430*LT~'), 'UNSUPPORTED_TIME_CODE'),
  ],
)
def test_midwest_214_mapping_rejects_invalid_profile_or_business_fields(payload: str, expected_code: str) -> None:
  interchange = parse_x12(payload)
  validate_x12_envelopes(interchange)

  with pytest.raises(Midwest214MappingError) as exc_info:
    map_midwest_214(interchange)

  assert exc_info.value.code == expected_code


def test_midwest_990_service_persists_response_and_forwards_to_apex() -> None:
  freightbridge_repository = FakeFreightBridgeRepository()
  integration_repository = FakeIntegrationRepository()
  apex_client = FakeApexClient()
  service = Midwest990IngestionService(
    audit_connection=DummyConnection(),
    business_connection=DummyConnection(),
    freightbridge_repository=freightbridge_repository,
    integration_repository=integration_repository,
    apex_client=apex_client,
  )

  result = service.ingest(
    raw_body=MIDWEST_990_ACCEPTED.encode('utf-8'),
    authorization_header='Bearer midwest-inbound-token',
    correlation_id='corr-990',
  )

  assert result.status == 'ACCEPTED'
  assert result.apex_delivery_status == 'DELIVERED_TO_APEX'
  assert freightbridge_repository.tender_response is not None
  assert freightbridge_repository.tender_status == 'ACCEPTED'
  assert freightbridge_repository.current_status == ShipmentStatus.PLANNED
  assert apex_client.delivered_payload['shipment_number'] == 'LOAD500'
  assert integration_repository.transactions[0].direction.value == 'INBOUND'
  assert integration_repository.transactions[0].message_format.value == 'X12'
  assert integration_repository.transactions[1].parent_transaction_id == integration_repository.transaction_ids[0]
  assert integration_repository.succeeded == [integration_repository.transaction_ids[0], integration_repository.transaction_ids[1]]


def test_midwest_214_service_persists_event_and_forwards_to_apex() -> None:
  freightbridge_repository = FakeFreightBridgeRepository()
  integration_repository = FakeIntegrationRepository()
  apex_client = FakeApexShipmentStatusClient()
  service = Midwest214IngestionService(
    audit_connection=DummyConnection(),
    business_connection=DummyConnection(),
    freightbridge_repository=freightbridge_repository,
    integration_repository=integration_repository,
    apex_client=apex_client,
  )

  result = service.ingest(
    raw_body=midwest_214(at7_code='AF').encode('utf-8'),
    correlation_id='corr-214',
    raw_payload_location='/outbound/MWCX_APEX_214_000000907.edi',
  )

  assert result.status == 'ACCEPTED'
  assert result.shipment_status == 'PICKED_UP'
  assert result.current_status == 'PICKED_UP'
  assert result.apex_delivery_status == 'DELIVERED_TO_APEX'
  assert freightbridge_repository.shipment_events[0].status == ShipmentStatus.PICKED_UP
  assert freightbridge_repository.current_status == ShipmentStatus.PICKED_UP
  assert apex_client.delivered_payload['shipment_number'] == 'LOAD500'
  assert integration_repository.transactions[0].document_type == '214'
  assert integration_repository.transactions[1].document_type == 'APEX_SHIPMENT_STATUS'
  assert integration_repository.transactions[1].parent_transaction_id == integration_repository.transaction_ids[0]


def test_midwest_214_late_event_is_appended_without_current_status_regression() -> None:
  freightbridge_repository = FakeFreightBridgeRepository()
  service = Midwest214IngestionService(
    audit_connection=DummyConnection(),
    business_connection=DummyConnection(),
    freightbridge_repository=freightbridge_repository,
    integration_repository=FakeIntegrationRepository(),
    apex_client=FakeApexShipmentStatusClient(),
  )

  service.ingest(
    raw_body=midwest_214(
      at7_code='D1',
      occurred_at=datetime(2026, 10, 8, 18, 30, tzinfo=timezone.utc),
      city='Detroit',
      state='MI',
      interchange_control='000000908',
    ).encode('utf-8'),
    correlation_id='corr-delivered',
  )
  service.ingest(
    raw_body=midwest_214(
      at7_code='X1',
      occurred_at=datetime(2026, 10, 8, 18, 0, tzinfo=timezone.utc),
      city='Detroit',
      state='MI',
      interchange_control='000000909',
    ).encode('utf-8'),
    correlation_id='corr-late-arrived',
  )

  assert [event.status for event in freightbridge_repository.shipment_events] == [
    ShipmentStatus.DELIVERED,
    ShipmentStatus.ARRIVED,
  ]
  assert freightbridge_repository.current_status == ShipmentStatus.DELIVERED
  assert freightbridge_repository.current_status_occurred_at == datetime(2026, 10, 8, 18, 30, tzinfo=timezone.utc)


def test_midwest_214_apex_failure_keeps_parent_successful_and_child_failed() -> None:
  integration_repository = FakeIntegrationRepository()
  service = Midwest214IngestionService(
    audit_connection=DummyConnection(),
    business_connection=DummyConnection(),
    freightbridge_repository=FakeFreightBridgeRepository(),
    integration_repository=integration_repository,
    apex_client=FakeApexShipmentStatusClient(fail=True),
  )

  result = service.ingest(
    raw_body=midwest_214().encode('utf-8'),
    correlation_id='corr-214-apex-fail',
  )

  assert result.apex_delivery_status == 'FAILED'
  assert integration_repository.succeeded == [integration_repository.transaction_ids[0]]
  assert integration_repository.failed == [(integration_repository.transaction_ids[1], ProcessingStage.DELIVERY)]
  assert integration_repository.errors[0]['error_code'] == 'DEPENDENCY_ERROR'


def test_midwest_990_duplicate_tender_returns_409_and_failed_parent_audit() -> None:
  freightbridge_repository = FakeFreightBridgeRepository(tender_status='ACCEPTED')
  integration_repository = FakeIntegrationRepository()
  service = Midwest990IngestionService(
    audit_connection=DummyConnection(),
    business_connection=DummyConnection(),
    freightbridge_repository=freightbridge_repository,
    integration_repository=integration_repository,
    apex_client=FakeApexClient(),
  )

  with pytest.raises(IntegrationAPIError) as exc_info:
    service.ingest(
      raw_body=MIDWEST_990_ACCEPTED.encode('utf-8'),
      authorization_header='Bearer midwest-inbound-token',
      correlation_id='corr-dup',
    )

  assert exc_info.value.status_code == 409
  assert exc_info.value.code == 'TENDER_ALREADY_DECIDED'
  assert integration_repository.failed[0][1] == ProcessingStage.BUSINESS_VALIDATION
  assert integration_repository.errors[0]['error_code'] == 'TENDER_ALREADY_DECIDED'


def test_midwest_990_apex_failure_keeps_parent_successful_and_child_failed() -> None:
  integration_repository = FakeIntegrationRepository()
  service = Midwest990IngestionService(
    audit_connection=DummyConnection(),
    business_connection=DummyConnection(),
    freightbridge_repository=FakeFreightBridgeRepository(),
    integration_repository=integration_repository,
    apex_client=FakeApexClient(fail=True),
  )

  result = service.ingest(
    raw_body=MIDWEST_990_ACCEPTED.encode('utf-8'),
    authorization_header='Bearer midwest-inbound-token',
    correlation_id='corr-apex-fail',
  )

  assert result.apex_delivery_status == 'FAILED'
  assert integration_repository.succeeded == [integration_repository.transaction_ids[0]]
  assert integration_repository.failed == [(integration_repository.transaction_ids[1], ProcessingStage.DELIVERY)]
  assert integration_repository.errors[0]['error_code'] == 'DEPENDENCY_ERROR'


def test_midwest_990_endpoint_returns_202_with_raw_x12_body() -> None:
  app.dependency_overrides[get_midwest_990_ingestion_service] = lambda: FakeRouteIngestionService()

  response = TestClient(app).post(
    '/api/integrations/midwest/tender-responses',
    content=MIDWEST_990_ACCEPTED,
    headers={'Authorization': 'Bearer midwest-inbound-token', 'Content-Type': 'application/edi-x12'},
  )

  assert response.status_code == 202
  assert response.json()['status'] == 'ACCEPTED'
  assert response.json()['shipmentNumber'] == 'LOAD500'


def test_sftp_outbound_poll_archives_valid_990_and_ignores_part_files() -> None:
  fake_sftp = FakeSftpClient({
    '/outbound/MWCX_APEX_990_000000906.edi': MIDWEST_990_ACCEPTED.encode('utf-8'),
    '/outbound/MWCX_APEX_990_000000906.edi.part': b'partial',
  })
  service = MidwestSftpOutboundPollService(
    audit_connection=DummyConnection(),
    business_connection=DummyConnection(),
    client_factory=lambda: fake_sftp,
    freightbridge_repository=FakeFreightBridgeRepository(),
    integration_repository=FakeIntegrationRepository(),
    ingestion_service=Midwest990IngestionService(
      audit_connection=DummyConnection(),
      business_connection=DummyConnection(),
      freightbridge_repository=FakeFreightBridgeRepository(),
      integration_repository=FakeIntegrationRepository(),
      apex_client=FakeApexClient(),
    ),
  )

  result = service.poll(correlation_id='corr-sftp')

  assert result.processed[0].status == 'ARCHIVED'
  assert result.processed[0].destination_path == '/archive/MWCX_APEX_990_000000906.edi'
  assert result.ignored == ['MWCX_APEX_990_000000906.edi.part']
  assert '/archive/MWCX_APEX_990_000000906.edi' in fake_sftp.files
  assert '/outbound/MWCX_APEX_990_000000906.edi' not in fake_sftp.files


def test_sftp_outbound_poll_moves_deterministic_invalid_990_to_error() -> None:
  invalid = MIDWEST_990_ACCEPTED.replace('ST*990*0001', 'ST*204*0001').encode('utf-8')
  fake_sftp = FakeSftpClient({'/outbound/MWCX_APEX_990_000000906.edi': invalid})
  service = MidwestSftpOutboundPollService(
    audit_connection=DummyConnection(),
    business_connection=DummyConnection(),
    client_factory=lambda: fake_sftp,
    freightbridge_repository=FakeFreightBridgeRepository(),
    integration_repository=FakeIntegrationRepository(),
    ingestion_service=Midwest990IngestionService(
      audit_connection=DummyConnection(),
      business_connection=DummyConnection(),
      freightbridge_repository=FakeFreightBridgeRepository(),
      integration_repository=FakeIntegrationRepository(),
      apex_client=FakeApexClient(),
    ),
  )

  result = service.poll(correlation_id='corr-sftp-bad')

  assert result.processed[0].status == 'MOVED_TO_ERROR'
  assert result.processed[0].destination_path == '/error/MWCX_APEX_990_000000906.edi'
  assert '/error/MWCX_APEX_990_000000906.edi' in fake_sftp.files


def test_sftp_outbound_poll_routes_990_and_214_by_transaction_type() -> None:
  fake_sftp = FakeSftpClient({
    '/outbound/MWCX_APEX_990_000000906.edi': MIDWEST_990_ACCEPTED.encode('utf-8'),
    '/outbound/MWCX_APEX_214_000000907.edi': midwest_214().encode('utf-8'),
  })
  tender_service = FakeTypedIngestionService('990')
  status_service = FakeTypedIngestionService('214')
  service = MidwestSftpOutboundPollService(
    audit_connection=DummyConnection(),
    business_connection=DummyConnection(),
    client_factory=lambda: fake_sftp,
    ingestion_service=tender_service,
    shipment_status_ingestion_service=status_service,
  )

  result = service.poll(correlation_id='corr-route')

  assert [item.status for item in result.processed] == ['ARCHIVED', 'ARCHIVED']
  assert tender_service.calls == ['corr-route:MWCX_APEX_990_000000906.edi']
  assert status_service.calls == ['corr-route:MWCX_APEX_214_000000907.edi']
  assert '/archive/MWCX_APEX_214_000000907.edi' in fake_sftp.files


def test_sftp_outbound_poll_moves_unsupported_transaction_to_error() -> None:
  unsupported = midwest_214().replace('ST*214*0001', 'ST*204*0001').replace('SE*7*0001', 'SE*7*0001')
  fake_sftp = FakeSftpClient({'/outbound/MWCX_APEX_204_000000907.edi': unsupported.encode('utf-8')})
  service = MidwestSftpOutboundPollService(
    audit_connection=DummyConnection(),
    business_connection=DummyConnection(),
    client_factory=lambda: fake_sftp,
    ingestion_service=FakeTypedIngestionService('990'),
    shipment_status_ingestion_service=FakeTypedIngestionService('214'),
  )

  result = service.poll(correlation_id='corr-unsupported')

  assert result.processed[0].status == 'MOVED_TO_ERROR'
  assert result.processed[0].error_code == 'UNSUPPORTED_TRANSACTION_SET'
  assert '/error/MWCX_APEX_204_000000907.edi' in fake_sftp.files


def _map(payload: str):
  interchange = parse_x12(payload)
  validate_x12_envelopes(interchange)
  return map_midwest_990(interchange)


def _map_214(payload: str):
  interchange = parse_x12(payload)
  validate_x12_envelopes(interchange)
  return map_midwest_214(interchange)


class DummyConnection:
  @contextmanager
  def transaction(self):
    yield


class FakeFreightBridgeRepository:
  def __init__(self, *, tender_status: str = 'PENDING', missing_shipment: bool = False) -> None:
    self.partner_ids = {'MWCX': uuid4(), 'APEX': uuid4()}
    self.tender_status = tender_status
    self.current_status = ShipmentStatus.PLANNED
    self.current_status_occurred_at = None
    self.missing_shipment = missing_shipment
    self.shipment_id = uuid4()
    self.tender_response = None
    self.shipment_events = []

  def fetch_trading_partner_by_code(self, partner_code: str):
    if partner_code not in self.partner_ids:
      return None
    return {'id': self.partner_ids[partner_code], 'partner_code': partner_code, 'active': True}

  def record_tender_response(self, response, shipment_number: str):
    if self.missing_shipment:
      raise ShipmentNotFoundForTenderError(shipment_number)
    if self.tender_status != 'PENDING':
      raise TenderAlreadyDecidedError(shipment_number)
    self.tender_response = response
    self.tender_status = response.decision.value
    return {'id': uuid4(), 'shipment_id': self.shipment_id}

  def record_shipment_event(self, shipment_number: str, event):
    if self.missing_shipment:
      raise ShipmentNotFoundForEventError(shipment_number)
    event_id = uuid4()
    resolved_event = event.model_copy(update={'id': event_id, 'shipment_id': self.shipment_id})
    self.shipment_events.append(resolved_event)
    snapshot = apply_shipment_event(
      current_status=self.current_status,
      current_status_occurred_at=self.current_status_occurred_at,
      event=resolved_event,
    )
    advanced = snapshot.status != self.current_status or snapshot.occurred_at != self.current_status_occurred_at
    self.current_status = snapshot.status
    self.current_status_occurred_at = snapshot.occurred_at
    return {
      'event_id': event_id,
      'shipment_id': self.shipment_id,
      'advanced': advanced,
      'current_status': self.current_status,
      'current_status_occurred_at': self.current_status_occurred_at,
    }


class FakeIntegrationRepository:
  def __init__(self) -> None:
    self.transactions = []
    self.transaction_ids: list[UUID] = []
    self.succeeded: list[UUID] = []
    self.failed: list[tuple[UUID, ProcessingStage]] = []
    self.errors: list[dict[str, object]] = []
    self.states: list[tuple[UUID, ProcessingStatus, ProcessingStage, bool]] = []
    self.x12_metadata = None

  def create_transaction(self, transaction):
    transaction_id = uuid4()
    self.transaction_ids.append(transaction_id)
    self.transactions.append(transaction)
    return transaction_id

  def update_x12_metadata(self, transaction_id, **kwargs) -> None:
    self.x12_metadata = kwargs

  def update_processing_state(self, transaction_id, status, stage, *, processed=False):
    self.states.append((transaction_id, status, stage, processed))

  def mark_succeeded(self, transaction_id):
    self.succeeded.append(transaction_id)
    self.update_processing_state(transaction_id, ProcessingStatus.SUCCEEDED, ProcessingStage.COMPLETED, processed=True)

  def mark_failed(self, transaction_id, stage):
    self.failed.append((transaction_id, stage))
    self.update_processing_state(transaction_id, ProcessingStatus.FAILED, stage, processed=True)

  def append_error(self, **kwargs):
    self.errors.append(kwargs)
    return uuid4()

  def append_log(self, log):
    return uuid4()


class FakeApexClient:
  def __init__(self, *, fail: bool = False) -> None:
    self.fail = fail
    self.delivered_payload = None

  def deliver_tender_response(self, *, shipment_number: str, response):
    if self.fail:
      raise ApexTenderResponseDeliveryError(
        status_code=503,
        code='DEPENDENCY_ERROR',
        message='Apex simulator could not be reached.',
      )
    self.delivered_payload = {'shipment_number': shipment_number, 'response': response}
    return ApexTenderResponseDeliveryResult(status='DELIVERED_TO_APEX', response_body={'status': 'ACCEPTED'})


class FakeApexShipmentStatusClient:
  def __init__(self, *, fail: bool = False) -> None:
    self.fail = fail
    self.delivered_payload = None

  def deliver_shipment_status(self, *, shipment_number: str, event, status_description: str | None = None):
    if self.fail:
      raise ApexShipmentStatusDeliveryError(
        status_code=503,
        code='DEPENDENCY_ERROR',
        message='Apex simulator could not be reached.',
      )
    self.delivered_payload = {
      'shipment_number': shipment_number,
      'event': event,
      'status_description': status_description,
    }
    return ApexShipmentStatusDeliveryResult(status='DELIVERED_TO_APEX', response_body={'status': 'ACCEPTED'})


class FakeRouteIngestionService:
  def ingest(self, *, raw_body: bytes, authorization_header: str | None, correlation_id: str):
    assert raw_body == MIDWEST_990_ACCEPTED.encode('utf-8')
    return type(
      'Result',
      (),
      {
        'correlation_id': correlation_id,
        'response_body': lambda self: {
          'status': 'ACCEPTED',
          'correlationId': correlation_id,
          'transactionId': str(uuid4()),
          'shipmentNumber': 'LOAD500',
          'decision': 'ACCEPTED',
          'apexDelivery': {'status': 'DELIVERED_TO_APEX'},
        },
      },
    )()


class FakeTypedIngestionService:
  def __init__(self, document_type: str) -> None:
    self.document_type = document_type
    self.calls = []

  def ingest(self, *, raw_body: bytes, correlation_id: str, transport, raw_payload_location: str | None = None):
    self.calls.append(correlation_id)
    return type(
      'Result',
      (),
      {
        'document_type': self.document_type,
      },
    )()


class FakeSftpClient:
  def __init__(self, files: dict[str, bytes]) -> None:
    self.files = dict(files)

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
    return remote_path in self.files or any(path.startswith(remote_path.rstrip('/') + '/') for path in self.files)

  def rename(self, source_path: str, destination_path: str) -> None:
    self.files[destination_path] = self.files.pop(source_path)
