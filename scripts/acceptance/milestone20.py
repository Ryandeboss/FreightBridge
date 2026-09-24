from __future__ import annotations

import argparse
from collections.abc import Callable, Sequence
from pathlib import Path
import subprocess
import sys

if __package__ in (None, ''):
  sys.path.append(str(Path(__file__).resolve().parents[2]))

from scripts.acceptance.common import generate_load_id  # noqa: E402


Runner = Callable[[Sequence[str]], subprocess.CompletedProcess]


def build_child_commands(*, load_id: str | None, verbose: bool) -> list[list[str]]:
  base_load_id = load_id or generate_load_id()
  commands = [
    [sys.executable, str(Path(__file__).with_name('milestone18.py')), '--load-id', f'{base_load_id}M18'],
    [sys.executable, str(Path(__file__).with_name('milestone19.py')), '--load-id', f'{base_load_id}M19'],
  ]
  if verbose:
    for command in commands:
      command.append('--verbose')
  return commands


def run_regression_pack(
  *,
  load_id: str | None = None,
  verbose: bool = False,
  keep_going: bool = False,
  runner: Runner = subprocess.run,
) -> int:
  commands = build_child_commands(load_id=load_id, verbose=verbose)
  labels = ('Milestone 18 happy-path regression', 'Milestone 19 failure-drill regression')
  first_failure = 0
  for label, command in zip(labels, commands, strict=True):
    print(f'Running {label}')
    result = runner(command)
    if result.returncode != 0:
      print(f'{label} failed with exit code {result.returncode}.')
      first_failure = first_failure or result.returncode
      if not keep_going:
        return result.returncode
  if first_failure:
    print('')
    print('RESULT: FAIL')
    return first_failure
  print('')
  print('RESULT: PASS')
  return 0


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(description='Run FreightBridge Milestone 20 deployed regression pack.')
  parser.add_argument('--load-id', default=None)
  parser.add_argument('--verbose', action='store_true')
  parser.add_argument('--keep-going', action='store_true')
  return parser.parse_args()


def main() -> int:
  args = parse_args()
  return run_regression_pack(load_id=args.load_id, verbose=args.verbose, keep_going=args.keep_going)


if __name__ == '__main__':
  raise SystemExit(main())
