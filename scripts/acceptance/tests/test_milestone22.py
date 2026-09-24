import subprocess
import sys

from scripts.acceptance.common import AcceptanceConfig, AcceptanceFailure, StepRecorder
from scripts.acceptance import milestone22


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


class OrchestratedAcceptance(milestone22.Milestone22Acceptance):
  def __init__(self, *, events: list[str], fail_preflight: bool = False, fail_postflight: bool = False, **kwargs) -> None:
    super().__init__(**kwargs)
    self.events = events
    self.fail_preflight = fail_preflight
    self.fail_postflight = fail_postflight

  def _run_preflight(self) -> None:
    self.events.append('preflight')
    if self.fail_preflight:
      self.recorder.fail_step(AcceptanceFailure('preflight', 'failed'))

  def _run_postflight(self) -> None:
    self.events.append('postflight')
    if self.fail_postflight:
      self.recorder.fail_step(AcceptanceFailure('postflight', 'failed'))

  def close(self) -> None:
    pass


class FakeClient:
  def close(self) -> None:
    pass


def make_acceptance(*, runner, events: list[str], fail_preflight: bool = False, fail_postflight: bool = False, verbose: bool = False):
  acceptance = OrchestratedAcceptance(
    config=config(),
    analyst_ui_base_url='https://ui.example',
    recorder=StepRecorder(verbose=verbose),
    load_id='load custom-01',
    runner=runner,
    ui_preflight=lambda _base_url, _token: {'status': 'ok'},
    events=events,
    fail_preflight=fail_preflight,
    fail_postflight=fail_postflight,
  )
  acceptance.apex = FakeClient()
  acceptance.freightbridge = FakeClient()
  acceptance.midwest = FakeClient()
  return acceptance


def test_preflight_runs_before_milestone20() -> None:
  events: list[str] = []

  def runner(command):
    events.append('milestone20')
    return subprocess.CompletedProcess(command, 0)

  acceptance = make_acceptance(runner=runner, events=events)
  assert acceptance.run() == 0
  assert events == ['preflight', 'milestone20', 'postflight']


def test_milestone20_does_not_run_if_preflight_fails() -> None:
  events: list[str] = []

  def runner(command):
    events.append('milestone20')
    return subprocess.CompletedProcess(command, 0)

  acceptance = make_acceptance(runner=runner, events=events, fail_preflight=True)
  assert acceptance.run() == 1
  assert events == ['preflight']


def test_child_process_uses_sys_executable_without_shell() -> None:
  command = milestone22.build_milestone20_command(load_id='LOAD22', verbose=False)
  assert command[0] == sys.executable
  assert command[1].endswith('milestone20.py')
  assert '--load-id' in command
  assert 'shell' not in command


def test_verbose_and_safe_load_id_propagate_to_milestone20() -> None:
  command = milestone22.build_milestone20_command(load_id='load custom-01', verbose=True)
  assert command[-1] == '--verbose'
  assert command[command.index('--load-id') + 1] == 'LOADCUSTOM01M22'


def test_postflight_runs_only_after_milestone20_success() -> None:
  events: list[str] = []

  def runner(command):
    events.append('milestone20')
    return subprocess.CompletedProcess(command, 4)

  acceptance = make_acceptance(runner=runner, events=events)
  assert acceptance.run() == 1
  assert events == ['preflight', 'milestone20']


def test_child_nonzero_failure_is_reported() -> None:
  events: list[str] = []

  def runner(command):
    events.append('milestone20')
    return subprocess.CompletedProcess(command, 9)

  acceptance = make_acceptance(runner=runner, events=events)
  assert acceptance.run() == 1
  assert acceptance.recorder.failures[0].step == 'Milestone 20 regression pack'


def test_success_requires_all_three_phases() -> None:
  events: list[str] = []

  def runner(command):
    events.append('milestone20')
    return subprocess.CompletedProcess(command, 0)

  acceptance = make_acceptance(runner=runner, events=events, fail_postflight=True)
  assert acceptance.run() == 1
  assert events == ['preflight', 'milestone20', 'postflight']


def test_real_runner_is_not_invoked_with_shell_keyword() -> None:
  calls: list[tuple] = []

  def runner(*args, **kwargs):
    calls.append((args, kwargs))
    return subprocess.CompletedProcess(args[0], 0)

  acceptance = make_acceptance(runner=runner, events=[])
  assert acceptance._run_milestone20_regression() == 0
  assert calls
  assert calls[0][1] == {}
  assert isinstance(calls[0][0][0], list)


def test_empty_custom_load_id_is_normalized() -> None:
  assert milestone22.derived_milestone20_load_id('---') == 'LOADM22'
