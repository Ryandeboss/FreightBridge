from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
import json
from uuid import UUID

from app.core.config import get_settings
from app.infrastructure.configuration_repository import IntegrationConfigurationRepository
from app.infrastructure.database import connect
from app.infrastructure.operations_repository import OperationsRepository
from app.integrations.apex.service import ApexLoadTenderIngestionService
from app.integrations.common.correlation import resolve_correlation_id
from app.integrations.common.errors import IntegrationAPIError
from app.integrations.midwest.sftp_client import (
  MidwestSftpClient,
  MidwestSftpConfig,
  MidwestSftpHostKeyError,
)
from app.integrations.midwest.sftp_poll_service import ERROR_DIR, OUTBOUND_DIR, ARCHIVE_DIR, MidwestSftpOutboundPollService


DRILL_KIND = 'FAILURE_DRILL'
HAPPY_PATH_KIND = 'HAPPY_PATH'
EXPECTED_OUTCOME = 'EXPECTED_FAILURE_OBSERVED'


@dataclass(frozen=True)
class ExpectedFailure:
  error_code: str
  category: str
  stage: str
  retryable: bool
  document_type: str | None = None
  transport: str | None = None

  def view(self) -> dict[str, object]:
    return {
      'errorCode': self.error_code,
      'category': self.category,
      'stage': self.stage,
      'retryable': self.retryable,
      'documentType': self.document_type,
      'transport': self.transport,
    }


@dataclass(frozen=True)
class ObservedFailure:
  error_id: str | None
  transaction_id: str | None
  correlation_id: str | None
  business_identifier: str | None
  error_code: str
  category: str
  stage: str
  retryable: bool
  safe_message: str
  processing_status: str | None = None
  document_type: str | None = None
  transport: str | None = None

  def view(self) -> dict[str, object]:
    return {
      'errorId': self.error_id,
      'transactionId': self.transaction_id,
      'correlationId': self.correlation_id,
      'businessIdentifier': self.business_identifier,
      'errorCode': self.error_code,
      'category': self.category,
      'stage': self.stage,
      'retryable': self.retryable,
      'safeMessage': self.safe_message,
      'processingStatus': self.processing_status,
      'documentType': self.document_type,
      'transport': self.transport,
    }


@dataclass(frozen=True)
class FailureDrillStepDefinition:
  step_key: str
  display_name: str
  document_type: str
  transport: str
  message_format: str


@dataclass(frozen=True)
class FailureDrillDefinition:
  scenario_key: str
  name: str
  description: str
  layer: str
  expected: ExpectedFailure
  guidance: str
  injected_fault: str
  steps: tuple[FailureDrillStepDefinition, ...]

  def scenario_metadata(self) -> dict[str, object]:
    return {
      'scenario_key': self.scenario_key,
      'name': self.name,
      'description': self.description,
      'step_count': len(self.steps),
      'kind': DRILL_KIND,
      'expected_failure': self.expected.view(),
      'guidance': self.guidance,
      'injected_fault': self.injected_fault,
      'layer': self.layer,
    }


DRILL_DEFINITIONS: dict[str, FailureDrillDefinition] = {
  'APEX_BAD_AUTH': FailureDrillDefinition(
    'APEX_BAD_AUTH',
    'Bad Apex Authentication',
    'Send a valid synthetic Apex tender with a deliberately invalid synthetic Authorization value.',
    'Authentication',
    ExpectedFailure('AUTHENTICATION_ERROR', 'AUTHENTICATION_ERROR', 'AUTHENTICATION', False, 'APEX_LOAD_TENDER', 'REST'),
    'Check the partner credential configured for the environment and confirm the caller is using the expected Authorization scheme.',
    'Synthetic Authorization header rejected before parsing.',
    (FailureDrillStepDefinition('INJECT_APEX_BAD_AUTH', 'Inject bad Apex authentication', 'APEX_LOAD_TENDER', 'REST', 'JSON'),),
  ),
  'APEX_INVALID_JSON': FailureDrillDefinition(
    'APEX_INVALID_JSON',
    'Invalid Apex JSON',
    'Send malformed JSON bytes with valid server-side Apex authentication.',
    'Parsing',
    ExpectedFailure('INVALID_JSON', 'SYNTAX_ERROR', 'PARSING', False, 'APEX_LOAD_TENDER', 'REST'),
    'JSON could not be parsed. Check the request body syntax before validating contract fields.',
    'Malformed JSON body: {"loadId":',
    (FailureDrillStepDefinition('INJECT_APEX_INVALID_JSON', 'Inject invalid Apex JSON', 'APEX_LOAD_TENDER', 'REST', 'JSON'),),
  ),
  'APEX_INVALID_CONTRACT': FailureDrillDefinition(
    'APEX_INVALID_CONTRACT',
    'Invalid Apex Contract',
    'Send syntactically valid JSON with pickup.postalCode removed.',
    'Validation',
    ExpectedFailure('INVALID_APEX_LOAD', 'BUSINESS_VALIDATION_ERROR', 'VALIDATION', False, 'APEX_LOAD_TENDER', 'REST'),
    'JSON parsed successfully, but the request did not satisfy the Apex load contract. Check required fields and data types.',
    'pickup.postalCode removed from an otherwise valid payload.',
    (FailureDrillStepDefinition('INJECT_APEX_INVALID_CONTRACT', 'Inject invalid Apex contract', 'APEX_LOAD_TENDER', 'REST', 'JSON'),),
  ),
  'APEX_DUPLICATE_SHIPMENT': FailureDrillDefinition(
    'APEX_DUPLICATE_SHIPMENT',
    'Duplicate Apex Shipment',
    'Create a baseline load, then resend the same load without an Idempotency-Key.',
    'Business validation',
    ExpectedFailure('DUPLICATE_SHIPMENT', 'DUPLICATE_TRANSACTION', 'BUSINESS_VALIDATION', False, 'APEX_LOAD_TENDER', 'REST'),
    'Repeated request without Idempotency-Key is a duplicate shipment failure. Repeating with a valid idempotency key is a safe replay.',
    'Second request reuses the same loadId without Idempotency-Key.',
    (
      FailureDrillStepDefinition('CREATE_DUPLICATE_BASELINE', 'Create duplicate baseline', 'APEX_LOAD_TENDER', 'REST', 'JSON'),
      FailureDrillStepDefinition('INJECT_DUPLICATE_SHIPMENT', 'Inject duplicate shipment', 'APEX_LOAD_TENDER', 'REST', 'JSON'),
    ),
  ),
  'X12_214_CONTROL_MISMATCH': FailureDrillDefinition(
    'X12_214_CONTROL_MISMATCH',
    '214 Control Mismatch',
    'Upload a synthetic 214 with ST02 and SE02 control numbers that do not match.',
    'X12 envelope',
    ExpectedFailure('CONTROL_NUMBER_MISMATCH', 'SYNTAX_ERROR', 'PARSING', False, '214', 'SFTP'),
    'Check envelope control numbers before troubleshooting business mapping.',
    'SE02 changed so it does not match ST02.',
    (FailureDrillStepDefinition('INJECT_X12_214_CONTROL_MISMATCH', 'Inject 214 control mismatch', '214', 'SFTP', 'X12'),),
  ),
  'X12_214_UNSUPPORTED_STATUS': FailureDrillDefinition(
    'X12_214_UNSUPPORTED_STATUS',
    '214 Unsupported Status',
    'Upload a structurally valid 214 with unsupported AT7-01 status code ZZ.',
    'Mapping',
    ExpectedFailure('UNSUPPORTED_AT7_CODE', 'MAPPING_ERROR', 'MAPPING', False, '214', 'SFTP'),
    'Check the trading-partner implementation guide and the active 214 status-code mapping.',
    'AT7-01 changed to unsupported code ZZ.',
    (FailureDrillStepDefinition('INJECT_X12_214_UNSUPPORTED_STATUS', 'Inject unsupported 214 status', '214', 'SFTP', 'X12'),),
  ),
  'X12_214_WRONG_VERSION': FailureDrillDefinition(
    'X12_214_WRONG_VERSION',
    '214 Wrong Version',
    'Upload a structurally valid 214 using unsupported ISA12/GS08 version identifiers.',
    'Mapping/profile',
    ExpectedFailure('UNSUPPORTED_X12_VERSION', 'MAPPING_ERROR', 'MAPPING', False, '214', 'SFTP'),
    'Confirm the partner is sending the X12 version supported by the active 214 mapping profile.',
    'ISA12 set to 00501 and GS08 set to 005010.',
    (FailureDrillStepDefinition('INJECT_X12_214_WRONG_VERSION', 'Inject wrong 214 version', '214', 'SFTP', 'X12'),),
  ),
  'SFTP_HOST_KEY_MISMATCH': FailureDrillDefinition(
    'SFTP_HOST_KEY_MISMATCH',
    'SFTP Host-Key Mismatch',
    'Probe SFTP with the real endpoint settings but a temporary invalid expected host-key fingerprint.',
    'Transport',
    ExpectedFailure('SFTP_HOST_KEY_MISMATCH', 'TRANSPORT_ERROR', 'TRANSPORT_BOUNDARY', False, None, 'SFTP'),
    'Failure occurred before an integration transaction could be created. Check SFTP host-key pinning and endpoint identity.',
    'Temporary in-memory host-key fingerprint mismatch.',
    (FailureDrillStepDefinition('INJECT_SFTP_HOST_KEY_MISMATCH', 'Probe SFTP host-key mismatch', 'TRANSPORT_PROBE', 'SFTP', 'NONE'),),
  ),
}


class ControlledX12FaultFactory:
  def build_214(self, *, fault_key: str, load_id: str, run_id: UUID) -> tuple[str, bytes, dict[str, object]]:
    short = run_id.hex[:8].upper()
    numeric = int(run_id.hex[:8], 16) % 999999999
    interchange = f'{numeric:09d}'
    group = str(numeric % 999999 or 907)
    transaction = f'{numeric % 9999 or 1:04d}'
    occurred = datetime.now(timezone.utc).replace(second=0, microsecond=0) + timedelta(minutes=5)
    x12 = self._baseline_214(
      load_id=load_id,
      interchange_control=interchange,
      group_control=group,
      transaction_control=transaction,
      occurred_at=occurred,
    )
    mutation = ''
    if fault_key == 'X12_214_CONTROL_MISMATCH':
      x12 = x12.replace(f'SE*7*{transaction}~', 'SE*7*9999~')
      mutation = f'ST02 {transaction} / SE02 9999'
    elif fault_key == 'X12_214_UNSUPPORTED_STATUS':
      x12 = x12.replace('AT7*AF', 'AT7*ZZ')
      mutation = 'AT7-01 ZZ'
    elif fault_key == 'X12_214_WRONG_VERSION':
      x12 = x12.replace('*00401*', '*00501*', 1).replace('*004010~', '*005010~', 1)
      mutation = 'ISA12 00501 / GS08 005010'
    else:
      raise ValueError(f'Unsupported X12 fault key: {fault_key}')
    filename = f'MWCX_FREIGHTBRIDGE_214_FAULT_{short}.edi'
    metadata = {
      'fileName': filename,
      'interchangeControlNumber': interchange,
      'groupControlNumber': group,
      'transactionControlNumber': transaction,
      'injectedFault': mutation,
      'x12Preview': x12,
    }
    return filename, x12.encode('utf-8'), metadata

  def _baseline_214(
    self,
    *,
    load_id: str,
    interchange_control: str,
    group_control: str,
    transaction_control: str,
    occurred_at: datetime,
  ) -> str:
    date = occurred_at.strftime('%Y%m%d')
    time = occurred_at.strftime('%H%M')
    isa_date = occurred_at.strftime('%y%m%d')
    return (
      f'ISA*00*          *00*          *ZZ*MWCX           *ZZ*FREIGHTBRIDGE  *{isa_date}*{time}*U*00401*{interchange_control}*0*T*:~'
      f'GS*QM*MWCX*FREIGHTBRIDGE*{date}*{time}*{group_control}*X*004010~'
      f'ST*214*{transaction_control}~'
      f'B10*MWC{load_id[-8:]}*{load_id}*MWCX~'
      'L11*BOLFAULT*BM~'
      'L11*POFAULT*PO~'
      f'AT7*AF****{date}*{time}*UT~'
      'MS1*Aurora*IL~'
      f'SE*7*{transaction_control}~'
      f'GE*1*{group_control}~'
      f'IEA*1*{interchange_control}~'
    )


class ControlledFailureDrillService:
  def __init__(
    self,
    *,
    x12_factory: ControlledX12FaultFactory | None = None,
    sftp_client_factory=MidwestSftpClient,
  ) -> None:
    self.x12_factory = x12_factory or ControlledX12FaultFactory()
    self.sftp_client_factory = sftp_client_factory

  def execute(self, run: dict[str, object], step_key: str) -> tuple[dict[str, object], dict[str, object]]:
    definition = DRILL_DEFINITIONS[str(run['scenario_key'])]
    if step_key == 'CREATE_DUPLICATE_BASELINE':
      return self._create_duplicate_baseline(run, definition)
    if definition.scenario_key.startswith('APEX_'):
      return self._execute_apex_failure(run, definition)
    if definition.scenario_key.startswith('X12_'):
      return self._execute_x12_failure(run, definition)
    if definition.scenario_key == 'SFTP_HOST_KEY_MISMATCH':
      return self._execute_host_key_probe(run, definition)
    raise ValueError(f'Unsupported failure drill step: {step_key}')

  def _execute_apex_failure(self, run: dict[str, object], definition: FailureDrillDefinition) -> tuple[dict[str, object], dict[str, object]]:
    snapshot = dict(run['input_snapshot'])
    payload = self._apex_payload(snapshot)
    raw_body = json.dumps(payload).encode('utf-8')
    authorization_header = self._valid_apex_authorization()
    preview: object = payload
    if definition.scenario_key == 'APEX_BAD_AUTH':
      authorization_header = 'Bearer freightbridge-fault-lab-invalid'
    elif definition.scenario_key == 'APEX_INVALID_JSON':
      raw_body = b'{"loadId":'
      preview = '{"loadId":'
    elif definition.scenario_key == 'APEX_INVALID_CONTRACT':
      payload = json.loads(json.dumps(payload))
      payload['pickup'].pop('postalCode', None)
      raw_body = json.dumps(payload).encode('utf-8')
      preview = payload
    elif definition.scenario_key == 'APEX_DUPLICATE_SHIPMENT':
      authorization_header = self._valid_apex_authorization()
    request = self._safe_request(definition, payload_preview=preview)
    observed = self._expect_integration_failure(
      definition,
      lambda correlation_id: self._ingest_apex(raw_body=raw_body, authorization_header=authorization_header, correlation_id=correlation_id),
      correlation_id=resolve_correlation_id(f"lab-{run['id']}-{definition.scenario_key}"),
    )
    return request, self._success_response(definition, observed, payload_preview=preview)

  def _create_duplicate_baseline(self, run: dict[str, object], definition: FailureDrillDefinition) -> tuple[dict[str, object], dict[str, object]]:
    payload = self._apex_payload(dict(run['input_snapshot']))
    correlation_id = resolve_correlation_id(f"lab-{run['id']}-duplicate-baseline")
    result = self._ingest_apex(
      raw_body=json.dumps(payload).encode('utf-8'),
      authorization_header=self._valid_apex_authorization(),
      correlation_id=correlation_id,
    )
    response = result.response_body()
    response.update({
      'drillOutcome': 'BASELINE_CREATED',
      'guidance': definition.guidance,
      '_relatedTransactionIds': [str(result.transaction_id)],
    })
    return self._safe_request(definition, payload_preview=payload), response

  def _execute_x12_failure(self, run: dict[str, object], definition: FailureDrillDefinition) -> tuple[dict[str, object], dict[str, object]]:
    load_id = str(run['business_identifier'])
    filename, payload, metadata = self.x12_factory.build_214(
      fault_key=definition.scenario_key,
      load_id=load_id,
      run_id=UUID(str(run['id'])),
    )
    cleanup: dict[str, object] = {'status': 'NOT_ATTEMPTED'}
    with self.sftp_client_factory() as client:
      remote_path = client.upload_bytes_atomic(OUTBOUND_DIR, filename, payload)
    with connect() as audit_connection:
      with connect() as business_connection:
        poll = MidwestSftpOutboundPollService(
          audit_connection=audit_connection,
          business_connection=business_connection,
          configuration_repository=IntegrationConfigurationRepository(audit_connection),
        ).poll(correlation_id=resolve_correlation_id(f"lab-{run['id']}-{definition.scenario_key}"))
    body = poll.response_body()
    target = next((item for item in body.get('processed', []) if isinstance(item, dict) and item.get('fileName') == filename), None)
    if target is None:
      raise LabDrillMismatch('LAB_EXPECTED_FAILURE_NOT_OBSERVED', f'SFTP poll did not process expected synthetic file {filename}.')
    if target.get('status') != 'MOVED_TO_ERROR' or target.get('errorCode') != definition.expected.error_code:
      raise LabDrillMismatch('LAB_UNEXPECTED_FAILURE', f'Synthetic file did not produce {definition.expected.error_code}.')
    transaction_id = target.get('transactionId')
    if not transaction_id:
      raise LabDrillMismatch('LAB_EXPECTED_FAILURE_NOT_OBSERVED', 'SFTP failure did not expose a transaction ID.')
    observed = self._observed_from_transaction(str(transaction_id))
    self._assert_expected(definition, observed)
    cleanup = self._cleanup_fault_file(filename, target.get('destinationPath'), payload)
    request = self._safe_request(definition, payload_preview=metadata['x12Preview'])
    request.update({'remotePath': remote_path, 'fileName': filename})
    response = self._success_response(definition, observed, payload_preview=metadata['x12Preview'])
    response.update({
      'sftp': {
        'fileName': filename,
        'targetProcessed': target,
        'cleanup': cleanup,
      },
      'x12Fault': metadata,
    })
    return request, response

  def _execute_host_key_probe(self, run: dict[str, object], definition: FailureDrillDefinition) -> tuple[dict[str, object], dict[str, object]]:
    try:
      real = MidwestSftpConfig.from_settings()
      wrong = MidwestSftpConfig(
        host=real.host,
        port=real.port,
        username=real.username,
        private_key_b64=real.private_key_b64,
        host_key_sha256='freightbridge-lab-invalid-host-key',
        timeout_seconds=real.timeout_seconds,
      )
      with self.sftp_client_factory(wrong):
        pass
    except MidwestSftpHostKeyError:
      observed = ObservedFailure(
        error_id=None,
        transaction_id=None,
        correlation_id=None,
        business_identifier=None,
        error_code='SFTP_HOST_KEY_MISMATCH',
        category='TRANSPORT_ERROR',
        stage='TRANSPORT_BOUNDARY',
        retryable=False,
        safe_message='Failure occurred before an integration transaction could be created.',
        processing_status=None,
        document_type=None,
        transport='SFTP',
      )
      return self._safe_request(definition), self._success_response(definition, observed, payload_preview=None)
    raise LabDrillMismatch('LAB_EXPECTED_FAILURE_NOT_OBSERVED', 'SFTP host-key mismatch was not observed.')

  def _expect_integration_failure(self, definition: FailureDrillDefinition, action, *, correlation_id: str) -> ObservedFailure:
    try:
      result = action(correlation_id)
    except IntegrationAPIError as exc:
      if exc.transaction_id is None:
        raise LabDrillMismatch('LAB_EXPECTED_FAILURE_NOT_OBSERVED', 'Expected integration failure did not create a transaction.') from exc
      observed = self._observed_from_transaction(exc.transaction_id)
      self._assert_expected(definition, observed)
      return observed
    raise LabDrillMismatch('LAB_EXPECTED_FAILURE_NOT_OBSERVED', f'Expected {definition.expected.error_code}, but transaction {result.transaction_id} succeeded.')

  def _observed_from_transaction(self, transaction_id: str) -> ObservedFailure:
    with connect() as connection:
      detail = OperationsRepository(connection).get_transaction_detail(UUID(transaction_id))
    if detail is None:
      raise LabDrillMismatch('LAB_EXPECTED_FAILURE_NOT_OBSERVED', 'Failed transaction detail was not found.')
    errors = detail.get('errors') or []
    if not errors:
      raise LabDrillMismatch('LAB_EXPECTED_FAILURE_NOT_OBSERVED', 'Failed transaction did not persist an IntegrationError.')
    error = errors[-1]
    transaction = detail['transaction']
    return ObservedFailure(
      error_id=str(error['id']),
      transaction_id=str(transaction['id']),
      correlation_id=str(transaction['correlation_id']),
      business_identifier=str(transaction['business_identifier']) if transaction.get('business_identifier') else None,
      error_code=str(error['error_code']),
      category=str(error['category']),
      stage=str(error['stage']),
      retryable=bool(error['retryable']),
      safe_message=str(error['safe_message']),
      processing_status=str(transaction['processing_status']),
      document_type=str(transaction['document_type']),
      transport=str(transaction['transport']),
    )

  def _assert_expected(self, definition: FailureDrillDefinition, observed: ObservedFailure) -> None:
    expected = definition.expected
    mismatches = []
    if observed.error_code != expected.error_code:
      mismatches.append(f'code {observed.error_code}')
    if observed.category != expected.category:
      mismatches.append(f'category {observed.category}')
    if observed.stage != expected.stage:
      mismatches.append(f'stage {observed.stage}')
    if observed.retryable != expected.retryable:
      mismatches.append(f'retryable {observed.retryable}')
    if expected.document_type is not None and observed.document_type != expected.document_type:
      mismatches.append(f'document {observed.document_type}')
    if expected.transport is not None and observed.transport != expected.transport:
      mismatches.append(f'transport {observed.transport}')
    if mismatches:
      raise LabDrillMismatch('LAB_UNEXPECTED_FAILURE', 'Observed failure did not match expected classification: ' + ', '.join(mismatches))

  def _success_response(
    self,
    definition: FailureDrillDefinition,
    observed: ObservedFailure,
    *,
    payload_preview: object | None,
  ) -> dict[str, object]:
    related = [observed.transaction_id] if observed.transaction_id else []
    summary = {
      'drillOutcome': EXPECTED_OUTCOME,
      'failureDrill': {
        'scenarioKey': definition.scenario_key,
        'name': definition.name,
        'kind': DRILL_KIND,
        'expected': definition.expected.view(),
        'observed': observed.view(),
        'drillOutcome': EXPECTED_OUTCOME,
        'guidance': definition.guidance,
        'injectedFault': definition.injected_fault,
        'payloadPreview': payload_preview,
        'transactionStatusExplanation': 'The Lab run succeeded because the expected integration failure was correctly produced and recorded.',
      },
    }
    return {
      'drillOutcome': EXPECTED_OUTCOME,
      'expectedFailure': definition.expected.view(),
      'observedFailure': observed.view(),
      'guidance': definition.guidance,
      'injectedFault': definition.injected_fault,
      'payloadPreview': payload_preview,
      '_relatedTransactionIds': related,
      '_resultSummary': summary,
    }

  def _safe_request(self, definition: FailureDrillDefinition, *, payload_preview: object | None = None) -> dict[str, object]:
    return {
      'scenarioKey': definition.scenario_key,
      'kind': DRILL_KIND,
      'expectedFailure': definition.expected.view(),
      'injectedFault': definition.injected_fault,
      'payloadPreview': payload_preview,
    }

  def _ingest_apex(self, *, raw_body: bytes, authorization_header: str, correlation_id: str):
    with connect() as audit_connection:
      with connect() as business_connection:
        return ApexLoadTenderIngestionService(
          audit_connection=audit_connection,
          business_connection=business_connection,
          configuration_repository=IntegrationConfigurationRepository(audit_connection),
        ).ingest(
          raw_body=raw_body,
          authorization_header=authorization_header,
          correlation_id=correlation_id,
          idempotency_key=None,
        )

  def _valid_apex_authorization(self) -> str:
    token = get_settings().apex_inbound_bearer_token
    if not token:
      raise LabDrillMismatch('LAB_APEX_CONFIGURATION_MISSING', 'Apex inbound bearer token is not configured.')
    return f'Bearer {token}'

  def _cleanup_fault_file(self, file_name: str, destination_path: object, payload: bytes) -> dict[str, object]:
    if not isinstance(destination_path, str) or not destination_path.startswith(ERROR_DIR + '/'):
      return {'status': 'SKIPPED', 'reason': 'Target file was not in the SFTP error directory.'}
    try:
      with self.sftp_client_factory() as client:
        archive_path = client.rename_to_unique_archive(destination_path, f'{ARCHIVE_DIR}/{file_name}', payload)
      return {'status': 'ARCHIVED', 'archivePath': archive_path}
    except Exception as exc:
      return {'status': 'FAILED', 'safeMessage': exc.__class__.__name__}

  def _apex_payload(self, snapshot: dict[str, object]) -> dict[str, object]:
    return {
      'loadId': snapshot['loadId'],
      'bolNumber': snapshot['bolNumber'],
      'purchaseOrderNumber': snapshot['purchaseOrderNumber'],
      'customerReference': snapshot['customerReference'],
      'equipmentType': snapshot['equipmentType'],
      'weightLbs': snapshot['weightLbs'],
      'pieces': snapshot['pieces'],
      'commodityDescription': snapshot['commodityDescription'],
      'pickup': snapshot['pickup'],
      'delivery': snapshot['delivery'],
      'references': [
        {'type': 'BOL', 'value': snapshot['bolNumber']},
        {'type': 'PO', 'value': snapshot['purchaseOrderNumber']},
        {'type': 'CUSTOMER_REF', 'value': snapshot['customerReference']},
      ],
      'createdAt': snapshot['createdAt'],
      'updatedAt': snapshot['updatedAt'],
    }


class LabDrillMismatch(Exception):
  def __init__(self, code: str, message: str) -> None:
    super().__init__(message)
    self.code = code
    self.message = message


def drill_definition_view(definition: FailureDrillDefinition) -> dict[str, object]:
  return {
    **definition.scenario_metadata(),
    'steps': [asdict(step) for step in definition.steps],
  }
