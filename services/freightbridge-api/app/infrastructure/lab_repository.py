from uuid import UUID

from psycopg import Connection
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb


class IntegrationLabRepository:
  def __init__(self, connection: Connection):
    self.connection = connection

  def create_run(
    self,
    *,
    scenario_key: str,
    business_identifier: str,
    input_snapshot: dict[str, object],
    steps: list[dict[str, object]],
  ) -> dict[str, object]:
    with self.connection.transaction():
      with self.connection.cursor(row_factory=dict_row) as cursor:
        cursor.execute(
          """
            INSERT INTO integration_lab_runs (
              scenario_key, business_identifier, input_snapshot
            )
            VALUES (%s, %s, %s)
            RETURNING *
          """,
          (scenario_key, business_identifier, Jsonb(input_snapshot)),
        )
        run = dict(cursor.fetchone())
        for step in steps:
          cursor.execute(
            """
              INSERT INTO integration_lab_steps (
                run_id, step_key, sequence, display_name, sender, receiver,
                transport, message_format, document_type
              )
              VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
              run['id'],
              step['step_key'],
              step['sequence'],
              step['display_name'],
              step['sender'],
              step['receiver'],
              step['transport'],
              step['message_format'],
              step['document_type'],
            ),
          )
    return self.get_run(run['id']) or run

  def list_runs(
    self,
    *,
    scenario_key: str | None = None,
    status: str | None = None,
    business_identifier: str | None = None,
    limit: int = 25,
    offset: int = 0,
  ) -> dict[str, object]:
    clauses: list[str] = []
    params: list[object] = []
    if scenario_key:
      clauses.append('scenario_key = %s')
      params.append(scenario_key)
    if status:
      clauses.append('status = %s')
      params.append(status)
    if business_identifier:
      clauses.append('business_identifier = %s')
      params.append(business_identifier)
    where_sql = 'WHERE ' + ' AND '.join(clauses) if clauses else ''
    with self.connection.cursor(row_factory=dict_row) as cursor:
      cursor.execute(
        f"""
          SELECT *
          FROM integration_lab_runs
          {where_sql}
          ORDER BY created_at DESC, id DESC
          LIMIT %s OFFSET %s
        """,
        tuple(params + [limit, offset]),
      )
      runs = [self._run(row, include_steps=False) for row in cursor.fetchall()]
    return {'limit': limit, 'offset': offset, 'count': len(runs), 'runs': runs}

  def get_run(self, run_id: UUID) -> dict[str, object] | None:
    with self.connection.cursor(row_factory=dict_row) as cursor:
      cursor.execute('SELECT * FROM integration_lab_runs WHERE id = %s', (run_id,))
      row = cursor.fetchone()
      if row is None:
        return None
      run = self._run(row, include_steps=False)
      cursor.execute(
        """
          SELECT *
          FROM integration_lab_steps
          WHERE run_id = %s
          ORDER BY sequence
        """,
        (run_id,),
      )
      run['steps'] = [self._step(step) for step in cursor.fetchall()]
      return run

  def get_step(self, run_id: UUID, step_key: str) -> dict[str, object] | None:
    with self.connection.cursor(row_factory=dict_row) as cursor:
      cursor.execute(
        """
          SELECT *
          FROM integration_lab_steps
          WHERE run_id = %s AND step_key = %s
        """,
        (run_id, step_key),
      )
      row = cursor.fetchone()
    return self._step(row) if row else None

  def acquire_step(self, run_id: UUID, step_key: str) -> dict[str, object] | None:
    with self.connection.transaction():
      with self.connection.cursor(row_factory=dict_row) as cursor:
        cursor.execute('SELECT * FROM integration_lab_runs WHERE id = %s FOR UPDATE', (run_id,))
        run = cursor.fetchone()
        if run is None:
          return None
        cursor.execute(
          """
            SELECT *
            FROM integration_lab_steps
            WHERE run_id = %s AND step_key = %s
            FOR UPDATE
          """,
          (run_id, step_key),
        )
        step = cursor.fetchone()
        if step is None:
          return None
        if step['status'] == 'SUCCEEDED':
          return self._step(step)
        cursor.execute(
          """
            UPDATE integration_lab_steps
            SET status = 'RUNNING',
                attempt_count = attempt_count + 1,
                error_code = null,
                safe_message = null,
                started_at = coalesce(started_at, now()),
                completed_at = null,
                updated_at = now()
            WHERE id = %s
            RETURNING *
          """,
          (step['id'],),
        )
        updated = cursor.fetchone()
        cursor.execute(
          """
            UPDATE integration_lab_runs
            SET status = 'RUNNING',
                started_at = coalesce(started_at, now()),
                completed_at = null,
                updated_at = now()
            WHERE id = %s
          """,
          (run_id,),
        )
    return self._step(updated)

  def mark_step_succeeded(
    self,
    *,
    step_id: UUID,
    request_summary: dict[str, object] | None = None,
    response_summary: dict[str, object] | None = None,
    related_transaction_ids: list[str] | None = None,
  ) -> None:
    with self.connection.cursor() as cursor:
      cursor.execute(
        """
          UPDATE integration_lab_steps
          SET status = 'SUCCEEDED',
              request_summary = %s,
              response_summary = %s,
              related_transaction_ids = %s,
              error_code = null,
              safe_message = null,
              completed_at = now(),
              updated_at = now()
          WHERE id = %s
        """,
        (
          Jsonb(request_summary or {}),
          Jsonb(response_summary or {}),
          Jsonb(related_transaction_ids or []),
          step_id,
        ),
      )

  def mark_step_failed(self, *, step_id: UUID, error_code: str, safe_message: str) -> None:
    with self.connection.transaction():
      with self.connection.cursor() as cursor:
        cursor.execute(
          """
            UPDATE integration_lab_steps
            SET status = 'FAILED',
                error_code = %s,
                safe_message = %s,
                completed_at = now(),
                updated_at = now()
            WHERE id = %s
          """,
          (error_code, safe_message, step_id),
        )
        cursor.execute(
          """
            UPDATE integration_lab_runs r
            SET status = 'FAILED',
                result_summary = jsonb_set(
                  coalesce(r.result_summary, '{}'::jsonb),
                  '{lastError}',
                  %s::jsonb,
                  true
                ),
                completed_at = now(),
                updated_at = now()
            FROM integration_lab_steps s
            WHERE s.id = %s AND r.id = s.run_id
          """,
          (Jsonb({'errorCode': error_code, 'safeMessage': safe_message}), step_id),
        )

  def update_run_summary(self, run_id: UUID, result_summary: dict[str, object], *, status: str | None = None) -> None:
    if status is None:
      with self.connection.cursor() as cursor:
        cursor.execute(
          """
            UPDATE integration_lab_runs
            SET result_summary = %s,
                updated_at = now()
            WHERE id = %s
          """,
          (Jsonb(result_summary), run_id),
        )
      return
    with self.connection.cursor() as cursor:
      cursor.execute(
        """
          UPDATE integration_lab_runs
          SET status = %s,
              result_summary = %s,
              completed_at = CASE WHEN %s in ('SUCCEEDED', 'FAILED') THEN now() ELSE completed_at END,
              updated_at = now()
          WHERE id = %s
        """,
        (status, Jsonb(result_summary), status, run_id),
      )

  def next_executable_step(self, run_id: UUID) -> dict[str, object] | None:
    run = self.get_run(run_id)
    if run is None:
      return None
    steps = run['steps']
    succeeded = {step['step_key'] for step in steps if step['status'] == 'SUCCEEDED'}
    for step in steps:
      if step['status'] not in ('PENDING', 'FAILED'):
        continue
      prior = [candidate['step_key'] for candidate in steps if candidate['sequence'] < step['sequence']]
      if all(key in succeeded for key in prior):
        return step
    return None

  def mark_run_if_complete(self, run_id: UUID, result_summary: dict[str, object]) -> None:
    run = self.get_run(run_id)
    if run is None:
      return
    if all(step['status'] == 'SUCCEEDED' for step in run['steps']):
      self.update_run_summary(run_id, result_summary, status='SUCCEEDED')
    else:
      self.update_run_summary(run_id, result_summary)

  def _run(self, row: dict[str, object], *, include_steps: bool) -> dict[str, object]:
    return {
      'id': row['id'],
      'scenario_key': row['scenario_key'],
      'business_identifier': row['business_identifier'],
      'status': row['status'],
      'input_snapshot': dict(row['input_snapshot'] or {}),
      'result_summary': dict(row['result_summary'] or {}),
      'created_at': row['created_at'],
      'updated_at': row['updated_at'],
      'started_at': row['started_at'],
      'completed_at': row['completed_at'],
      'steps': [] if include_steps else [],
    }

  def _step(self, row: dict[str, object]) -> dict[str, object]:
    return {
      'id': row['id'],
      'run_id': row['run_id'],
      'step_key': row['step_key'],
      'sequence': row['sequence'],
      'display_name': row['display_name'],
      'sender': row['sender'],
      'receiver': row['receiver'],
      'transport': row['transport'],
      'message_format': row['message_format'],
      'document_type': row['document_type'],
      'status': row['status'],
      'attempt_count': row['attempt_count'],
      'request_summary': dict(row['request_summary'] or {}),
      'response_summary': dict(row['response_summary'] or {}),
      'related_transaction_ids': [str(value) for value in row['related_transaction_ids'] or []],
      'error_code': row['error_code'],
      'safe_message': row['safe_message'],
      'created_at': row['created_at'],
      'updated_at': row['updated_at'],
      'started_at': row['started_at'],
      'completed_at': row['completed_at'],
    }
