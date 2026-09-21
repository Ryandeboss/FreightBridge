from uuid import uuid4
import re


CORRELATION_HEADER = 'X-Correlation-ID'
CORRELATION_PATTERN = re.compile(r'^[A-Za-z0-9._:-]{1,80}$')


def resolve_correlation_id(candidate: str | None) -> str:
  if candidate and CORRELATION_PATTERN.fullmatch(candidate):
    return candidate
  return f'fb-{uuid4()}'
