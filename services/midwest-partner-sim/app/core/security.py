import secrets
from dataclasses import dataclass

from fastapi import Depends, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import get_settings
from app.models.errors import ErrorCode, MidwestAPIError


bearer_scheme = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class AuthenticatedToken:
  readonly: bool


def _matches_configured_token(candidate: str, configured: str | None) -> bool:
  if not configured:
    return False
  return secrets.compare_digest(candidate, configured)


def authenticate_token(
  credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> AuthenticatedToken:
  settings = get_settings()
  if credentials is None or credentials.scheme.lower() != 'bearer':
    raise MidwestAPIError(
      status.HTTP_401_UNAUTHORIZED,
      ErrorCode.AUTHENTICATION_ERROR,
      'Missing bearer token.',
    )

  token = credentials.credentials
  if _matches_configured_token(token, settings.midwest_api_bearer_token):
    return AuthenticatedToken(readonly=False)
  if _matches_configured_token(token, settings.midwest_api_readonly_token):
    return AuthenticatedToken(readonly=True)

  raise MidwestAPIError(
    status.HTTP_401_UNAUTHORIZED,
    ErrorCode.AUTHENTICATION_ERROR,
    'Invalid bearer token.',
  )


def require_read_access(
  authenticated: AuthenticatedToken = Depends(authenticate_token),
) -> AuthenticatedToken:
  return authenticated


def require_write_access(
  request: Request,
  authenticated: AuthenticatedToken = Depends(authenticate_token),
) -> AuthenticatedToken:
  if authenticated.readonly:
    raise MidwestAPIError(
      status.HTTP_403_FORBIDDEN,
      ErrorCode.AUTHORIZATION_ERROR,
      f'Read-only token is not authorized to call {request.method} {request.url.path}.',
    )
  return authenticated
