from datetime import UTC, datetime

import httpx
import pytest

from scripts.acceptance.common import (
  AcceptanceFailure,
  SafeHttpClient,
  find_processed_file,
  generate_load_id,
  load_numeric_suffix,
  parse_instant,
  safe_body,
)
from scripts.acceptance.milestone12 import apex_load_payload, assert_event_history
from scripts.acceptance.milestone18 import extract_lab_run_id_from_url


def test_generate_load_id_conforms_to_apex_validation_shape() -> None:
  load_id = generate_load_id(datetime(2026, 9, 23, 12, 34, 56, tzinfo=UTC))

  assert load_id.startswith('LOAD0923123456')
  assert 6 <= len(load_id) <= 30
  assert load_id.isalnum()


@pytest.mark.parametrize(
  ('load_id', 'expected'),
  [
    ('LOAD503', '503'),
    ('LOAD0923123456ABCD', '123456'),
    ('LOADABC', '900'),
  ],
)
def test_load_numeric_suffix(load_id: str, expected: str) -> None:
  assert load_numeric_suffix(load_id) == expected


def test_safe_body_redacts_secrets() -> None:
  rendered = safe_body(
    {
      'Authorization': 'Bearer should-not-appear',
      'DATABASE_URL': 'postgresql://user:pass@example/db',
      'nested': {'token': 'abc123'},
      'safe': 'visible',
    }
  )

  assert 'should-not-appear' not in rendered
  assert 'postgresql://user:pass' not in rendered
  assert 'abc123' not in rendered
  assert 'visible' in rendered


def test_safe_get_retries_transient_failure() -> None:
  calls = {'count': 0}

  def handler(request: httpx.Request) -> httpx.Response:
    calls['count'] += 1
    if calls['count'] == 1:
      return httpx.Response(503, json={'status': 'cold_start'})
    return httpx.Response(200, json={'status': 'ok'})

  client = SafeHttpClient(name='Test', base_url='https://example.test', safe_retries=2, retry_backoff_seconds=0)
  client.client.close()
  client.client = httpx.Client(transport=httpx.MockTransport(handler))
  try:
    body = client.get('/health', step='health')
  finally:
    client.close()

  assert body == {'status': 'ok'}
  assert calls['count'] == 2


def test_post_does_not_retry_mutating_operation() -> None:
  calls = {'count': 0}

  def handler(request: httpx.Request) -> httpx.Response:
    calls['count'] += 1
    return httpx.Response(503, json={'status': 'not_ready'})

  client = SafeHttpClient(name='Test', base_url='https://example.test', safe_retries=3, retry_backoff_seconds=0)
  client.client.close()
  client.client = httpx.Client(transport=httpx.MockTransport(handler))
  try:
    with pytest.raises(AcceptanceFailure):
      client.post_empty('/mutate', step='mutate')
  finally:
    client.close()

  assert calls['count'] == 1


def test_find_processed_file_matches_specific_filename() -> None:
  body = {
    'processed': [
      {'fileName': 'one.edi', 'status': 'ARCHIVED', 'destinationPath': '/archive/one.edi'},
      {'fileName': 'two.edi', 'status': 'ARCHIVED', 'destinationPath': '/archive/two.edi'},
    ]
  }

  assert find_processed_file(body, file_name='two.edi', expected_status='ARCHIVED', step='poll')['fileName'] == 'two.edi'


def test_find_processed_file_fails_when_specific_filename_missing() -> None:
  with pytest.raises(AcceptanceFailure):
    find_processed_file({'processed': []}, file_name='missing.edi', expected_status='ARCHIVED', step='poll')


def test_apex_load_payload_derives_references_from_load_id() -> None:
  payload = apex_load_payload('LOAD503')

  assert payload['bolNumber'] == 'BOL503'
  assert payload['purchaseOrderNumber'] == 'PO503'
  assert payload['customerReference'] == 'CUST-REF-503'
  assert payload['pickup']['facilityName'] == 'ABC Factory'
  assert payload['delivery']['facilityName'] == 'XYZ Warehouse'


def test_event_history_assertion_validates_out_of_order_received_time() -> None:
  assert_event_history(
    [
      {
        'statusCode': 'PICKED_UP',
        'occurredAt': '2026-10-07T14:30:00+00:00',
        'receivedAt': '2026-10-07T14:31:00+00:00',
      },
      {
        'statusCode': 'IN_TRANSIT',
        'occurredAt': '2026-10-07T18:00:00+00:00',
        'receivedAt': '2026-10-07T18:01:00+00:00',
      },
      {
        'statusCode': 'ARRIVED',
        'occurredAt': '2026-10-08T18:00:00+00:00',
        'receivedAt': '2026-10-08T18:36:00+00:00',
      },
      {
        'statusCode': 'DELIVERED',
        'occurredAt': '2026-10-08T18:30:00+00:00',
        'receivedAt': '2026-10-08T18:31:00+00:00',
      },
    ],
    'Apex history verified',
  )


def test_event_history_assertion_rejects_missing_late_arrived_ordering() -> None:
  with pytest.raises(AcceptanceFailure):
    assert_event_history(
      [
        {
          'statusCode': 'PICKED_UP',
          'occurredAt': '2026-10-07T14:30:00Z',
          'receivedAt': '2026-10-07T14:31:00Z',
        },
        {
          'statusCode': 'IN_TRANSIT',
          'occurredAt': '2026-10-07T18:00:00Z',
          'receivedAt': '2026-10-07T18:01:00Z',
        },
        {
          'statusCode': 'ARRIVED',
          'occurredAt': '2026-10-08T18:00:00Z',
          'receivedAt': '2026-10-08T18:29:00Z',
        },
        {
          'statusCode': 'DELIVERED',
          'occurredAt': '2026-10-08T18:30:00Z',
          'receivedAt': '2026-10-08T18:31:00Z',
        },
      ],
      'Apex history verified',
    )


def test_parse_instant_accepts_zulu_and_offset_forms() -> None:
  assert parse_instant('2026-10-08T18:30:00Z') == parse_instant('2026-10-08T18:30:00+00:00')


def test_extract_lab_run_id_from_url_accepts_detail_route() -> None:
  run_id = '99999999-9999-4999-8999-999999999999'

  assert extract_lab_run_id_from_url(f'https://example.vercel.app/#/lab/runs/{run_id}', 'test') == run_id


def test_extract_lab_run_id_from_url_rejects_lab_index_route() -> None:
  with pytest.raises(AcceptanceFailure):
    extract_lab_run_id_from_url('https://example.vercel.app/#/lab', 'test')
