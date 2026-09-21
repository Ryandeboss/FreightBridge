import secrets

from app.core.config import get_settings


def apex_inbound_token_is_valid(authorization_header: str | None) -> bool:
  settings = get_settings()
  expected_token = settings.apex_inbound_bearer_token
  if not expected_token:
    return False
  if not authorization_header or not authorization_header.startswith('Bearer '):
    return False
  supplied_token = authorization_header.removeprefix('Bearer ').strip()
  return secrets.compare_digest(supplied_token, expected_token)
