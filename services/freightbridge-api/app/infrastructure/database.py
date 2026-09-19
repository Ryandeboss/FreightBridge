import psycopg

from app.core.config import get_settings


class DatabaseConnectivityError(RuntimeError):
  """Raised when the configured PostgreSQL database cannot be reached."""


def check_database_connectivity() -> None:
  settings = get_settings()

  if not settings.database_url:
    raise DatabaseConnectivityError('Database URL is not configured.')

  try:
    with psycopg.connect(settings.database_url, connect_timeout=5) as connection:
      with connection.cursor() as cursor:
        cursor.execute('SELECT 1;')
        cursor.fetchone()
  except psycopg.Error as exc:
    raise DatabaseConnectivityError('Database readiness check failed.') from exc
