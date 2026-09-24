from __future__ import annotations

import argparse
import os
from pathlib import Path
import re
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
  require_field,
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
    self.recorder.run('List active mappings', self._list_active_mappings)

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

  def _list_active_mappings(self) -> dict[str, Any]:
    body = self.freightbridge.get('/api/configuration/mappings?status=ACTIVE&limit=100', token=self.operations_token, step='List active mappings')
    keys = {item.get('mappingKey') for item in body.get('mappings', [])}
    missing = REQUIRED_MAPPING_KEYS - keys
    assert_truth(not missing, 'List active mappings', f'Missing active mapping keys: {sorted(missing)}')
    return body

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
    self.recorder.run('Dispatch Midwest 204 over SFTP', self._dispatch_204_to_midwest_sftp)
    self.recorder.run('Verify transaction mapping audit', self._verify_transaction_mapping_audit)

  def _dispatch_204_to_midwest_sftp(self) -> dict[str, Any]:
    step = 'Dispatch Midwest 204 over SFTP'
    body = self.freightbridge.post_empty(
      f'/api/integrations/midwest/load-tenders/{self.load_id}/dispatch-sftp',
      expected=(202,),
      step=step,
      correlation_id=correlation_id(self.load_id, step),
    )
    assert_equal(body.get('documentType'), '204', step, 'documentType')
    assert_equal(body.get('transport'), 'SFTP', step, 'transport')
    require_field(body, 'fileName', step)
    return body

  def _verify_transaction_mapping_audit(self) -> dict[str, Any]:
    body = self.freightbridge.get(
      f'/api/operations/transactions?businessIdentifier={self.load_id}&limit=25',
      token=self.operations_token,
      step='Verify transaction mapping audit',
    )
    transactions = body.get('transactions') or []
    assert_truth(bool(transactions), 'Verify transaction mapping audit', 'No operations transaction was found for the acceptance load.')
    inbound = next((item for item in transactions if item.get('documentType') == 'APEX_LOAD_TENDER'), None)
    outbound_204 = next((item for item in transactions if item.get('documentType') == '204' and item.get('direction') == 'OUTBOUND'), None)
    assert_truth(isinstance(inbound, dict), 'Verify transaction mapping audit', 'APEX_LOAD_TENDER transaction was not found.')
    assert_truth(isinstance(outbound_204, dict), 'Verify transaction mapping audit', 'Outbound 204 transaction was not found.')
    self._assert_transaction_mapping(inbound, 'APEX_LOAD_TO_CANONICAL', 'Verify transaction mapping audit')
    self._assert_transaction_mapping(outbound_204, 'CANONICAL_TO_MWCX_204', 'Verify transaction mapping audit')
    return {'apex': inbound, 'outbound204': outbound_204}

  def _assert_transaction_mapping(self, transaction: dict[str, Any], expected_key: str, step: str) -> None:
    assert_equal(transaction.get('mappingKey'), expected_key, step, f'{expected_key} mappingKey')
    assert_truth(bool(transaction.get('mappingProfileId')), step, f'{expected_key} mappingProfileId missing.')
    assert_truth(bool(transaction.get('mappingProfileVersion')), step, f'{expected_key} mappingProfileVersion missing.')

  def exercise_console(self) -> None:
    self.recorder.run('Analyst UI configuration flow', self._run_browser_flow)

  def _run_browser_flow(self) -> dict[str, Any]:
    from playwright.sync_api import sync_playwright

    original_partner = self._read_partner('MWCX')
    original_support_contact = original_partner.get('supportContact')
    unique_support_contact = f'milestone17-{self.load_id.lower()}@example.com'
    partner_mutated = False

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
        expect_text(page, 'APEX')
        expect_text(page, 'MWCX')
        page.get_by_role('link', name='MWCX').first.click()
        expect_test_id(page, 'partner-detail-page')
        expect_text(page, 'MOTOR_CARRIER')
        expect_text(page, 'X12_SFTP')
        expect_text(page, 'Capabilities')
        for document_type in ('204', '997', '990', '214'):
          expect_text(page, document_type)
        for credential_label in (
          r'bearer token configuration',
          r'ssh private key',
          r'database url',
          r'supabase secret',
          r'sftp password',
        ):
          expect_no_label(page, credential_label)

        page.get_by_label('Support Contact').fill(unique_support_contact)
        page.get_by_role('button', name='Save').click()
        expect_text(page, 'Partner saved.')
        partner_mutated = True
        verified_partner = self._read_partner('MWCX')
        assert_equal(
          verified_partner.get('supportContact'),
          unique_support_contact,
          'Analyst UI configuration flow',
          'MWCX supportContact',
        )
        expect_text(page, 'UPDATE')

        page.get_by_role('link', name='Mappings').click()
        expect_test_id(page, 'mappings-page')
        page.get_by_label('Mapping Key').fill('CANONICAL_TO_MWCX_204')
        page.get_by_label('Partner').fill('MWCX')
        page.get_by_role('button', name='Apply Filters').click()
        expect_text(page, 'CANONICAL_TO_MWCX_204')
        page.get_by_role('link', name='CANONICAL_TO_MWCX_204').first.click()
        expect_test_id(page, 'mapping-detail-page')
        expect_text(page, 'Profile Configuration')
        expect_text(page, 'senderId')
        expect_no_text(page, 'Profile Settings JSON')
        expect_no_text(page, 'Rule Configuration JSON')
        expect_text(page, 'Versions')
        page.get_by_role('button', name='Create Draft').click()
        page.get_by_role('button', name='Save Draft').wait_for(timeout=15000)
        draft_id = page.url.split('/mappings/')[-1].split('?')[0].split('#')[-1]
        assert_truth(bool(draft_id), 'Analyst UI configuration flow', 'Draft ID could not be captured from browser URL.')
        page.get_by_label('Change Note').fill(f'Milestone 17 acceptance {self.load_id}')
        page.get_by_label('Description').fill(f'Milestone 17 acceptance {self.load_id}')
        page.get_by_label('Notes').first.fill(f'Milestone 17 acceptance {self.load_id}')
        page.get_by_role('button', name='Save Draft').click()
        expect_text(page, 'Draft saved.')
        page.get_by_role('button', name='Validate Draft').click()
        activate_button = page.get_by_role('button', name='Activate Mapping')
        expect_enabled(activate_button)
        page.get_by_role('button', name='Abandon Draft').click()
        expect_text(page, 'Abandoning this draft preserves it in configuration history but prevents activation.')
        page.get_by_role('button', name='Abandon Draft').last.click()
        expect_text(page, 'ABANDONED')
        for action in ('CREATE_DRAFT', 'VALIDATE', 'ABANDON'):
          expect_text(page, action)

        page.get_by_role('link', name='Transactions').click()
        expect_test_id(page, 'transactions-page')
        page.get_by_label('Business ID').fill(self.load_id)
        page.get_by_role('button', name='Apply Filters').click()
        expect_text(page, self.load_id)
        apex_row = page.locator('tr').filter(has_text='APEX_LOAD_TENDER').first
        apex_row.get_by_role('link').first.click()
        expect_test_id(page, 'transaction-detail-page')
        expect_text(page, 'Mapping')
        expect_text(page, 'Mapping Version')
        expect_text(page, 'APEX_LOAD_TO_CANONICAL')
        page.get_by_role('link', name=re.compile(r'[0-9a-f]{8}', re.IGNORECASE)).first.click()
        expect_test_id(page, 'mapping-detail-page')
        expect_text(page, 'APEX_LOAD_TO_CANONICAL')

        page.get_by_role('link', name='Transactions').click()
        expect_test_id(page, 'transactions-page')
        page.get_by_label('Business ID').fill(self.load_id)
        page.get_by_role('button', name='Apply Filters').click()
        expect_text(page, '204')
        outbound_row = page.locator('tr').filter(has_text='204').filter(has_text='SFTP').first
        outbound_row.get_by_role('link').first.click()
        expect_test_id(page, 'transaction-detail-page')
        expect_text(page, 'CANONICAL_TO_MWCX_204')
        expect_text(page, 'Mapping Version')
        page.get_by_role('link', name=re.compile(r'[0-9a-f]{8}', re.IGNORECASE)).first.click()
        expect_test_id(page, 'mapping-detail-page')
        expect_text(page, 'CANONICAL_TO_MWCX_204')

        return {'load_id': self.load_id, 'draft_id': draft_id}
      finally:
        if partner_mutated:
          try:
            self.freightbridge.patch_json(
              '/api/configuration/partners/MWCX',
              {
                'name': original_partner.get('name'),
                'description': original_partner.get('description'),
                'supportContact': original_support_contact,
                'active': original_partner.get('active'),
              },
              token=self.operations_token,
              step='Restore Midwest partner metadata',
            )
          except Exception:
            pass
        browser.close()


def expect_text(page: Any, text: str) -> None:
  from playwright.sync_api import TimeoutError as PlaywrightTimeoutError

  try:
    page.get_by_text(text, exact=False).first.wait_for(timeout=15000)
  except PlaywrightTimeoutError as exc:
    raise AcceptanceFailure('Analyst UI configuration flow', f'Missing UI text: {text}') from exc


def expect_no_text(page: Any, text: str) -> None:
  if page.get_by_text(text, exact=False).count() > 0:
    raise AcceptanceFailure('Analyst UI configuration flow', f'Unexpected UI text: {text}')


def expect_no_label(page: Any, label_pattern: str) -> None:
  if page.get_by_label(re.compile(label_pattern, re.IGNORECASE)).count() > 0:
    raise AcceptanceFailure('Analyst UI configuration flow', f'Unexpected credential editor label: {label_pattern}')


def expect_enabled(locator: Any) -> None:
  from playwright.sync_api import TimeoutError as PlaywrightTimeoutError, expect

  try:
    expect(locator).to_be_enabled(timeout=15000)
  except PlaywrightTimeoutError as exc:
    raise AcceptanceFailure('Analyst UI configuration flow', 'Expected control to be enabled.') from exc


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
