from __future__ import annotations

import argparse
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
  assert_archive_path,
  assert_equal,
  assert_truth,
  correlation_id,
  find_processed_file,
  generate_load_id,
  print_required_env,
)
from scripts.acceptance.milestone12 import apex_load_payload  # noqa: E402


class Milestone14Acceptance:
  def __init__(self, *, config: AcceptanceConfig, load_id: str, recorder: StepRecorder) -> None:
    if not config.operations_bearer_token:
      raise AcceptanceFailure(
        'Load configuration',
        'OPERATIONS_API_BEARER_TOKEN is required for Milestone 14.',
      )
    self.config = config
    self.load_id = load_id
    self.recorder = recorder
    self.apex = SafeHttpClient(name='Apex', base_url=config.apex_base_url, verbose=recorder.verbose)
    self.freightbridge = SafeHttpClient(
      name='FreightBridge',
      base_url=config.freightbridge_base_url,
      verbose=recorder.verbose,
    )
    self.midwest = SafeHttpClient(name='Midwest', base_url=config.midwest_base_url, verbose=recorder.verbose)
    self.success_transaction_id: str | None = None
    self.failed_transaction_id: str | None = None
    self.duplicate_error_id: str | None = None

  def close(self) -> None:
    self.apex.close()
    self.freightbridge.close()
    self.midwest.close()

  @property
  def operations_token(self) -> str:
    return self.config.operations_bearer_token or ''

  def run(self) -> int:
    print('FreightBridge Milestone 14 Deployed Acceptance')
    print(f'Load: {self.load_id}')
    print('')

    self.warm_up()
    self.create_apex_load()
    self.dispatch_apex_to_freightbridge()
    self.dispatch_duplicate_apex_to_freightbridge()
    self.verify_transaction_search()
    self.verify_failed_transaction_detail()
    self.verify_error_queue()
    self.resolve_duplicate_error()
    self.verify_failed_transaction_still_failed()
    self.verify_error_queue_resolution()
    dispatch_204 = self.dispatch_204_to_midwest_sftp()
    file_204 = str(dispatch_204['fileName'])
    self.poll_midwest_inbound(file_204)
    self.verify_business_trace_has_outbound_204()
    self.verify_summary()
    return self.recorder.finish()

  def warm_up(self) -> None:
    self.recorder.run('Apex health', lambda: self.apex.get('/health', step='Apex health'))
    self.recorder.run('Apex readiness', lambda: self.apex.get('/readiness', step='Apex readiness'))
    self.recorder.run('FreightBridge health', lambda: self.freightbridge.get('/health', step='FreightBridge health'))
    self.recorder.run('FreightBridge readiness', lambda: self.freightbridge.get('/readiness', step='FreightBridge readiness'))
    self.recorder.run('Midwest health', lambda: self.midwest.get('/health', step='Midwest health'))
    self.recorder.run('Midwest readiness', lambda: self.midwest.get('/readiness', step='Midwest readiness'))
    self.recorder.run(
      'FreightBridge SFTP readiness',
      lambda: self.freightbridge.get('/api/integrations/midwest/sftp/readiness', step='FreightBridge SFTP readiness'),
    )
    self.recorder.run(
      'Midwest SFTP readiness',
      lambda: self.midwest.get('/v1/sftp/readiness', token=self.config.midwest_readonly_token, step='Midwest SFTP readiness'),
    )

  def create_apex_load(self) -> None:
    step = 'Apex load created'

    def action() -> dict[str, Any]:
      body = self.apex.post_json(
        '/v1/load-tenders',
        apex_load_payload(self.load_id),
        token=self.config.apex_bearer_token,
        expected=(202,),
        step=step,
        correlation_id=correlation_id(self.load_id, step),
      )
      assert_equal(body.get('loadId'), self.load_id, step, 'loadId')
      return body

    self.recorder.run(step, action)

  def dispatch_apex_to_freightbridge(self) -> None:
    step = 'Apex -> FreightBridge success'

    def action() -> dict[str, Any]:
      body = self.apex.post_empty(
        f'/v1/load-tenders/{self.load_id}/dispatch',
        token=self.config.apex_bearer_token,
        expected=(202,),
        step=step,
        correlation_id=correlation_id(self.load_id, step),
      )
      assert_equal(body.get('status'), 'DISPATCHED', step, 'dispatch status')
      freightbridge = body.get('freightbridge')
      if isinstance(freightbridge, dict) and isinstance(freightbridge.get('transactionId'), str):
        self.success_transaction_id = freightbridge['transactionId']
      return body

    self.recorder.run(step, action)

  def dispatch_duplicate_apex_to_freightbridge(self) -> None:
    step = 'Apex duplicate -> FreightBridge expected 409'

    def action() -> dict[str, Any]:
      body = self.apex.post_empty(
        f'/v1/load-tenders/{self.load_id}/dispatch',
        token=self.config.apex_bearer_token,
        expected=(409,),
        step=step,
        correlation_id=correlation_id(self.load_id, step),
      )
      error = body.get('error')
      assert_truth(isinstance(error, dict), step, 'Expected duplicate error envelope.')
      assert_equal(error.get('code'), 'DUPLICATE_LOAD', step, 'Apex duplicate code')
      return body

    self.recorder.run(step, action)

  def verify_transaction_search(self) -> None:
    step = 'Operations transaction search'

    def action() -> dict[str, Any]:
      body = self.freightbridge.get(
        f'/api/operations/transactions?businessIdentifier={self.load_id}',
        token=self.operations_token,
        step=step,
      )
      transactions = body.get('transactions')
      assert_truth(isinstance(transactions, list), step, 'Transactions response must include a list.')
      successes = [
        item for item in transactions
        if item.get('documentType') == 'APEX_LOAD_TENDER'
        and item.get('processingStatus') == 'SUCCEEDED'
        and item.get('processingStage') == 'COMPLETED'
      ]
      failures = [
        item for item in transactions
        if item.get('documentType') == 'APEX_LOAD_TENDER'
        and item.get('processingStatus') == 'FAILED'
        and item.get('processingStage') == 'BUSINESS_VALIDATION'
      ]
      assert_truth(len(successes) >= 1, step, 'Expected a successful APEX_LOAD_TENDER transaction.')
      assert_truth(len(failures) >= 1, step, 'Expected a failed duplicate APEX_LOAD_TENDER transaction.')
      self.success_transaction_id = self.success_transaction_id or str(successes[0]['id'])
      self.failed_transaction_id = str(failures[0]['id'])
      return body

    self.recorder.run(step, action)

  def verify_failed_transaction_detail(self) -> None:
    step = 'Operations failed transaction detail'

    def action() -> dict[str, Any]:
      body = self.freightbridge.get(
        f'/api/operations/transactions/{self.failed_transaction_id}',
        token=self.operations_token,
        step=step,
      )
      transaction = body.get('transaction')
      assert_truth(isinstance(transaction, dict), step, 'Transaction detail missing.')
      assert_equal(transaction.get('processingStatus'), 'FAILED', step, 'processingStatus')
      assert_equal(transaction.get('processingStage'), 'BUSINESS_VALIDATION', step, 'processingStage')
      errors = body.get('errors')
      logs = body.get('logs')
      assert_truth(isinstance(errors, list) and errors, step, 'Expected transaction errors.')
      assert_truth(isinstance(logs, list) and any(log.get('status') == 'FAILED' for log in logs if isinstance(log, dict)), step, 'Expected failure log.')
      error = errors[0]
      assert_equal(error.get('category'), 'DUPLICATE_TRANSACTION', step, 'category')
      assert_equal(error.get('errorCode'), 'DUPLICATE_SHIPMENT', step, 'errorCode')
      assert_equal(error.get('retryable'), False, step, 'retryable')
      assert_equal(error.get('resolved'), False, step, 'resolved')
      self.duplicate_error_id = str(error['errorId'])
      return body

    self.recorder.run(step, action)

  def verify_error_queue(self) -> None:
    step = 'Operations unresolved error queue'

    def action() -> dict[str, Any]:
      body = self.freightbridge.get(
        f'/api/operations/errors?businessIdentifier={self.load_id}',
        token=self.operations_token,
        step=step,
      )
      errors = body.get('errors')
      assert_truth(isinstance(errors, list), step, 'Error queue response must include errors.')
      assert_truth(any(error.get('errorId') == self.duplicate_error_id for error in errors if isinstance(error, dict)), step, 'Duplicate error missing from unresolved queue.')
      return body

    self.recorder.run(step, action)

  def resolve_duplicate_error(self) -> None:
    step = 'Operations resolve duplicate error'

    def action() -> dict[str, Any]:
      body = self.freightbridge.post_json(
        f'/api/operations/errors/{self.duplicate_error_id}/resolve',
        {'note': 'Resolved by automated Milestone 14 deployed acceptance.'},
        token=self.operations_token,
        expected=(200,),
        step=step,
      )
      error = body.get('error')
      assert_truth(isinstance(error, dict), step, 'Resolve response missing error.')
      assert_equal(error.get('resolved'), True, step, 'resolved')
      assert_truth(isinstance(error.get('resolvedAt'), str), step, 'resolvedAt missing')
      assert_equal(error.get('resolutionNote'), 'Resolved by automated Milestone 14 deployed acceptance.', step, 'resolutionNote')
      return body

    self.recorder.run(step, action)

  def verify_failed_transaction_still_failed(self) -> None:
    step = 'Resolved error leaves transaction FAILED'

    def action() -> dict[str, Any]:
      body = self.freightbridge.get(
        f'/api/operations/transactions/{self.failed_transaction_id}',
        token=self.operations_token,
        step=step,
      )
      assert_equal(body.get('transaction', {}).get('processingStatus'), 'FAILED', step, 'processingStatus')
      return body

    self.recorder.run(step, action)

  def verify_error_queue_resolution(self) -> None:
    unresolved_step = 'Resolved error absent from unresolved queue'

    def unresolved_action() -> dict[str, Any]:
      body = self.freightbridge.get(
        f'/api/operations/errors?businessIdentifier={self.load_id}',
        token=self.operations_token,
        step=unresolved_step,
      )
      errors = body.get('errors')
      assert_truth(isinstance(errors, list), unresolved_step, 'Error queue response must include errors.')
      assert_truth(all(error.get('errorId') != self.duplicate_error_id for error in errors if isinstance(error, dict)), unresolved_step, 'Resolved error still appeared in unresolved queue.')
      return body

    self.recorder.run(unresolved_step, unresolved_action)

    resolved_step = 'Resolved error present in resolved queue'

    def resolved_action() -> dict[str, Any]:
      body = self.freightbridge.get(
        f'/api/operations/errors?businessIdentifier={self.load_id}&resolved=true',
        token=self.operations_token,
        step=resolved_step,
      )
      errors = body.get('errors')
      assert_truth(isinstance(errors, list), resolved_step, 'Resolved queue response must include errors.')
      assert_truth(any(error.get('errorId') == self.duplicate_error_id for error in errors if isinstance(error, dict)), resolved_step, 'Resolved error missing from resolved queue.')
      return body

    self.recorder.run(resolved_step, resolved_action)

  def dispatch_204_to_midwest_sftp(self) -> dict[str, Any]:
    step = '204 delivered over SFTP'

    def action() -> dict[str, Any]:
      body = self.freightbridge.post_empty(
        f'/api/integrations/midwest/load-tenders/{self.load_id}/dispatch-sftp',
        expected=(202,),
        step=step,
        correlation_id=correlation_id(self.load_id, step),
      )
      assert_equal(body.get('documentType'), '204', step, 'documentType')
      assert_equal(body.get('transport'), 'SFTP', step, 'transport')
      return body

    return self.recorder.run(step, action, detail=lambda result: str(result.get('fileName'))) or {}

  def poll_midwest_inbound(self, file_name: str) -> None:
    step = 'Midwest consumed observability 204'

    def action() -> dict[str, Any]:
      body = self.midwest.post_empty(
        '/v1/sftp/inbound/poll',
        token=self.config.midwest_bearer_token,
        expected=(202,),
        step=step,
        correlation_id=correlation_id(self.load_id, step),
      )
      item = find_processed_file(body, file_name=file_name, expected_status='ARCHIVED', step=step)
      assert_archive_path(item, step)
      return body

    self.recorder.run(step, action)

  def verify_business_trace_has_outbound_204(self) -> None:
    step = 'Operations business trace includes outbound 204'

    def action() -> dict[str, Any]:
      body = self.freightbridge.get(
        f'/api/operations/business/{self.load_id}/trace',
        token=self.operations_token,
        step=step,
      )
      transactions = body.get('transactions')
      assert_truth(isinstance(transactions, list), step, 'Trace must include transactions.')
      assert_truth(
        any(
          item.get('direction') == 'OUTBOUND'
          and item.get('transport') == 'SFTP'
          and item.get('messageFormat') == 'X12'
          and item.get('documentType') == '204'
          and item.get('processingStatus') == 'SUCCEEDED'
          for item in transactions
          if isinstance(item, dict)
        ),
        step,
        'Trace did not include successful outbound SFTP 204.',
      )
      return body

    self.recorder.run(step, action)

  def verify_summary(self) -> None:
    step = 'Operations summary'

    def action() -> dict[str, Any]:
      body = self.freightbridge.get(
        '/api/operations/summary',
        token=self.operations_token,
        step=step,
      )
      for field in (
        'transactionsTotal',
        'transactionsSucceeded',
        'transactionsFailed',
        'unresolvedErrors',
        'retryableUnresolvedErrors',
        'byErrorCategory',
        'byDocumentType',
      ):
        assert_truth(field in body, step, f'Missing summary field {field}.')
      return body

    self.recorder.run(step, action)


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(description='Run deployed FreightBridge Milestone 14 acceptance.')
  parser.add_argument('--load-id', help='Load ID to use. Defaults to a unique LOAD-prefixed ID.')
  parser.add_argument('--verbose', action='store_true', help='Print safe request progress.')
  parser.add_argument('--keep-going', action='store_true', help='Continue after failures and summarize at the end.')
  parser.add_argument('--print-env', action='store_true', help='Print required variable names and exit.')
  return parser.parse_args()


def main() -> int:
  args = parse_args()
  if args.print_env:
    print_required_env()
    print('Milestone 14 also requires:')
    print('  OPERATIONS_API_BEARER_TOKEN')
    return 0

  recorder = StepRecorder(keep_going=args.keep_going, verbose=args.verbose)
  try:
    config = AcceptanceConfig.from_env()
    app = Milestone14Acceptance(
      config=config,
      load_id=args.load_id or generate_load_id(),
      recorder=recorder,
    )
  except AcceptanceFailure as exc:
    recorder.fail_step(exc)
    return recorder.finish()

  try:
    return app.run()
  finally:
    app.close()


if __name__ == '__main__':
  raise SystemExit(main())
