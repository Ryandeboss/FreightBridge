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


class Milestone13Acceptance:
  def __init__(self, *, config: AcceptanceConfig, load_id: str, recorder: StepRecorder, skip_db: bool) -> None:
    self.config = config
    self.load_id = load_id
    self.recorder = recorder
    self.skip_db = skip_db
    self.apex = SafeHttpClient(name='Apex', base_url=config.apex_base_url, verbose=recorder.verbose)
    self.freightbridge = SafeHttpClient(
      name='FreightBridge',
      base_url=config.freightbridge_base_url,
      verbose=recorder.verbose,
    )
    self.midwest = SafeHttpClient(name='Midwest', base_url=config.midwest_base_url, verbose=recorder.verbose)

  def close(self) -> None:
    self.apex.close()
    self.freightbridge.close()
    self.midwest.close()

  def run(self) -> int:
    print('FreightBridge Milestone 13 Deployed Acceptance')
    print(f'Load: {self.load_id}')
    print('')

    self.warm_up()
    self.create_apex_load()
    self.dispatch_apex_to_freightbridge()
    dispatch_204 = self.dispatch_204_to_midwest_sftp()
    file_204 = str(dispatch_204['fileName'])
    self.poll_midwest_inbound(file_204)
    self.verify_midwest_pending_load()
    ack = self.verify_midwest_generated_997()
    dispatch_997 = self.dispatch_997_to_sftp(str(ack['outboundDocumentId']))
    file_997 = str(dispatch_997['fileName'])
    self.poll_freightbridge_outbound(file_997, '997')
    self.verify_freightbridge_acknowledgment()
    self.verify_midwest_pending_load('Midwest tender remains PENDING after 997')
    self.verify_apex_pending_tender()
    if not self.skip_db and self.config.database_url:
      self.verify_database_before_990()
    elif self.skip_db:
      self.recorder.skip_step('DB pre-990 verification', '--skip-db was provided')
    else:
      self.recorder.skip_step('DB pre-990 verification', 'DATABASE_URL not provided')

    tender = self.accept_tender()
    dispatch_990 = self.dispatch_990_to_sftp()
    self.poll_freightbridge_outbound(str(dispatch_990['fileName']), '990')
    self.verify_apex_tender_accepted(tender.get('carrierLoadNumber'))
    if not self.skip_db and self.config.database_url:
      self.verify_database_after_990()
    elif self.skip_db:
      self.recorder.skip_step('DB post-990 verification', '--skip-db was provided')
    else:
      self.recorder.skip_step('DB post-990 verification', 'DATABASE_URL not provided')

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
    step = 'Apex -> FreightBridge'

    def action() -> dict[str, Any]:
      body = self.apex.post_empty(
        f'/v1/load-tenders/{self.load_id}/dispatch',
        token=self.config.apex_bearer_token,
        expected=(202,),
        step=step,
        correlation_id=correlation_id(self.load_id, step),
      )
      assert_equal(body.get('status'), 'DISPATCHED', step, 'dispatch status')
      return body

    self.recorder.run(step, action)

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
    step = 'Midwest consumed 204 and generated 997'

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
      assert_equal(item.get('functionalAcknowledgmentStatus'), 'ACCEPTED', step, 'functionalAcknowledgmentStatus')
      return body

    self.recorder.run(step, action)

  def verify_midwest_pending_load(self, step: str = 'Midwest load readback PENDING') -> None:
    def action() -> dict[str, Any]:
      body = self.midwest.get(
        f'/v1/loads/{self.load_id}',
        token=self.config.midwest_readonly_token,
        step=step,
      )
      assert_equal(body.get('tenderStatus'), 'PENDING', step, 'tenderStatus')
      return body

    self.recorder.run(step, action)

  def verify_midwest_generated_997(self) -> dict[str, Any]:
    step = 'Midwest generated 997 A/A'

    def action() -> dict[str, Any]:
      body = self.midwest.get(
        f'/v1/loads/{self.load_id}/functional-acknowledgments',
        token=self.config.midwest_readonly_token,
        step=step,
      )
      acknowledgments = body.get('functionalAcknowledgments')
      assert_truth(isinstance(acknowledgments, list) and len(acknowledgments) == 1, step, 'Expected exactly one 997.')
      ack = acknowledgments[0]
      assert_equal(ack.get('documentType'), '997', step, 'documentType')
      assert_equal(ack.get('acknowledgmentStatus'), 'ACCEPTED', step, 'acknowledgmentStatus')
      assert_equal(ack.get('transactionAckCode'), 'A', step, 'transactionAckCode')
      assert_equal(ack.get('groupAckCode'), 'A', step, 'groupAckCode')
      assert_equal(ack.get('processingStatus'), 'GENERATED', step, 'processingStatus')
      return ack

    return self.recorder.run(step, action, detail=lambda result: str(result.get('outboundDocumentId'))) or {}

  def dispatch_997_to_sftp(self, outbound_document_id: str) -> dict[str, Any]:
    step = '997 delivered over SFTP'

    def action() -> dict[str, Any]:
      body = self.midwest.post_empty(
        f'/v1/functional-acknowledgments/{outbound_document_id}/dispatch-sftp',
        token=self.config.midwest_bearer_token,
        expected=(202,),
        step=step,
        correlation_id=correlation_id(self.load_id, step),
      )
      assert_equal(body.get('documentType'), '997', step, 'documentType')
      assert_equal(body.get('transport'), 'SFTP', step, 'transport')
      assert_truth(str(body.get('fileName', '')).startswith('MWCX_APEX_997_'), step, '997 filename prefix mismatch')
      return body

    return self.recorder.run(step, action, detail=lambda result: str(result.get('fileName'))) or {}

  def poll_freightbridge_outbound(self, file_name: str, document_type: str) -> None:
    step = f'FreightBridge consumed {document_type}'

    def action() -> dict[str, Any]:
      body = self.freightbridge.post_empty(
        '/api/integrations/midwest/sftp/outbound/poll',
        expected=(202,),
        step=step,
        correlation_id=correlation_id(self.load_id, step),
      )
      item = find_processed_file(body, file_name=file_name, expected_status='ARCHIVED', step=step)
      assert_archive_path(item, step)
      return body

    self.recorder.run(step, action)

  def verify_freightbridge_acknowledgment(self) -> None:
    step = 'FreightBridge 997 acknowledgment readback'

    def action() -> dict[str, Any]:
      body = self.freightbridge.get(
        f'/api/integrations/midwest/load-tenders/{self.load_id}/functional-acknowledgment',
        step=step,
      )
      assert_equal(body.get('status'), 'ACCEPTED', step, 'status')
      assert_equal(body.get('acknowledgedDocumentType'), '204', step, 'acknowledgedDocumentType')
      assert_equal(body.get('transactionAckCode'), 'A', step, 'transactionAckCode')
      assert_equal(body.get('groupAckCode'), 'A', step, 'groupAckCode')
      return body

    self.recorder.run(step, action)

  def verify_apex_pending_tender(self) -> None:
    step = 'Apex tender remains pending after 997'

    def action() -> dict[str, Any]:
      body = self.apex.get(
        f'/v1/loads/{self.load_id}/tender-status',
        token=self.config.apex_readonly_token,
        step=step,
      )
      assert_truth(body.get('currentTenderDecision') is None, step, 'Apex tender decision should still be null before 990.')
      assert_truth(body.get('latestResponse') is None, step, 'Apex latest tender response should still be null before 990.')
      return body

    self.recorder.run(step, action)

  def accept_tender(self) -> dict[str, Any]:
    step = 'Tender accepted'

    def action() -> dict[str, Any]:
      body = self.midwest.post_json(
        f'/v1/loads/{self.load_id}/tender-decisions',
        {'decision': 'ACCEPTED', 'message': 'Accepted after technical 997 acknowledgment.'},
        token=self.config.midwest_bearer_token,
        expected=(200,),
        step=step,
        correlation_id=correlation_id(self.load_id, step),
      )
      assert_equal(body.get('decision'), 'ACCEPTED', step, 'decision')
      return body

    return self.recorder.run(step, action, detail=lambda result: str(result.get('carrierLoadNumber'))) or {}

  def dispatch_990_to_sftp(self) -> dict[str, Any]:
    step = '990 delivered over SFTP'

    def action() -> dict[str, Any]:
      body = self.midwest.post_empty(
        f'/v1/loads/{self.load_id}/tender-response/dispatch-sftp',
        token=self.config.midwest_bearer_token,
        expected=(202,),
        step=step,
        correlation_id=correlation_id(self.load_id, step),
      )
      assert_equal(body.get('documentType'), '990', step, 'documentType')
      assert_equal(body.get('transport'), 'SFTP', step, 'transport')
      return body

    return self.recorder.run(step, action, detail=lambda result: str(result.get('fileName'))) or {}

  def verify_apex_tender_accepted(self, carrier_load_number: object) -> None:
    step = 'Apex received tender acceptance after 990'

    def action() -> dict[str, Any]:
      body = self.apex.get(
        f'/v1/loads/{self.load_id}/tender-status',
        token=self.config.apex_readonly_token,
        step=step,
      )
      assert_equal(body.get('currentTenderDecision'), 'ACCEPTED', step, 'currentTenderDecision')
      latest = body.get('latestResponse')
      if isinstance(latest, dict) and carrier_load_number:
        assert_equal(latest.get('carrierLoadNumber'), carrier_load_number, step, 'carrierLoadNumber')
      return body

    self.recorder.run(step, action)

  def verify_database_before_990(self) -> None:
    self.recorder.run('DB pre-990 verification', lambda: run_database_pre_990(self.config.database_url or '', self.load_id))

  def verify_database_after_990(self) -> None:
    self.recorder.run('DB post-990 verification', lambda: run_database_post_990(self.config.database_url or '', self.load_id))


def run_database_pre_990(database_url: str, load_id: str) -> None:
  import psycopg
  from psycopg.rows import dict_row

  with psycopg.connect(database_url, row_factory=dict_row) as connection:
    with connection.cursor() as cursor:
      cursor.execute("select id, tender_status from shipments where shipment_number = %s", (load_id,))
      shipment = cursor.fetchone()
      if shipment is None:
        raise AcceptanceFailure('DB pre-990 verification', 'Canonical shipment was not found.')
      assert_equal(shipment['tender_status'], 'PENDING', 'DB pre-990 verification', 'tender_status before 990')
      cursor.execute(
        """
        select id from integration_transactions
        where business_identifier = %s
          and direction = 'OUTBOUND'
          and transport = 'SFTP'
          and document_type = '204'
        """,
        (load_id,),
      )
      outbound_204 = cursor.fetchone()
      if outbound_204 is None:
        raise AcceptanceFailure('DB pre-990 verification', 'Outbound 204 transaction was not found.')
      cursor.execute(
        """
        select it.id, it.parent_transaction_id, fa.transaction_ack_code, fa.group_ack_code
        from integration_transactions it
        join functional_acknowledgments fa on fa.ack_transaction_id = it.id
        where it.business_identifier = %s
          and it.direction = 'INBOUND'
          and it.transport = 'SFTP'
          and it.document_type = '997'
        """,
        (load_id,),
      )
      ack = cursor.fetchone()
      if ack is None:
        raise AcceptanceFailure('DB pre-990 verification', 'Inbound 997 acknowledgment was not found.')
      assert_equal(ack['parent_transaction_id'], outbound_204['id'], 'DB pre-990 verification', '997 parent transaction')
      assert_equal(ack['transaction_ack_code'], 'A', 'DB pre-990 verification', 'transaction_ack_code')
      assert_equal(ack['group_ack_code'], 'A', 'DB pre-990 verification', 'group_ack_code')
      cursor.execute(
        """
        select oed.processing_status, oed.transport
        from midwest_sim.outbound_edi_documents oed
        join midwest_sim.inbound_edi_documents ied on ied.id = oed.inbound_document_id
        where oed.customer_shipment_number = %s
          and oed.document_type = '997'
        """,
        (load_id,),
      )
      midwest = cursor.fetchone()
      if midwest is None:
        raise AcceptanceFailure('DB pre-990 verification', 'Midwest outbound 997 row was not found.')
      assert_equal(midwest['processing_status'], 'DELIVERED', 'DB pre-990 verification', 'Midwest 997 status')
      assert_equal(midwest['transport'], 'SFTP', 'DB pre-990 verification', 'Midwest 997 transport')


def run_database_post_990(database_url: str, load_id: str) -> None:
  import psycopg
  from psycopg.rows import dict_row

  with psycopg.connect(database_url, row_factory=dict_row) as connection:
    with connection.cursor() as cursor:
      cursor.execute("select tender_status from shipments where shipment_number = %s", (load_id,))
      shipment = cursor.fetchone()
      if shipment is None:
        raise AcceptanceFailure('DB post-990 verification', 'Canonical shipment was not found.')
      assert_equal(shipment['tender_status'], 'ACCEPTED', 'DB post-990 verification', 'tender_status after 990')


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(description='Run deployed FreightBridge Milestone 13 acceptance.')
  parser.add_argument('--load-id', help='Load ID to use. Defaults to a unique LOAD-prefixed ID.')
  parser.add_argument('--verbose', action='store_true', help='Print safe request progress.')
  parser.add_argument('--skip-db', action='store_true', help='Skip optional DATABASE_URL verification.')
  parser.add_argument('--keep-going', action='store_true', help='Continue after failures and summarize at the end.')
  parser.add_argument('--print-env', action='store_true', help='Print required variable names and exit.')
  return parser.parse_args()


def main() -> int:
  args = parse_args()
  if args.print_env:
    print_required_env()
    return 0

  recorder = StepRecorder(keep_going=args.keep_going, verbose=args.verbose)
  try:
    config = AcceptanceConfig.from_env()
  except AcceptanceFailure as exc:
    recorder.fail_step(exc)
    return recorder.finish()

  app = Milestone13Acceptance(
    config=config,
    load_id=args.load_id or generate_load_id(),
    recorder=recorder,
    skip_db=args.skip_db,
  )
  try:
    return app.run()
  finally:
    app.close()


if __name__ == '__main__':
  raise SystemExit(main())
