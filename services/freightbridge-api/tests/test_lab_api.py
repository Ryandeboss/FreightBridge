from datetime import UTC, datetime
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from app.api.routes.lab import get_lab_service
from app.core.config import get_settings
from app.integrations.lab import LabExecutionError
from app.main import app


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


class FakeLabService:
  def __init__(self, *, completed: bool = False, blocked: bool = False) -> None:
    self.completed = completed
    self.blocked = blocked
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
    run = lab_run(status='SUCCEEDED', step_status='SUCCEEDED')
    return run, run['steps'][0], self.completed

  def run_next(self, run_id: UUID):
    run = lab_run(status='SUCCEEDED', step_status='SUCCEEDED')
    return run, run['steps'][0], False
