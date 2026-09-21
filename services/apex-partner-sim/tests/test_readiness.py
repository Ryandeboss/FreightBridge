from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import app


client = TestClient(app)


def test_readiness_returns_ready_when_database_and_schema_are_available(monkeypatch) -> None:
  monkeypatch.setenv('APP_ENV', 'test')
  get_settings.cache_clear()
  monkeypatch.setattr('app.api.routes.readiness.check_database_connectivity', lambda: None)
  monkeypatch.setattr('app.api.routes.readiness.check_apex_schema', lambda: None)

  response = client.get('/readiness')

  assert response.status_code == 200
  assert response.json() == {
    'status': 'ready',
    'service': 'apex-partner-sim',
    'environment': 'test',
    'dependencies': {
      'database': 'ok',
      'apex_schema': 'ok',
    },
  }


def test_readiness_returns_503_when_database_is_unavailable(monkeypatch) -> None:
  from app.infrastructure.database import DatabaseConnectivityError

  def fail_database_check() -> None:
    raise DatabaseConnectivityError('safe failure')

  monkeypatch.setattr('app.api.routes.readiness.check_database_connectivity', fail_database_check)

  response = client.get('/readiness')

  assert response.status_code == 503
  assert response.json()['detail']['dependencies'] == {'database': 'error'}


def test_readiness_returns_503_when_schema_is_missing(monkeypatch) -> None:
  from app.infrastructure.database import ApexSchemaUnavailableError

  def fail_schema_check() -> None:
    raise ApexSchemaUnavailableError('safe failure')

  monkeypatch.setattr('app.api.routes.readiness.check_database_connectivity', lambda: None)
  monkeypatch.setattr('app.api.routes.readiness.check_apex_schema', fail_schema_check)

  response = client.get('/readiness')

  assert response.status_code == 503
  assert response.json()['detail']['dependencies'] == {
    'database': 'ok',
    'apex_schema': 'error',
  }


def test_readiness_does_not_return_secrets(monkeypatch) -> None:
  monkeypatch.setenv('DATABASE_URL', 'sensitive-database-url')
  get_settings.cache_clear()
  monkeypatch.setattr('app.api.routes.readiness.check_database_connectivity', lambda: None)
  monkeypatch.setattr('app.api.routes.readiness.check_apex_schema', lambda: None)

  response = client.get('/readiness')

  assert 'sensitive-database-url' not in response.text
