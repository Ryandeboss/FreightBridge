from app.core.config import get_settings
from app.infrastructure import database


def test_connect_uses_autocommit(monkeypatch) -> None:
  captured: dict[str, object] = {}

  class FakeConnection:
    pass

  def fake_connect(database_url: str, **kwargs):
    captured['database_url'] = database_url
    captured.update(kwargs)
    return FakeConnection()

  monkeypatch.setenv('DATABASE_URL', 'sensitive-database-url')
  get_settings.cache_clear()
  monkeypatch.setattr(database.psycopg, 'connect', fake_connect)

  connection = database.connect()

  assert isinstance(connection, FakeConnection)
  assert captured['database_url'] == 'sensitive-database-url'
  assert captured['autocommit'] is True
  assert captured['connect_timeout'] == 5
