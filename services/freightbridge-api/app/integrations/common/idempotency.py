from __future__ import annotations

import hashlib
import json
import re
from typing import Any


IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key'
MAX_IDEMPOTENCY_KEY_LENGTH = 120
_SAFE_KEY_PATTERN = re.compile(r'^[\x20-\x7E]+$')


class IdempotencyKeyError(ValueError):
  pass


def normalize_idempotency_key(value: str | None) -> str | None:
  if value is None:
    return None
  key = value.strip()
  if not key:
    raise IdempotencyKeyError('Idempotency-Key must not be empty.')
  if len(key) > MAX_IDEMPOTENCY_KEY_LENGTH:
    raise IdempotencyKeyError('Idempotency-Key is too long.')
  if _SAFE_KEY_PATTERN.fullmatch(key) is None:
    raise IdempotencyKeyError('Idempotency-Key contains unsupported characters.')
  return key


def semantic_fingerprint(value: Any) -> str:
  normalized = json.dumps(value, sort_keys=True, separators=(',', ':'), default=str)
  return hashlib.sha256(normalized.encode('utf-8')).hexdigest()
