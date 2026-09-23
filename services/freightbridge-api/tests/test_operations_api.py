from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from app.api.routes.operations import get_operations_repository
from app.core.config import get_settings
from app.infrastructure.operations_repository import OperationsRepository, sanitize_raw_payload_location
from app.main import app


TOKEN = 'ops-test-token'


@pytest.fixture(autouse=True)
def operations_state(monkeypatch):
  get_settings.cache_clear()
  monkeypatch.setenv('OPERATIONS_API_BEARER_TOKEN', TOKEN)
  app.dependency_overrides.clear()
  yield
  app.dependency_overrides.clear()
  get_settings.cache_clear()


def auth_headers() -> dict[str, str]:
  return {'Authorization': f'Bearer {TOKEN}'}


def test_operations_auth_missing_and_invalid_tokens_are_rejected() -> None:
  client = TestClient(app)

  missing = client.get('/api/operations/summary')
  invalid = client.get('/api/operations/summary', headers={'Authorization': 'Bearer wrong'})

  assert missing.status_code == 401
  assert invalid.status_code == 401
  assert missing.json()['detail']['error']['code'] == 'AUTHENTICATION_ERROR'
  assert invalid.json()['detail']['error']['code'] == 'AUTHENTICATION_ERROR'


def test_operations_auth_valid_token_succeeds() -> None:
  repository = FakeOperationsRepository()
  app.dependency_overrides[get_operations_repository] = lambda: repository

  response = TestClient(app).get('/api/operations/summary', headers=auth_headers())

  assert response.status_code == 200
  assert response.json()['transactionsTotal'] == 3


@pytest.mark.parametrize(
  ('query', 'expected_ids'),
  [
    ('businessIdentifier=LOAD500', ['tx-204', 'tx-dup', 'tx-ok']),
    ('correlationId=corr-dup', ['tx-dup']),
    ('partnerCode=APEX', ['tx-dup', 'tx-ok']),
    ('documentType=APEX_LOAD_TENDER', ['tx-dup', 'tx-ok']),
    ('status=FAILED', ['tx-dup']),
    ('stage=BUSINESS_VALIDATION', ['tx-dup']),
    ('businessIdentifier=UNKNOWN', []),
  ],
)
def test_transaction_search_filters_and_ordering(query: str, expected_ids: list[str]) -> None:
  repository = FakeOperationsRepository()
  app.dependency_overrides[get_operations_repository] = lambda: repository

  response = TestClient(app).get(f'/api/operations/transactions?{query}', headers=auth_headers())

  assert response.status_code == 200
  body = response.json()
  assert [item['id'] for item in body['transactions']] == [str(repository.ids[item]) for item in expected_ids]
  assert body['count'] == len(expected_ids)


def test_transaction_search_limit_and_offset() -> None:
  repository = FakeOperationsRepository()
  app.dependency_overrides[get_operations_repository] = lambda: repository

  response = TestClient(app).get(
    '/api/operations/transactions?businessIdentifier=LOAD500&limit=1&offset=1',
    headers=auth_headers(),
  )

  assert response.status_code == 200
  body = response.json()
  assert body['limit'] == 1
  assert body['offset'] == 1
  assert [item['id'] for item in body['transactions']] == [str(repository.ids['tx-dup'])]


def test_transaction_detail_includes_relationships_logs_errors_and_no_raw_payload() -> None:
  repository = FakeOperationsRepository()
  app.dependency_overrides[get_operations_repository] = lambda: repository

  response = TestClient(app).get(
    f'/api/operations/transactions/{repository.ids["tx-dup"]}',
    headers=auth_headers(),
  )

  assert response.status_code == 200
  body = response.json()
  assert body['transaction']['processingStatus'] == 'FAILED'
  assert body['transaction']['rawPayloadLocation'] is None
  assert 'rawPayload' not in body['transaction']
  assert body['parent'] is None
  assert body['children'] == []
  assert [log['stage'] for log in body['logs']] == ['RECEIVED', 'BUSINESS_VALIDATION']
  assert body['errors'][0]['category'] == 'DUPLICATE_TRANSACTION'


def test_transaction_detail_not_found_returns_404() -> None:
  repository = FakeOperationsRepository()
  app.dependency_overrides[get_operations_repository] = lambda: repository

  response = TestClient(app).get(f'/api/operations/transactions/{uuid4()}', headers=auth_headers())

  assert response.status_code == 404
  assert response.json()['detail']['error']['code'] == 'TRANSACTION_NOT_FOUND'


def test_business_trace_counts_links_and_failures() -> None:
  repository = FakeOperationsRepository()
  app.dependency_overrides[get_operations_repository] = lambda: repository

  response = TestClient(app).get('/api/operations/business/LOAD500/trace', headers=auth_headers())

  assert response.status_code == 200
  body = response.json()
  assert body['transactionCount'] == 3
  assert body['failedTransactionCount'] == 1
  assert body['unresolvedErrorCount'] == 1
  assert body['links'] == [{
    'parentTransactionId': str(repository.ids['tx-ok']),
    'childTransactionId': str(repository.ids['tx-204']),
  }]


def test_correlation_lookup_is_distinct_from_business_trace() -> None:
  repository = FakeOperationsRepository()
  app.dependency_overrides[get_operations_repository] = lambda: repository

  response = TestClient(app).get('/api/operations/correlations/corr-dup', headers=auth_headers())

  assert response.status_code == 200
  body = response.json()
  assert body['correlationId'] == 'corr-dup'
  assert body['transactionCount'] == 1
  assert body['transactions'][0]['businessIdentifier'] == 'LOAD500'


@pytest.mark.parametrize(
  ('query', 'expected_count'),
  [
    ('', 1),
    ('resolved=false', 1),
    ('resolved=true', 1),
    ('retryable=false', 1),
    ('category=DUPLICATE_TRANSACTION', 1),
    ('errorCode=DUPLICATE_SHIPMENT', 1),
    ('stage=BUSINESS_VALIDATION', 1),
    ('partnerCode=APEX', 1),
    ('businessIdentifier=LOAD500', 1),
    ('documentType=APEX_LOAD_TENDER', 1),
  ],
)
def test_error_queue_filters(query: str, expected_count: int) -> None:
  repository = FakeOperationsRepository()
  app.dependency_overrides[get_operations_repository] = lambda: repository

  suffix = f'?{query}' if query else ''
  response = TestClient(app).get(f'/api/operations/errors{suffix}', headers=auth_headers())

  assert response.status_code == 200
  assert response.json()['count'] == expected_count


def test_error_detail_includes_transaction_and_logs() -> None:
  repository = FakeOperationsRepository()
  app.dependency_overrides[get_operations_repository] = lambda: repository

  response = TestClient(app).get(
    f'/api/operations/errors/{repository.ids["err-dup"]}',
    headers=auth_headers(),
  )

  assert response.status_code == 200
  body = response.json()
  assert body['error']['errorCode'] == 'DUPLICATE_SHIPMENT'
  assert body['transaction']['processingStatus'] == 'FAILED'
  assert body['logs'][-1]['status'] == 'FAILED'


def test_resolve_and_reopen_error_do_not_change_failed_transaction() -> None:
  repository = FakeOperationsRepository()
  app.dependency_overrides[get_operations_repository] = lambda: repository
  client = TestClient(app)

  resolved = client.post(
    f'/api/operations/errors/{repository.ids["err-dup"]}/resolve',
    headers=auth_headers(),
    json={'note': 'Reviewed during production support investigation.'},
  )
  repeated = client.post(
    f'/api/operations/errors/{repository.ids["err-dup"]}/resolve',
    headers=auth_headers(),
    json={'note': 'This should not replace the first note.'},
  )
  detail_after_resolve = client.get(
    f'/api/operations/transactions/{repository.ids["tx-dup"]}',
    headers=auth_headers(),
  )
  reopened = client.post(
    f'/api/operations/errors/{repository.ids["err-dup"]}/reopen',
    headers=auth_headers(),
  )

  assert resolved.status_code == 200
  assert resolved.json()['error']['resolved'] is True
  assert resolved.json()['error']['resolutionNote'] == 'Reviewed during production support investigation.'
  assert repeated.json()['error']['resolutionNote'] == 'Reviewed during production support investigation.'
  assert detail_after_resolve.json()['transaction']['processingStatus'] == 'FAILED'
  assert detail_after_resolve.json()['transaction']['retryCount'] == 0
  assert reopened.json()['error']['resolved'] is False
  assert reopened.json()['error']['resolvedAt'] is None
  assert reopened.json()['error']['resolutionNote'] == 'Reviewed during production support investigation.'


def test_summary_shape() -> None:
  repository = FakeOperationsRepository()
  app.dependency_overrides[get_operations_repository] = lambda: repository

  response = TestClient(app).get('/api/operations/summary?hours=48', headers=auth_headers())

  assert response.status_code == 200
  body = response.json()
  assert body['hours'] == 48
  assert body['transactionsSucceeded'] == 2
  assert body['transactionsFailed'] == 1
  assert body['unresolvedErrors'] == 1
  assert body['byErrorCategory']['DUPLICATE_TRANSACTION'] == 1


def test_raw_payload_location_is_sanitized() -> None:
  assert sanitize_raw_payload_location('/inbound/APEX_MWCX_204.edi') == '/inbound/APEX_MWCX_204.edi'
  assert sanitize_raw_payload_location('C:/Users/secret/file.edi') is None
  assert sanitize_raw_payload_location('postgresql://user:pass@example/db') is None


def test_repository_transaction_search_uses_parameterized_allowlisted_filters() -> None:
  connection = RecordingConnection([])
  repository = OperationsRepository(connection)  # type: ignore[arg-type]

  repository.search_transactions(
    business_identifier='LOAD500',
    partner_code='APEX',
    document_type='APEX_LOAD_TENDER',
    status='FAILED',
    stage='BUSINESS_VALIDATION',
    limit=25,
    offset=5,
  )

  query, params = connection.cursor_instance.executed[0]
  assert 't.business_identifier = %s' in query
  assert 'p.partner_code = %s' in query
  assert 't.document_type = %s' in query
  assert params == ('LOAD500', 'APEX', 'APEX_LOAD_TENDER', 'FAILED', 'BUSINESS_VALIDATION', 25, 5)


class FakeOperationsRepository:
  def __init__(self) -> None:
    self.ids = {
      'partner-apex': UUID('00000000-0000-0000-0000-0000000000a1'),
      'partner-midwest': UUID('00000000-0000-0000-0000-0000000000b1'),
      'tx-ok': UUID('10000000-0000-0000-0000-000000000001'),
      'tx-dup': UUID('10000000-0000-0000-0000-000000000002'),
      'tx-204': UUID('10000000-0000-0000-0000-000000000003'),
      'err-dup': UUID('20000000-0000-0000-0000-000000000001'),
      'err-resolved': UUID('20000000-0000-0000-0000-000000000002'),
    }
    self.now = datetime(2026, 9, 23, 15, tzinfo=UTC)
    self.transactions = [
      self._transaction('tx-204', 'MIDWEST', 'Midwest Carrier', 'OUTBOUND', 'SFTP', 'X12', '204', 'SUCCEEDED', 'COMPLETED', 'corr-204', parent='tx-ok', created_minute=3),
      self._transaction('tx-dup', 'APEX', 'Apex Logistics', 'INBOUND', 'REST', 'JSON', 'APEX_LOAD_TENDER', 'FAILED', 'BUSINESS_VALIDATION', 'corr-dup', created_minute=2, error_count=1),
      self._transaction('tx-ok', 'APEX', 'Apex Logistics', 'INBOUND', 'REST', 'JSON', 'APEX_LOAD_TENDER', 'SUCCEEDED', 'COMPLETED', 'corr-ok', created_minute=1),
    ]
    self.logs = {
      self.ids['tx-dup']: [
        self._log('RECEIVED', 'RECEIVED', 1),
        self._log('BUSINESS_VALIDATION', 'FAILED', 2),
      ]
    }
    self.errors = [
      self._error('err-dup', 'tx-dup', resolved=False),
      self._error('err-resolved', 'tx-dup', resolved=True),
    ]

  def _transaction(self, key, partner_code, partner_name, direction, transport, message_format, document_type, status, stage, correlation_id, *, parent=None, created_minute=1, error_count=0):
    return {
      'id': self.ids[key],
      'correlation_id': correlation_id,
      'partner_code': partner_code,
      'partner_name': partner_name,
      'direction': direction,
      'transport': transport,
      'message_format': message_format,
      'document_type': document_type,
      'business_identifier': 'LOAD500',
      'x12_version': '004010' if message_format == 'X12' else None,
      'interchange_control_number': '000000905' if message_format == 'X12' else None,
      'group_control_number': '905' if message_format == 'X12' else None,
      'transaction_control_number': '0001' if message_format == 'X12' else None,
      'processing_status': status,
      'processing_stage': stage,
      'retry_count': 0,
      'parent_transaction_id': self.ids[parent] if parent else None,
      'received_at': self.now,
      'processed_at': self.now,
      'created_at': self.now.replace(minute=created_minute),
      'updated_at': self.now.replace(minute=created_minute),
      'error_count': error_count,
      'partner': {
        'id': self.ids['partner-apex'] if partner_code == 'APEX' else self.ids['partner-midwest'],
        'partner_code': partner_code,
        'partner_name': partner_name,
      },
      'payload_hash': 'hash',
      'raw_payload_location': '/inbound/file.edi' if message_format == 'X12' else None,
    }

  def _log(self, stage, status, minute):
    return {
      'id': uuid4(),
      'transaction_id': self.ids['tx-dup'],
      'stage': stage,
      'status': status,
      'message': f'{stage} log',
      'metadata': {'error_code': 'DUPLICATE_SHIPMENT'} if status == 'FAILED' else {},
      'created_at': self.now.replace(minute=minute),
    }

  def _error(self, key, transaction_key, *, resolved):
    return {
      'id': self.ids[key],
      'transaction_id': self.ids[transaction_key],
      'business_identifier': 'LOAD500',
      'partner_code': 'APEX',
      'document_type': 'APEX_LOAD_TENDER',
      'category': 'DUPLICATE_TRANSACTION',
      'error_code': 'DUPLICATE_SHIPMENT',
      'safe_message': 'A canonical shipment already exists for this Apex load.',
      'stage': 'BUSINESS_VALIDATION',
      'retryable': False,
      'resolved': resolved,
      'resolution_note': 'previously reviewed' if resolved else None,
      'created_at': self.now,
      'resolved_at': self.now if resolved else None,
      'correlation_id': 'corr-dup',
    }

  def search_transactions(self, **filters):
    rows = self.transactions
    rows = self._filter_transactions(rows, filters)
    offset = filters.get('offset', 0)
    limit = filters.get('limit', 50)
    page = rows[offset:offset + limit]
    return {'limit': limit, 'offset': offset, 'count': len(page), 'transactions': page}

  def get_transaction_detail(self, transaction_id):
    tx = next((item for item in self.transactions if item['id'] == transaction_id), None)
    if tx is None:
      return None
    detail = {**tx, 'raw_payload_location': None if tx['document_type'] == 'APEX_LOAD_TENDER' else tx['raw_payload_location']}
    parent = next((item for item in self.transactions if item['id'] == tx['parent_transaction_id']), None)
    children = [item for item in self.transactions if item['parent_transaction_id'] == transaction_id]
    return {
      'transaction': detail,
      'parent': parent,
      'children': children,
      'logs': self.logs.get(transaction_id, []),
      'errors': [error for error in self.errors if error['transaction_id'] == transaction_id],
    }

  def get_business_trace(self, business_identifier):
    transactions = self._filter_transactions(self.transactions, {'business_identifier': business_identifier})
    errors = [error for error in self.errors if error['business_identifier'] == business_identifier and not error['resolved']]
    return {
      'business_identifier': business_identifier,
      'transaction_count': len(transactions),
      'failed_transaction_count': len([tx for tx in transactions if tx['processing_status'] == 'FAILED']),
      'unresolved_error_count': len(errors),
      'transactions': transactions,
      'links': [
        {'parent_transaction_id': tx['parent_transaction_id'], 'child_transaction_id': tx['id']}
        for tx in transactions if tx['parent_transaction_id']
      ],
    }

  def get_correlation_lookup(self, correlation_id):
    transactions = self._filter_transactions(self.transactions, {'correlation_id': correlation_id})
    return {'correlation_id': correlation_id, 'transaction_count': len(transactions), 'transactions': transactions}

  def search_errors(self, **filters):
    rows = list(self.errors)
    for key, value in filters.items():
      if key in ('limit', 'offset') or value is None:
        continue
      rows = [error for error in rows if error[key] == value]
    offset = filters.get('offset', 0)
    limit = filters.get('limit', 50)
    page = rows[offset:offset + limit]
    return {'limit': limit, 'offset': offset, 'count': len(page), 'errors': page}

  def get_error_detail(self, error_id):
    error = next((item for item in self.errors if item['id'] == error_id), None)
    if error is None:
      return None
    tx = next(item for item in self.transactions if item['id'] == error['transaction_id'])
    return {'error': error, 'transaction': tx, 'logs': self.logs.get(tx['id'], [])}

  def resolve_error(self, error_id, *, note=None):
    error = next((item for item in self.errors if item['id'] == error_id), None)
    if error is None:
      return None
    if not error['resolved']:
      error['resolved'] = True
      error['resolved_at'] = self.now
      error['resolution_note'] = note
    return self.get_error_detail(error_id)

  def reopen_error(self, error_id):
    error = next((item for item in self.errors if item['id'] == error_id), None)
    if error is None:
      return None
    error['resolved'] = False
    error['resolved_at'] = None
    return self.get_error_detail(error_id)

  def get_summary(self, *, hours, now):
    return {
      'hours': hours,
      'generated_at': now,
      'transactions_total': 3,
      'transactions_succeeded': 2,
      'transactions_failed': 1,
      'transactions_processing': 0,
      'unresolved_errors': len([error for error in self.errors if not error['resolved']]),
      'retryable_unresolved_errors': 0,
      'by_error_category': {'DUPLICATE_TRANSACTION': 1},
      'by_document_type': {'APEX_LOAD_TENDER': 2, '204': 1},
    }

  def _filter_transactions(self, rows, filters):
    mapping = {
      'business_identifier': 'business_identifier',
      'correlation_id': 'correlation_id',
      'partner_code': 'partner_code',
      'direction': 'direction',
      'transport': 'transport',
      'message_format': 'message_format',
      'document_type': 'document_type',
      'status': 'processing_status',
      'stage': 'processing_stage',
    }
    for key, field in mapping.items():
      value = filters.get(key)
      if value is not None:
        rows = [row for row in rows if row[field] == value]
    return rows


class RecordingCursor:
  def __init__(self, rows):
    self.rows = rows
    self.executed = []

  def __enter__(self):
    return self

  def __exit__(self, exc_type, exc, traceback):
    return None

  def execute(self, query, params=()):
    self.executed.append((query, params))

  def fetchall(self):
    return self.rows

  def fetchone(self):
    return self.rows[0] if self.rows else None


class RecordingConnection:
  def __init__(self, rows):
    self.cursor_instance = RecordingCursor(rows)

  def cursor(self, *args, **kwargs):
    return self.cursor_instance
