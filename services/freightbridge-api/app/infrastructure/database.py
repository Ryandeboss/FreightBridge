import psycopg
from psycopg.rows import dict_row

from app.core.config import get_settings

REQUIRED_DOMAIN_TABLES = (
  'trading_partners',
  'shipments',
  'shipment_stops',
  'shipment_references',
  'tender_responses',
  'shipment_events',
  'integration_transactions',
  'functional_acknowledgments',
  'processing_logs',
  'integration_errors',
)


class DatabaseConnectivityError(RuntimeError):
  """Raised when the configured PostgreSQL database cannot be reached."""


class DomainSchemaUnavailableError(RuntimeError):
  """Raised when required FreightBridge domain tables are not available."""


def connect() -> psycopg.Connection:
  settings = get_settings()

  if not settings.database_url:
    raise DatabaseConnectivityError('Database URL is not configured.')

  try:
    return psycopg.connect(settings.database_url, autocommit=True, connect_timeout=5)
  except psycopg.Error as exc:
    raise DatabaseConnectivityError('Database connection failed.') from exc


def check_database_connectivity() -> None:
  try:
    with connect() as connection:
      with connection.cursor() as cursor:
        cursor.execute('SELECT 1;')
        cursor.fetchone()
  except psycopg.Error as exc:
    raise DatabaseConnectivityError('Database readiness check failed.') from exc


def check_domain_schema() -> None:
  query = """
    SELECT table_name
    FROM unnest(%s::text[]) AS required(table_name)
    WHERE to_regclass('public.' || quote_ident(table_name)) IS NOT NULL;
  """

  try:
    with connect() as connection:
      with connection.cursor(row_factory=dict_row) as cursor:
        cursor.execute(query, (list(REQUIRED_DOMAIN_TABLES),))
        found_tables = {row['table_name'] for row in cursor.fetchall()}
  except DatabaseConnectivityError:
    raise
  except psycopg.Error as exc:
    raise DomainSchemaUnavailableError('Domain schema readiness check failed.') from exc

  missing_tables = set(REQUIRED_DOMAIN_TABLES) - found_tables
  if missing_tables:
    raise DomainSchemaUnavailableError('Required domain schema objects are missing.')
