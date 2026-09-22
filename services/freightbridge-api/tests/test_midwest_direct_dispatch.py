from uuid import uuid4

from fastapi.testclient import TestClient
import pytest

from app.api.routes.midwest_integrations import get_midwest_direct_dispatch_service
from app.domain import ErrorCategory, ProcessingStage, ProcessingStatus
from app.integrations.midwest.dispatch_service import MidwestDirectDispatchService
from app.integrations.midwest.models import Midwest204GenerationResult
from app.integrations.midwest.transport import (
  MidwestDeliveryError,
  MidwestDeliveryResult,
  MidwestOutboundTransport,
  MidwestSftpTransport,
)
from app.integrations.midwest.sftp_client import (
  MidwestSftpAuthenticationError,
  MidwestSftpConfigurationError,
  MidwestSftpError,
  MidwestSftpFileConflictError,
  MidwestSftpHostKeyError,
)
from app.main import app


def test_direct_dispatch_service_records_successful_outbound_audit() -> None:
  integration_repository = FakeIntegrationRepository()
  service = MidwestDirectDispatchService(
    audit_connection=object(),
    business_connection=object(),
    freightbridge_repository=FakeFreightBridgeRepository(),
    integration_repository=integration_repository,
    generation_service=FakeGenerationService(),
    transport=FakeTransport(),
  )

  result = service.dispatch(shipment_number='LOAD500', correlation_id='corr-1')

  assert result.status == 'DELIVERED_TO_MIDWEST_TEST_GATEWAY'
  assert result.transport == 'REST_TEST_HARNESS'
  assert result.midwest['customerShipmentNumber'] == 'LOAD500'
  assert integration_repository.transaction.message_format.value == 'X12'
  assert integration_repository.transaction.transport.value == 'REST'
  assert integration_repository.transaction.direction.value == 'OUTBOUND'
  assert integration_repository.transaction.processing_status == ProcessingStatus.PROCESSING
  assert integration_repository.marked_succeeded is True
  assert integration_repository.failed_stage is None


def test_sftp_dispatch_uploads_204_atomically_and_records_remote_audit() -> None:
  integration_repository = FakeIntegrationRepository()
  fake_client = FakeSftpClient()
  service = MidwestDirectDispatchService(
    audit_connection=object(),
    business_connection=object(),
    freightbridge_repository=FakeFreightBridgeRepository(),
    integration_repository=integration_repository,
    generation_service=FakeGenerationService(),
    transport=MidwestSftpTransport(client_factory=lambda: fake_client),
  )

  result = service.dispatch(shipment_number='LOAD500', correlation_id='corr-sftp')

  assert result.status == 'DELIVERED_TO_MIDWEST_SFTP'
  assert result.transport == 'SFTP'
  assert result.midwest['fileName'] == 'APEX_MWCX_204_000000905.edi'
  assert result.midwest['remotePath'] == '/inbound/APEX_MWCX_204_000000905.edi'
  assert fake_client.uploads == [
    ('/inbound/APEX_MWCX_204_000000905.edi.part', generated_result().serialized_x12.encode('utf-8')),
    ('rename', '/inbound/APEX_MWCX_204_000000905.edi.part', '/inbound/APEX_MWCX_204_000000905.edi'),
  ]
  assert integration_repository.transaction.transport.value == 'SFTP'
  assert integration_repository.raw_payload_location == '/inbound/APEX_MWCX_204_000000905.edi'


@pytest.mark.parametrize(
  ('sftp_error', 'expected_status', 'expected_code', 'retryable'),
  [
    (MidwestSftpFileConflictError('exists'), 409, 'SFTP_FILE_CONFLICT', False),
    (MidwestSftpHostKeyError('mismatch'), 503, 'SFTP_HOST_KEY_MISMATCH', False),
    (MidwestSftpAuthenticationError('denied'), 503, 'SFTP_AUTHENTICATION_FAILED', False),
    (MidwestSftpConfigurationError('missing'), 503, 'DEPENDENCY_ERROR', True),
    (MidwestSftpError('failed'), 503, 'DEPENDENCY_ERROR', True),
  ],
)
def test_sftp_dispatch_maps_transport_failures(
  sftp_error: MidwestSftpError,
  expected_status: int,
  expected_code: str,
  retryable: bool,
) -> None:
  integration_repository = FakeIntegrationRepository()
  service = MidwestDirectDispatchService(
    audit_connection=object(),
    business_connection=object(),
    freightbridge_repository=FakeFreightBridgeRepository(),
    integration_repository=integration_repository,
    generation_service=FakeGenerationService(),
    transport=MidwestSftpTransport(client_factory=lambda: FailingSftpClient(sftp_error)),
  )

  with pytest.raises(MidwestDeliveryError) as exc_info:
    service.dispatch(shipment_number='LOAD500', correlation_id='corr-sftp-fail')

  assert exc_info.value.status_code == expected_status
  assert exc_info.value.code == expected_code
  assert integration_repository.transaction.transport.value == 'SFTP'
  assert integration_repository.failed_stage == ProcessingStage.DELIVERY
  assert integration_repository.error['error_code'] == expected_code
  assert integration_repository.error['retryable'] is retryable


@pytest.mark.parametrize(
  ('transport_error', 'expected_status', 'expected_code', 'retryable'),
  [
    (
      MidwestDeliveryError(
        409,
        'DUPLICATE_LOAD',
        'Midwest simulator already has this load.',
        ErrorCategory.DUPLICATE_TRANSACTION,
      ),
      409,
      'DUPLICATE_LOAD',
      False,
    ),
    (
      MidwestDeliveryError(
        503,
        'DEPENDENCY_ERROR',
        'Midwest simulator could not be reached.',
        ErrorCategory.DOWNSTREAM_ERROR,
        retryable=True,
      ),
      503,
      'DEPENDENCY_ERROR',
      True,
    ),
    (
      MidwestDeliveryError(
        503,
        'DEPENDENCY_ERROR',
        'Midwest simulator rejected FreightBridge authentication.',
        ErrorCategory.AUTHENTICATION_ERROR,
      ),
      503,
      'DEPENDENCY_ERROR',
      False,
    ),
  ],
)
def test_direct_dispatch_service_records_failed_outbound_audit(
  transport_error: MidwestDeliveryError,
  expected_status: int,
  expected_code: str,
  retryable: bool,
) -> None:
  integration_repository = FakeIntegrationRepository()
  service = MidwestDirectDispatchService(
    audit_connection=object(),
    business_connection=object(),
    freightbridge_repository=FakeFreightBridgeRepository(),
    integration_repository=integration_repository,
    generation_service=FakeGenerationService(),
    transport=FakeTransport(error=transport_error),
  )

  with pytest.raises(MidwestDeliveryError) as exc_info:
    service.dispatch(shipment_number='LOAD500', correlation_id='corr-1')

  assert exc_info.value.status_code == expected_status
  assert exc_info.value.code == expected_code
  assert integration_repository.failed_stage == ProcessingStage.DELIVERY
  assert integration_repository.error['error_code'] == expected_code
  assert integration_repository.error['retryable'] is retryable
  assert integration_repository.last_state[0] == ProcessingStatus.FAILED
  assert integration_repository.last_state[1] == ProcessingStage.DELIVERY


def test_dispatch_direct_endpoint_returns_202() -> None:
  app.dependency_overrides[get_midwest_direct_dispatch_service] = lambda: FakeRouteDispatchService()
  client = TestClient(app)

  response = client.post('/api/integrations/midwest/load-tenders/LOAD500/dispatch-direct')

  app.dependency_overrides.clear()
  assert response.status_code == 202
  body = response.json()
  assert body['status'] == 'DELIVERED_TO_MIDWEST_TEST_GATEWAY'
  assert body['transport'] == 'REST_TEST_HARNESS'


def test_dispatch_direct_endpoint_maps_duplicate() -> None:
  app.dependency_overrides[get_midwest_direct_dispatch_service] = lambda: FakeRouteDispatchService(
    error=MidwestDeliveryError(
      409,
      'DUPLICATE_LOAD',
      'Midwest simulator already has this load.',
      ErrorCategory.DUPLICATE_TRANSACTION,
    )
  )
  client = TestClient(app)

  response = client.post('/api/integrations/midwest/load-tenders/LOAD500/dispatch-direct')

  app.dependency_overrides.clear()
  assert response.status_code == 409
  assert response.json()['error']['code'] == 'DUPLICATE_LOAD'


def generated_result() -> Midwest204GenerationResult:
  return Midwest204GenerationResult(
    shipment_number='LOAD500',
    document_type='204',
    x12_version='004010',
    interchange_control_number='000000905',
    group_control_number='905',
    transaction_control_number='0001',
    serialized_x12='ISA*00*          *00*          *ZZ*FREIGHTBRIDGE  *ZZ*MWCX           *260919*1400*U*00401*000000905*0*T*:~',
    mapping_spec_version='test',
  )


class FakeFreightBridgeRepository:
  def fetch_trading_partner_by_code(self, partner_code: str):
    return {'id': uuid4(), 'partner_code': partner_code, 'active': True}


class FakeGenerationService:
  def generate_for_shipment_number(self, shipment_number: str):
    return generated_result()


class FakeTransport(MidwestOutboundTransport):
  transport_name = 'REST_TEST_HARNESS'

  def __init__(self, error: MidwestDeliveryError | None = None) -> None:
    self.error = error

  def deliver_204(self, *, generated, correlation_id):
    if self.error is not None:
      raise self.error
    return MidwestDeliveryResult(
      status='ACCEPTED',
      status_code=202,
      response_body={
        'status': 'ACCEPTED',
        'customerShipmentNumber': generated.shipment_number,
      },
    )


class FakeIntegrationRepository:
  def __init__(self) -> None:
    self.transaction = None
    self.transaction_id = uuid4()
    self.marked_succeeded = False
    self.failed_stage = None
    self.error = None
    self.last_state = None
    self.raw_payload_location = None

  def create_transaction(self, transaction):
    self.transaction = transaction
    return self.transaction_id

  def update_processing_state(self, transaction_id, status, stage, *, processed=False):
    self.last_state = (status, stage, processed)

  def mark_succeeded(self, transaction_id):
    self.marked_succeeded = True
    self.last_state = (ProcessingStatus.SUCCEEDED, ProcessingStage.COMPLETED, True)

  def mark_failed(self, transaction_id, stage):
    self.failed_stage = stage
    self.last_state = (ProcessingStatus.FAILED, stage, True)

  def append_error(self, **kwargs):
    self.error = kwargs
    return uuid4()

  def append_log(self, log):
    return uuid4()

  def update_raw_payload_location(self, transaction_id, raw_payload_location):
    self.raw_payload_location = raw_payload_location


class FakeRouteDispatchService:
  def __init__(self, error: MidwestDeliveryError | None = None) -> None:
    self.error = error

  def dispatch(self, *, shipment_number: str, correlation_id: str):
    if self.error is not None:
      raise self.error
    return type(
      'Result',
      (),
      {
        'response_body': lambda self: {
          'status': 'DELIVERED_TO_MIDWEST_TEST_GATEWAY',
          'shipmentNumber': shipment_number,
          'documentType': '204',
          'transport': 'REST_TEST_HARNESS',
          'transactionId': str(uuid4()),
          'midwest': {'status': 'ACCEPTED'},
        }
      },
    )()


class FakeSftpClient:
  def __init__(self) -> None:
    self.files = {}
    self.uploads = []

  def __enter__(self):
    return self

  def __exit__(self, exc_type, exc, traceback):
    return None

  def exists(self, path: str) -> bool:
    return path in self.files

  def upload_bytes_atomic(self, remote_directory: str, final_filename: str, payload: bytes) -> str:
    final_path = remote_directory.rstrip('/') + '/' + final_filename
    temp_path = final_path + '.part'
    self.uploads.append((temp_path, payload))
    self.files[temp_path] = payload
    self.uploads.append(('rename', temp_path, final_path))
    self.files[final_path] = self.files.pop(temp_path)
    return final_path


class FailingSftpClient(FakeSftpClient):
  def __init__(self, error: MidwestSftpError) -> None:
    super().__init__()
    self.error = error

  def upload_bytes_atomic(self, remote_directory: str, final_filename: str, payload: bytes) -> str:
    raise self.error
