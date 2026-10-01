from dataclasses import dataclass

import httpx

from app.core.config import get_settings


class SupabaseAuthError(RuntimeError):
  def __init__(self, message: str, *, status_code: int = 401, code: str = 'AUTHENTICATION_ERROR'):
    super().__init__(message)
    self.message = message
    self.status_code = status_code
    self.code = code


class SupabaseAuthUnavailableError(SupabaseAuthError):
  def __init__(self, message: str = 'Account service is temporarily unavailable.'):
    super().__init__(message, status_code=503, code='DEPENDENCY_ERROR')


@dataclass(frozen=True)
class AuthenticatedLearner:
  id: str
  email: str


class SupabaseAuthClient:
  def __init__(self, *, base_url: str | None = None, api_key: str | None = None):
    settings = get_settings()
    self.base_url = (base_url or settings.supabase_url or '').rstrip('/')
    self.api_key = api_key or settings.supabase_publishable_key or ''

  def _configured(self) -> None:
    if not self.base_url or not self.api_key:
      raise SupabaseAuthUnavailableError('Learner accounts are not configured.')

  def _request(
    self,
    method: str,
    path: str,
    *,
    token: str | None = None,
    json: dict[str, object] | None = None,
  ) -> dict[str, object]:
    self._configured()
    headers = {
      'apikey': self.api_key,
      'Accept': 'application/json',
    }
    if token:
      headers['Authorization'] = f'Bearer {token}'

    try:
      response = httpx.request(
        method,
        f'{self.base_url}{path}',
        headers=headers,
        json=json,
        timeout=12.0,
      )
    except httpx.HTTPError as exc:
      raise SupabaseAuthUnavailableError() from exc

    if response.is_error:
      try:
        payload = response.json()
      except ValueError:
        payload = {}
      message = (
        payload.get('msg')
        or payload.get('message')
        or payload.get('error_description')
        or 'Account request was rejected.'
      )
      code = payload.get('error_code') or payload.get('code') or 'AUTHENTICATION_ERROR'
      status_code = response.status_code if response.status_code >= 400 else 401
      raise SupabaseAuthError(str(message), status_code=status_code, code=str(code))

    try:
      payload = response.json()
    except ValueError as exc:
      raise SupabaseAuthUnavailableError('Account service returned an invalid response.') from exc

    if not isinstance(payload, dict):
      raise SupabaseAuthUnavailableError('Account service returned an invalid response.')
    return payload

  def sign_up(self, email: str, password: str) -> dict[str, object]:
    return self._request('POST', '/auth/v1/signup', json={'email': email, 'password': password})

  def sign_in(self, email: str, password: str) -> dict[str, object]:
    return self._request(
      'POST',
      '/auth/v1/token?grant_type=password',
      json={'email': email, 'password': password},
    )

  def refresh(self, refresh_token: str) -> dict[str, object]:
    return self._request(
      'POST',
      '/auth/v1/token?grant_type=refresh_token',
      json={'refresh_token': refresh_token},
    )

  def get_user(self, access_token: str) -> AuthenticatedLearner:
    payload = self._request('GET', '/auth/v1/user', token=access_token)
    user_id = payload.get('id')
    email = payload.get('email')
    if not isinstance(user_id, str) or not isinstance(email, str):
      raise SupabaseAuthError('Account session is invalid.')
    return AuthenticatedLearner(id=user_id, email=email)
