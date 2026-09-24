from datetime import UTC, datetime
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from app.api.routes.lab import get_lab_service
from app.core.config import get_settings
from app.integrations.lab import IntegrationLabService, LabExecutionError
from app.main import app
from app.models.lab import CreateLabRunRequest


TOKEN = 'ops-test-token'
RUN_ID = UUID('90000000-0000-4000-8000-000000000001')
STEP_ID = UUID('90000000-0000-4000-8000-000000000101')


@pytest.fixture(autouse=True)
def lab_state(monkeypatch):
  get_settings.cache_clear()
  monkeypatch.setenv('OPERATIONS_API_BEARER_TOKEN', TOKEN)
  app.dependency_overrides.clear()
  yield
  app.dependency_overrides.clear()
  get_settings.cache_clear()


def auth_headers() -> dict[str, str]:
  return {'Authorization': f'Bearer {TOKEN}'}


def lab_step(step_key: str = 'CREATE_APEX_LOAD', status: str = 'PENDING') -> dict[str, object]:
  now = datetime(2026, 9, 24, 15, tzinfo=UTC)
  return {
    'id': STEP_ID,
    'run_id': RUN_ID,
    'step_key': step_key,
    'sequence': 1,
    'display_name': 'Create Apex load',
    'sender': 'Analyst',
    'receiver': 'Apex Logistics',
    'transport': 'REST',
    'message_format': 'JSON',
    'document_type': 'APEX_LOAD_TENDER',
    'status': status,
    'attempt_count': 1 if status == 'SUCCEEDED' else 0,
    'request_summary': {},
    'response_summary': {'status': 'ACCEPTED_FOR_PROCESSING'} if status == 'SUCCEEDED' else {},
    'related_transaction_ids': [],
    'error_code': None,
    'safe_message': None,
    'created_at': now,
    'updated_at': now,
    'started_at': now if status == 'SUCCEEDED' else None,
    'completed_at': now if status == 'SUCCEEDED' else None,
  }


def lab_run(status: str = 'READY', step_status: str = 'PENDING') -> dict[str, object]:
  now = datetime(2026, 9, 24, 15, tzinfo=UTC)
  return {
    'id': RUN_ID,
    'scenario_key': 'FULL_SHIPMENT_LIFECYCLE',
    'business_identifier': 'LAB900',
    'status': status,
    'input_snapshot': {'loadId': 'LAB900', 'equipmentType': 'VAN_53'},
    'result_summary': {'technicalAcknowledgment': 'PENDING', 'tenderStatus': 'PENDING'},
    'created_at': now,
    'updated_at': now,
    'started_at': now if status != 'READY' else None,
    'completed_at': now if status in ('SUCCEEDED', 'FAILED') else None,
    'steps': [lab_step(status=step_status)],
  }


def test_lab_auth_rejects_missing_token() -> None:
  response = TestClient(app).get('/api/lab/readiness')

  assert response.status_code == 401
  assert response.json()['detail']['error']['code'] == 'AUTHENTICATION_ERROR'


def test_lab_readiness_lists_scenarios_without_secrets() -> None:
  app.dependency_overrides[get_lab_service] = lambda: FakeLabService()

  response = TestClient(app).get('/api/lab/readiness', headers=auth_headers())

  assert response.status_code == 200
  assert response.json()['status'] == 'ready'
  assert response.json()['scenarios'][0]['scenarioKey'] == 'FULL_SHIPMENT_LIFECYCLE'
  assert 'secret' not in response.text.lower()
  assert 'bearer' not in response.text.lower()
  assert 'database' not in response.text.lower()


def test_lab_create_run_returns_ready_steps_without_side_effects() -> None:
  service = FakeLabService()
  app.dependency_overrides[get_lab_service] = lambda: service

  response = TestClient(app).post(
    '/api/lab/runs',
    headers=auth_headers(),
    json={'scenarioKey': 'FULL_SHIPMENT_LIFECYCLE'},
  )

  assert response.status_code == 201
  assert response.json()['status'] == 'READY'
  assert response.json()['steps'][0]['status'] == 'PENDING'
  assert service.created_payloads[0]['scenarioKey'] == 'FULL_SHIPMENT_LIFECYCLE'
  assert service.created_payloads[0]['equipmentType'] == 'VAN_53'


def test_lab_completed_step_reexecute_is_idempotent() -> None:
  app.dependency_overrides[get_lab_service] = lambda: FakeLabService(completed=True)

  response = TestClient(app).post(
    f'/api/lab/runs/{RUN_ID}/steps/CREATE_APEX_LOAD/execute',
    headers=auth_headers(),
  )

  assert response.status_code == 200
  assert response.json()['alreadyCompleted'] is True
  assert response.json()['step']['status'] == 'SUCCEEDED'


def test_lab_step_prerequisite_failure_returns_safe_error() -> None:
  app.dependency_overrides[get_lab_service] = lambda: FakeLabService(blocked=True)

  response = TestClient(app).post(
    f'/api/lab/runs/{RUN_ID}/steps/DISPATCH_204_SFTP/execute',
    headers=auth_headers(),
  )

  assert response.status_code == 409
  assert response.json()['detail']['error']['code'] == 'LAB_STEP_NOT_READY'
  assert 'token' not in response.text.lower()


def test_lab_rejects_unknown_scenario_and_extra_fields() -> None:
  app.dependency_overrides[get_lab_service] = lambda: FakeLabService()

  response = TestClient(app).post(
    '/api/lab/runs',
    headers=auth_headers(),
    json={'scenarioKey': 'UNKNOWN_SCENARIO', 'unexpectedField': 'not allowed'},
  )

  assert response.status_code == 422
  assert 'unexpectedField' in response.text


def test_lab_apex_payload_matches_deployed_simulator_contract() -> None:
  service = IntegrationLabService(repository=None)  # type: ignore[arg-type]
  request = CreateLabRunRequest.model_validate({'scenarioKey': 'FULL_SHIPMENT_LIFECYCLE', 'loadId': 'LAB900'})

  snapshot = service._input_snapshot(request)
  payload = service._apex_payload(snapshot)

  assert payload['pickup']['facilityName'] == 'ABC Factory'
  assert payload['pickup']['address1'] == '200 Industrial Rd'
  assert 'addressLine1' not in payload['pickup']
  assert payload['delivery']['facilityName'] == 'XYZ Warehouse'
  assert payload['delivery']['address1'] == '900 Commerce St'
  assert payload['equipmentType'] == 'VAN_53'
  assert payload['weightLbs'] == 42000
  assert payload['pieces'] == 22
  assert payload['commodityDescription'] == 'Industrial Components'
  assert payload['createdAt'] <= payload['updatedAt']


def test_lab_failure_drill_scenarios_are_server_declared_with_expected_metadata() -> None:
  service = IntegrationLabService(repository=None)  # type: ignore[arg-type]
  readiness = service.readiness()
  scenarios = {scenario['scenario_key']: scenario for scenario in readiness['scenarios']}

  assert scenarios['APEX_BAD_AUTH']['kind'] == 'FAILURE_DRILL'
  assert scenarios['APEX_BAD_AUTH']['expected_failure']['errorCode'] == 'AUTHENTICATION_ERROR'
  assert scenarios['APEX_INVALID_JSON']['expected_failure']['stage'] == 'PARSING'
  assert scenarios['APEX_INVALID_CONTRACT']['expected_failure']['category'] == 'BUSINESS_VALIDATION_ERROR'
  assert scenarios['APEX_DUPLICATE_SHIPMENT']['step_count'] == 2
  assert scenarios['X12_214_CONTROL_MISMATCH']['expected_failure']['errorCode'] == 'CONTROL_NUMBER_MISMATCH'
  assert scenarios['X12_214_UNSUPPORTED_STATUS']['expected_failure']['errorCode'] == 'UNSUPPORTED_AT7_CODE'
  assert scenarios['X12_214_WRONG_VERSION']['expected_failure']['errorCode'] == 'UNSUPPORTED_X12_VERSION'
  assert scenarios['SFTP_HOST_KEY_MISMATCH']['expected_failure']['stage'] == 'TRANSPORT_BOUNDARY'


def test_lab_create_request_accepts_predefined_failure_drills_only() -> None:
  request = CreateLabRunRequest.model_validate({'scenarioKey': 'APEX_BAD_AUTH'})

  assert request.scenario_key == 'APEX_BAD_AUTH'

  with pytest.raises(Exception):
    CreateLabRunRequest.model_validate({'scenarioKey': 'ARBITRARY_RAW_X12'})


def test_lab_exact_204_preview_uses_stored_payload_metadata() -> None:
  service = IntegrationLabService(repository=None)  # type: ignore[arg-type]

  preview = service._x12_preview_from_payload(
    {
      'payload_text': 'ISA*stored~GS*SM~ST*204*0001~',
      'interchange_control_number': '000000901',
      'group_control_number': '901',
      'transaction_control_number': '0001',
      'mapping_key': 'CANONICAL_TO_MWCX_204',
      'mapping_profile_id': UUID('55555555-5555-4555-8555-555555555555'),
      'mapping_profile_version': 1,
      'payload_sha256': 'abc123',
    },
    {'fileName': 'FB_MWCX_204_000000901.edi', 'remotePath': '/inbound/FB_MWCX_204_000000901.edi'},
  )

  assert preview['x12'] == 'ISA*stored~GS*SM~ST*204*0001~'
  assert preview['mappingKey'] == 'CANONICAL_TO_MWCX_204'
  assert preview['mappingProfileVersion'] == 1
  assert preview['payloadSha256'] == 'abc123'
  assert 'mappingSpecVersion' not in preview


def test_lab_sftp_target_matching_requires_exact_filename() -> None:
  service = IntegrationLabService(repository=None)  # type: ignore[arg-type]
  response = {
    'processed': [
      {'fileName': 'unrelated.edi', 'status': 'ARCHIVED'},
      {'fileName': 'expected.edi', 'status': 'ARCHIVED'},
    ]
  }

  assert service._processed_file(response, 'expected.edi')['status'] == 'ARCHIVED'
  assert service._processed_file(response, 'missing.edi') is None


def test_lab_freightbridge_poll_requires_target_archived_status() -> None:
  service = IntegrationLabService(repository=None)  # type: ignore[arg-type]
  run = lab_run_with_sftp_file('expected.edi')
  service._poll_freightbridge_sftp = lambda correlation_id: {  # type: ignore[method-assign]
    'processed': [{'fileName': 'expected.edi', 'status': 'ARCHIVED'}]
  }

  result = service._verified_freightbridge_poll(
    run,
    'corr',
    expected_file_name='expected.edi',
    document_type='997',
    business_identifier='LAB900',
  )

  assert result['targetProcessed']['status'] == 'ARCHIVED'


@pytest.mark.parametrize(
  ('target_status', 'error_code'),
  [
    ('MOVED_TO_ERROR', 'LAB_SFTP_TARGET_PROCESSING_FAILED'),
    ('LEFT_FOR_RETRY', 'LAB_SFTP_TARGET_RETRY_PENDING'),
  ],
)
def test_lab_freightbridge_poll_rejects_unsuccessful_target_status(target_status: str, error_code: str) -> None:
  service = IntegrationLabService(repository=None)  # type: ignore[arg-type]
  run = lab_run_with_sftp_file('expected.edi')
  service._poll_freightbridge_sftp = lambda correlation_id: {  # type: ignore[method-assign]
    'processed': [{'fileName': 'expected.edi', 'status': target_status}]
  }

  with pytest.raises(LabExecutionError) as exc:
    service._verified_freightbridge_poll(
      run,
      'corr',
      expected_file_name='expected.edi',
      document_type='997',
      business_identifier='LAB900',
    )

  assert exc.value.code == error_code


def test_lab_midwest_204_receive_requires_archived_target_and_ack() -> None:
  service = IntegrationLabService(repository=None)  # type: ignore[arg-type]
  run = lab_run_with_sftp_file('expected.edi')

  result = service._verified_midwest_receive_204(
    run,
    {
      'processed': [
        {
          'fileName': 'expected.edi',
          'status': 'ARCHIVED',
          'functionalAcknowledgmentDocumentId': 'ack-1',
        }
      ]
    },
  )

  assert result['functionalAcknowledgmentDocumentId'] == 'ack-1'


def test_lab_midwest_204_receive_rejects_target_moved_to_error() -> None:
  service = IntegrationLabService(repository=None)  # type: ignore[arg-type]
  run = lab_run_with_sftp_file('expected.edi')

  with pytest.raises(LabExecutionError) as exc:
    service._verified_midwest_receive_204(
      run,
      {
        'processed': [
          {
            'fileName': 'expected.edi',
            'status': 'MOVED_TO_ERROR',
            'functionalAcknowledgmentDocumentId': 'ack-1',
          }
        ]
      },
    )

  assert exc.value.code == 'LAB_SFTP_TARGET_PROCESSING_FAILED'


def test_lab_unrelated_archived_file_does_not_succeed_without_specific_reconciliation() -> None:
  service = IntegrationLabService(repository=None)  # type: ignore[arg-type]
  run = lab_run_with_sftp_file('expected.edi')
  service._poll_freightbridge_sftp = lambda correlation_id: {  # type: ignore[method-assign]
    'processed': [{'fileName': 'unrelated.edi', 'status': 'ARCHIVED'}]
  }
  service._has_matching_functional_ack = lambda candidate: False  # type: ignore[method-assign]

  with pytest.raises(LabExecutionError) as exc:
    service._verified_freightbridge_poll(
      run,
      'corr',
      expected_file_name='expected.edi',
      document_type='997',
      business_identifier='LAB900',
    )

  assert exc.value.code == 'LAB_SFTP_TARGET_FILE_NOT_FOUND'


def test_lab_214_reconciliation_requires_matching_specific_event() -> None:
  service = IntegrationLabService(repository=None)  # type: ignore[arg-type]
  run = lab_run_with_214_create('IN_TRANSIT')
  service.apex = FakeApexStatusClient(
    [
      {
        'status': 'PICKED_UP',
        'occurredAt': '2026-09-25T15:00:00+00:00',
        'city': 'Aurora',
        'state': 'IL',
      }
    ]
  )

  assert service._has_matching_shipment_status(run, 'IN_TRANSIT') is False

  service.apex = FakeApexStatusClient(
    [
      {
        'status': 'IN_TRANSIT',
        'occurredAt': '2026-09-25T23:00:00+00:00',
        'city': 'South Bend',
        'state': 'IN',
      }
    ]
  )

  assert service._has_matching_shipment_status(run, 'IN_TRANSIT') is True


def test_lab_990_reconciliation_requires_expected_tender_outcome() -> None:
  service = IntegrationLabService(repository=None)  # type: ignore[arg-type]
  run = lab_run_with_sftp_file('expected.edi', scenario_key='TENDER_REJECTED')
  service.apex = FakeApexTenderClient('ACCEPTED')

  assert service._has_expected_tender_outcome(run) is False

  service.apex = FakeApexTenderClient('REJECTED')

  assert service._has_expected_tender_outcome(run) is True


def test_lab_997_reconciliation_requires_matching_204_controls(monkeypatch) -> None:
  service = IntegrationLabService(repository=None)  # type: ignore[arg-type]
  run = lab_run_with_sftp_file('expected.edi')

  class FakeIntegrationRepository:
    def __init__(self, connection) -> None:
      pass

    def fetch_latest_functional_acknowledgment_for_shipment(self, shipment_number: str):
      return {
        'acknowledged_group_control_number': 'DIFFERENT',
        'acknowledged_transaction_control_number': '0009',
        'status': 'ACCEPTED',
      }

  class FakeConnection:
    def __enter__(self):
      return self

    def __exit__(self, exc_type, exc, tb):
      return None

  monkeypatch.setattr('app.integrations.lab.connect', lambda: FakeConnection())
  monkeypatch.setattr('app.integrations.lab.IntegrationRepository', FakeIntegrationRepository)

  assert service._has_matching_functional_ack(run) is False


def test_lab_running_step_returns_deterministic_conflict() -> None:
  app.dependency_overrides[get_lab_service] = lambda: FakeLabService(in_progress=True)

  response = TestClient(app).post(
    f'/api/lab/runs/{RUN_ID}/steps/CREATE_APEX_LOAD/execute',
    headers=auth_headers(),
  )

  assert response.status_code == 409
  assert response.json()['detail']['error']['code'] == 'LAB_STEP_IN_PROGRESS'


def lab_run_with_sftp_file(file_name: str, *, scenario_key: str = 'FULL_SHIPMENT_LIFECYCLE') -> dict[str, object]:
  return {
    **lab_run(status='RUNNING'),
    'scenario_key': scenario_key,
    'steps': [
      {
        **lab_step(step_key='DISPATCH_204_SFTP', status='SUCCEEDED'),
        'response_summary': {
          'fileName': file_name,
          'x12Preview': {
            'groupControlNumber': '901',
            'transactionControlNumber': '0001',
          },
        },
      }
    ],
  }


def lab_run_with_214_create(status: str) -> dict[str, object]:
  return {
    **lab_run(status='RUNNING'),
    'steps': [
      {
        **lab_step(step_key=f'CREATE_214_{status}', status='SUCCEEDED'),
        'response_summary': {
          'eventId': 'event-1',
          'status': status,
          'occurredAt': '2026-09-25T23:00:00+00:00',
          'city': 'South Bend',
          'state': 'IN',
        },
      }
    ],
  }


class FakeApexStatusClient:
  def __init__(self, events: list[dict[str, object]]) -> None:
    self.events = events

  def get(self, path: str) -> dict[str, object]:
    return {'events': self.events, 'currentStatus': self.events[-1]['status'] if self.events else 'PLANNED'}


class FakeApexTenderClient:
  def __init__(self, decision: str) -> None:
    self.decision = decision

  def get(self, path: str) -> dict[str, object]:
    return {'currentTenderDecision': self.decision}


class FakeLabService:
  def __init__(self, *, completed: bool = False, blocked: bool = False, in_progress: bool = False) -> None:
    self.completed = completed
    self.blocked = blocked
    self.in_progress = in_progress
    self.created_payloads: list[dict[str, object]] = []

  def readiness(self) -> dict[str, object]:
    return {
      'status': 'ready',
      'dependencies': {'apexSimulatorConfigured': True, 'midwestSimulatorConfigured': True, 'sftpConfigured': True},
      'scenarios': [
        {
          'scenario_key': 'FULL_SHIPMENT_LIFECYCLE',
          'name': 'Full shipment lifecycle',
          'description': 'Accepted tender plus 214 shipment progression.',
          'step_count': 21,
        }
      ],
    }

  def create_run(self, request) -> dict[str, object]:
    self.created_payloads.append(request.model_dump(mode='json', by_alias=True, exclude_none=True))
    return lab_run()

  def execute_step(self, run_id: UUID, step_key: str):
    if self.blocked:
      raise LabExecutionError('LAB_STEP_NOT_READY', 'Earlier Lab steps must succeed before this step can run.')
    if self.in_progress:
      raise LabExecutionError('LAB_STEP_IN_PROGRESS', 'This Lab step is already running.')
    run = lab_run(status='SUCCEEDED', step_status='SUCCEEDED')
    return run, run['steps'][0], self.completed

  def run_next(self, run_id: UUID):
    run = lab_run(status='SUCCEEDED', step_status='SUCCEEDED')
    return run, run['steps'][0], False
