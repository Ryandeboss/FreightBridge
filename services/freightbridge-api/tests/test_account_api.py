from datetime import UTC, datetime
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from app.api.routes.account import get_progress_repository, get_supabase_auth_client
from app.integrations.supabase_auth import AuthenticatedLearner, SupabaseAuthError
from app.main import app


USER_ID = UUID('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
ACCESS_TOKEN = 'learner-access-token'
REFRESH_TOKEN = 'learner-refresh-token'


@pytest.fixture(autouse=True)
def account_state():
  app.dependency_overrides.clear()
  yield
  app.dependency_overrides.clear()


def session_payload(email: str = 'learner@example.com') -> dict[str, object]:
  return {
    'access_token': ACCESS_TOKEN,
    'refresh_token': REFRESH_TOKEN,
    'expires_in': 3600,
    'expires_at': 2_000_000_000,
    'token_type': 'bearer',
    'user': {'id': str(USER_ID), 'email': email},
  }


class FakeAuthClient:
  def sign_up(self, email: str, password: str) -> dict[str, object]:
    if email == 'confirm@example.com':
      return {'id': str(USER_ID), 'email': email}
    return session_payload(email)

  def sign_in(self, email: str, password: str) -> dict[str, object]:
    if password == 'wrong-password':
      raise SupabaseAuthError('Invalid login credentials', status_code=400, code='invalid_credentials')
    return session_payload(email)

  def refresh(self, refresh_token: str) -> dict[str, object]:
    if refresh_token != REFRESH_TOKEN:
      raise SupabaseAuthError('Invalid refresh token', status_code=400, code='refresh_token_not_found')
    return session_payload()

  def get_user(self, access_token: str) -> AuthenticatedLearner:
    if access_token != ACCESS_TOKEN:
      raise SupabaseAuthError('Invalid account session.')
    return AuthenticatedLearner(id=str(USER_ID), email='learner@example.com')


class FakeProgressRepository:
  def __init__(self) -> None:
    self.snapshot: dict[str, str] | None = None

  def get(self, user_id: UUID) -> dict[str, object] | None:
    assert user_id == USER_ID
    if self.snapshot is None:
      return None
    return {
      'user_id': USER_ID,
      'progress_snapshot': self.snapshot,
      'created_at': datetime(2026, 10, 1, 20, tzinfo=UTC),
      'updated_at': datetime(2026, 10, 1, 21, tzinfo=UTC),
    }

  def upsert(self, user_id: UUID, snapshot: dict[str, str]) -> dict[str, object]:
    assert user_id == USER_ID
    self.snapshot = dict(snapshot)
    return {
      'user_id': USER_ID,
      'progress_snapshot': self.snapshot,
      'created_at': datetime(2026, 10, 1, 20, tzinfo=UTC),
      'updated_at': datetime(2026, 10, 1, 21, tzinfo=UTC),
    }


def client_with_fakes() -> tuple[TestClient, FakeProgressRepository]:
  repository = FakeProgressRepository()
  app.dependency_overrides[get_supabase_auth_client] = lambda: FakeAuthClient()
  app.dependency_overrides[get_progress_repository] = lambda: repository
  return TestClient(app), repository


def auth_headers() -> dict[str, str]:
  return {'Authorization': f'Bearer {ACCESS_TOKEN}'}


def test_register_can_return_signed_in_session() -> None:
  client, _ = client_with_fakes()

  response = client.post('/api/account/register', json={
    'email': 'learner@example.com',
    'password': 'strong-pass-123',
  })

  assert response.status_code == 200
  assert response.json()['status'] == 'SIGNED_IN'
  assert response.json()['session']['accessToken'] == ACCESS_TOKEN
  assert response.json()['session']['user']['email'] == 'learner@example.com'


def test_register_supports_email_confirmation_flow() -> None:
  client, _ = client_with_fakes()

  response = client.post('/api/account/register', json={
    'email': 'confirm@example.com',
    'password': 'strong-pass-123',
  })

  assert response.status_code == 200
  assert response.json() == {
    'status': 'CONFIRM_EMAIL',
    'session': None,
    'email': 'confirm@example.com',
  }


def test_login_refresh_and_me_return_account_session() -> None:
  client, _ = client_with_fakes()

  login = client.post('/api/account/login', json={
    'email': 'learner@example.com',
    'password': 'strong-pass-123',
  })
  refresh = client.post('/api/account/refresh', json={'refreshToken': REFRESH_TOKEN})
  me = client.get('/api/account/me', headers=auth_headers())

  assert login.status_code == 200
  assert refresh.status_code == 200
  assert login.json()['refreshToken'] == REFRESH_TOKEN
  assert refresh.json()['accessToken'] == ACCESS_TOKEN
  assert me.json() == {'id': str(USER_ID), 'email': 'learner@example.com'}


def test_login_rejects_invalid_credentials() -> None:
  client, _ = client_with_fakes()

  response = client.post('/api/account/login', json={
    'email': 'learner@example.com',
    'password': 'wrong-password',
  })

  assert response.status_code == 400
  assert response.json()['detail']['error']['code'] == 'invalid_credentials'


def test_progress_round_trip_is_scoped_to_authenticated_user() -> None:
  client, repository = client_with_fakes()

  empty = client.get('/api/account/progress', headers=auth_headers())
  saved = client.put('/api/account/progress', headers=auth_headers(), json={
    'snapshot': {
      'freightbridge.learningJourneyStarted': 'true',
      'freightbridge.trainingProgress': '{"version":1,"completedMissions":["LEARN_THE_FLOW"]}',
    }
  })
  loaded = client.get('/api/account/progress', headers=auth_headers())

  assert empty.status_code == 200
  assert empty.json() == {'snapshot': {}, 'updatedAt': None}
  assert saved.status_code == 200
  assert repository.snapshot is not None
  assert loaded.json()['snapshot']['freightbridge.learningJourneyStarted'] == 'true'
  assert 'LEARN_THE_FLOW' in loaded.json()['snapshot']['freightbridge.trainingProgress']


def test_progress_rejects_unknown_browser_keys_and_requires_login() -> None:
  client, _ = client_with_fakes()

  unauthenticated = client.get('/api/account/progress')
  invalid = client.put('/api/account/progress', headers=auth_headers(), json={
    'snapshot': {'freightbridge.secretThing': 'nope'}
  })

  assert unauthenticated.status_code == 401
  assert invalid.status_code == 422
