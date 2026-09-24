from __future__ import annotations

import argparse
from collections.abc import Callable, Sequence
import os
from pathlib import Path
import re
import subprocess
import sys
from typing import Any

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



Runner = Callable[[Sequence[str]], subprocess.CompletedProcess]
UiPreflight = Callable[[str, str], dict[str, object]]

REQUIRED_MAPPING_KEYS = (
  'APEX_LOAD_TO_CANONICAL',
  'CANONICAL_TO_MWCX_204',
  'MWCX_990_TO_CANONICAL',
  'MWCX_214_TO_CANONICAL',
  'MWCX_997_TO_ACK',
)

REQUIRED_FAILURE_DRILL_KEYS = (
  'APEX_BAD_AUTH',
  'APEX_INVALID_JSON',
  'APEX_INVALID_CONTRACT',
  'APEX_DUPLICATE_SHIPMENT',
  'X12_214_CONTROL_MISMATCH',
  'X12_214_UNSUPPORTED_STATUS',
  'X12_214_WRONG_VERSION',
  'SFTP_HOST_KEY_MISMATCH',
)

REQUIRED_NAV_LINKS = (
  'Transactions',
  'Failures',
  'Business Trace',
  'Partners',
  'Mappings',
  'Integration Lab',
)


def build_milestone20_command(*, load_id: str | None, verbose: bool) -> list[str]:
  command = [sys.executable, str(Path(__file__).with_name('milestone20.py'))]
  if load_id:
    command.extend(['--load-id', derived_milestone20_load_id(load_id)])
  if verbose:
    command.append('--verbose')
  return command


def derived_milestone20_load_id(load_id: str) -> str:
  cleaned = re.sub(r'[^A-Za-z0-9]', '', load_id).upper()
  if not cleaned:
    cleaned = 'LOAD'
  if not cleaned.startswith('LOAD'):
    cleaned = f'LOAD{cleaned}'
  return f'{cleaned[:24]}M22'


class Milestone22Acceptance:
  def __init__(
    self,
    *,
    config: AcceptanceConfig,
    analyst_ui_base_url: str,
    recorder: StepRecorder,
    load_id: str | None = None,
    runner: Runner = subprocess.run,
    ui_preflight: UiPreflight | None = None,
  ) -> None:
    if not config.operations_bearer_token:
      raise AcceptanceFailure('Load configuration', 'OPERATIONS_API_BEARER_TOKEN is required for Milestone 22.')
    if not analyst_ui_base_url:
      raise AcceptanceFailure('Load configuration', 'ANALYST_UI_BASE_URL is required for Milestone 22.')

    self.config = config
    self.analyst_ui_base_url = analyst_ui_base_url.rstrip('/')
    self.recorder = recorder
    self.load_id = load_id
    self.runner = runner
    self.ui_preflight = ui_preflight or run_browser_preflight
    self.apex = SafeHttpClient(name='Apex', base_url=config.apex_base_url, verbose=recorder.verbose)
    self.freightbridge = SafeHttpClient(name='FreightBridge', base_url=config.freightbridge_base_url, verbose=recorder.verbose)
    self.midwest = SafeHttpClient(name='Midwest', base_url=config.midwest_base_url, verbose=recorder.verbose)

  @property
  def operations_token(self) -> str:
    return self.config.operations_bearer_token or ''

  @property
  def midwest_readonly_token(self) -> str:
    return self.config.midwest_readonly_token or self.config.midwest_bearer_token

  def close(self) -> None:
    self.apex.close()
    self.freightbridge.close()
    self.midwest.close()

  def run(self) -> int:
    print('FreightBridge Milestone 22 Final Deployed Acceptance')
    print('Phase A: deployment preflight')
    print('Phase B: Milestone 20 regression pack')
    print('Phase C: deployment postflight')
    print('')

    try:
      self._run_preflight()
    except AcceptanceFailure:
      return self.recorder.finish()
    if self.recorder.failures:
      return self.recorder.finish()

    try:
      self.recorder.run(
        'Milestone 20 regression pack',
        self._run_milestone20_regression,
        lambda result: f'exit code {result}',
      )
    except AcceptanceFailure:
      return self.recorder.finish()
    if self.recorder.failures:
      return self.recorder.finish()

    try:
      self._run_postflight()
    except AcceptanceFailure:
      return self.recorder.finish()
    return self.recorder.finish()

  def _run_preflight(self) -> None:
    self.recorder.run('Apex deployment readiness', self._check_apex_readiness)
    self.recorder.run('FreightBridge deployment readiness', self._check_freightbridge_readiness)
    self.recorder.run('Midwest deployment readiness', self._check_midwest_readiness)
    self.recorder.run('FreightBridge Midwest SFTP readiness', self._check_freightbridge_sftp_readiness)
    self.recorder.run('Midwest SFTP readiness', self._check_midwest_sftp_readiness)
    self.recorder.run('Operations summary readiness', self._check_operations_summary)
    self.recorder.run('Configuration partner readiness', self._check_configuration_partners)
    self.recorder.run('Mapping profile readiness', self._check_mapping_profiles)
    self.recorder.run('Integration Lab readiness', self._check_lab_readiness)
    self.recorder.run('Analyst UI readiness', self._check_analyst_ui)

  def _run_postflight(self) -> None:
    self.recorder.run('Postflight FreightBridge readiness', self._check_freightbridge_readiness)
    self.recorder.run('Postflight operations summary', self._check_operations_summary)
    self.recorder.run('Postflight Integration Lab readiness', self._check_lab_readiness)

  def _check_apex_readiness(self) -> dict[str, object]:
    health = self.apex.get('/health', token=self.config.apex_readonly_token, step='Apex health')
    assert_equal(health.get('status'), 'ok', 'Apex health', 'status')
    assert_equal(health.get('service'), 'apex-partner-sim', 'Apex health', 'service')

    readiness = self.apex.get(
      '/readiness',
      token=self.config.apex_readonly_token,
      step='Apex readiness',
    )
    assert_equal(readiness.get('status'), 'ready', 'Apex readiness', 'status')
    assert_equal(readiness.get('service'), 'apex-partner-sim', 'Apex readiness', 'service')
    self._assert_dependency(readiness, 'database', 'Apex readiness')
    self._assert_dependency(readiness, 'apex_schema', 'Apex readiness')
    return readiness

  def _check_freightbridge_readiness(self) -> dict[str, object]:
    health = self.freightbridge.get('/health', step='FreightBridge health')
    assert_equal(health.get('status'), 'ok', 'FreightBridge health', 'status')
    assert_equal(health.get('service'), 'freightbridge-api', 'FreightBridge health', 'service')

    readiness = self.freightbridge.get('/readiness', step='FreightBridge readiness')
    assert_equal(readiness.get('status'), 'ready', 'FreightBridge readiness', 'status')
    assert_equal(readiness.get('service'), 'freightbridge-api', 'FreightBridge readiness', 'service')

    for dependency in ('configuration', 'database', 'domain_schema'):
      self._assert_dependency(readiness, dependency, 'FreightBridge readiness')

    return readiness

  def _check_midwest_readiness(self) -> dict[str, object]:
    health = self.midwest.get(
      '/health',
      token=self.midwest_readonly_token,
      step='Midwest health',
    )
    assert_equal(health.get('status'), 'ok', 'Midwest health', 'status')
    assert_equal(health.get('service'), 'midwest-partner-sim', 'Midwest health', 'service')

    readiness = self.midwest.get(
      '/readiness',
      token=self.midwest_readonly_token,
      step='Midwest readiness',
    )
    assert_equal(readiness.get('status'), 'ready', 'Midwest readiness', 'status')
    assert_equal(readiness.get('service'), 'midwest-partner-sim', 'Midwest readiness', 'service')
    self._assert_dependency(readiness, 'database', 'Midwest readiness')
    self._assert_dependency(readiness, 'midwest_schema', 'Midwest readiness')
    return readiness

  def _check_freightbridge_sftp_readiness(self) -> dict[str, object]:
    body = self.freightbridge.get(
      '/api/integrations/midwest/sftp/readiness',
      step='FreightBridge Midwest SFTP readiness',
    )
    assert_equal(body.get('status'), 'ready', 'FreightBridge Midwest SFTP readiness', 'status')
    assert_equal(body.get('transport'), 'SFTP', 'FreightBridge Midwest SFTP readiness', 'transport')
    return body

  def _check_midwest_sftp_readiness(self) -> dict[str, object]:
    body = self.midwest.get('/v1/sftp/readiness', token=self.midwest_readonly_token, step='Midwest SFTP readiness')
    assert_equal(body.get('status'), 'ready', 'Midwest SFTP readiness', 'status')
    assert_equal(body.get('transport'), 'SFTP', 'Midwest SFTP readiness', 'transport')
    return body

  def _check_operations_summary(self) -> dict[str, object]:
    body = self.freightbridge.get('/api/operations/summary', token=self.operations_token, step='Operations summary readiness')
    for field_name in (
      'hours',
      'transactionsTotal',
      'transactionsSucceeded',
      'transactionsFailed',
      'transactionsProcessing',
      'unresolvedErrors',
      'retryableUnresolvedErrors',
    ):
      assert_truth(isinstance(body.get(field_name), int), 'Operations summary readiness', f'{field_name} must be an integer.')
    for field_name in ('generatedAt', 'byErrorCategory', 'byDocumentType'):
      assert_truth(field_name in body, 'Operations summary readiness', f'{field_name} is missing.')
    assert_truth(isinstance(body.get('byErrorCategory'), dict), 'Operations summary readiness', 'byErrorCategory must be an object.')
    assert_truth(isinstance(body.get('byDocumentType'), dict), 'Operations summary readiness', 'byDocumentType must be an object.')
    return body

  def _check_configuration_partners(self) -> dict[str, object]:
    partners = self.freightbridge.get('/api/configuration/partners', token=self.operations_token, step='Configuration partners')
    assert_truth(isinstance(partners, list), 'Configuration partners', 'Partner list response must be an array.')
    partner_codes = {
      item.get('partnerCode')
      for item in partners
      if isinstance(item, dict) and isinstance(item.get('partnerCode'), str)
    }
    for partner_code in ('APEX', 'MWCX'):
      assert_truth(partner_code in partner_codes, 'Configuration partners', f'{partner_code} partner is missing.')
      detail = self.freightbridge.get(
        f'/api/configuration/partners/{partner_code}',
        token=self.operations_token,
        step=f'{partner_code} configuration detail',
      )
      assert_equal(detail.get('partnerCode'), partner_code, f'{partner_code} configuration detail', 'partnerCode')
      assert_truth(bool(detail.get('businessRole')), f'{partner_code} configuration detail', 'businessRole is missing.')
      assert_truth(bool(detail.get('integrationStyle')), f'{partner_code} configuration detail', 'integrationStyle is missing.')
      capabilities = self.freightbridge.get(
        f'/api/configuration/partners/{partner_code}/capabilities',
        token=self.operations_token,
        step=f'{partner_code} capabilities',
      )
      assert_truth(isinstance(capabilities, list) and len(capabilities) > 0, f'{partner_code} capabilities', 'No capabilities returned.')
      assert_truth(
        any(isinstance(item, dict) and item.get('enabled') is True for item in capabilities),
        f'{partner_code} capabilities',
        'No enabled capabilities returned.',
      )
    return {'partners': sorted(partner_codes)}

  def _check_mapping_profiles(self) -> dict[str, object]:
    observed: dict[str, str] = {}
    for mapping_key in REQUIRED_MAPPING_KEYS:
      body = self.freightbridge.get(
        f'/api/configuration/mappings?mappingKey={mapping_key}&status=ACTIVE&limit=10',
        token=self.operations_token,
        step=f'Mapping profile {mapping_key}',
      )
      mappings = body.get('mappings')
      assert_truth(isinstance(mappings, list), f'Mapping profile {mapping_key}', 'mappings must be an array.')
      active = [
        item for item in mappings
        if isinstance(item, dict) and item.get('mappingKey') == mapping_key and item.get('status') == 'ACTIVE'
      ]
      assert_truth(len(active) > 0, f'Mapping profile {mapping_key}', 'Active mapping profile was not found.')
      observed[mapping_key] = str(active[0].get('versionNumber'))
    return observed

  def _check_lab_readiness(self) -> dict[str, object]:
    body = self.freightbridge.get(
      '/api/lab/readiness',
      token=self.operations_token,
      step='Integration Lab readiness',
    )

    assert_equal(body.get('status'), 'ready', 'Integration Lab readiness', 'status')

    scenarios = {
      scenario.get('scenarioKey'): scenario
      for scenario in body.get('scenarios', [])
      if isinstance(scenario, dict)
    }

    assert_truth(
      'FULL_SHIPMENT_LIFECYCLE' in scenarios,
      'Integration Lab readiness',
      'FULL_SHIPMENT_LIFECYCLE scenario is missing.',
    )

    for scenario_key in REQUIRED_FAILURE_DRILL_KEYS:
      assert_truth(
        scenario_key in scenarios,
        'Integration Lab readiness',
        f'{scenario_key} failure drill is missing.',
      )

    dependencies = body.get('dependencies')
    assert_truth(
      isinstance(dependencies, dict),
      'Integration Lab readiness',
      'dependencies must be an object.',
    )

    return {
      'scenarioCount': len(scenarios),
      'failureDrills': list(REQUIRED_FAILURE_DRILL_KEYS),
    }

  def _check_analyst_ui(self) -> dict[str, object]:
    return self.ui_preflight(self.analyst_ui_base_url, self.operations_token)

  def _run_milestone20_regression(self) -> int:
    command = build_milestone20_command(load_id=self.load_id, verbose=self.recorder.verbose)
    result = self.runner(command)
    if result.returncode != 0:
      raise AcceptanceFailure(
        'Milestone 20 regression pack',
        f'Milestone 20 child process failed with exit code {result.returncode}.',
      )
    return result.returncode

  def _assert_dependency(self, body: dict[str, object], dependency_name: str, step: str) -> None:
    dependencies = body.get('dependencies')
    assert_truth(isinstance(dependencies, dict), step, 'dependencies must be an object.')
    assert_equal(dependencies.get(dependency_name), 'ok', step, f'{dependency_name} dependency')


def run_browser_preflight(analyst_ui_base_url: str, operations_token: str) -> dict[str, object]:
  from playwright.sync_api import expect, sync_playwright

  with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
      page = browser.new_page()
      page.goto(analyst_ui_base_url, wait_until='domcontentloaded')
      page.get_by_label('Operations bearer token').fill(operations_token)
      page.get_by_role('button', name='Unlock Console').click()
      expect(page.get_by_test_id('dashboard-page')).to_be_visible(timeout=30000)
      for link_name in REQUIRED_NAV_LINKS:
        expect(page.get_by_role('link', name=link_name, exact=True)).to_be_visible(timeout=15000)
      assert_truth('Bearer' not in page.content(), 'Analyst UI readiness', 'UI exposed bearer-token text.')
      return {'navLinks': list(REQUIRED_NAV_LINKS)}
    finally:
      browser.close()


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(description='Run FreightBridge Milestone 22 final deployed acceptance.')
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
    print('  OPERATIONS_API_BEARER_TOKEN')
    return 0
  try:
    config = AcceptanceConfig.from_env()
    recorder = StepRecorder(keep_going=args.keep_going, verbose=args.verbose)
    acceptance = Milestone22Acceptance(
      config=config,
      analyst_ui_base_url=os.environ.get('ANALYST_UI_BASE_URL', ''),
      recorder=recorder,
      load_id=args.load_id,
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
