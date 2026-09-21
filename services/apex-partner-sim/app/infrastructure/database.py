import psycopg
from psycopg.rows import dict_row

from app.core.config import get_settings


REQUIRED_APEX_TABLES: tuple[str, ...] = (
  'loads',
  'load_locations',
  'load_references',
  'tender_responses',
  'shipment_statuses',
)


class DatabaseConnectivityError(RuntimeError):
  pass


class ApexSchemaUnavailableError(RuntimeError):
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


def check_apex_schema() -> None:
  try:
    with connect() as connection:
      with connection.cursor() as cursor:
        cursor.execute(
          """
          select table_name
          from unnest(%s::text[]) as required(table_name)
          where to_regclass('apex_sim.' || quote_ident(table_name)) is not null
          """,
          (list(REQUIRED_APEX_TABLES),),
        )
        available_tables = {row['table_name'] for row in cursor.fetchall()}
  except DatabaseConnectivityError:
    raise
  except psycopg.Error as exc:
    raise ApexSchemaUnavailableError('Apex simulator schema check failed') from exc

  missing_tables = set(REQUIRED_APEX_TABLES) - available_tables
  if missing_tables:
    raise ApexSchemaUnavailableError('Apex simulator schema is incomplete')
