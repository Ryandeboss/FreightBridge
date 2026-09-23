from __future__ import annotations

import argparse
import os
from pathlib import Path
import sys
from typing import Any

from playwright.sync_api import Page, TimeoutError as PlaywrightTimeoutError, sync_playwright

if __package__ in (None, ''):
  sys.path.append(str(Path(__file__).resolve().parents[2]))

from scripts.acceptance.common import (  # noqa: E402
  AcceptanceConfig,
  AcceptanceFailure,
  SafeHttpClient,
  StepRecorder,
  assert_truth,
  correlation_id,
  generate_load_id,
  print_required_env,
)
from scripts.acceptance.milestone12 import apex_load_payload  # noqa: E402


class Milestone16Acceptance:
  def __init__(self, *, config: AcceptanceConfig, analyst_ui_base_url: str, load_id: str, recorder: StepRecorder) -> None:
    if not config.operations_bearer_token:
      raise AcceptanceFailure('Load configuration', 'OPERATIONS_API_BEARER_TOKEN is required for Milestone 16.')
    if not analyst_ui_base_url:
      raise AcceptanceFailure('Load configuration', 'ANALYST_UI_BASE_URL is required for Milestone 16.')
    self.config = config
    self.analyst_ui_base_url = analyst_ui_base_url.rstrip('/')
    self.load_id = load_id
    self.recorder = recorder
    self.apex = SafeHttpClient(name='Apex', base_url=config.apex_base_url, verbose=recorder.verbose)
    self.freightbridge = SafeHttpClient(name='FreightBridge', base_url=config.freightbridge_base_url, verbose=recorder.verbose)

  def close(self) -> None:
    self.apex.close()
    self.freightbridge.close()

  @property
  def operations_token(self) -> str:
    return self.config.operations_bearer_token or ''

  def run(self) -> int:
    print('FreightBridge Milestone 16 Deployed Acceptance')
    print(f'Load: {self.load_id}')
    print('')
    self.warm_up()
    self.create_live_data()
    self.exercise_console()
    return self.recorder.finish()

  def warm_up(self) -> None:
    for name, client, path in (
      ('Apex health', self.apex, '/health'),
      ('Apex readiness', self.apex, '/readiness'),
      ('FreightBridge health', self.freightbridge, '/health'),
      ('FreightBridge readiness', self.freightbridge, '/readiness'),
    ):
      self.recorder.run(name, lambda c=client, p=path, n=name: c.get(p, step=n))
    self.recorder.run(
      'Operations summary auth check',
      lambda: self.freightbridge.get(
        '/api/operations/summary?hours=24',
        token=self.operations_token,
        step='Operations summary auth check',
      ),
    )

  def create_live_data(self) -> None:
    create_step = 'Create Apex load'
    self.recorder.run(
      create_step,
      lambda: self.apex.post_json(
        '/v1/load-tenders',
        apex_load_payload(self.load_id),
        token=self.config.apex_bearer_token,
        expected=(202,),
        step=create_step,
        correlation_id=correlation_id(self.load_id, create_step),
      ),
    )
    first_dispatch = 'Dispatch Apex load to FreightBridge'
    self.recorder.run(
      first_dispatch,
      lambda: self.apex.post_empty(
        f'/v1/load-tenders/{self.load_id}/dispatch',
        token=self.config.apex_bearer_token,
        expected=(202,),
        step=first_dispatch,
        correlation_id=correlation_id(self.load_id, first_dispatch),
      ),
    )
    duplicate_step = 'Create duplicate no-key failure'
    self.recorder.run(
      duplicate_step,
      lambda: self.apex.post_empty(
        f'/v1/load-tenders/{self.load_id}/dispatch',
        token=self.config.apex_bearer_token,
        expected=(409,),
        step=duplicate_step,
        correlation_id=correlation_id(self.load_id, duplicate_step),
      ),
    )
    dispatch_204 = 'Dispatch original 204'
    self.recorder.run(
      dispatch_204,
      lambda: self.freightbridge.post_empty(
        f'/api/integrations/midwest/load-tenders/{self.load_id}/dispatch-sftp',
        expected=(202,),
        step=dispatch_204,
        correlation_id=correlation_id(self.load_id, dispatch_204),
      ),
    )

  def exercise_console(self) -> None:
    self.recorder.run('Analyst UI browser flow', self._run_browser_flow)

  def _run_browser_flow(self) -> dict[str, Any]:
    with sync_playwright() as playwright:
      browser = playwright.chromium.launch(headless=True)
      try:
        page = browser.new_page()
        page.goto(self.analyst_ui_base_url, wait_until='domcontentloaded')
        expect_text(page, 'FreightBridge Analyst Console')
        page.get_by_label('Operations bearer token').fill(self.operations_token)
        page.get_by_role('button', name='Unlock Console').click()
        expect_test_id(page, 'dashboard-page')
        expect_text(page, 'Recent Transactions')

        page.get_by_role('link', name='Transactions').click()
        expect_test_id(page, 'transactions-page')
        page.get_by_label('Business ID').fill(self.load_id)
        page.get_by_role('button', name='Apply Filters').click()
        expect_text(page, self.load_id)
        page.get_by_role('link', name=self.load_id).first.click()
        expect_test_id(page, 'transaction-detail-page')
        expect_text(page, 'Timeline')

        page.get_by_role('link', name='Failures').click()
        expect_test_id(page, 'failures-page')
        page.get_by_label('Business ID').fill(self.load_id)
        page.get_by_role('button', name='Apply Filters').click()
        expect_text(page, self.load_id)

        page.get_by_role('link', name='Business Trace').click()
        expect_test_id(page, 'trace-search-page')
        page.get_by_label('Business identifier').fill(self.load_id)
        page.get_by_role('button', name='Trace Business ID').click()
        expect_test_id(page, 'trace-detail-page')
        expect_text(page, 'Transaction Chain')

        page.get_by_role('button', name='Lock Console').click()
        expect_text(page, 'Operations bearer token')
        stored = page.evaluate("window.sessionStorage.getItem('freightbridge.operationsToken')")
        assert_truth(stored is None, 'Analyst UI browser flow', 'Lock Console did not clear the operations token.')
        return {'load_id': self.load_id}
      finally:
        browser.close()


def expect_text(page: Page, text: str) -> None:
  try:
    page.get_by_text(text, exact=False).first.wait_for(timeout=15000)
  except PlaywrightTimeoutError as exc:
    raise AcceptanceFailure('Analyst UI browser flow', f'Missing UI text: {text}') from exc


def expect_test_id(page: Page, test_id: str) -> None:
  try:
    page.get_by_test_id(test_id).wait_for(timeout=15000)
  except PlaywrightTimeoutError as exc:
    raise AcceptanceFailure('Analyst UI browser flow', f'Missing UI area: {test_id}') from exc


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(description='Run FreightBridge Milestone 16 deployed acceptance.')
  parser.add_argument('--load-id', default=None)
  parser.add_argument('--verbose', action='store_true')
  parser.add_argument('--keep-going', action='store_true')
  parser.add_argument('--print-required-env', action='store_true')
  return parser.parse_args()


def main() -> int:
  args = parse_args()
  if args.print_required_env:
    print_required_env()
    print('  ANALYST_UI_BASE_URL')
    return 0
  try:
    config = AcceptanceConfig.from_env()
    recorder = StepRecorder(keep_going=args.keep_going, verbose=args.verbose)
    acceptance = Milestone16Acceptance(
      config=config,
      analyst_ui_base_url=os.environ.get('ANALYST_UI_BASE_URL', ''),
      load_id=args.load_id or generate_load_id(),
      recorder=recorder,
    )
    try:
      return acceptance.run()
    finally:
      acceptance.close()
  except AcceptanceFailure as exc:
    print(exc.format())
    print('')
    print('RESULT: FAIL')
    return 1


if __name__ == '__main__':
  raise SystemExit(main())
