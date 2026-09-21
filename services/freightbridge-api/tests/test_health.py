import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings, get_settings
from app.main import app
from app.main import create_app


client = TestClient(app)


@pytest.fixture(autouse=True)
def clear_settings_cache() -> None:
  get_settings.cache_clear()
  yield
  get_settings.cache_clear()


def test_health_endpoint_returns_service_status() -> None:
  response = client.get('/health')

  assert response.status_code == 200
  assert response.json() == {
    'status': 'ok',
    'service': 'freightbridge-api',
  }


def test_readiness_endpoint_returns_ready_when_database_is_available(monkeypatch) -> None:
  monkeypatch.setenv('APP_ENV', 'test')
  monkeypatch.setattr(
    'app.api.routes.readiness.check_database_connectivity',
    lambda: None,
  )
  monkeypatch.setattr(
    'app.api.routes.readiness.check_domain_schema',
    lambda: None,
  )

  response = client.get('/readiness')

  assert response.status_code == 200
  assert response.json() == {
    'status': 'ready',
    'service': 'freightbridge-api',
    'environment': 'test',
    'dependencies': {
      'configuration': 'ok',
      'database': 'ok',
      'domain_schema': 'ok',
    },
  }


def test_readiness_endpoint_returns_503_when_database_is_unavailable(monkeypatch) -> None:
  from app.infrastructure.database import DatabaseConnectivityError

  def fail_database_check() -> None:
    raise DatabaseConnectivityError('sanitized failure')

  monkeypatch.setattr(
    'app.api.routes.readiness.check_database_connectivity',
    fail_database_check,
  )

  response = client.get('/readiness')

  assert response.status_code == 503
  assert response.json() == {
    'detail': {
      'status': 'not_ready',
      'service': 'freightbridge-api',
      'dependencies': {
        'configuration': 'ok',
        'database': 'error',
      },
    },
  }


def test_readiness_endpoint_returns_503_when_domain_schema_is_unavailable(monkeypatch) -> None:
  from app.infrastructure.database import DomainSchemaUnavailableError

  def fail_schema_check() -> None:
    raise DomainSchemaUnavailableError('schema unavailable')

  monkeypatch.setattr(
    'app.api.routes.readiness.check_database_connectivity',
    lambda: None,
  )
  monkeypatch.setattr(
    'app.api.routes.readiness.check_domain_schema',
    fail_schema_check,
  )

  response = client.get('/readiness')

  assert response.status_code == 503
  assert response.json() == {
    'detail': {
      'status': 'not_ready',
      'service': 'freightbridge-api',
      'dependencies': {
        'configuration': 'ok',
        'database': 'ok',
        'domain_schema': 'error',
      },
    },
  }


def test_readiness_response_does_not_include_secrets(monkeypatch) -> None:
  monkeypatch.setenv('SUPABASE_SECRET_KEY', 'test-secret-value')
  monkeypatch.setenv('DATABASE_URL', 'sensitive-database-url')
  monkeypatch.setattr(
    'app.api.routes.readiness.check_database_connectivity',
    lambda: None,
  )
  monkeypatch.setattr(
    'app.api.routes.readiness.check_domain_schema',
    lambda: None,
  )

  response_text = client.get('/readiness').text

  assert 'test-secret-value' not in response_text
  assert 'sensitive-database-url' not in response_text


def test_configured_origin_receives_cors_headers() -> None:
  test_app = create_app(
    Settings(
      app_env='test',
      allowed_origins_raw='https://analyst.example.com',
      _env_file=None,
    )
  )
  test_client = TestClient(test_app)

  response = test_client.options(
    '/health',
    headers={
      'Origin': 'https://analyst.example.com',
      'Access-Control-Request-Method': 'GET',
    },
  )

  assert response.status_code == 200
  assert response.headers['access-control-allow-origin'] == 'https://analyst.example.com'


def test_unapproved_origin_does_not_receive_cors_allow_origin_header() -> None:
  test_app = create_app(
    Settings(
      app_env='test',
      allowed_origins_raw='https://analyst.example.com',
      _env_file=None,
    )
  )
  test_client = TestClient(test_app)

  response = test_client.options(
    '/health',
    headers={
      'Origin': 'https://unknown.example.com',
      'Access-Control-Request-Method': 'GET',
    },
  )

  assert 'access-control-allow-origin' not in response.headers


def test_supabase_key_settings_prefer_new_names(monkeypatch) -> None:
  monkeypatch.setenv('SUPABASE_PUBLISHABLE_KEY', 'publishable-key')
  monkeypatch.setenv('SUPABASE_SECRET_KEY', 'secret-key')
  monkeypatch.setenv('SUPABASE_ANON_KEY', 'legacy-anon-key')
  monkeypatch.setenv('SUPABASE_SERVICE_ROLE_KEY', 'legacy-service-key')

  settings = Settings(_env_file=None)

  assert settings.supabase_publishable_key == 'publishable-key'
  assert settings.supabase_secret_key == 'secret-key'


def test_supabase_key_settings_fall_back_to_legacy_names(monkeypatch) -> None:
  monkeypatch.delenv('SUPABASE_PUBLISHABLE_KEY', raising=False)
  monkeypatch.delenv('SUPABASE_SECRET_KEY', raising=False)
  monkeypatch.setenv('SUPABASE_ANON_KEY', 'legacy-anon-key')
  monkeypatch.setenv('SUPABASE_SERVICE_ROLE_KEY', 'legacy-service-key')

  settings = Settings(_env_file=None)

  assert settings.supabase_publishable_key == 'legacy-anon-key'
  assert settings.supabase_secret_key == 'legacy-service-key'
