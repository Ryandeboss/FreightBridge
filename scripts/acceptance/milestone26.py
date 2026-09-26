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
}


class Milestone26Acceptance:
  def __init__(
    self,
    *,
    config: AcceptanceConfig,
    analyst_ui_base_url: str,
    recorder: StepRecorder,
    ui_acceptance: UiAcceptance | None = None,
  ) -> None:
    if not config.operations_bearer_token:
      raise AcceptanceFailure('Load configuration', 'OPERATIONS_API_BEARER_TOKEN is required for Milestone 26.')
    if not analyst_ui_base_url:
      raise AcceptanceFailure('Load configuration', 'ANALYST_UI_BASE_URL is required for Milestone 26.')

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
    print('FreightBridge Milestone 26 beginner incident campaign deployed acceptance')
    print('Scope: Training Mode Missions 2-4 using real Integration Lab failure drills')
    print('')
    try:
      self.recorder.run('FreightBridge API readiness', self._check_freightbridge_readiness)
      self.recorder.run('Integration Lab failure-drill readiness', self._check_lab_readiness)
      self.recorder.run(
        'Beginner incident browser acceptance',
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

      page.evaluate("""
        window.localStorage.setItem('freightbridge.trainingProgress', JSON.stringify({
          version: 1,
          completedMissions: ['LEARN_THE_FLOW']
        }));
      """)
      page.goto(f'{analyst_ui_base_url.rstrip("/")}/#/learn', wait_until='domcontentloaded')
      expect(page.get_by_test_id('training-home-page')).to_be_visible(timeout=15000)
      expect(page.get_by_test_id('mission-1-card')).to_contain_text('Complete')
      expect(page.get_by_test_id('mission-2-card')).to_contain_text('Open Mission')
      expect(page.get_by_test_id('mission-3-card')).to_contain_text('Locked')

      run_incident_mission(
        page,
        analyst_ui_base_url,
        slug='apex-bad-auth',
        scenario_key='APEX_BAD_AUTH',
        expected_error='AUTHENTICATION_ERROR',
        last_healthy='No healthy processing checkpoint',
        diagnosis='failed FreightBridge authentication',
        plan='valid training authentication',
        recovery='Retry with valid training authentication',
      )
      expect(page.get_by_test_id('mission-3-card')).to_contain_text('Open Mission', timeout=15000)
      expect(page.get_by_test_id('mission-4-card')).to_contain_text('Locked')

      run_incident_mission(
        page,
        analyst_ui_base_url,
        slug='apex-invalid-json',
        scenario_key='APEX_INVALID_JSON',
        expected_error='INVALID_JSON',
        last_healthy='Inbound request reached FreightBridge',
        diagnosis='malformed JSON',
        plan='resend parseable JSON',
        recovery='Retry with corrected JSON',
      )
      expect(page.get_by_test_id('mission-4-card')).to_contain_text('Open Mission', timeout=15000)
      expect(page.get_by_test_id('mission-5-card')).to_contain_text('Locked')

      run_incident_mission(
        page,
        analyst_ui_base_url,
        slug='apex-invalid-contract',
        scenario_key='APEX_INVALID_CONTRACT',
        expected_error='INVALID_APEX_LOAD',
        last_healthy='JSON parsing succeeded',
        diagnosis='Parsed JSON failed the Apex load contract',
        plan='contract-valid payload',
        recovery='Retry with contract-valid payload',
      )
      expect(page.get_by_test_id('mission-5-card')).to_contain_text('Locked', timeout=15000)

      page.get_by_role('link', name='Advanced Console').first.click()
      expect(page.get_by_test_id('dashboard-page')).to_be_visible(timeout=30000)

      return {'completedMissions': ['APEX_BAD_AUTH', 'APEX_INVALID_JSON', 'APEX_INVALID_CONTRACT']}
    finally:
      browser.close()


def run_incident_mission(
  page,
  analyst_ui_base_url: str,
  *,
  slug: str,
  scenario_key: str,
  expected_error: str,
  last_healthy: str,
  diagnosis: str,
  plan: str,
  recovery: str,
) -> None:
  from playwright.sync_api import expect

  page.goto(f'{analyst_ui_base_url.rstrip("/")}/#/learn/mission/{slug}', wait_until='domcontentloaded')
  expect(page.get_by_test_id('incident-mission-page')).to_be_visible(timeout=15000)
  if page.get_by_test_id('completed-incident-review').count() > 0:
    page.get_by_test_id('completed-incident-review').get_by_test_id('replay-mission').click()
  else:
    page.get_by_role('button', name='Start Incident').click()
  workspace = page.get_by_test_id('incident-workspace')
  expect(workspace).to_be_visible(timeout=30000)
  expect(workspace).to_contain_text(scenario_key)
  expect(workspace).to_contain_text(expected_error)
  expect(workspace).to_contain_text(re.compile('FAILED|NOT REACHED'))
  incident_load = page.get_by_test_id('incident-load-id').inner_text().strip()
  assert_truth(bool(incident_load), 'Incident correlation', 'Incident load identifier was empty.')

  choose_radio(page, 'Where did FreightBridge evidence last look healthy', last_healthy)
  choose_radio(page, 'What is the most accurate FreightBridge diagnosis', diagnosis)
  choose_radio(page, 'What should you do next', plan)
  page.get_by_test_id('remediation-action').get_by_role('button', name=re.compile(re.escape(recovery), re.IGNORECASE)).click()
  verification = page.get_by_test_id('verification-panel')
  expect(verification).to_contain_text('SUCCEEDED', timeout=120000)
  expect(verification).to_contain_text(incident_load)
  expect(page.get_by_test_id('recovery-correlation')).to_contain_text('MATCHED')
  page.get_by_label(re.compile('Write Mike', re.IGNORECASE)).fill(
    f'Mike, FreightBridge reproduced {scenario_key}, found {expected_error}, completed the safe retry, and verified recovery.'
  )
  page.get_by_role('button', name='Complete Debrief').click()
  expect(page.get_by_test_id('incident-debrief')).to_be_visible(timeout=15000)
  expect(page.get_by_test_id('incident-debrief')).to_contain_text('MISSION COMPLETE')
  expect(page.get_by_test_id('incident-summary')).to_be_visible(timeout=15000)
  page.get_by_role('link', name='Return to Training Desk').click()
  expect(page.get_by_test_id('training-home-page')).to_be_visible(timeout=15000)


def choose_radio(page, prompt: str, option: str) -> None:
  group = page.get_by_role('radiogroup', name=re.compile(re.escape(prompt), re.IGNORECASE))
  group.get_by_role('radio', name=re.compile(re.escape(option), re.IGNORECASE)).click()


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(description='Run FreightBridge Milestone 26 beginner incident deployed acceptance.')
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
    acceptance = Milestone26Acceptance(
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
