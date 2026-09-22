import secrets

from app.core.config import get_settings


def midwest_inbound_token_is_valid(authorization_header: str | None) -> bool:
  if not authorization_header:
    return False
  scheme, _, token = authorization_header.partition(' ')
  settings = get_settings()
  if scheme.lower() != 'bearer' or not token or not settings.midwest_inbound_bearer_token:
    return False
  return secrets.compare_digest(token, settings.midwest_inbound_bearer_token)
