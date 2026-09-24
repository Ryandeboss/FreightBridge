import subprocess

from scripts.acceptance import milestone20


def test_milestone20_runs_18_then_19_with_distinct_load_prefixes(monkeypatch) -> None:
  calls: list[list[str]] = []
  monkeypatch.setattr(milestone20, 'generate_load_id', lambda: 'LOADREG900')

  def runner(command):
    calls.append(list(command))
    return subprocess.CompletedProcess(command, 0)

  assert milestone20.run_regression_pack(runner=runner) == 0

  assert calls[0][1].endswith('milestone18.py')
  assert calls[1][1].endswith('milestone19.py')
  assert calls[0][-1] == 'LOADREG900M18'
  assert calls[1][-1] == 'LOADREG900M19'
  assert calls[0][-1] != calls[1][-1]


def test_milestone20_stops_after_milestone18_failure() -> None:
  calls: list[list[str]] = []

  def runner(command):
    calls.append(list(command))
    return subprocess.CompletedProcess(command, 7)

  assert milestone20.run_regression_pack(load_id='LOADFAIL', runner=runner) == 7
  assert len(calls) == 1
  assert calls[0][1].endswith('milestone18.py')


def test_milestone20_keep_going_and_verbose_propagation() -> None:
  calls: list[list[str]] = []

  def runner(command):
    calls.append(list(command))
    return subprocess.CompletedProcess(command, 3 if len(calls) == 1 else 0)

  assert milestone20.run_regression_pack(load_id='LOADKG', verbose=True, keep_going=True, runner=runner) == 3
  assert len(calls) == 2
  assert all('--verbose' in call for call in calls)
  assert all(isinstance(call, list) for call in calls)
