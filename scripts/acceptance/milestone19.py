from __future__ import annotations

import argparse
import os
from pathlib import Path
import re
import sys
import time
from typing import Any
from uuid import UUID

if __package__ in (None, ''):
  sys.path.append(str(Path(__file__).resolve().parents[2]))

from scripts.acceptance.common import (  # noqa: E402
  AcceptanceConfig,
  AcceptanceFailure,
  SafeHttpClient,
  StepRecorder,
  assert_equal,
  assert_truth,
  generate_load_id,
  print_required_env,
)


DRILLS = (
  {
    'scenario': 'APEX_BAD_AUTH',
    'card': 'Bad Apex Authentication',
    'code': 'AUTHENTICATION_ERROR',
    'category': 'AUTHENTICATION_ERROR',
    'stage': 'AUTHENTICATION',
    'document': 'APEX_LOAD_TENDER',
    'transport': 'REST',
  },
  {
    'scenario': 'APEX_INVALID_CONTRACT',
    'card': 'Invalid Apex Contract',
    'code': 'INVALID_APEX_LOAD',
    'category': 'BUSINESS_VALIDATION_ERROR',
    'stage': 'VALIDATION',
    'document': 'APEX_LOAD_TENDER',
    'transport': 'REST',
    'preview': 'postalCode',
  },
  {
    'scenario': 'X12_214_UNSUPPORTED_STATUS',
    'card': '214 Unsupported Status',
    'code': 'UNSUPPORTED_AT7_CODE',
    'category': 'MAPPING_ERROR',
    'stage': 'MAPPING',
    'document': '214',
    'transport': 'SFTP',
    'preview': 'AT7*ZZ',
  },
)


class Milestone19Acceptance:
  def __init__(self, *, config: AcceptanceConfig, analyst_ui_base_url: str, load_id: str, recorder: StepRecorder) -> None:
    if not config.operations_bearer_token:
      raise AcceptanceFailure('Load configuration', 'OPERATIONS_API_BEARER_TOKEN is required for Milestone 19.')
    if not analyst_ui_base_url:
      raise AcceptanceFailure('Load configuration', 'ANALYST_UI_BASE_URL is required for Milestone 19.')
    self.config = config
    self.analyst_ui_base_url = analyst_ui_base_url.rstrip('/')
    self.load_id = load_id
    self.recorder = recorder
    self.created_error_ids: set[str] = set()
    self.freightbridge = SafeHttpClient(name='FreightBridge', base_url=config.freightbridge_base_url, verbose=recorder.verbose)

  def close(self) -> None:
    self.freightbridge.close()

  @property
  def operations_token(self) -> str:
    return self.config.operations_bearer_token or ''

  def run(self) -> int:
    print('FreightBridge Milestone 19 Deployed Acceptance')
    print(f'Load prefix: {self.load_id}')
    print('')
    try:
      self.recorder.run('Failure drill API readiness', self._readiness)
      self.recorder.run('Analyst UI failure drill flow', self._run_browser_flow)
    finally:
      self._cleanup_created_errors()
    return self.recorder.finish()

  def _readiness(self) -> dict[str, Any]:
    body = self.freightbridge.get('/api/lab/readiness', token=self.operations_token, step='Failure drill API readiness')
    scenarios = {scenario.get('scenarioKey'): scenario for scenario in body.get('scenarios', []) if isinstance(scenario, dict)}
    for drill in DRILLS:
      scenario = scenarios.get(drill['scenario'])
      assert_truth(isinstance(scenario, dict), 'Failure drill API readiness', f"Missing {drill['scenario']} scenario.")
      assert_equal(scenario.get('kind'), 'FAILURE_DRILL', 'Failure drill API readiness', f"{drill['scenario']} kind")
      expected = scenario.get('expectedFailure') or {}
      assert_equal(expected.get('errorCode'), drill['code'], 'Failure drill API readiness', f"{drill['scenario']} expected code")
      assert_equal(expected.get('category'), drill['category'], 'Failure drill API readiness', f"{drill['scenario']} expected category")
      assert_equal(expected.get('stage'), drill['stage'], 'Failure drill API readiness', f"{drill['scenario']} expected stage")
    assert_truth('secret' not in str(body).lower(), 'Failure drill API readiness', 'Readiness exposed secret-like content.')
    assert_truth('bearer' not in str(body).lower(), 'Failure drill API readiness', 'Readiness exposed bearer-token content.')
    return body

  def _run_browser_flow(self) -> dict[str, Any]:
    from playwright.sync_api import expect, sync_playwright

    completed: list[dict[str, str]] = []
    with sync_playwright() as playwright:
      browser = playwright.chromium.launch(headless=True)
      try:
        page = browser.new_page()
        page.goto(self.analyst_ui_base_url, wait_until='domcontentloaded')
        page.get_by_label('Operations bearer token').fill(self.operations_token)
        page.get_by_role('button', name='Unlock Console').click()
        expect(page.get_by_test_id('dashboard-page')).to_be_visible(timeout=20000)

        for index, drill in enumerate(DRILLS, start=1):
          load_id = f'{self.load_id}{index}'
          run_id = self._execute_drill_in_ui(page, drill, load_id)
          run = self._wait_for_lab_run_complete(run_id)
          observed = self._assert_run_result(run, drill)
          error_id = str(observed.get('errorId') or '')
          transaction_id = str(observed.get('transactionId') or '')
          if error_id:
            self.created_error_ids.add(error_id)
          self._verify_detail_links(page, run_id, drill, error_id, transaction_id, observed.get('businessIdentifier'))
          completed.append({'scenario': drill['scenario'], 'run_id': run_id, 'error_id': error_id})
        return {'completed': completed}
      finally:
        browser.close()

  def _execute_drill_in_ui(self, page: Any, drill: dict[str, str], load_id: str) -> str:
    from playwright.sync_api import expect

    page.goto(f'{self.analyst_ui_base_url}/#/lab', wait_until='domcontentloaded')
    expect(page.get_by_test_id('integration-lab-page')).to_be_visible(timeout=30000)
    page.get_by_role('button', name='Failure Drills').click()
    page.get_by_role('button', name=drill['card']).click()
    expect_text(page, drill['code'])
    expect_text(page, drill['category'])
    expect_text(page, drill['stage'])
    page.get_by_label('Load ID').fill(load_id)
    page.get_by_role('button', name='Create Run').click()
    expect(page).to_have_url(re.compile(r'.*/#/lab/runs/[0-9a-fA-F-]{36}$'), timeout=30000)
    expect(page.get_by_test_id('lab-run-detail')).to_be_visible(timeout=30000)
    run_id = extract_lab_run_id_from_url(page.url, 'Analyst UI failure drill flow')
    page.get_by_role('button', name='Run All Remaining').click()
    self._wait_for_lab_run_complete(run_id)
    page.goto(f'{self.analyst_ui_base_url}/#/lab/runs/{run_id}', wait_until='domcontentloaded')
    expect(page.get_by_test_id('lab-run-detail')).to_be_visible(timeout=30000)
    for required in (
      'Failure Drill',
      'Expected vs Observed',
      'EXPECTED FAILURE OBSERVED',
      drill['code'],
      drill['category'],
      drill['stage'],
      'Integration Transaction',
      'FAILED',
      'View Failed Transaction',
      'View Failure',
      'Open Failure Queue',
    ):
      expect_text(page, required, timeout=30000)
    if drill.get('preview'):
      expect_text(page, drill['preview'], timeout=30000)
    assert_truth('Bearer' not in page.content(), 'Analyst UI failure drill flow', 'UI exposed bearer-token text.')
    return run_id

  def _wait_for_lab_run_complete(self, run_id: str) -> dict[str, Any]:
    step = 'Wait for failure drill completion'
    last_run: dict[str, Any] | None = None
    for _ in range(90):
      run = self.freightbridge.get(f'/api/lab/runs/{run_id}', token=self.operations_token, step=step)
      last_run = run
      steps = [item for item in run.get('steps', []) if isinstance(item, dict)]
      failed_step = next((item for item in steps if item.get('status') == 'FAILED'), None)
      if failed_step is not None:
        raise AcceptanceFailure(step, 'Failure drill Lab step failed.', response_body=failed_step)
      if run.get('status') == 'SUCCEEDED' and all(step_item.get('status') == 'SUCCEEDED' for step_item in steps):
        return run
      time.sleep(2)
    raise AcceptanceFailure(step, 'Failure drill Lab run did not complete.', response_body=last_run)

  def _assert_run_result(self, run: dict[str, Any], drill: dict[str, str]) -> dict[str, Any]:
    step = f"Verify {drill['scenario']} result"
    summary = run.get('resultSummary') or {}
    failure_drill = summary.get('failureDrill') or {}
    assert_equal(summary.get('drillOutcome'), 'EXPECTED_FAILURE_OBSERVED', step, 'drillOutcome')
    observed = failure_drill.get('observed') or {}
    expected = failure_drill.get('expected') or {}
    for source_name, source in (('expected', expected), ('observed', observed)):
      assert_equal(source.get('errorCode'), drill['code'], step, f'{source_name} errorCode')
      assert_equal(source.get('category'), drill['category'], step, f'{source_name} category')
      assert_equal(source.get('stage'), drill['stage'], step, f'{source_name} stage')
      assert_equal(source.get('retryable'), False, step, f'{source_name} retryable')
    assert_equal(observed.get('processingStatus'), 'FAILED', step, 'integration transaction status')
    assert_truth(bool(observed.get('transactionId')), step, 'Observed failure did not include a transactionId.')
    assert_truth(bool(observed.get('errorId')), step, 'Observed failure did not include an errorId.')
    assert_truth(observed.get('businessIdentifier') in (None, ''), step, 'Early failure should not invent a businessIdentifier.')
    related_ids = [transaction_id for lab_step in run.get('steps', []) for transaction_id in (lab_step.get('relatedTransactionIds') or [])]
    assert_truth(observed.get('transactionId') in related_ids, step, 'Failed transaction was not linked to the Lab step.')
    return observed

  def _verify_detail_links(
    self,
    page: Any,
    run_id: str,
    drill: dict[str, str],
    error_id: str,
    transaction_id: str,
    observed_business_identifier: object,
  ) -> None:
    from playwright.sync_api import expect

    page.goto(f'{self.analyst_ui_base_url}/#/lab/runs/{run_id}', wait_until='domcontentloaded')
    expect(page.get_by_test_id('lab-run-detail')).to_be_visible(timeout=30000)
    page.get_by_role('link', name='View Failed Transaction').click()
    expect(page.get_by_test_id('transaction-detail-page')).to_be_visible(timeout=30000)
    expect(page).to_have_url(re.compile(rf'.*/#/transactions/{re.escape(transaction_id)}$'), timeout=30000)
    for required in (drill['code'], drill['category'], drill['stage'], 'FAILED'):
      expect_text(page, required, timeout=30000)

    page.goto(f'{self.analyst_ui_base_url}/#/lab/runs/{run_id}', wait_until='domcontentloaded')
    expect(page.get_by_test_id('lab-run-detail')).to_be_visible(timeout=30000)
    page.get_by_role('link', name='View Failure').click()
    expect(page.get_by_test_id('failure-detail-page')).to_be_visible(timeout=30000)
    expect(page).to_have_url(re.compile(rf'.*/#/failures/{re.escape(error_id)}$'), timeout=30000)
    for required in (drill['code'], drill['category'], drill['stage'], 'Manual review', 'Related Logs'):
      expect_text(page, required, timeout=30000)

    page.goto(f'{self.analyst_ui_base_url}/#/lab/runs/{run_id}', wait_until='domcontentloaded')
    expect(page.get_by_test_id('lab-run-detail')).to_be_visible(timeout=30000)
    page.get_by_role('link', name='Open Failure Queue').click()
    expect(page.get_by_test_id('failures-page')).to_be_visible(timeout=30000)
    expect_text(page, drill['code'], timeout=30000)
    if isinstance(observed_business_identifier, str) and observed_business_identifier.strip():
      expect_text(page, observed_business_identifier.strip(), timeout=30000)

  def _cleanup_created_errors(self) -> None:
    for error_id in sorted(self.created_error_ids):
      try:
        self.freightbridge.post_json(
          f'/api/operations/errors/{error_id}/resolve',
          {'note': 'Milestone 19 deployed acceptance cleanup.'},
          token=self.operations_token,
          expected=(200,),
          step='Cleanup Milestone 19 failure',
        )
      except AcceptanceFailure as exc:
        print(f'[WARN] Cleanup failed for {error_id}: {exc.format()}')


def expect_text(page: Any, text: str, *, timeout: int = 15000) -> None:
  from playwright.sync_api import TimeoutError as PlaywrightTimeoutError

  try:
    page.get_by_text(text, exact=False).first.wait_for(timeout=timeout)
  except PlaywrightTimeoutError as exc:
    raise AcceptanceFailure('Analyst UI failure drill flow', f'Missing UI text: {text}') from exc


def extract_lab_run_id_from_url(url: str, step: str) -> str:
  match = re.search(r'(?:^|/)#/lab/runs/([0-9a-fA-F-]{36})$', url)
  if not match:
    raise AcceptanceFailure(step, 'Browser URL was not a Lab run detail route.', response_body={'url': url})
  run_id = match.group(1)
  try:
    return str(UUID(run_id))
  except ValueError as exc:
    raise AcceptanceFailure(step, 'Browser Lab run route did not contain a valid UUID.', response_body={'url': url}) from exc


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(description='Run FreightBridge Milestone 19 deployed acceptance.')
  parser.add_argument('--load-id', default=None)
  parser.add_argument('--verbose', action='store_true')
  parser.add_argument('--keep-going', action='store_true')
  parser.add_argument('--print-required-env', action='store_true')
  return parser.parse_args()


def main() -> int:
  args = parse_args()
  if args.print_required_env:
    print_required_env()
    return 0
  try:
    config = AcceptanceConfig.from_env()
    recorder = StepRecorder(keep_going=args.keep_going, verbose=args.verbose)
    acceptance = Milestone19Acceptance(
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
