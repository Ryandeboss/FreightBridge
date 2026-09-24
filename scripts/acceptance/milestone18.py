from __future__ import annotations

import argparse
import os
from pathlib import Path
import re
import sys
import time
from typing import Any

if __package__ in (None, ''):
  sys.path.append(str(Path(__file__).resolve().parents[2]))

from scripts.acceptance.common import (  # noqa: E402
  AcceptanceConfig,
  AcceptanceFailure,
  SafeHttpClient,
  StepRecorder,
  assert_truth,
  generate_load_id,
  print_required_env,
)


class Milestone18Acceptance:
  def __init__(self, *, config: AcceptanceConfig, analyst_ui_base_url: str, load_id: str, recorder: StepRecorder) -> None:
    if not config.operations_bearer_token:
      raise AcceptanceFailure('Load configuration', 'OPERATIONS_API_BEARER_TOKEN is required for Milestone 18.')
    if not analyst_ui_base_url:
      raise AcceptanceFailure('Load configuration', 'ANALYST_UI_BASE_URL is required for Milestone 18.')
    self.config = config
    self.analyst_ui_base_url = analyst_ui_base_url.rstrip('/')
    self.load_id = load_id
    self.recorder = recorder
    self.freightbridge = SafeHttpClient(name='FreightBridge', base_url=config.freightbridge_base_url, verbose=recorder.verbose)

  def close(self) -> None:
    self.freightbridge.close()

  @property
  def operations_token(self) -> str:
    return self.config.operations_bearer_token or ''

  def run(self) -> int:
    print('FreightBridge Milestone 18 Deployed Acceptance')
    print(f'Load: {self.load_id}')
    print('')
    self.recorder.run('Integration Lab API readiness', self._readiness)
    self.recorder.run('Analyst UI Integration Lab flow', self._run_browser_flow)
    self.recorder.run('Verify Integration Lab business trace', self._verify_trace)
    self.recorder.run('Verify Integration Lab history', self._verify_history)
    return self.recorder.finish()

  def _readiness(self) -> dict[str, Any]:
    body = self.freightbridge.get('/api/lab/readiness', token=self.operations_token, step='Integration Lab API readiness')
    keys = {scenario.get('scenarioKey') for scenario in body.get('scenarios', [])}
    assert_truth('FULL_SHIPMENT_LIFECYCLE' in keys, 'Integration Lab API readiness', 'Full lifecycle scenario is missing.')
    assert_truth('secret' not in str(body).lower(), 'Integration Lab API readiness', 'Readiness exposed secret-like content.')
    return body

  def _run_browser_flow(self) -> dict[str, Any]:
    from playwright.sync_api import expect, sync_playwright

    with sync_playwright() as playwright:
      browser = playwright.chromium.launch(headless=True)
      try:
        page = browser.new_page()
        page.goto(self.analyst_ui_base_url, wait_until='domcontentloaded')
        page.get_by_label('Operations bearer token').fill(self.operations_token)
        page.get_by_role('button', name='Unlock Console').click()
        expect(page.get_by_test_id('dashboard-page')).to_be_visible(timeout=20000)

        page.get_by_role('link', name='Integration Lab').first.click()
        expect(page.get_by_test_id('integration-lab-page')).to_be_visible(timeout=20000)
        for label in ('FreightBridge', 'Apex Simulator', 'Midwest Simulator', 'Midwest SFTP', 'Ready'):
          expect_text(page, label)
        page.get_by_label('Scenario').select_option('FULL_SHIPMENT_LIFECYCLE')
        page.get_by_label('Load ID').fill(self.load_id)
        page.get_by_role('button', name='Create Run').click()
        expect(page.get_by_test_id('lab-run-detail')).to_be_visible(timeout=20000)
        run_id = page.url.split('/lab/runs/')[-1].split('?')[0].split('#')[-1]
        assert_truth(bool(run_id), 'Analyst UI Integration Lab flow', 'Lab run ID could not be captured from browser URL.')
        expect_text(page, self.load_id)
        page.get_by_role('button', name='Run Step').first.click()
        self._wait_for_lab_step(run_id, 'CREATE_APEX_LOAD', 'SUCCEEDED')
        expect_text(page, 'Create Apex load')
        expect_text(page, 'Complete previous step first')
        page.get_by_role('button', name='Run All Remaining').click()
        expect_text(page, 'SUCCEEDED', timeout=180000)
        for required in (
          'Apex Load Tender',
          'ABC Factory',
          '200 Industrial Rd',
          'Canonical Shipment',
          'Midwest 204',
          'ISA13',
          'GS06',
          'ST02',
          'Payload SHA-256',
          'CANONICAL_TO_MWCX_204',
          'View Transaction',
          '997 Technical Ack',
          '990 Business Response',
          'AK5',
          'AK9',
          'ACCEPTED',
          'DELIVERED',
          'PICKED_UP',
          'IN_TRANSIT',
          'ARRIVED',
          'DELIVERED',
          'Synthetic Integration Test',
          'Started',
        ):
          expect_text(page, required, timeout=30000)
        page.get_by_role('link', name=re.compile(r'View Transaction')).first.click()
        expect(page.get_by_test_id('transaction-detail-page')).to_be_visible(timeout=30000)
        expect_text(page, self.load_id)
        page.goto(f'{self.analyst_ui_base_url}/#/lab/runs/{run_id}', wait_until='domcontentloaded')
        expect(page.get_by_test_id('lab-run-detail')).to_be_visible(timeout=30000)
        page.get_by_role('link', name='CANONICAL_TO_MWCX_204').first.click()
        expect(page.get_by_test_id('mapping-detail-page')).to_be_visible(timeout=30000)
        expect_text(page, 'CANONICAL_TO_MWCX_204')
        page.goto(f'{self.analyst_ui_base_url}/#/lab', wait_until='domcontentloaded')
        expect(page.get_by_test_id('integration-lab-page')).to_be_visible(timeout=30000)
        expect_text(page, self.load_id, timeout=30000)
        page.get_by_role('link', name=self.load_id).first.click()
        expect(page.get_by_test_id('lab-run-detail')).to_be_visible(timeout=30000)
        assert_truth(
          f'/lab/runs/{run_id}' in page.url,
          'Analyst UI Integration Lab flow',
          'Recent Lab run did not navigate to the run detail URL.',
        )
        page.get_by_role('link', name='Business Trace').click()
        expect(page.get_by_test_id('trace-detail-page')).to_be_visible(timeout=30000)
        for document_type in ('APEX_LOAD_TENDER', '204', '997', '990', '214'):
          expect_text(page, document_type, timeout=30000)
        page.get_by_role('link', name='Integration Lab').first.click()
        expect_text(page, self.load_id, timeout=30000)
        return {'load_id': self.load_id, 'run_id': run_id}
      finally:
        browser.close()

  def _wait_for_lab_step(self, run_id: str, step_key: str, expected_status: str) -> dict[str, Any]:
    step_name = f'Wait for Lab step {step_key}'
    last_run: dict[str, Any] | None = None
    for _ in range(60):
      run = self.freightbridge.get(f'/api/lab/runs/{run_id}', token=self.operations_token, step=step_name)
      last_run = run
      step = next((item for item in run.get('steps', []) if item.get('stepKey') == step_key), None)
      if isinstance(step, dict) and step.get('status') == expected_status:
        return step
      time.sleep(2)
    raise AcceptanceFailure(step_name, f'{step_key} did not reach {expected_status}.', response_body=last_run)

  def _verify_trace(self) -> dict[str, Any]:
    body = self.freightbridge.get(
      f'/api/operations/business/{self.load_id}/trace',
      token=self.operations_token,
      step='Verify Integration Lab business trace',
    )
    document_types = {transaction.get('documentType') for transaction in body.get('transactions', [])}
    for expected in ('APEX_LOAD_TENDER', '204', '997', '990', '214'):
      assert_truth(expected in document_types, 'Verify Integration Lab business trace', f'Missing {expected} transaction.')
    shipment_events = [transaction for transaction in body.get('transactions', []) if transaction.get('documentType') == '214']
    assert_truth(len(shipment_events) >= 4, 'Verify Integration Lab business trace', 'Business trace did not include at least four 214 shipment-status transactions.')
    return body

  def _verify_history(self) -> dict[str, Any]:
    body = self.freightbridge.get(
      f'/api/lab/runs?businessIdentifier={self.load_id}&limit=10',
      token=self.operations_token,
      step='Verify Integration Lab history',
    )
    runs = body.get('runs') or []
    assert_truth(any(run.get('businessIdentifier') == self.load_id for run in runs), 'Verify Integration Lab history', 'Run history does not include the created Lab run.')
    summary_run = next(run for run in runs if run.get('businessIdentifier') == self.load_id)
    run = self.freightbridge.get(
      f"/api/lab/runs/{summary_run.get('id')}",
      token=self.operations_token,
      step='Verify Integration Lab history',
    )
    steps = run.get('steps') or []
    assert_truth(len(steps) == 21, 'Verify Integration Lab history', 'Full lifecycle run did not create 21 Lab steps.')
    assert_truth(all(step.get('status') == 'SUCCEEDED' for step in steps), 'Verify Integration Lab history', 'Not every Lab step succeeded.')
    summary = run.get('resultSummary') or {}
    assert_truth(summary.get('technicalAcknowledgment') == 'ACCEPTED', 'Verify Integration Lab history', '997 technical acknowledgment was not accepted.')
    assert_truth(summary.get('tenderStatus') == 'ACCEPTED', 'Verify Integration Lab history', 'Tender status was not accepted.')
    assert_truth(summary.get('shipmentStatus') == 'DELIVERED', 'Verify Integration Lab history', 'Shipment status was not delivered.')
    dispatch_204 = next((step for step in steps if step.get('stepKey') == 'DISPATCH_204_SFTP'), {})
    preview = (dispatch_204.get('responseSummary') or {}).get('x12Preview') or {}
    for required_key in ('interchangeControlNumber', 'groupControlNumber', 'transactionControlNumber', 'mappingKey', 'mappingProfileId', 'mappingProfileVersion', 'fileName', 'remotePath', 'payloadSha256'):
      assert_truth(bool(preview.get(required_key)), 'Verify Integration Lab history', f'Missing 204 preview metadata: {required_key}.')
    assert_truth('mappingSpecVersion' not in preview, 'Verify Integration Lab history', '204 preview used obsolete mappingSpecVersion metadata.')
    return body


def expect_text(page: Any, text: str, *, timeout: int = 15000) -> None:
  from playwright.sync_api import TimeoutError as PlaywrightTimeoutError

  try:
    page.get_by_text(text, exact=False).first.wait_for(timeout=timeout)
  except PlaywrightTimeoutError as exc:
    raise AcceptanceFailure('Analyst UI Integration Lab flow', f'Missing UI text: {text}') from exc


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(description='Run FreightBridge Milestone 18 deployed acceptance.')
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
    acceptance = Milestone18Acceptance(
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
