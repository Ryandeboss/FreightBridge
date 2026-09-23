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
  assert_equal,
  assert_truth,
  correlation_id,
  find_processed_file,
  generate_load_id,
  print_required_env,
  require_field,
)
from scripts.acceptance.milestone12 import apex_load_payload  # noqa: E402


class Milestone15Acceptance:
  def __init__(self, *, config: AcceptanceConfig, load_id: str, recorder: StepRecorder) -> None:
    if not config.operations_bearer_token:
      raise AcceptanceFailure('Load configuration', 'OPERATIONS_API_BEARER_TOKEN is required for Milestone 15.')
    self.config = config
    self.load_a = load_id
    self.load_b = generate_load_id()
    self.recorder = recorder
    self.apex = SafeHttpClient(name='Apex', base_url=config.apex_base_url, verbose=recorder.verbose)
    self.freightbridge = SafeHttpClient(name='FreightBridge', base_url=config.freightbridge_base_url, verbose=recorder.verbose)
    self.midwest = SafeHttpClient(name='Midwest', base_url=config.midwest_base_url, verbose=recorder.verbose)
    self.failed_duplicate_transaction_id: str | None = None
    self.dispatch_204: dict[str, Any] | None = None
    self.functional_ack_document_id: str | None = None

  def close(self) -> None:
    self.apex.close()
    self.freightbridge.close()
    self.midwest.close()

  def run(self) -> int:
    print('FreightBridge Milestone 15 Deployed Acceptance')
    print(f'Load A: {self.load_a}')
    print(f'Load B: {self.load_b}')
    print('')
    self.warm_up()
    self.apex_idempotency()
    self.no_key_duplicate_guard()
    self.dispatch_204_idempotency_and_conflict()
    self.midwest_997_replay()
    self.non_retryable_retry_guard()
    return self.recorder.finish()

  @property
  def operations_token(self) -> str:
    return self.config.operations_bearer_token or ''

  def warm_up(self) -> None:
    for name, client, path, token in (
      ('Apex health', self.apex, '/health', None),
      ('Apex readiness', self.apex, '/readiness', None),
      ('FreightBridge health', self.freightbridge, '/health', None),
      ('FreightBridge readiness', self.freightbridge, '/readiness', None),
      ('Midwest health', self.midwest, '/health', None),
      ('Midwest readiness', self.midwest, '/readiness', None),
      ('FreightBridge SFTP readiness', self.freightbridge, '/api/integrations/midwest/sftp/readiness', None),
      ('Midwest SFTP readiness', self.midwest, '/v1/sftp/readiness', self.config.midwest_readonly_token),
    ):
      self.recorder.run(name, lambda c=client, p=path, t=token, n=name: c.get(p, token=t, step=n))

  def create_apex_load(self, load_id: str) -> None:
    step = f'Apex load {load_id} created'
    self.recorder.run(
      step,
      lambda: self.apex.post_json(
        '/v1/load-tenders',
        apex_load_payload(load_id),
        token=self.config.apex_bearer_token,
        expected=(202,),
        step=step,
        correlation_id=correlation_id(load_id, step),
      ),
    )

  def apex_idempotency(self) -> None:
    self.create_apex_load(self.load_a)
    key = f'm15-apex-{self.load_a}'
    first_step = 'Apex keyed dispatch first'
    first = self.recorder.run(
      first_step,
      lambda: self.apex.post_empty(
        f'/v1/load-tenders/{self.load_a}/dispatch',
        token=self.config.apex_bearer_token,
        expected=(202,),
        step=first_step,
        correlation_id=correlation_id(self.load_a, first_step),
        extra_headers={'Idempotency-Key': key},
      ),
    )
    second_step = 'Apex keyed dispatch replay'
    second = self.recorder.run(
      second_step,
      lambda: self.apex.post_empty(
        f'/v1/load-tenders/{self.load_a}/dispatch',
        token=self.config.apex_bearer_token,
        expected=(202,),
        step=second_step,
        correlation_id=correlation_id(self.load_a, second_step),
        extra_headers={'Idempotency-Key': key},
      ),
    )
    if isinstance(first, dict) and isinstance(second, dict):
      fb_first = first.get('freightbridge') or {}
      fb_second = second.get('freightbridge') or {}
      assert_truth(fb_second.get('idempotentReplay') is True, second_step, 'Replay response was not marked idempotent.')
      assert_equal(fb_second.get('originalTransactionId'), fb_first.get('transactionId'), second_step, 'originalTransactionId')

  def no_key_duplicate_guard(self) -> None:
    self.create_apex_load(self.load_b)
    first_step = 'Apex no-key dispatch first'
    self.recorder.run(
      first_step,
      lambda: self.apex.post_empty(
        f'/v1/load-tenders/{self.load_b}/dispatch',
        token=self.config.apex_bearer_token,
        expected=(202,),
        step=first_step,
      ),
    )
    dup_step = 'Apex no-key duplicate dispatch'
    body = self.recorder.run(
      dup_step,
      lambda: self.apex.post_empty(
        f'/v1/load-tenders/{self.load_b}/dispatch',
        token=self.config.apex_bearer_token,
        expected=(409,),
        step=dup_step,
      ),
    )
    assert_truth(isinstance(body, dict), dup_step, 'Duplicate response was not JSON.')
    trace_step = 'Find no-key duplicate transaction'
    trace = self.recorder.run(
      trace_step,
      lambda: self.freightbridge.get(
        f'/api/operations/business/{self.load_b}/trace',
        token=self.operations_token,
        step=trace_step,
      ),
    )
    failed = [tx for tx in (trace or {}).get('transactions', []) if tx.get('processingStatus') == 'FAILED']
    assert_truth(bool(failed), trace_step, 'No failed duplicate transaction found.')
    self.failed_duplicate_transaction_id = failed[0]['id']

  def dispatch_204_idempotency_and_conflict(self) -> None:
    key = f'm15-204-{self.load_a}'
    first_step = '204 keyed SFTP dispatch first'
    first = self.recorder.run(
      first_step,
      lambda: self.freightbridge.post_empty(
        f'/api/integrations/midwest/load-tenders/{self.load_a}/dispatch-sftp',
        expected=(202,),
        step=first_step,
        extra_headers={'Idempotency-Key': key},
      ),
    )
    replay_step = '204 keyed SFTP dispatch replay'
    replay = self.recorder.run(
      replay_step,
      lambda: self.freightbridge.post_empty(
        f'/api/integrations/midwest/load-tenders/{self.load_a}/dispatch-sftp',
        expected=(202,),
        step=replay_step,
        extra_headers={'Idempotency-Key': key},
      ),
    )
    if isinstance(first, dict) and isinstance(replay, dict):
      assert_truth(replay.get('idempotentReplay') is True, replay_step, '204 replay was not marked idempotent.')
      assert_equal(replay.get('originalTransactionId'), first.get('transactionId'), replay_step, 'originalTransactionId')
      assert_equal(replay.get('fileName'), first.get('fileName'), replay_step, 'fileName')
      self.dispatch_204 = first
    conflict_step = '204 idempotency key conflict'
    self.recorder.run(
      conflict_step,
      lambda: self.freightbridge.post_empty(
        f'/api/integrations/midwest/load-tenders/{self.load_b}/dispatch-sftp',
        expected=(409,),
        step=conflict_step,
        extra_headers={'Idempotency-Key': key},
      ),
    )

  def midwest_997_replay(self) -> None:
    if not self.dispatch_204:
      raise AcceptanceFailure('997 replay setup', '204 dispatch result was not available.')
    file_name = str(require_field(self.dispatch_204, 'fileName', '997 replay setup'))
    poll_midwest = 'Midwest consumes 204'
    poll_body = self.recorder.run(
      poll_midwest,
      lambda: self.midwest.post_empty('/v1/sftp/inbound/poll', token=self.config.midwest_bearer_token, step=poll_midwest),
    )
    processed = find_processed_file(poll_body or {}, file_name=file_name, expected_status='ARCHIVED', step=poll_midwest)
    self.functional_ack_document_id = processed.get('functionalAcknowledgmentDocumentId')
    if not self.functional_ack_document_id:
      raise AcceptanceFailure(poll_midwest, 'Midwest did not generate a 997 document.', response_body=poll_body)
    for label in ('first', 'replay'):
      dispatch_step = f'Midwest dispatches 997 {label}'
      dispatch = self.recorder.run(
        dispatch_step,
        lambda: self.midwest.post_empty(
          f'/v1/functional-acknowledgments/{self.functional_ack_document_id}/dispatch-sftp',
          token=self.config.midwest_bearer_token,
          expected=(202,),
          step=dispatch_step,
        ),
      )
      poll_step = f'FreightBridge consumes 997 {label}'
      poll = self.recorder.run(
        poll_step,
        lambda: self.freightbridge.post_empty('/api/integrations/midwest/sftp/outbound/poll', expected=(202,), step=poll_step),
      )
      find_processed_file(poll or {}, file_name=str((dispatch or {}).get('fileName')), expected_status='ARCHIVED', step=poll_step)

  def non_retryable_retry_guard(self) -> None:
    if not self.failed_duplicate_transaction_id:
      raise AcceptanceFailure('Non-retryable retry guard', 'Duplicate failed transaction id was not captured.')
    step = 'Non-retryable retry guard'
    self.recorder.run(
      step,
      lambda: self.freightbridge.post_json(
        f'/api/operations/transactions/{self.failed_duplicate_transaction_id}/retry',
        {'note': 'Milestone 15 non-retryable guard verification.'},
        token=self.operations_token,
        expected=(409,),
        step=step,
      ),
    )


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(description='Run FreightBridge Milestone 15 deployed acceptance.')
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
    acceptance = Milestone15Acceptance(config=config, load_id=args.load_id or generate_load_id(), recorder=recorder)
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
