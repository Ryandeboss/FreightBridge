from datetime import datetime, timedelta
from uuid import UUID

from psycopg import Connection
from psycopg.rows import dict_row


SAFE_RAW_PAYLOAD_PREFIXES = ('/inbound/', '/outbound/', '/archive/', '/error/')


class OperationsRepository:
  def __init__(self, connection: Connection):
    self.connection = connection

  def search_transactions(
    self,
    *,
    business_identifier: str | None = None,
    correlation_id: str | None = None,
    partner_code: str | None = None,
    direction: str | None = None,
    transport: str | None = None,
    message_format: str | None = None,
    document_type: str | None = None,
    status: str | None = None,
    stage: str | None = None,
    limit: int = 50,
    offset: int = 0,
  ) -> dict[str, object]:
    filters = {
      'business_identifier': business_identifier,
      'correlation_id': correlation_id,
      'partner_code': partner_code,
      'direction': direction,
      'transport': transport,
      'message_format': message_format,
      'document_type': document_type,
      'processing_status': status,
      'processing_stage': stage,
    }
    where_sql, params = self._transaction_filters(filters)
    query = self._transaction_summary_query(where_sql)
    params.extend([limit, offset])
    with self.connection.cursor(row_factory=dict_row) as cursor:
      cursor.execute(query, tuple(params))
      rows = [self._transaction_summary(row) for row in cursor.fetchall()]
    return {'limit': limit, 'offset': offset, 'count': len(rows), 'transactions': rows}

  def get_transaction_detail(self, transaction_id: UUID) -> dict[str, object] | None:
    transaction = self._fetch_transaction_detail_row(transaction_id)
    if transaction is None:
      return None
    parent = self._fetch_transaction_summary(transaction['parent_transaction_id']) if transaction['parent_transaction_id'] else None
    return {
      'transaction': self._transaction_detail(transaction),
      'parent': parent,
      'children': self._fetch_child_summaries(transaction_id),
      'retry_attempts': self._fetch_retry_attempts(transaction_id),
      'logs': self._fetch_logs(transaction_id),
      'errors': self._fetch_errors_for_transaction(transaction_id),
    }

  def get_business_trace(self, business_identifier: str) -> dict[str, object]:
    search = self.search_transactions(business_identifier=business_identifier, limit=100, offset=0)
    transactions = search['transactions']
    links = [
      {
        'parent_transaction_id': tx['parent_transaction_id'],
        'child_transaction_id': tx['id'],
      }
      for tx in transactions
      if tx.get('parent_transaction_id') is not None
    ]
    links.extend(
      {
        'parent_transaction_id': tx['replay_of_transaction_id'],
        'child_transaction_id': tx['id'],
      }
      for tx in transactions
      if tx.get('replay_of_transaction_id') is not None
    )
    failed = [tx for tx in transactions if tx['processing_status'] == 'FAILED']
    unresolved = self.search_errors(
      business_identifier=business_identifier,
      resolved=False,
      limit=100,
      offset=0,
    )['errors']
    return {
      'business_identifier': business_identifier,
      'transaction_count': len(transactions),
      'failed_transaction_count': len(failed),
      'unresolved_error_count': len(unresolved),
      'transactions': transactions,
      'links': links,
    }

  def get_correlation_lookup(self, correlation_id: str) -> dict[str, object]:
    search = self.search_transactions(correlation_id=correlation_id, limit=100, offset=0)
    transactions = search['transactions']
    return {
      'correlation_id': correlation_id,
      'transaction_count': len(transactions),
      'transactions': transactions,
    }

  def search_errors(
    self,
    *,
    resolved: bool | None = False,
    retryable: bool | None = None,
    category: str | None = None,
    error_code: str | None = None,
    stage: str | None = None,
    partner_code: str | None = None,
    business_identifier: str | None = None,
    document_type: str | None = None,
    limit: int = 50,
    offset: int = 0,
  ) -> dict[str, object]:
    filters = {
      'resolved': resolved,
      'retryable': retryable,
      'category': category,
      'error_code': error_code,
      'stage': stage,
      'partner_code': partner_code,
      'business_identifier': business_identifier,
      'document_type': document_type,
    }
    where_sql, params = self._error_filters(filters)
    params.extend([limit, offset])
    with self.connection.cursor(row_factory=dict_row) as cursor:
      cursor.execute(
        f"""
          SELECT
            e.id, e.transaction_id, e.category, e.error_code, e.safe_message,
            e.stage, e.retryable, e.resolved, e.resolution_note, e.resolved_by_transaction_id, e.created_at, e.resolved_at,
            t.business_identifier, t.document_type, t.correlation_id,
            p.partner_code
          FROM integration_errors e
          JOIN integration_transactions t ON t.id = e.transaction_id
          JOIN trading_partners p ON p.id = t.partner_id
          {where_sql}
          ORDER BY e.created_at DESC, e.id DESC
          LIMIT %s OFFSET %s
        """,
        tuple(params),
      )
      rows = [self._error_view(row) for row in cursor.fetchall()]
    return {'limit': limit, 'offset': offset, 'count': len(rows), 'errors': rows}

  def get_error_detail(self, error_id: UUID) -> dict[str, object] | None:
    error = self._fetch_error(error_id)
    if error is None:
      return None
    transaction = self._fetch_transaction_summary(error['transaction_id'])
    if transaction is None:
      return None
    return {
      'error': error,
      'transaction': transaction,
      'logs': self._fetch_logs(error['transaction_id']),
    }

  def resolve_error(self, error_id: UUID, *, note: str | None = None) -> dict[str, object] | None:
    current = self._fetch_error(error_id)
    if current is None:
      return None
    if current['resolved']:
      return self.get_error_detail(error_id)
    with self.connection.cursor(row_factory=dict_row) as cursor:
      cursor.execute(
        """
          UPDATE integration_errors
          SET resolved = true,
              resolved_at = now(),
              resolution_note = %s
          WHERE id = %s
        """,
        (note, error_id),
      )
    return self.get_error_detail(error_id)

  def reopen_error(self, error_id: UUID) -> dict[str, object] | None:
    current = self._fetch_error(error_id)
    if current is None:
      return None
    if not current['resolved']:
      return self.get_error_detail(error_id)
    with self.connection.cursor() as cursor:
      cursor.execute(
        """
          UPDATE integration_errors
          SET resolved = false,
              resolved_at = null
          WHERE id = %s
        """,
        (error_id,),
      )
    return self.get_error_detail(error_id)

  def begin_retry_attempt(self, transaction_id: UUID, *, note: str | None = None, max_attempts: int = 3) -> dict[str, object] | None:
    with self.connection.transaction():
      with self.connection.cursor(row_factory=dict_row) as cursor:
        cursor.execute(
          """
            SELECT *
            FROM integration_transactions
            WHERE id = %s
            FOR UPDATE
          """,
          (transaction_id,),
        )
        original = cursor.fetchone()
        if original is None:
          return None
        cursor.execute(
          """
            SELECT id
            FROM integration_retry_attempts
            WHERE original_transaction_id = %s
              AND status = 'SUCCEEDED'
            LIMIT 1
          """,
          (transaction_id,),
        )
        if cursor.fetchone() is not None:
          return {'status': 'ALREADY_RECOVERED', 'original': dict(original)}
        cursor.execute(
          """
            SELECT id
            FROM integration_retry_attempts
            WHERE original_transaction_id = %s
              AND status = 'PROCESSING'
            LIMIT 1
          """,
          (transaction_id,),
        )
        if cursor.fetchone() is not None:
          return {'status': 'RETRY_IN_PROGRESS', 'original': dict(original)}
        cursor.execute(
          """
            SELECT *
            FROM integration_errors
            WHERE transaction_id = %s
              AND resolved = false
              AND retryable = true
            ORDER BY created_at desc
            LIMIT 1
          """,
          (transaction_id,),
        )
        error = cursor.fetchone()
        if not self._retryable_original(original, error):
          return {'status': 'TRANSACTION_NOT_RETRYABLE', 'original': dict(original)}
        if original['retry_count'] >= max_attempts:
          return {'status': 'RETRY_LIMIT_EXCEEDED', 'original': dict(original)}
        cursor.execute(
          """
            SELECT *
            FROM integration_message_payloads
            WHERE transaction_id = %s
          """,
          (transaction_id,),
        )
        payload = cursor.fetchone()
        if payload is None:
          return {'status': 'TRANSACTION_NOT_RETRYABLE', 'original': dict(original)}

        attempt_number = int(original['retry_count']) + 1
        cursor.execute(
          """
            UPDATE integration_transactions
            SET retry_count = retry_count + 1,
                updated_at = now()
            WHERE id = %s
          """,
          (transaction_id,),
        )
        cursor.execute(
          """
            INSERT INTO integration_transactions (
              correlation_id, partner_id, direction, transport, message_format,
              document_type, business_identifier, x12_version,
              interchange_control_number, group_control_number,
              transaction_control_number, payload_hash, raw_payload_location,
              processing_status, processing_stage, retry_count,
              parent_transaction_id, received_at
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                    'PROCESSING', 'DELIVERY', 0, %s, now())
            RETURNING id
          """,
          (
            original['correlation_id'],
            original['partner_id'],
            original['direction'],
            original['transport'],
            original['message_format'],
            original['document_type'],
            original['business_identifier'],
            original['x12_version'],
            original['interchange_control_number'],
            original['group_control_number'],
            original['transaction_control_number'],
            original['payload_hash'],
            original['raw_payload_location'],
            transaction_id,
          ),
        )
        retry_transaction_id = cursor.fetchone()['id']
        cursor.execute(
          """
            INSERT INTO integration_retry_attempts (
              original_transaction_id,
              retry_transaction_id,
              attempt_number,
              status,
              note
            )
            VALUES (%s, %s, %s, 'PROCESSING', %s)
            RETURNING id
          """,
          (transaction_id, retry_transaction_id, attempt_number, note),
        )
        retry_attempt_id = cursor.fetchone()['id']
        return {
          'status': 'PROCESSING',
          'original': dict(original),
          'payload': dict(payload),
          'retry_transaction_id': retry_transaction_id,
          'retry_attempt_id': retry_attempt_id,
          'attempt_number': attempt_number,
        }

  def complete_retry_success(
    self,
    *,
    retry_attempt_id: UUID,
    original_transaction_id: UUID,
    retry_transaction_id: UUID,
    remote_path: str | None,
    delivery_disposition: str,
  ) -> None:
    with self.connection.transaction():
      with self.connection.cursor() as cursor:
        cursor.execute(
          """
            UPDATE integration_transactions
            SET processing_status = 'SUCCEEDED',
                processing_stage = 'COMPLETED',
                raw_payload_location = coalesce(%s, raw_payload_location),
                processed_at = now(),
                updated_at = now()
            WHERE id = %s
          """,
          (remote_path, retry_transaction_id),
        )
        cursor.execute(
          """
            UPDATE integration_retry_attempts
            SET status = 'SUCCEEDED',
                delivery_disposition = %s,
                completed_at = now()
            WHERE id = %s
          """,
          (delivery_disposition, retry_attempt_id),
        )
        cursor.execute(
          """
            UPDATE integration_errors
            SET resolved = true,
                resolved_at = now(),
                resolved_by_transaction_id = %s,
                resolution_note = coalesce(resolution_note, 'Resolved by controlled manual retry.')
            WHERE transaction_id = %s
              AND resolved = false
              AND retryable = true
          """,
          (retry_transaction_id, original_transaction_id),
        )

  def complete_retry_failure(
    self,
    *,
    retry_attempt_id: UUID,
    retry_transaction_id: UUID,
    error_code: str,
    safe_message: str,
  ) -> None:
    with self.connection.transaction():
      with self.connection.cursor() as cursor:
        cursor.execute(
          """
            UPDATE integration_transactions
            SET processing_status = 'FAILED',
                processing_stage = 'DELIVERY',
                processed_at = now(),
                updated_at = now()
            WHERE id = %s
          """,
          (retry_transaction_id,),
        )
        cursor.execute(
          """
            INSERT INTO integration_errors (
              transaction_id, category, error_code, safe_message, stage, retryable
            )
            VALUES (%s, 'TRANSPORT_ERROR', %s, %s, 'DELIVERY', true)
          """,
          (retry_transaction_id, error_code, safe_message),
        )
        cursor.execute(
          """
            UPDATE integration_retry_attempts
            SET status = 'FAILED',
                error_code = %s,
                safe_message = %s,
                completed_at = now()
            WHERE id = %s
          """,
          (error_code, safe_message, retry_attempt_id),
        )

  def get_summary(self, *, hours: int, now: datetime) -> dict[str, object]:
    since = now - timedelta(hours=hours)
    with self.connection.cursor(row_factory=dict_row) as cursor:
      cursor.execute(
        """
          SELECT
            count(*)::int as total,
            count(*) FILTER (WHERE processing_status = 'SUCCEEDED')::int as succeeded,
            count(*) FILTER (WHERE processing_status = 'FAILED')::int as failed,
            count(*) FILTER (WHERE processing_status in ('RECEIVED', 'PROCESSING'))::int as processing
          FROM integration_transactions
          WHERE created_at >= %s
        """,
        (since,),
      )
      counts = cursor.fetchone()
      cursor.execute(
        """
          SELECT
            count(*) FILTER (WHERE resolved = false)::int as unresolved,
            count(*) FILTER (WHERE resolved = false AND retryable = true)::int as retryable_unresolved
          FROM integration_errors
          WHERE created_at >= %s
        """,
        (since,),
      )
      error_counts = cursor.fetchone()
      cursor.execute(
        """
          SELECT category, count(*)::int as count
          FROM integration_errors
          WHERE created_at >= %s
          GROUP BY category
          ORDER BY category
        """,
        (since,),
      )
      by_category = {row['category']: row['count'] for row in cursor.fetchall()}
      cursor.execute(
        """
          SELECT document_type, count(*)::int as count
          FROM integration_transactions
          WHERE created_at >= %s
          GROUP BY document_type
          ORDER BY document_type
        """,
        (since,),
      )
      by_document = {row['document_type']: row['count'] for row in cursor.fetchall()}
    return {
      'hours': hours,
      'generated_at': now,
      'transactions_total': counts['total'],
      'transactions_succeeded': counts['succeeded'],
      'transactions_failed': counts['failed'],
      'transactions_processing': counts['processing'],
      'unresolved_errors': error_counts['unresolved'],
      'retryable_unresolved_errors': error_counts['retryable_unresolved'],
      'by_error_category': by_category,
      'by_document_type': by_document,
    }

  def _transaction_summary_query(self, where_sql: str) -> str:
    return f"""
      SELECT
        t.id, t.correlation_id, t.partner_id, p.partner_code, p.name as partner_name,
        t.direction, t.transport, t.message_format, t.document_type, t.business_identifier,
        t.x12_version, t.interchange_control_number, t.group_control_number,
        t.transaction_control_number, t.processing_status, t.processing_stage,
        t.retry_count, t.parent_transaction_id, t.replay_of_transaction_id, t.received_at, t.processed_at,
        t.created_at, t.updated_at, count(e.id)::int as error_count
      FROM integration_transactions t
      JOIN trading_partners p ON p.id = t.partner_id
      LEFT JOIN integration_errors e ON e.transaction_id = t.id
      {where_sql}
      GROUP BY t.id, p.partner_code, p.name
      ORDER BY t.created_at DESC, t.id DESC
      LIMIT %s OFFSET %s
    """

  def _transaction_filters(self, filters: dict[str, object]) -> tuple[str, list[object]]:
    clauses: list[str] = []
    params: list[object] = []
    columns = {
      'business_identifier': 't.business_identifier',
      'correlation_id': 't.correlation_id',
      'partner_code': 'p.partner_code',
      'direction': 't.direction',
      'transport': 't.transport',
      'message_format': 't.message_format',
      'document_type': 't.document_type',
      'processing_status': 't.processing_status',
      'processing_stage': 't.processing_stage',
    }
    for key, value in filters.items():
      if value is None:
        continue
      clauses.append(f'{columns[key]} = %s')
      params.append(value)
    return ('WHERE ' + ' AND '.join(clauses), params) if clauses else ('', params)

  def _error_filters(self, filters: dict[str, object]) -> tuple[str, list[object]]:
    clauses: list[str] = []
    params: list[object] = []
    columns = {
      'resolved': 'e.resolved',
      'retryable': 'e.retryable',
      'category': 'e.category',
      'error_code': 'e.error_code',
      'stage': 'e.stage',
      'partner_code': 'p.partner_code',
      'business_identifier': 't.business_identifier',
      'document_type': 't.document_type',
    }
    for key, value in filters.items():
      if value is None:
        continue
      clauses.append(f'{columns[key]} = %s')
      params.append(value)
    return ('WHERE ' + ' AND '.join(clauses), params) if clauses else ('', params)

  def _fetch_transaction_summary(self, transaction_id: UUID | None) -> dict[str, object] | None:
    if transaction_id is None:
      return None
    with self.connection.cursor(row_factory=dict_row) as cursor:
      cursor.execute(self._transaction_summary_query('WHERE t.id = %s'), (transaction_id, 1, 0))
      row = cursor.fetchone()
    return self._transaction_summary(row) if row else None

  def _fetch_child_summaries(self, transaction_id: UUID) -> list[dict[str, object]]:
    with self.connection.cursor(row_factory=dict_row) as cursor:
      cursor.execute(self._transaction_summary_query('WHERE t.parent_transaction_id = %s'), (transaction_id, 100, 0))
      return [self._transaction_summary(row) for row in cursor.fetchall()]

  def _fetch_retry_attempts(self, transaction_id: UUID) -> list[dict[str, object]]:
    with self.connection.cursor(row_factory=dict_row) as cursor:
      cursor.execute(
        """
          SELECT
            id,
            original_transaction_id,
            retry_transaction_id,
            attempt_number,
            status,
            note,
            delivery_disposition,
            error_code,
            safe_message,
            created_at,
            completed_at
          FROM integration_retry_attempts
          WHERE original_transaction_id = %s
             OR retry_transaction_id = %s
          ORDER BY attempt_number, created_at
        """,
        (transaction_id, transaction_id),
      )
      return [dict(row) for row in cursor.fetchall()]

  def _fetch_transaction_detail_row(self, transaction_id: UUID) -> dict[str, object] | None:
    with self.connection.cursor(row_factory=dict_row) as cursor:
      cursor.execute(
        """
          SELECT
            t.*, p.partner_code, p.name as partner_name, count(e.id)::int as error_count
          FROM integration_transactions t
          JOIN trading_partners p ON p.id = t.partner_id
          LEFT JOIN integration_errors e ON e.transaction_id = t.id
          WHERE t.id = %s
          GROUP BY t.id, p.partner_code, p.name
        """,
        (transaction_id,),
      )
      return cursor.fetchone()

  def _fetch_logs(self, transaction_id: UUID) -> list[dict[str, object]]:
    with self.connection.cursor(row_factory=dict_row) as cursor:
      cursor.execute(
        """
          SELECT id, transaction_id, stage, status, message, metadata, created_at
          FROM processing_logs
          WHERE transaction_id = %s
          ORDER BY created_at, id
        """,
        (transaction_id,),
      )
      return [dict(row) for row in cursor.fetchall()]

  def _fetch_errors_for_transaction(self, transaction_id: UUID) -> list[dict[str, object]]:
    with self.connection.cursor(row_factory=dict_row) as cursor:
      cursor.execute(
        """
          SELECT
            e.id, e.transaction_id, e.category, e.error_code, e.safe_message,
            e.stage, e.retryable, e.resolved, e.resolution_note, e.resolved_by_transaction_id, e.created_at, e.resolved_at,
            t.business_identifier, t.document_type, t.correlation_id,
            p.partner_code
          FROM integration_errors e
          JOIN integration_transactions t ON t.id = e.transaction_id
          JOIN trading_partners p ON p.id = t.partner_id
          WHERE e.transaction_id = %s
          ORDER BY e.created_at, e.id
        """,
        (transaction_id,),
      )
      return [self._error_view(row) for row in cursor.fetchall()]

  def _fetch_error(self, error_id: UUID) -> dict[str, object] | None:
    with self.connection.cursor(row_factory=dict_row) as cursor:
      cursor.execute(
        """
          SELECT
            e.id, e.transaction_id, e.category, e.error_code, e.safe_message,
            e.stage, e.retryable, e.resolved, e.resolution_note, e.resolved_by_transaction_id, e.created_at, e.resolved_at,
            t.business_identifier, t.document_type, t.correlation_id,
            p.partner_code
          FROM integration_errors e
          JOIN integration_transactions t ON t.id = e.transaction_id
          JOIN trading_partners p ON p.id = t.partner_id
          WHERE e.id = %s
        """,
        (error_id,),
      )
      row = cursor.fetchone()
    return self._error_view(row) if row else None

  def _transaction_summary(self, row: dict[str, object]) -> dict[str, object]:
    return {
      'id': row['id'],
      'correlation_id': row['correlation_id'],
      'partner_code': row['partner_code'],
      'partner_name': row['partner_name'],
      'direction': row['direction'],
      'transport': row['transport'],
      'message_format': row['message_format'],
      'document_type': row['document_type'],
      'business_identifier': row['business_identifier'],
      'x12_version': row['x12_version'],
      'interchange_control_number': row['interchange_control_number'],
      'group_control_number': row['group_control_number'],
      'transaction_control_number': row['transaction_control_number'],
      'processing_status': row['processing_status'],
      'processing_stage': row['processing_stage'],
      'retry_count': row['retry_count'],
      'parent_transaction_id': row['parent_transaction_id'],
      'replay_of_transaction_id': row.get('replay_of_transaction_id'),
      'received_at': row['received_at'],
      'processed_at': row['processed_at'],
      'created_at': row['created_at'],
      'updated_at': row['updated_at'],
      'error_count': row['error_count'],
    }

  def _transaction_detail(self, row: dict[str, object]) -> dict[str, object]:
    return {
      **self._transaction_summary(row),
      'partner': {
        'id': row['partner_id'],
        'partner_code': row['partner_code'],
        'partner_name': row['partner_name'],
      },
      'payload_hash': row['payload_hash'],
      'raw_payload_location': sanitize_raw_payload_location(row['raw_payload_location']),
    }

  def _error_view(self, row: dict[str, object]) -> dict[str, object]:
    return {
      'id': row['id'],
      'transaction_id': row['transaction_id'],
      'business_identifier': row['business_identifier'],
      'partner_code': row['partner_code'],
      'document_type': row['document_type'],
      'category': row['category'],
      'error_code': row['error_code'],
      'safe_message': row['safe_message'],
      'stage': row['stage'],
      'retryable': row['retryable'],
      'resolved': row['resolved'],
      'resolution_note': row['resolution_note'],
      'resolved_by_transaction_id': row.get('resolved_by_transaction_id'),
      'created_at': row['created_at'],
      'resolved_at': row['resolved_at'],
      'correlation_id': row['correlation_id'],
    }

  def _retryable_original(self, original: dict[str, object], error: dict[str, object] | None) -> bool:
    if error is None:
      return False
    return (
      original['processing_status'] == 'FAILED'
      and original['direction'] == 'OUTBOUND'
      and original['transport'] == 'SFTP'
      and original['message_format'] == 'X12'
      and original['document_type'] == '204'
    )


def sanitize_raw_payload_location(value: object) -> str | None:
  if not isinstance(value, str):
    return None
  if value.startswith(SAFE_RAW_PAYLOAD_PREFIXES):
    return value
  return None
