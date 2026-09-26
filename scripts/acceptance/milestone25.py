from __future__ import annotations

import argparse
from collections.abc import Callable
import os
from pathlib import Path
import re
import sys
import time

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


class Milestone25Acceptance:
  def __init__(
    self,
    *,
    config: AcceptanceConfig,
    analyst_ui_base_url: str,
    recorder: StepRecorder,
    ui_acceptance: UiAcceptance | None = None,
  ) -> None:
    if not config.operations_bearer_token:
      raise AcceptanceFailure('Load configuration', 'OPERATIONS_API_BEARER_TOKEN is required for Milestone 25.')
    if not analyst_ui_base_url:
      raise AcceptanceFailure('Load configuration', 'ANALYST_UI_BASE_URL is required for Milestone 25.')

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
    print('FreightBridge Milestone 25 healthy baseline deployed acceptance')
    print('Scope: Mission 1 healthy integration checkpoint training')
    print('')
    try:
      self.recorder.run('FreightBridge API readiness', self._check_freightbridge_readiness)
      self.recorder.run('Integration Lab lifecycle readiness', self._check_lab_readiness)
      self.recorder.run(
        'Healthy baseline browser acceptance',
        lambda: self.ui_acceptance(self.analyst_ui_base_url, self.operations_token),
        lambda result: f"mission={result.get('mission')} completed={result.get('completed')}",
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
      assert_truth(operations_token not in page.content(), 'Training secret boundary', 'Operations token was rendered.')

      page.get_by_role('link', name=re.compile('Start Current Mission|Start Mission|Review Mission', re.IGNORECASE)).first.click()
      expect(page.get_by_test_id('learn-the-flow-mission-page')).to_be_visible(timeout=15000)
      expect(page.get_by_text('Mission 1 - Your First Shift')).to_be_visible(timeout=15000)
      expect(page.get_by_text('Watch a Healthy Integration')).to_be_visible(timeout=15000)
      expect(page.get_by_test_id('external-partner-apex')).to_contain_text('External Trading Partner')
      expect(page.get_by_test_id('external-partner-midwest')).to_contain_text('External Trading Partner')
      expect(page.get_by_test_id('follow-this-load')).to_be_visible(timeout=15000)
      expect(page.get_by_test_id('mission-checkpoint-x12-997')).to_contain_text('Pending')

      if page.get_by_test_id('completed-mission-review').count() > 0:
        page.get_by_test_id('replay-mission').click()
      else:
        page.get_by_role('button', name='Start Mission').click()

      expect(page.get_by_test_id('follow-this-load')).to_contain_text(re.compile('TRAIN|LAB', re.IGNORECASE), timeout=15000)
      expect(page.get_by_role('radiogroup', name=re.compile('Does receiving the Apex request', re.IGNORECASE))).to_be_visible(timeout=15000)
      assert_truth('AK5' not in page.get_by_test_id('mission-checkpoint-x12-997').inner_text(), 'Progressive evidence', '997 details appeared before lifecycle evidence.')

      run_training_lifecycle(page)
      expect(page.get_by_test_id('mission-checkpoint-inbound-apex')).to_contain_text('Observed by FreightBridge')
      expect(page.get_by_test_id('mission-checkpoint-canonical')).to_contain_text('one internal shipment language')
      expect(page.get_by_test_id('mission-checkpoint-x12-204')).to_contain_text('FreightBridge generated an X12 204')
      expect(page.get_by_test_id('mission-checkpoint-sftp-delivery')).to_contain_text('Document creation and document delivery are different')
      expect(page.get_by_test_id('mission-checkpoint-x12-997')).to_contain_text('Functional Acknowledgment')
      expect(page.get_by_test_id('mission-checkpoint-x12-990')).to_contain_text('business answer')
      expect(page.get_by_test_id('mission-checkpoint-x12-214')).to_contain_text('business event time')
      expect(page.get_by_test_id('transport-business-comparison')).to_contain_text('990 business response')
      expect(page.get_by_test_id('healthy-flow-checklist')).to_be_visible(timeout=15000)
      expect(page.get_by_test_id('last-healthy-checkpoint')).to_contain_text('Last Healthy Checkpoint')

      answer_checkpoint_questions(page)
      complete_final_review(page)
      page.get_by_role('button', name='Complete Mission').click()
      expect(page.get_by_text(re.compile('MISSION COMPLETE.*Your First Shift', re.IGNORECASE))).to_be_visible(timeout=15000)
      expect(page.get_by_test_id('replay-mission')).to_be_visible(timeout=15000)

      page.get_by_role('link', name='Return to Training Desk').click()
      expect(page.get_by_test_id('training-home-page')).to_be_visible(timeout=15000)
      expect(page.get_by_text('Complete')).to_be_visible(timeout=15000)

      page.get_by_role('link', name='Advanced Console').first.click()
      expect(page.get_by_test_id('dashboard-page')).to_be_visible(timeout=30000)
      expect(page.get_by_role('link', name='Back to Training').first).to_be_visible(timeout=15000)

      return {'mission': 'LEARN_THE_FLOW', 'completed': True}
    finally:
      browser.close()


def run_training_lifecycle(page) -> None:
  deadline = time.time() + 240
  while time.time() < deadline:
    if page.get_by_role('alert').count() > 0 and page.get_by_role('alert').first.is_visible():
      raise AcceptanceFailure('Training lifecycle', 'Mission displayed an unexpected failure alert.')
    answer_checkpoint_questions(page)
    debrief = page.get_by_test_id('mission-debrief')
    if debrief.count() > 0 and debrief.is_visible():
      return
    continue_button = page.get_by_role('button', name='Continue')
    if continue_button.count() > 0 and continue_button.is_enabled():
      continue_button.click()
      page.wait_for_timeout(750)
      continue
    page.wait_for_timeout(500)
  raise AcceptanceFailure('Training lifecycle', 'Mission 1 did not reach the healthy-flow debrief before timeout.')


def answer_checkpoint_questions(page) -> None:
  answers = (
    ('Does receiving the Apex request', 'No'),
    ('Who created the X12 204', 'FreightBridge'),
    ('Does successful SFTP delivery', 'No'),
    ('you see a 997', 'No'),
    ('Which message tells FreightBridge', '990'),
    ('Which transaction communicates shipment status', '214'),
  )
  for prompt, answer in answers:
    group = page.get_by_role('radiogroup', name=re.compile(re.escape(prompt), re.IGNORECASE))
    if group.count() > 0 and group.is_visible():
      group.get_by_role('radio', name=answer).click()


def complete_final_review(page) -> None:
  from playwright.sync_api import expect

  review = page.get_by_test_id('final-healthy-review')
  expect(review).to_be_visible(timeout=15000)
  for checkbox in review.get_by_role('checkbox').all():
    if not checkbox.is_checked():
      checkbox.check()


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(description='Run FreightBridge Milestone 25 healthy baseline deployed acceptance.')
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
    acceptance = Milestone25Acceptance(
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
