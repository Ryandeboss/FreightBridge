from __future__ import annotations

import argparse
import os
from pathlib import Path
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
  correlation_id,
  generate_load_id,
  print_required_env,
)
from scripts.acceptance.milestone12 import apex_load_payload  # noqa: E402


REQUIRED_MAPPING_KEYS = {
  'APEX_LOAD_TO_CANONICAL',
  'CANONICAL_TO_MWCX_204',
  'MWCX_990_TO_CANONICAL',
  'MWCX_214_TO_CANONICAL',
  'MWCX_997_TO_ACK',
}


class Milestone17Acceptance:
  def __init__(self, *, config: AcceptanceConfig, analyst_ui_base_url: str, load_id: str, recorder: StepRecorder) -> None:
    if not config.operations_bearer_token:
      raise AcceptanceFailure('Load configuration', 'OPERATIONS_API_BEARER_TOKEN is required for Milestone 17.')
    if not analyst_ui_base_url:
      raise AcceptanceFailure('Load configuration', 'ANALYST_UI_BASE_URL is required for Milestone 17.')
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
    print('FreightBridge Milestone 17 Deployed Acceptance')
    print(f'Load: {self.load_id}')
    print('')
    self.warm_up()
    self.exercise_configuration_api()
    self.create_runtime_transaction()
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
      lambda: self.freightbridge.get('/api/operations/summary?hours=24', token=self.operations_token, step='Operations summary auth check'),
    )

  def exercise_configuration_api(self) -> None:
    partners = self.recorder.run('List configured partners', self._list_partners)
    if partners:
      for code in ('APEX', 'MWCX'):
        assert_truth(any(item.get('partnerCode') == code for item in partners), 'List configured partners', f'Missing {code}.')
      assert_truth('secret' not in str(partners).lower(), 'List configured partners', 'Configuration API exposed secret-like content.')

    self.recorder.run('Read Midwest partner detail', lambda: self._read_partner('MWCX'))
    self.recorder.run('Safe partner patch', self._safe_partner_patch)
    self.recorder.run('Safe capability patch', self._safe_capability_patch)
    self.recorder.run('List active mappings', self._list_active_mappings)
    self.recorder.run('Clone validate abandon mapping draft', self._draft_lifecycle)

  def _list_partners(self) -> list[dict[str, Any]]:
    body = self.freightbridge.get('/api/configuration/partners', token=self.operations_token, step='List configured partners')
    partners = body.get('body')
    if isinstance(partners, list):
      return partners
    raise AcceptanceFailure('List configured partners', 'Expected partners list.', response_body=body)

  def _read_partner(self, partner_code: str) -> dict[str, Any]:
    partner = self.freightbridge.get(f'/api/configuration/partners/{partner_code}', token=self.operations_token, step='Read Midwest partner detail')
    assert_truth(bool(partner.get('capabilities')), 'Read Midwest partner detail', 'Partner capabilities were missing.')
    return partner

  def _safe_partner_patch(self) -> dict[str, Any]:
    partner = self._read_partner('MWCX')
    patched = self.freightbridge.patch_json(
      '/api/configuration/partners/MWCX',
      {
        'name': partner.get('name'),
        'description': partner.get('description'),
        'supportContact': partner.get('supportContact'),
        'active': partner.get('active'),
      },
      token=self.operations_token,
      step='Safe partner patch',
    )
    assert_equal(patched.get('partnerCode'), 'MWCX', 'Safe partner patch', 'partnerCode')
    return patched

  def _safe_capability_patch(self) -> dict[str, Any]:
    partner = self._read_partner('MWCX')
    capability = next((item for item in partner.get('capabilities', []) if item.get('documentType') == '204'), None)
    assert_truth(isinstance(capability, dict), 'Safe capability patch', 'Missing Midwest 204 capability.')
    return self.freightbridge.patch_json(
      f"/api/configuration/capabilities/{capability['id']}",
      {'enabled': capability.get('enabled'), 'note': 'Milestone 17 acceptance no-op capability verification'},
      token=self.operations_token,
      step='Safe capability patch',
    )

  def _list_active_mappings(self) -> dict[str, Any]:
    body = self.freightbridge.get('/api/configuration/mappings?status=ACTIVE&limit=100', token=self.operations_token, step='List active mappings')
    keys = {item.get('mappingKey') for item in body.get('mappings', [])}
    missing = REQUIRED_MAPPING_KEYS - keys
    assert_truth(not missing, 'List active mappings', f'Missing active mapping keys: {sorted(missing)}')
    return body

  def _draft_lifecycle(self) -> dict[str, Any]:
    active = self._list_active_mappings()
    source = next(item for item in active['mappings'] if item.get('mappingKey') == 'CANONICAL_TO_MWCX_204')
    draft = self.freightbridge.post_json(
      f"/api/configuration/mappings/{source['id']}/clone-draft",
      {'changeNote': 'Milestone 17 deployed acceptance draft'},
      token=self.operations_token,
      expected=(201,),
      step='Clone validate abandon mapping draft',
    )
    detail = self.freightbridge.get(f"/api/configuration/mappings/{draft['id']}", token=self.operations_token, step='Clone validate abandon mapping draft')
    self.freightbridge.patch_json(
      f"/api/configuration/mappings/{draft['id']}",
      {'settings': detail.get('settings'), 'changeNote': 'Milestone 17 no-op settings verification'},
      token=self.operations_token,
      step='Clone validate abandon mapping draft',
    )
    validated = self.freightbridge.post_empty(
      f"/api/configuration/mappings/{draft['id']}/validate",
      token=self.operations_token,
      step='Clone validate abandon mapping draft',
    )
    assert_equal(validated.get('validationStatus'), 'VALID', 'Clone validate abandon mapping draft', 'validationStatus')
    abandoned = self.freightbridge.post_empty(
      f"/api/configuration/mappings/{draft['id']}/abandon",
      token=self.operations_token,
      step='Clone validate abandon mapping draft',
    )
    assert_equal(abandoned.get('status'), 'ABANDONED', 'Clone validate abandon mapping draft', 'draft status')
    changes = self.freightbridge.get('/api/configuration/changes?entityType=MAPPING_PROFILE&limit=25', token=self.operations_token, step='Clone validate abandon mapping draft')
    assert_truth(changes.get('count', 0) >= 1, 'Clone validate abandon mapping draft', 'Expected mapping change history.')
    return abandoned

  def create_runtime_transaction(self) -> None:
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
    dispatch_step = 'Dispatch Apex load to FreightBridge'
    self.recorder.run(
      dispatch_step,
      lambda: self.apex.post_empty(
        f'/v1/load-tenders/{self.load_id}/dispatch',
        token=self.config.apex_bearer_token,
        expected=(202,),
        step=dispatch_step,
        correlation_id=correlation_id(self.load_id, dispatch_step),
      ),
    )
    self.recorder.run('Verify transaction mapping audit', self._verify_transaction_mapping_audit)

  def _verify_transaction_mapping_audit(self) -> dict[str, Any]:
    body = self.freightbridge.get(
      f'/api/operations/transactions?businessIdentifier={self.load_id}&limit=25',
      token=self.operations_token,
      step='Verify transaction mapping audit',
    )
    transactions = body.get('transactions') or []
    assert_truth(bool(transactions), 'Verify transaction mapping audit', 'No operations transaction was found for the acceptance load.')
    inbound = next((item for item in transactions if item.get('documentType') == 'APEX_LOAD_TENDER'), transactions[0])
    assert_truth(bool(inbound.get('mappingKey')), 'Verify transaction mapping audit', 'Transaction missing mappingKey.')
    assert_truth(bool(inbound.get('mappingProfileId')), 'Verify transaction mapping audit', 'Transaction missing mappingProfileId.')
    assert_truth(bool(inbound.get('mappingProfileVersion')), 'Verify transaction mapping audit', 'Transaction missing mappingProfileVersion.')
    return inbound

  def exercise_console(self) -> None:
    self.recorder.run('Analyst UI configuration flow', self._run_browser_flow)

  def _run_browser_flow(self) -> dict[str, Any]:
    from playwright.sync_api import sync_playwright

    with sync_playwright() as playwright:
      browser = playwright.chromium.launch(headless=True)
      try:
        page = browser.new_page()
        page.goto(self.analyst_ui_base_url, wait_until='domcontentloaded')
        expect_text(page, 'FreightBridge Analyst Console')
        page.get_by_label('Operations bearer token').fill(self.operations_token)
        page.get_by_role('button', name='Unlock Console').click()
        expect_test_id(page, 'dashboard-page')

        page.get_by_role('link', name='Partners').click()
        expect_test_id(page, 'partners-page')
        expect_text(page, 'MWCX')
        page.get_by_role('link', name='MWCX').first.click()
        expect_test_id(page, 'partner-detail-page')
        expect_text(page, 'Capabilities')

        page.get_by_role('link', name='Mappings').click()
        expect_test_id(page, 'mappings-page')
        expect_text(page, 'CANONICAL_TO_MWCX_204')
        page.get_by_role('link', name='CANONICAL_TO_MWCX_204').first.click()
        expect_test_id(page, 'mapping-detail-page')
        expect_text(page, 'Settings')
        expect_text(page, 'Versions')

        page.get_by_role('link', name='Transactions').click()
        expect_test_id(page, 'transactions-page')
        page.get_by_label('Business ID').fill(self.load_id)
        page.get_by_role('button', name='Apply Filters').click()
        expect_text(page, self.load_id)

        return {'load_id': self.load_id}
      finally:
        browser.close()


def expect_text(page: Any, text: str) -> None:
  from playwright.sync_api import TimeoutError as PlaywrightTimeoutError

  try:
    page.get_by_text(text, exact=False).first.wait_for(timeout=15000)
  except PlaywrightTimeoutError as exc:
    raise AcceptanceFailure('Analyst UI configuration flow', f'Missing UI text: {text}') from exc


def expect_test_id(page: Any, test_id: str) -> None:
  from playwright.sync_api import TimeoutError as PlaywrightTimeoutError

  try:
    page.get_by_test_id(test_id).wait_for(timeout=15000)
  except PlaywrightTimeoutError as exc:
    raise AcceptanceFailure('Analyst UI configuration flow', f'Missing UI area: {test_id}') from exc


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(description='Run FreightBridge Milestone 17 deployed acceptance.')
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
    acceptance = Milestone17Acceptance(
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
