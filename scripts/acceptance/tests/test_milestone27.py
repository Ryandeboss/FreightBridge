import pytest

from scripts.acceptance import milestone27
from scripts.acceptance.common import AcceptanceConfig, AcceptanceFailure, StepRecorder


def config() -> AcceptanceConfig:
  return AcceptanceConfig(
    apex_base_url='https://apex.example',
    apex_bearer_token='apex-write',
    apex_readonly_token='apex-read',
    freightbridge_base_url='https://freightbridge.example',
    midwest_base_url='https://midwest.example',
    midwest_bearer_token='midwest-write',
    midwest_readonly_token='midwest-read',
    operations_bearer_token='operations',
  )


class FakeFreightBridgeClient:
  def __init__(self, *, missing_scenarios: set[str] | None = None) -> None:
    self.missing_scenarios = missing_scenarios or set()
    self.paths: list[tuple[str, str | None]] = []

  def get(self, path: str, *, step: str, token: str | None = None, **_kwargs):
    self.paths.append((path, token))
    if path == '/health':
      return {'status': 'ok', 'service': 'freightbridge-api'}
    if path == '/api/lab/readiness':
      scenarios = [
        {'scenarioKey': scenario}
        for scenario in sorted(milestone27.REQUIRED_SCENARIOS - self.missing_scenarios)
      ]
      return {'status': 'ready', 'scenarios': scenarios, 'dependencies': {}}
    raise AssertionError(f'unexpected path {path}')

  def close(self) -> None:
    pass


def make_acceptance(*, ui_acceptance, missing_scenarios: set[str] | None = None) -> milestone27.Milestone27Acceptance:
  acceptance = milestone27.Milestone27Acceptance(
    config=config(),
    analyst_ui_base_url='https://ui.example',
    recorder=StepRecorder(),
    ui_acceptance=ui_acceptance,
  )
  acceptance.freightbridge = FakeFreightBridgeClient(missing_scenarios=missing_scenarios)
  return acceptance


def test_milestone27_requires_operations_token() -> None:
  bad_config = AcceptanceConfig(
    apex_base_url='https://apex.example',
    apex_bearer_token='apex-write',
    freightbridge_base_url='https://freightbridge.example',
    midwest_base_url='https://midwest.example',
    midwest_bearer_token='midwest-write',
  )

  with pytest.raises(AcceptanceFailure, match='OPERATIONS_API_BEARER_TOKEN'):
    milestone27.Milestone27Acceptance(
      config=bad_config,
      analyst_ui_base_url='https://ui.example',
      recorder=StepRecorder(),
    )


def test_milestone27_requires_analyst_ui_base_url() -> None:
  with pytest.raises(AcceptanceFailure, match='ANALYST_UI_BASE_URL'):
    milestone27.Milestone27Acceptance(
      config=config(),
      analyst_ui_base_url='',
      recorder=StepRecorder(),
    )


def test_milestone27_runs_readiness_before_browser_acceptance() -> None:
  events: list[str] = []

  def ui_acceptance(base_url: str, token: str) -> dict[str, object]:
    events.append(f'ui:{base_url}:{token}')
    return {'completedMissions': ['DUPLICATE_SHIPMENT', 'X12_ENVELOPE_MISMATCH', 'STATUS_CALLBACK_MISSING']}

  acceptance = make_acceptance(ui_acceptance=ui_acceptance)

  assert acceptance.run() == 0
  assert acceptance.freightbridge.paths == [
    ('/health', None),
    ('/api/lab/readiness', 'operations'),
  ]
  assert events == ['ui:https://ui.example:operations']


def test_milestone27_fails_when_intermediate_scenario_is_missing() -> None:
  acceptance = make_acceptance(
    missing_scenarios={'X12_214_UNSUPPORTED_STATUS'},
    ui_acceptance=lambda _base_url, _token: {'completedMissions': []},
  )

  assert acceptance.run() == 1
  assert acceptance.recorder.failures[0].step == 'Integration Lab readiness'


def test_browser_acceptance_function_is_injectable_for_ci_unit_tests() -> None:
  acceptance = make_acceptance(
    ui_acceptance=lambda base_url, token: {
      'completedMissions': [f'{base_url}:{token}'],
    },
  )

  assert acceptance.run() == 0
  assert acceptance.recorder.failures == []
