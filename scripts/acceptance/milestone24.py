from __future__ import annotations

import argparse
from collections.abc import Callable
import os
from pathlib import Path
import re
import sys

if __package__ in (None, ''):
  sys.path.append(str(Path(__file__).resolve().parents[2]))

from scripts.acceptance.common import (  # noqa: E402
  AcceptanceConfig,
  AcceptanceFailure,
  SafeHttpClient,
  StepRecorder,
  assert_equal,
  assert_truth,
  print_required_env,
)


UiAcceptance = Callable[[str, str], dict[str, object]]


class Milestone24Acceptance:
  def __init__(
    self,
    *,
    config: AcceptanceConfig,
    analyst_ui_base_url: str,
    recorder: StepRecorder,
    ui_acceptance: UiAcceptance | None = None,
  ) -> None:
    if not config.operations_bearer_token:
      raise AcceptanceFailure('Load configuration', 'OPERATIONS_API_BEARER_TOKEN is required for Milestone 24.')
    if not analyst_ui_base_url:
      raise AcceptanceFailure('Load configuration', 'ANALYST_UI_BASE_URL is required for Milestone 24.')

    self.config = config
    self.analyst_ui_base_url = analyst_ui_base_url.rstrip('/')
    self.recorder = recorder
    self.ui_acceptance = ui_acceptance or run_browser_acceptance
    self.freightbridge = SafeHttpClient(name='FreightBridge', base_url=config.freightbridge_base_url, verbose=recorder.verbose)

  @property
  def operations_token(self) -> str:
    return self.config.operations_bearer_token or ''

  def close(self) -> None:
    self.freightbridge.close()

  def run(self) -> int:
    print('FreightBridge Milestone 24 Training POV deployed acceptance')
    print('Scope: FreightBridge employee POV + Training Desk shell')
    print('')
    try:
      self.recorder.run('FreightBridge API readiness', self._check_freightbridge_readiness)
      self.recorder.run('Integration Lab lifecycle readiness', self._check_lab_readiness)
      self.recorder.run(
        'Training POV browser acceptance',
        lambda: self.ui_acceptance(self.analyst_ui_base_url, self.operations_token),
        lambda result: f"mission={result.get('mission')} role={result.get('role')}",
      )
    except AcceptanceFailure:
      return self.recorder.finish()
    return self.recorder.finish()

  def _check_freightbridge_readiness(self) -> dict[str, object]:
    health = self.freightbridge.get('/health', step='FreightBridge health')
    assert_equal(health.get('status'), 'ok', 'FreightBridge health', 'status')
    assert_equal(health.get('service'), 'freightbridge-api', 'FreightBridge health', 'service')
    return health

  def _check_lab_readiness(self) -> dict[str, object]:
    body = self.freightbridge.get('/api/lab/readiness', token=self.operations_token, step='Integration Lab readiness')
    assert_equal(body.get('status'), 'ready', 'Integration Lab readiness', 'status')
    scenarios = {
      scenario.get('scenarioKey'): scenario
      for scenario in body.get('scenarios', [])
      if isinstance(scenario, dict)
    }
    assert_truth('FULL_SHIPMENT_LIFECYCLE' in scenarios, 'Integration Lab readiness', 'FULL_SHIPMENT_LIFECYCLE scenario is missing.')
    return {'scenario': 'FULL_SHIPMENT_LIFECYCLE'}


def run_browser_acceptance(analyst_ui_base_url: str, operations_token: str) -> dict[str, object]:
  from playwright.sync_api import expect, sync_playwright

  with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
      page = browser.new_page()
      page.goto(analyst_ui_base_url, wait_until='domcontentloaded')
      page.get_by_label('Operations bearer token').fill(operations_token)
      page.get_by_role('button', name='Unlock Console').click()

      expect(page.get_by_test_id('training-desk')).to_be_visible(timeout=30000)
      expect(page.get_by_test_id('training-role')).to_contain_text('FreightBridge Integration Support Analyst')
      expect(page.get_by_test_id('external-partner-apex')).to_contain_text('External Trading Partner')
      expect(page.get_by_test_id('external-partner-midwest')).to_contain_text('External Trading Partner')
      expect(page.get_by_test_id('training-workplace-freightbridge')).to_contain_text('Your Workplace')
      assert_equal(page.evaluate('window.location.hash'), '#/learn', 'Training Desk landing', 'hash')
      assert_truth(operations_token not in page.content(), 'Training Desk secret boundary', 'Operations token was rendered in Training Mode.')

      page.get_by_role('link', name=re.compile('Start Current Mission|Start Mission', re.IGNORECASE)).first.click()
      expect(page.get_by_test_id('learn-the-flow-mission-page')).to_be_visible(timeout=15000)
      expect(page.get_by_text('Mission 1 - Your First Shift')).to_be_visible(timeout=15000)
      expect(page.get_by_text('Watch a Healthy Integration')).to_be_visible(timeout=15000)
      expect(page.get_by_text('FULL_SHIPMENT_LIFECYCLE')).to_be_visible(timeout=15000)

      page.get_by_role('button', name='Start Mission').click()
      run_training_lifecycle(page)
      expect(page.get_by_test_id('training-workstation').get_by_text('Observed by FreightBridge').first).to_be_visible(timeout=15000)
      expect(page.get_by_text('FreightBridge received a 997 from Midwest')).to_be_visible(timeout=15000)
      expect(page.get_by_test_id('hint-panel')).to_be_visible(timeout=15000)
      page.get_by_text('Hint 1 - Start with what FreightBridge received').click()
      expect(page.get_by_text(re.compile('confirm whether FreightBridge received', re.IGNORECASE))).to_be_visible(timeout=15000)
      page.get_by_label('Notes for this mission').fill('Validated healthy flow from FreightBridge evidence.')
      expect(page.get_by_label('Notes for this mission')).to_have_value('Validated healthy flow from FreightBridge evidence.')

      page.get_by_role('link', name='Open in Advanced Console').first.click()
      expect(page.get_by_test_id('integration-lab-page')).to_be_visible(timeout=30000)
      page.get_by_role('link', name='Back to Training').first.click()
      expect(page.get_by_test_id('training-desk')).to_be_visible(timeout=15000)

      return {'mission': 'LEARN_THE_FLOW', 'role': 'Integration Support Analyst'}
    finally:
      browser.close()


def run_training_lifecycle(page) -> None:
  import time

  deadline = time.time() + 180
  while time.time() < deadline:
    if page.get_by_role('alert').count() > 0 and page.get_by_role('alert').first.is_visible():
      raise AcceptanceFailure('Training lifecycle', 'Mission displayed an unexpected failure alert.')
    debrief_heading = page.get_by_role('heading', name='Debrief', exact=True)
    if debrief_heading.count() > 0 and debrief_heading.is_visible():
      return
    if page.get_by_role('radiogroup', name=re.compile('you see a 997', re.IGNORECASE)).count() > 0:
      group = page.get_by_role('radiogroup', name=re.compile('you see a 997', re.IGNORECASE))
      if group.is_visible():
        group.get_by_role('radio', name='No').click()
    if page.get_by_role('radiogroup', name=re.compile('Which message tells FreightBridge', re.IGNORECASE)).count() > 0:
      group = page.get_by_role('radiogroup', name=re.compile('Which message tells FreightBridge', re.IGNORECASE))
      if group.is_visible():
        group.get_by_role('radio', name='990').click()
    continue_button = page.get_by_role('button', name='Continue')
    if continue_button.count() > 0 and continue_button.is_enabled():
      continue_button.click()
      page.wait_for_timeout(750)
      continue
    page.wait_for_timeout(500)
  raise AcceptanceFailure('Training lifecycle', 'Mission 1 did not reach debrief before timeout.')


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(description='Run FreightBridge Milestone 24 Training POV deployed acceptance.')
  parser.add_argument('--verbose', action='store_true')
  parser.add_argument('--keep-going', action='store_true')
  parser.add_argument('--print-required-env', action='store_true')
  return parser.parse_args()


def main() -> int:
  args = parse_args()
  if args.print_required_env:
    print_required_env()
    print('  ANALYST_UI_BASE_URL')
    print('  OPERATIONS_API_BEARER_TOKEN')
    return 0
  try:
    config = AcceptanceConfig.from_env()
    recorder = StepRecorder(keep_going=args.keep_going, verbose=args.verbose)
    acceptance = Milestone24Acceptance(
      config=config,
      analyst_ui_base_url=os.environ.get('ANALYST_UI_BASE_URL', ''),
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
