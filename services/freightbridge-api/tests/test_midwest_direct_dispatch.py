from uuid import uuid4

from fastapi.testclient import TestClient
import pytest

from app.api.routes.midwest_integrations import get_midwest_direct_dispatch_service
from app.domain import ErrorCategory, ProcessingStage, ProcessingStatus
from app.integrations.midwest.dispatch_service import MidwestDirectDispatchService
from app.integrations.midwest.retry_service import Midwest204ManualRetryService, RetryRejectedError
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


def test_keyed_sftp_dispatch_replays_original_without_regenerating_or_reuploading() -> None:
  integration_repository = FakeIntegrationRepository()
  fake_client = FakeSftpClient()
  generation_service = FakeGenerationService()
  service = MidwestDirectDispatchService(
    audit_connection=object(),
    business_connection=object(),
    freightbridge_repository=FakeFreightBridgeRepository(),
    integration_repository=integration_repository,
    generation_service=generation_service,
    transport=MidwestSftpTransport(client_factory=lambda: fake_client),
  )

  first = service.dispatch(shipment_number='LOAD500', correlation_id='corr-sftp-1', idempotency_key='dispatch-once')
  upload_count = len(fake_client.uploads)
  second = service.dispatch(shipment_number='LOAD500', correlation_id='corr-sftp-2', idempotency_key='dispatch-once')

  assert first.idempotent_replay is False
  assert second.idempotent_replay is True
  assert second.transaction_id == first.transaction_id
  assert second.original_transaction_id == first.transaction_id
  assert second.midwest['fileName'] == first.midwest['fileName']
  assert len(fake_client.uploads) == upload_count
  assert generation_service.calls == ['LOAD500']


def test_keyed_sftp_dispatch_rejects_key_reuse_for_different_shipment() -> None:
  integration_repository = FakeIntegrationRepository()
  service = MidwestDirectDispatchService(
    audit_connection=object(),
    business_connection=object(),
    freightbridge_repository=FakeFreightBridgeRepository(),
    integration_repository=integration_repository,
    generation_service=FakeGenerationService(),
    transport=MidwestSftpTransport(client_factory=lambda: FakeSftpClient()),
  )

  service.dispatch(shipment_number='LOAD500', correlation_id='corr-sftp-1', idempotency_key='dispatch-once')

  with pytest.raises(MidwestDeliveryError) as exc_info:
    service.dispatch(shipment_number='LOAD501', correlation_id='corr-sftp-2', idempotency_key='dispatch-once')

  assert exc_info.value.status_code == 409
  assert exc_info.value.code == 'IDEMPOTENCY_KEY_REUSE'


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


def test_sftp_retry_reconciles_identical_existing_file() -> None:
  payload = generated_result().serialized_x12
  fake_client = FakeSftpClient({'/inbound/APEX_MWCX_204_000000905.edi': payload.encode('utf-8')})
  transport = MidwestSftpTransport(client_factory=lambda: fake_client)

  result = transport.deliver_existing_204(
    payload_text=payload,
    interchange_control_number='000000905',
    shipment_number='LOAD500',
  )

  assert result.response_body['deliveryDisposition'] == 'ALREADY_PRESENT_IDENTICAL'
  assert fake_client.files['/inbound/APEX_MWCX_204_000000905.edi'] == payload.encode('utf-8')
  assert fake_client.uploads == []


def test_sftp_retry_rejects_different_existing_file_without_overwrite() -> None:
  fake_client = FakeSftpClient({'/inbound/APEX_MWCX_204_000000905.edi': b'different'})
  transport = MidwestSftpTransport(client_factory=lambda: fake_client)

  with pytest.raises(MidwestDeliveryError) as exc_info:
    transport.deliver_existing_204(
      payload_text=generated_result().serialized_x12,
      interchange_control_number='000000905',
      shipment_number='LOAD500',
    )

  assert exc_info.value.code == 'SFTP_FILE_CONFLICT'
  assert fake_client.files['/inbound/APEX_MWCX_204_000000905.edi'] == b'different'


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


def test_manual_retry_uses_exact_payload_and_resolves_original_error() -> None:
  original_id = uuid4()
  retry_id = uuid4()
  repository = FakeRetryRepository(original_id=original_id, retry_id=retry_id)
  transport = FakeRetryTransport()
  service = Midwest204ManualRetryService(repository=repository, transport=transport)

  result = service.retry(original_id, note='retry from ops')

  assert result['status'] == 'SUCCEEDED'
  assert result['retryTransactionId'] == retry_id
  assert result['attemptNumber'] == 1
  assert transport.payloads == [repository.payload['payload_text']]
  assert repository.original_status == 'FAILED'
  assert repository.success_completed['retry_transaction_id'] == retry_id
  assert repository.resolved_by_transaction_id == retry_id
  assert repository.retry_count == 1


def test_manual_retry_failure_creates_failed_child_and_leaves_original_error_unresolved() -> None:
  original_id = uuid4()
  retry_id = uuid4()
  repository = FakeRetryRepository(original_id=original_id, retry_id=retry_id)
  service = Midwest204ManualRetryService(
    repository=repository,
    transport=FakeRetryTransport(
      error=MidwestDeliveryError(
        503,
        'DEPENDENCY_ERROR',
        'Midwest SFTP delivery failed.',
        ErrorCategory.TRANSPORT_ERROR,
        retryable=True,
      )
    ),
  )

  with pytest.raises(MidwestDeliveryError):
    service.retry(original_id, note='retry from ops')

  assert repository.failed_completed['retry_transaction_id'] == retry_id
  assert repository.original_status == 'FAILED'
  assert repository.resolved_by_transaction_id is None


@pytest.mark.parametrize(
  ('begin_status', 'expected_code'),
  [
    ('TRANSACTION_NOT_RETRYABLE', 'TRANSACTION_NOT_RETRYABLE'),
    ('RETRY_LIMIT_EXCEEDED', 'RETRY_LIMIT_EXCEEDED'),
  ],
)
def test_manual_retry_rejects_non_retryable_or_limited_transactions(begin_status: str, expected_code: str) -> None:
  repository = FakeRetryRepository(original_id=uuid4(), retry_id=uuid4(), begin_status=begin_status)
  service = Midwest204ManualRetryService(repository=repository, transport=FakeRetryTransport())

  with pytest.raises(RetryRejectedError) as exc_info:
    service.retry(repository.original_id, note='blocked')

  assert exc_info.value.code == expected_code
  assert repository.retry_count == 0


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
  def __init__(self) -> None:
    self.partner_id = uuid4()

  def fetch_trading_partner_by_code(self, partner_code: str):
    return {'id': self.partner_id, 'partner_code': partner_code, 'active': True}


class FakeGenerationService:
  def __init__(self) -> None:
    self.calls = []

  def generate_for_shipment_number(self, shipment_number: str):
    self.calls.append(shipment_number)
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
    self.payloads = []
    self.idempotency_records = {}

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

  def store_message_payload(self, **kwargs):
    self.payloads.append(kwargs)

  def acquire_idempotency_record(self, **kwargs):
    key = (kwargs['partner_id'], kwargs['direction'].value, kwargs['document_type'], kwargs['operation'], kwargs['idempotency_key'])
    if key in self.idempotency_records:
      return {**self.idempotency_records[key], 'acquired': False}
    record = {
      'id': uuid4(),
      'request_fingerprint': kwargs['request_fingerprint'],
      'status': 'PROCESSING',
      'original_transaction_id': None,
      'response_snapshot': None,
    }
    self.idempotency_records[key] = record
    return {**record, 'acquired': True}

  def mark_idempotency_succeeded(self, record_id, *, original_transaction_id, business_identifier, response_snapshot):
    for record in self.idempotency_records.values():
      if record['id'] == record_id:
        record.update({
          'status': 'SUCCEEDED',
          'original_transaction_id': original_transaction_id,
          'response_snapshot': response_snapshot,
        })

  def mark_idempotency_failed(self, record_id, *, original_transaction_id=None):
    for record in self.idempotency_records.values():
      if record['id'] == record_id:
        record['status'] = 'FAILED'

  def record_idempotent_replay(self, record_id):
    return None


class FakeRouteDispatchService:
  def __init__(self, error: MidwestDeliveryError | None = None) -> None:
    self.error = error

  def dispatch(self, *, shipment_number: str, correlation_id: str, idempotency_key: str | None = None):
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
  def __init__(self, files: dict[str, bytes] | None = None) -> None:
    self.files = dict(files or {})
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

  def download_bytes(self, remote_path: str) -> bytes:
    return self.files[remote_path]

  def upload_bytes_atomic_reconcile_identical(self, remote_directory: str, final_filename: str, payload: bytes):
    final_path = remote_directory.rstrip('/') + '/' + final_filename
    if self.exists(final_path):
      if self.download_bytes(final_path) == payload:
        return final_path, 'ALREADY_PRESENT_IDENTICAL'
      raise MidwestSftpFileConflictError('exists')
    return self.upload_bytes_atomic(remote_directory, final_filename, payload), 'UPLOADED'


class FailingSftpClient(FakeSftpClient):
  def __init__(self, error: MidwestSftpError) -> None:
    super().__init__()
    self.error = error

  def upload_bytes_atomic(self, remote_directory: str, final_filename: str, payload: bytes) -> str:
    raise self.error


class FakeRetryRepository:
  def __init__(self, *, original_id, retry_id, begin_status: str = 'PROCESSING') -> None:
    self.original_id = original_id
    self.retry_id = retry_id
    self.begin_status = begin_status
    self.retry_count = 0
    self.original_status = 'FAILED'
    self.payload = {
      'payload_text': generated_result().serialized_x12,
      'payload_sha256': 'sha',
    }
    self.success_completed = None
    self.failed_completed = None
    self.resolved_by_transaction_id = None

  def begin_retry_attempt(self, transaction_id, *, note=None, max_attempts=3):
    if self.begin_status != 'PROCESSING':
      return {
        'status': self.begin_status,
        'original': {'document_type': '204', 'business_identifier': 'LOAD500', 'transport': 'SFTP'},
      }
    self.retry_count += 1
    return {
      'status': 'PROCESSING',
      'original': {
        'id': self.original_id,
        'document_type': '204',
        'business_identifier': 'LOAD500',
        'transport': 'SFTP',
        'interchange_control_number': '000000905',
        'group_control_number': '905',
        'transaction_control_number': '0001',
      },
      'payload': self.payload,
      'retry_transaction_id': self.retry_id,
      'retry_attempt_id': uuid4(),
      'attempt_number': self.retry_count,
    }

  def complete_retry_success(self, **kwargs):
    self.success_completed = kwargs
    self.resolved_by_transaction_id = kwargs['retry_transaction_id']

  def complete_retry_failure(self, **kwargs):
    self.failed_completed = kwargs


class FakeRetryTransport:
  def __init__(self, error: MidwestDeliveryError | None = None) -> None:
    self.error = error
    self.payloads = []

  def deliver_existing_204(self, *, payload_text, interchange_control_number, shipment_number):
    self.payloads.append(payload_text)
    if self.error is not None:
      raise self.error
    return MidwestDeliveryResult(
      status='DELIVERED',
      status_code=202,
      response_body={
        'fileName': f'APEX_MWCX_204_{interchange_control_number}.edi',
        'remotePath': f'/inbound/APEX_MWCX_204_{interchange_control_number}.edi',
        'deliveryDisposition': 'UPLOADED',
      },
    )
