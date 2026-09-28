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

REQUIRED_SCENARIOS = {
  'FULL_SHIPMENT_LIFECYCLE',
  'APEX_BAD_AUTH',
  'APEX_INVALID_JSON',
  'APEX_INVALID_CONTRACT',
  'APEX_DUPLICATE_SHIPMENT',
  'X12_214_CONTROL_MISMATCH',
  'X12_214_UNSUPPORTED_STATUS',
}


class Milestone27Acceptance:
  def __init__(
    self,
    *,
    config: AcceptanceConfig,
    analyst_ui_base_url: str,
    recorder: StepRecorder,
    ui_acceptance: UiAcceptance | None = None,
  ) -> None:
    if not config.operations_bearer_token:
      raise AcceptanceFailure('Load configuration', 'OPERATIONS_API_BEARER_TOKEN is required for Milestone 27.')
    if not analyst_ui_base_url:
      raise AcceptanceFailure('Load configuration', 'ANALYST_UI_BASE_URL is required for Milestone 27.')

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
    print('FreightBridge Milestone 27 intermediate incident deployed acceptance')
    print('Scope: Training Mode Missions 5-7 using real failure drills')
    print('')
    try:
      self.recorder.run('FreightBridge API readiness', self._check_freightbridge_readiness)
      self.recorder.run('Integration Lab intermediate drill readiness', self._check_lab_readiness)
      self.recorder.run(
        'Intermediate incident browser acceptance',
        lambda: self.ui_acceptance(self.analyst_ui_base_url, self.operations_token),
        lambda result: f"completed={','.join(result.get('completedMissions', []))}",
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
    missing = sorted(REQUIRED_SCENARIOS - set(scenarios))
    assert_truth(not missing, 'Integration Lab readiness', f'Missing required scenarios: {", ".join(missing)}')
    return {'scenarios': sorted(REQUIRED_SCENARIOS)}


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
      assert_truth(operations_token not in page.content(), 'Training secret boundary', 'Operations token was rendered.')

      seed_progress(page, ['LEARN_THE_FLOW', 'APEX_BAD_AUTH', 'APEX_INVALID_JSON', 'APEX_INVALID_CONTRACT'])
      page.reload(wait_until='domcontentloaded')
      expect(page.get_by_test_id('training-home-page')).to_be_visible(timeout=15000)
      for index in range(1, 5):
        expect(page.get_by_test_id(f'mission-{index}-card')).to_contain_text('Complete')
      expect(page.get_by_test_id('mission-5-card')).to_contain_text('Open Mission')
      expect(page.get_by_test_id('mission-6-card')).to_contain_text('Locked')
      expect(page.get_by_test_id('mission-7-card')).to_contain_text('Locked')
      expect(page.get_by_test_id('mission-8-card')).to_contain_text('Locked')

      run_intermediate_mission(
        page,
        analyst_ui_base_url,
        slug='duplicate-shipment',
        scenario_key='APEX_DUPLICATE_SHIPMENT',
        required_sources=('transaction', 'idempotency'),
        last_healthy='Original shipment was established',
        diagnosis='same shipment was resent without an idempotency key',
        plan='safe replay',
        recovery='Verify safe replay protection',
        expected_text='DUPLICATE_SHIPMENT',
      )
      expect(page.get_by_test_id('mission-6-card')).to_contain_text('Open Mission', timeout=15000)

      run_intermediate_mission(
        page,
        analyst_ui_base_url,
        slug='x12-envelope-mismatch',
        scenario_key='X12_214_CONTROL_MISMATCH',
        required_sources=('sftp', 'raw-x12'),
        last_healthy='214 file reached FreightBridge',
        diagnosis='ST02 and SE02',
        plan='Correct the 214 transaction-set control numbers',
        recovery='Retry corrected 214 controls',
        expected_text='CONTROL_NUMBER_MISMATCH',
      )
      expect(page.get_by_test_id('mission-7-card')).to_contain_text('Open Mission', timeout=15000)

      run_intermediate_mission(
        page,
        analyst_ui_base_url,
        slug='status-callback-missing',
        scenario_key='X12_214_UNSUPPORTED_STATUS',
        required_sources=('raw-x12', 'mapping'),
        last_healthy='passed X12 parsing',
        diagnosis='unsupported status code ZZ',
        plan='supported AT7 value',
        recovery='Retry corrected supported 214 status',
        expected_text='UNSUPPORTED_AT7_CODE',
      )
      expect(page.get_by_test_id('mission-8-card')).to_contain_text('Locked', timeout=15000)

      page.get_by_role('link', name='Advanced Console').first.click()
      expect(page.get_by_test_id('dashboard-page')).to_be_visible(timeout=30000)
      assert_truth(operations_token not in page.content(), 'Training secret boundary', 'Operations token was rendered after missions.')

      return {'completedMissions': ['DUPLICATE_SHIPMENT', 'X12_ENVELOPE_MISMATCH', 'STATUS_CALLBACK_MISSING']}
    finally:
      browser.close()


def seed_progress(page, completed: list[str]) -> None:
  page.evaluate(
    """completed => {
      window.localStorage.setItem('freightbridge.trainingProgress', JSON.stringify({
        version: 1,
        completedMissions: completed
      }));
    }""",
    completed,
  )


def run_intermediate_mission(
  page,
  analyst_ui_base_url: str,
  *,
  slug: str,
  scenario_key: str,
  required_sources: tuple[str, str],
  last_healthy: str,
  diagnosis: str,
  plan: str,
  recovery: str,
  expected_text: str,
) -> None:
  from playwright.sync_api import expect

  page.goto(f'{analyst_ui_base_url.rstrip("/")}/#/learn/mission/{slug}', wait_until='domcontentloaded')
  expect(page.get_by_test_id('incident-mission-page')).to_be_visible(timeout=15000)
  page.get_by_role('button', name='Start Incident').click()
  workspace = page.get_by_test_id('incident-workspace')
  expect(workspace).to_be_visible(timeout=30000)
  assert_equal(workspace.get_attribute('data-scenario-key'), scenario_key, 'Scenario key', slug)

  page.get_by_test_id('technical-classification').locator('summary').click()
  expect(page.get_by_test_id('technical-classification')).to_contain_text(expected_text)
  choose_radio(page, 'Where did FreightBridge evidence last look healthy', last_healthy)
  assert_truth(
    not page.get_by_test_id('diagnosis-panel').get_by_role('radio', name=re.compile(re.escape(diagnosis), re.IGNORECASE)).is_enabled(),
    'Diagnosis gating',
    f'{slug} diagnosis was enabled before required evidence inspection.',
  )

  for source_id in required_sources:
    page.get_by_test_id(f'evidence-source-{source_id}').locator('summary').click()
  choose_radio(page, 'What is the most accurate FreightBridge diagnosis', diagnosis)
  choose_radio(page, 'What should you do next', plan)
  page.get_by_test_id('remediation-action').get_by_role('button', name=re.compile(re.escape(recovery), re.IGNORECASE)).click()
  expect(page.get_by_test_id('verification-panel')).to_contain_text('SUCCEEDED', timeout=120000)
  expect(page.get_by_test_id('recovery-correlation')).to_contain_text('same incident load', timeout=15000)
  page.get_by_label(re.compile('Write Mike', re.IGNORECASE)).fill(
    f'Mike, FreightBridge verified {scenario_key}, selected the last healthy checkpoint, took the safe action, and proved same-load recovery.'
  )
  page.get_by_role('button', name='Complete Debrief').click()
  expect(page.get_by_test_id('incident-debrief')).to_be_visible(timeout=15000)
  page.get_by_role('link', name='Return to Training Desk').click()
  expect(page.get_by_test_id('training-home-page')).to_be_visible(timeout=15000)


def choose_radio(page, prompt: str, option: str) -> None:
  group = page.get_by_role('radiogroup', name=re.compile(re.escape(prompt), re.IGNORECASE))
  group.get_by_role('radio', name=re.compile(re.escape(option), re.IGNORECASE)).click()


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(description='Run FreightBridge Milestone 27 intermediate incident deployed acceptance.')
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
    acceptance = Milestone27Acceptance(
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
