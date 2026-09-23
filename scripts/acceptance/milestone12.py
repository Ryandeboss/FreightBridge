from __future__ import annotations

import argparse
from datetime import UTC, datetime
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
  assert_same_instant,
  assert_truth,
  correlation_id,
  find_processed_file,
  generate_load_id,
  load_numeric_suffix,
  parse_instant,
  print_required_env,
  require_field,
)


EVENTS = [
  {
    'status': 'PICKED_UP',
    'at7Code': 'AF',
    'occurredAt': '2026-10-07T14:30:00Z',
    'city': 'Aurora',
    'state': 'IL',
    'statusDescription': 'Shipment departed pickup facility.',
  },
  {
    'status': 'IN_TRANSIT',
    'at7Code': 'X6',
    'occurredAt': '2026-10-07T18:00:00Z',
    'city': 'South Bend',
    'state': 'IN',
    'statusDescription': 'Shipment is in transit.',
  },
  {
    'status': 'DELIVERED',
    'at7Code': 'D1',
    'occurredAt': '2026-10-08T18:30:00Z',
    'city': 'Detroit',
    'state': 'MI',
    'statusDescription': 'Shipment delivery completed.',
  },
  {
    'status': 'ARRIVED',
    'at7Code': 'X1',
    'occurredAt': '2026-10-08T18:00:00Z',
    'city': 'Detroit',
    'state': 'MI',
    'statusDescription': 'Shipment arrived at delivery location.',
  },
]


class Milestone12Acceptance:
  def __init__(self, *, config: AcceptanceConfig, load_id: str, recorder: StepRecorder, skip_db: bool) -> None:
    self.config = config
    self.load_id = load_id
    self.recorder = recorder
    self.skip_db = skip_db
    self.apex = SafeHttpClient(
      name='Apex',
      base_url=config.apex_base_url,
      verbose=recorder.verbose,
    )
    self.freightbridge = SafeHttpClient(
      name='FreightBridge',
      base_url=config.freightbridge_base_url,
      verbose=recorder.verbose,
    )
    self.midwest = SafeHttpClient(
      name='Midwest',
      base_url=config.midwest_base_url,
      verbose=recorder.verbose,
    )
    self.carrier_load_number: str | None = None

  def close(self) -> None:
    self.apex.close()
    self.freightbridge.close()
    self.midwest.close()

  def run(self) -> int:
    print('FreightBridge Milestone 12 Deployed Acceptance')
    print(f'Load: {self.load_id}')
    print('')

    self.warm_up()
    self.create_apex_load()
    self.dispatch_apex_to_freightbridge()
    dispatch_204 = self.dispatch_204_to_midwest_sftp()
    file_204 = require_field(dispatch_204, 'fileName', '204 delivered over SFTP')
    self.poll_midwest_inbound(file_204)
    self.verify_midwest_pending_load()
    tender = self.accept_tender()
    self.carrier_load_number = require_field(tender, 'carrierLoadNumber', 'Tender accepted')
    dispatch_990 = self.dispatch_990_to_sftp()
    file_990 = require_field(dispatch_990, 'fileName', '990 delivered over SFTP')
    self.poll_freightbridge_outbound(file_990, '990')
    self.verify_apex_tender_status()

    event_results: list[dict[str, Any]] = []
    for event in EVENTS:
      created = self.create_midwest_event(event)
      event_results.append(created)
      event_id = require_field(created, 'eventId', f'{event["status"]} 214')
      dispatch_214 = self.dispatch_214_to_sftp(event_id, event['status'])
      file_214 = require_field(dispatch_214, 'fileName', f'{event["status"]} 214 dispatch')
      self.poll_freightbridge_outbound(file_214, '214', event['status'])

    self.verify_apex_history()
    self.verify_midwest_history()
    self.verify_database() if not self.skip_db else self.recorder.skip_step('DB verification', '--skip-db was provided')

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
      lambda: self.freightbridge.get(
        '/api/integrations/midwest/sftp/readiness',
        step='FreightBridge SFTP readiness',
      ),
    )
    self.recorder.run(
      'Midwest SFTP readiness',
      lambda: self.midwest.get(
        '/v1/sftp/readiness',
        token=self.config.midwest_readonly_token,
        step='Midwest SFTP readiness',
      ),
    )

  def create_apex_load(self) -> None:
    payload = apex_load_payload(self.load_id)
    step = 'Apex load created'

    def action() -> dict[str, Any]:
      try:
        body = self.apex.post_json(
          '/v1/load-tenders',
          payload,
          token=self.config.apex_bearer_token,
          expected=(202,),
          step=step,
          correlation_id=correlation_id(self.load_id, step),
        )
        assert_equal(body.get('loadId'), self.load_id, step, 'loadId')
        return body
      except AcceptanceFailure as exc:
        if 'Timeout' not in exc.message and 'Transport' not in exc.message:
          raise
        readback = self.apex.get(
          f'/v1/loads/{self.load_id}',
          token=self.config.apex_readonly_token,
          step='Apex load timeout readback',
          retry=True,
        )
        assert_equal(readback.get('loadId'), self.load_id, step, 'loadId')
        return {'status': 'CREATED_OR_CONFIRMED_AFTER_TIMEOUT', 'loadId': self.load_id}

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
      assert_truth(str(body.get('remotePath', '')).startswith('/inbound/'), step, '204 remotePath must begin /inbound/')
      return body

    body = self.recorder.run(step, action, detail=lambda result: str(result.get('fileName')))
    if body is None:
      return {}
    return body

  def poll_midwest_inbound(self, file_name: str) -> None:
    step = 'Midwest consumed 204'
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

  def verify_midwest_pending_load(self) -> None:
    step = 'Midwest load readback'
    def action() -> dict[str, Any]:
      body = self.midwest.get(
        f'/v1/loads/{self.load_id}',
        token=self.config.midwest_readonly_token,
        step=step,
      )
      assert_equal(body.get('tenderStatus'), 'PENDING', step, 'tenderStatus')
      return body

    self.recorder.run(step, action)

  def accept_tender(self) -> dict[str, Any]:
    step = 'Tender accepted'
    def action() -> dict[str, Any]:
      body = self.midwest.post_json(
        f'/v1/loads/{self.load_id}/tender-decisions',
        {
          'decision': 'ACCEPTED',
          'message': 'Accepted by automated FreightBridge acceptance test.',
        },
        token=self.config.midwest_bearer_token,
        expected=(200,),
        step=step,
        correlation_id=correlation_id(self.load_id, step),
      )
      assert_equal(body.get('decision'), 'ACCEPTED', step, 'decision')
      return body

    body = self.recorder.run(step, action, detail=lambda result: str(result.get('carrierLoadNumber')))
    if body is None:
      return {}
    return body

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
      assert_truth(str(body.get('remotePath', '')).startswith('/outbound/'), step, '990 remotePath must begin /outbound/')
      return body

    body = self.recorder.run(step, action, detail=lambda result: str(result.get('fileName')))
    if body is None:
      return {}
    return body

  def poll_freightbridge_outbound(self, file_name: str, document_type: str, label: str | None = None) -> None:
    step = f'FreightBridge consumed {label + " " if label else ""}{document_type}'
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

  def verify_apex_tender_status(self) -> None:
    step = 'Apex received tender acceptance'
    def action() -> dict[str, Any]:
      body = self.apex.get(
        f'/v1/loads/{self.load_id}/tender-status',
        token=self.config.apex_readonly_token,
        step=step,
      )
      assert_equal(body.get('currentTenderDecision'), 'ACCEPTED', step, 'currentTenderDecision')
      latest = body.get('latestResponse')
      if isinstance(latest, dict) and self.carrier_load_number:
        assert_equal(latest.get('carrierLoadNumber'), self.carrier_load_number, step, 'carrierLoadNumber')
      return body

    self.recorder.run(step, action)

  def create_midwest_event(self, event: dict[str, str]) -> dict[str, Any]:
    step = f'{event["status"]} 214'
    payload = {
      'status': event['status'],
      'occurredAt': event['occurredAt'],
      'city': event['city'],
      'state': event['state'],
      'statusDescription': event['statusDescription'],
    }
    def action() -> dict[str, Any]:
      body = self.midwest.post_json(
        f'/v1/loads/{self.load_id}/shipment-events',
        payload,
        token=self.config.midwest_bearer_token,
        expected=(200,),
        step=step,
        correlation_id=correlation_id(self.load_id, step),
      )
      assert_equal(body.get('status'), event['status'], step, 'status')
      assert_equal(body.get('at7Code'), event['at7Code'], step, 'at7Code')
      assert_same_instant(str(body.get('occurredAt')), event['occurredAt'], step, 'occurredAt')
      return body

    body = self.recorder.run(step, action, detail=lambda result: str(result.get('eventId')))
    if body is None:
      return {}
    return body

  def dispatch_214_to_sftp(self, event_id: str, status_label: str) -> dict[str, Any]:
    step = f'{status_label} 214 dispatch'
    def action() -> dict[str, Any]:
      body = self.midwest.post_empty(
        f'/v1/loads/{self.load_id}/shipment-events/{event_id}/dispatch-sftp',
        token=self.config.midwest_bearer_token,
        expected=(202,),
        step=step,
        correlation_id=correlation_id(self.load_id, step),
      )
      assert_equal(body.get('documentType'), '214', step, 'documentType')
      assert_equal(body.get('transport'), 'SFTP', step, 'transport')
      assert_truth(str(body.get('remotePath', '')).startswith('/outbound/'), step, '214 remotePath must begin /outbound/')
      assert_truth(str(body.get('fileName', '')).startswith('MWCX_APEX_214_'), step, '214 filename prefix mismatch')
      return body

    body = self.recorder.run(step, action, detail=lambda result: str(result.get('fileName')))
    if body is None:
      return {}
    return body

  def verify_apex_history(self) -> None:
    step = 'Apex history verified'
    def action() -> dict[str, Any]:
      body = self.apex.get(
        f'/v1/loads/{self.load_id}/shipment-statuses',
        token=self.config.apex_readonly_token,
        step=step,
      )
      assert_equal(body.get('currentStatus'), 'DELIVERED', step, 'currentStatus')
      assert_same_instant(str(body.get('currentStatusOccurredAt')), '2026-10-08T18:30:00Z', step, 'currentStatusOccurredAt')
      assert_event_history(body.get('events'), step)
      return body

    body = self.recorder.run(step, action)
    if body is not None:
      self.recorder.pass_step('Current status remains DELIVERED')
      self.recorder.pass_step('Out-of-order history preserved')

  def verify_midwest_history(self) -> None:
    step = 'Midwest event history verified'
    def action() -> dict[str, Any]:
      body = self.midwest.get(
        f'/v1/loads/{self.load_id}/shipment-events',
        token=self.config.midwest_readonly_token,
        step=step,
      )
      events = body.get('events')
      if not isinstance(events, list):
        raise AcceptanceFailure(step, 'Midwest history did not include events.', response_body=body)
      assert_equal(len(events), 4, step, 'Midwest event count')
      statuses = {event.get('status') for event in events if isinstance(event, dict)}
      assert_equal(statuses, {'PICKED_UP', 'IN_TRANSIT', 'ARRIVED', 'DELIVERED'}, step, 'Midwest statuses')
      return body

    self.recorder.run(step, action)

  def verify_database(self) -> None:
    if not self.config.database_url:
      self.recorder.skip_step('DB verification', 'DATABASE_URL not provided')
      return
    self.recorder.run('DB verification', lambda: run_database_verification(self.config.database_url, self.load_id))


def apex_load_payload(load_id: str) -> dict[str, Any]:
  suffix = load_numeric_suffix(load_id)
  now = datetime.now(UTC).replace(microsecond=0).isoformat().replace('+00:00', 'Z')
  return {
    'loadId': load_id,
    'bolNumber': f'BOL{suffix}',
    'purchaseOrderNumber': f'PO{suffix}',
    'customerReference': f'CUST-REF-{suffix}',
    'equipmentType': 'VAN_53',
    'weightLbs': 42000,
    'pieces': 26,
    'commodityDescription': 'Automotive parts',
    'pickup': {
      'facilityName': 'ABC Factory',
      'address1': '200 Industrial Rd',
      'city': 'Aurora',
      'state': 'IL',
      'postalCode': '60505',
      'scheduledDateTime': '2026-10-07T14:00:00Z',
    },
    'delivery': {
      'facilityName': 'XYZ Warehouse',
      'address1': '900 Commerce St',
      'city': 'Detroit',
      'state': 'MI',
      'postalCode': '48201',
      'scheduledDateTime': '2026-10-08T18:00:00Z',
    },
    'references': [
      {'type': 'BOL', 'value': f'BOL{suffix}', 'description': 'Bill of lading'},
      {'type': 'PO', 'value': f'PO{suffix}', 'description': 'Purchase order'},
      {'type': 'CUSTOMER_REF', 'value': f'CUST-REF-{suffix}', 'description': 'Customer reference'},
    ],
    'createdAt': now,
    'updatedAt': now,
  }


def assert_event_history(events: object, step: str) -> None:
  if not isinstance(events, list):
    raise AcceptanceFailure(step, 'Apex history did not include events.', response_body=events)
  matching = [event for event in events if isinstance(event, dict)]
  assert_equal(len(matching), 4, step, 'Apex event count')

  by_status = {event.get('statusCode'): event for event in matching}
  assert_equal(set(by_status), {'PICKED_UP', 'IN_TRANSIT', 'ARRIVED', 'DELIVERED'}, step, 'Apex statuses')
  for expected in EVENTS:
    actual = by_status[expected['status']]
    assert_same_instant(str(actual.get('occurredAt')), expected['occurredAt'], step, f'{expected["status"]}.occurredAt')

  arrived = by_status['ARRIVED']
  delivered = by_status['DELIVERED']
  assert_truth(
    parse_instant(str(arrived.get('occurredAt'))) < parse_instant(str(delivered.get('occurredAt'))),
    step,
    'ARRIVED occurredAt must be before DELIVERED occurredAt.',
  )
  assert_truth(
    parse_instant(str(arrived.get('receivedAt'))) > parse_instant(str(delivered.get('receivedAt'))),
    step,
    'ARRIVED receivedAt must be after DELIVERED receivedAt.',
  )


def run_database_verification(database_url: str, load_id: str) -> None:
  try:
    import psycopg
    from psycopg.rows import dict_row
  except ImportError as exc:
    raise AcceptanceFailure('DB verification', 'psycopg is required when DATABASE_URL is provided.') from exc

  with psycopg.connect(database_url, row_factory=dict_row) as connection:
    with connection.cursor() as cursor:
      cursor.execute(
        """
        select shipment_number, tender_status, current_status, current_status_occurred_at
        from public.shipments
        where shipment_number = %s
        """,
        (load_id,),
      )
      shipment = cursor.fetchone()
      if shipment is None:
        raise AcceptanceFailure('DB verification', 'Canonical shipment was not found.')
      assert_equal(shipment['tender_status'], 'ACCEPTED', 'DB verification', 'canonical tender_status')
      assert_equal(shipment['current_status'], 'DELIVERED', 'DB verification', 'canonical current_status')
      assert_equal(
        shipment['current_status_occurred_at'].astimezone(UTC),
        parse_instant('2026-10-08T18:30:00Z'),
        'DB verification',
        'canonical current_status_occurred_at',
      )

      cursor.execute(
        """
        select se.status, se.occurred_at, se.received_at
        from public.shipment_events se
        join public.shipments s on s.id = se.shipment_id
        where s.shipment_number = %s
        order by se.occurred_at, se.received_at
        """,
        (load_id,),
      )
      events = cursor.fetchall()
      assert_equal(len(events), 4, 'DB verification', 'canonical shipment_events count')
      statuses = {event['status'] for event in events}
      assert_equal(statuses, {'PICKED_UP', 'IN_TRANSIT', 'ARRIVED', 'DELIVERED'}, 'DB verification', 'canonical statuses')
      by_status = {event['status']: event for event in events}
      assert_truth(
        by_status['ARRIVED']['occurred_at'] < by_status['DELIVERED']['occurred_at'],
        'DB verification',
        'DB ARRIVED occurred_at must be before DELIVERED occurred_at.',
      )
      assert_truth(
        by_status['ARRIVED']['received_at'] > by_status['DELIVERED']['received_at'],
        'DB verification',
        'DB ARRIVED received_at must be after DELIVERED received_at.',
      )

      cursor.execute(
        """
        select id, parent_transaction_id, document_type, direction, transport, message_format, processing_status
        from public.integration_transactions
        where business_identifier = %s
          and document_type in ('214', 'APEX_SHIPMENT_STATUS')
        """,
        (load_id,),
      )
      transactions = cursor.fetchall()
      inbound_214 = [
        row for row in transactions
        if row['document_type'] == '214'
        and row['direction'] == 'INBOUND'
        and row['transport'] == 'SFTP'
        and row['message_format'] == 'X12'
        and row['processing_status'] == 'SUCCEEDED'
      ]
      child_statuses = [
        row for row in transactions
        if row['document_type'] == 'APEX_SHIPMENT_STATUS'
        and row['direction'] == 'OUTBOUND'
        and row['transport'] == 'REST'
        and row['message_format'] == 'JSON'
        and row['processing_status'] == 'SUCCEEDED'
      ]
      assert_equal(len(inbound_214), 4, 'DB verification', 'inbound 214 transaction count')
      assert_equal(len(child_statuses), 4, 'DB verification', 'Apex child transaction count')
      parent_ids = {row['id'] for row in inbound_214}
      assert_truth(
        all(row['parent_transaction_id'] in parent_ids for row in child_statuses),
        'DB verification',
        'Every APEX_SHIPMENT_STATUS child must reference a 214 parent.',
      )

      cursor.execute(
        """
        select oed.document_type, oed.transport, oed.processing_status
        from midwest_sim.outbound_edi_documents oed
        join midwest_sim.shipment_events se on se.id = oed.shipment_event_id
        where oed.customer_shipment_number = %s
          and oed.document_type = '214'
        """,
        (load_id,),
      )
      outbound = cursor.fetchall()
      assert_equal(len(outbound), 4, 'DB verification', 'Midwest outbound 214 count')
      assert_truth(
        all(row['transport'] == 'SFTP' and row['processing_status'] == 'DELIVERED' for row in outbound),
        'DB verification',
        'All Midwest outbound 214 rows must be SFTP DELIVERED.',
      )


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(description='Run deployed FreightBridge Milestone 12 acceptance.')
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

  load_id = args.load_id or generate_load_id()
  app = Milestone12Acceptance(config=config, load_id=load_id, recorder=recorder, skip_db=args.skip_db)
  try:
    return app.run()
  finally:
    app.close()


if __name__ == '__main__':
  raise SystemExit(main())
