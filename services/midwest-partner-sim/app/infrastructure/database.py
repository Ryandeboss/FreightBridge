import psycopg
from psycopg.rows import dict_row

from app.core.config import get_settings


REQUIRED_MIDWEST_TABLES: tuple[str, ...] = (
  'loads',
  'inbound_edi_documents',
  'tender_decisions',
  'outbound_edi_documents',
)


class DatabaseConnectivityError(RuntimeError):
  pass


class MidwestSchemaUnavailableError(RuntimeError):
  pass


def connect() -> psycopg.Connection:
  settings = get_settings()
  if not settings.database_url:
    raise DatabaseConnectivityError('DATABASE_URL is not configured')
  try:
    return psycopg.connect(settings.database_url, autocommit=True, row_factory=dict_row)
  except psycopg.Error as exc:
    raise DatabaseConnectivityError('Database connectivity check failed') from exc


def check_database_connectivity() -> None:
  try:
    with connect() as connection:
      with connection.cursor() as cursor:
        cursor.execute('select 1')
        cursor.fetchone()
  except DatabaseConnectivityError:
    raise
  except psycopg.Error as exc:
    raise DatabaseConnectivityError('Database connectivity check failed') from exc


def check_midwest_schema() -> None:
  try:
    with connect() as connection:
      with connection.cursor() as cursor:
        cursor.execute(
          """
          select table_name
          from unnest(%s::text[]) as required(table_name)
          where to_regclass('midwest_sim.' || quote_ident(table_name)) is not null
          """,
          (list(REQUIRED_MIDWEST_TABLES),),
        )
        available_tables = {row['table_name'] for row in cursor.fetchall()}
  except DatabaseConnectivityError:
    raise
  except psycopg.Error as exc:
    raise MidwestSchemaUnavailableError('Midwest simulator schema check failed') from exc

  missing_tables = set(REQUIRED_MIDWEST_TABLES) - available_tables
  if missing_tables:
    raise MidwestSchemaUnavailableError('Midwest simulator schema is incomplete')
