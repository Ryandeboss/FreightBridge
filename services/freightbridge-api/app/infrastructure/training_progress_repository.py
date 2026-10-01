from uuid import UUID

from psycopg import Connection
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb


class TrainingProgressRepository:
  def __init__(self, connection: Connection):
    self.connection = connection

  def get(self, user_id: UUID) -> dict[str, object] | None:
    with self.connection.cursor(row_factory=dict_row) as cursor:
      cursor.execute(
        """
          SELECT user_id, progress_snapshot, created_at, updated_at
          FROM public.learner_course_progress
          WHERE user_id = %s
        """,
        (user_id,),
      )
      row = cursor.fetchone()
      return dict(row) if row else None

  def upsert(self, user_id: UUID, snapshot: dict[str, str]) -> dict[str, object]:
    with self.connection.cursor(row_factory=dict_row) as cursor:
      cursor.execute(
        """
          INSERT INTO public.learner_course_progress (
            user_id, progress_snapshot
          )
          VALUES (%s, %s)
          ON CONFLICT (user_id) DO UPDATE
          SET
            progress_snapshot = EXCLUDED.progress_snapshot,
            updated_at = now()
          RETURNING user_id, progress_snapshot, created_at, updated_at
        """,
        (user_id, Jsonb(snapshot)),
      )
      return dict(cursor.fetchone())
