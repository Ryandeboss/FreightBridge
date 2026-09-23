from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
import json
import os
import random
import re
import string
import time
from typing import Any, Callable
from uuid import uuid4

import httpx


SECRET_NAME_PATTERN = re.compile(r'(AUTHORIZATION|TOKEN|SECRET|PASSWORD|PRIVATE|DATABASE_URL|KEY)', re.IGNORECASE)


class AcceptanceFailure(Exception):
  def __init__(
    self,
    step: str,
    message: str,
    *,
    status_code: int | None = None,
    response_body: object | None = None,
    correlation_id: str | None = None,
  ) -> None:
    super().__init__(message)
    self.step = step
    self.message = message
    self.status_code = status_code
    self.response_body = response_body
    self.correlation_id = correlation_id

  def format(self) -> str:
    parts = [f'step={self.step}', f'message={self.message}']
    if self.status_code is not None:
      parts.append(f'http_status={self.status_code}')
    if self.correlation_id:
      parts.append(f'correlation_id={self.correlation_id}')
    if self.response_body is not None:
      parts.append(f'response={safe_body(self.response_body)}')
    return '; '.join(parts)


@dataclass(frozen=True)
class AcceptanceConfig:
  apex_base_url: str
  apex_bearer_token: str
  freightbridge_base_url: str
  midwest_base_url: str
  midwest_bearer_token: str
  apex_readonly_token: str | None = None
  midwest_readonly_token: str | None = None
  database_url: str | None = None

  @classmethod
  def from_env(cls) -> 'AcceptanceConfig':
    required = [
      'APEX_BASE_URL',
      'APEX_BEARER_TOKEN',
      'FREIGHTBRIDGE_BASE_URL',
      'MIDWEST_BASE_URL',
      'MIDWEST_BEARER_TOKEN',
    ]
    missing = [name for name in required if not os.environ.get(name)]
    if missing:
      raise AcceptanceFailure(
        'Load configuration',
        'Missing required environment variables: ' + ', '.join(missing),
      )

    return cls(
      apex_base_url=os.environ['APEX_BASE_URL'].rstrip('/'),
      apex_bearer_token=os.environ['APEX_BEARER_TOKEN'],
      apex_readonly_token=os.environ.get('APEX_READONLY_TOKEN') or os.environ['APEX_BEARER_TOKEN'],
      freightbridge_base_url=os.environ['FREIGHTBRIDGE_BASE_URL'].rstrip('/'),
      midwest_base_url=os.environ['MIDWEST_BASE_URL'].rstrip('/'),
      midwest_bearer_token=os.environ['MIDWEST_BEARER_TOKEN'],
      midwest_readonly_token=os.environ.get('MIDWEST_READONLY_TOKEN') or os.environ['MIDWEST_BEARER_TOKEN'],
      database_url=os.environ.get('DATABASE_URL'),
    )


@dataclass
class StepRecorder:
  keep_going: bool = False
  verbose: bool = False
  failures: list[AcceptanceFailure] = field(default_factory=list)

  def pass_step(self, name: str, detail: str | None = None) -> None:
    suffix = f' - {detail}' if detail else ''
    print(f'[PASS] {name}{suffix}')

  def skip_step(self, name: str, detail: str) -> None:
    print(f'[SKIP] {name} - {detail}')

  def fail_step(self, failure: AcceptanceFailure) -> None:
    self.failures.append(failure)
    print(f'[FAIL] {failure.step}')
    print(f'       {failure.format()}')
    if not self.keep_going:
      raise failure

  def run(self, name: str, action: Callable[[], Any], detail: Callable[[Any], str | None] | None = None) -> Any:
    try:
      result = action()
    except AcceptanceFailure as exc:
      if exc.step == 'unknown':
        exc.step = name
      self.fail_step(exc)
      return None
    except Exception as exc:
      self.fail_step(AcceptanceFailure(name, str(exc)))
      return None

    self.pass_step(name, detail(result) if detail else None)
    return result

  def finish(self) -> int:
    if self.failures:
      print('')
      print('RESULT: FAIL')
      return 1
    print('')
    print('RESULT: PASS')
    return 0


class SafeHttpClient:
  def __init__(
    self,
    *,
    name: str,
    base_url: str,
    timeout_seconds: float = 20.0,
    safe_retries: int = 8,
    retry_backoff_seconds: float = 2.0,
    verbose: bool = False,
  ) -> None:
    self.name = name
    self.base_url = base_url.rstrip('/')
    self.safe_retries = safe_retries
    self.retry_backoff_seconds = retry_backoff_seconds
    self.verbose = verbose
    self.client = httpx.Client(timeout=httpx.Timeout(timeout_seconds))

  def close(self) -> None:
    self.client.close()

  def get(
    self,
    path: str,
    *,
    token: str | None = None,
    expected: tuple[int, ...] = (200,),
    step: str,
    correlation_id: str | None = None,
    retry: bool = True,
  ) -> dict[str, Any]:
    return self._request(
      'GET',
      path,
      token=token,
      expected=expected,
      step=step,
      correlation_id=correlation_id,
      retry=retry,
    )

  def post_json(
    self,
    path: str,
    payload: dict[str, Any],
    *,
    token: str | None = None,
    expected: tuple[int, ...] = (200, 202),
    step: str,
    correlation_id: str | None = None,
  ) -> dict[str, Any]:
    return self._request(
      'POST',
      path,
      token=token,
      json_payload=payload,
      expected=expected,
      step=step,
      correlation_id=correlation_id,
      retry=False,
    )

  def post_empty(
    self,
    path: str,
    *,
    token: str | None = None,
    expected: tuple[int, ...] = (200, 202),
    step: str,
    correlation_id: str | None = None,
  ) -> dict[str, Any]:
    return self._request(
      'POST',
      path,
      token=token,
      expected=expected,
      step=step,
      correlation_id=correlation_id,
      retry=False,
    )

  def _request(
    self,
    method: str,
    path: str,
    *,
    token: str | None,
    expected: tuple[int, ...],
    step: str,
    correlation_id: str | None,
    retry: bool,
    json_payload: dict[str, Any] | None = None,
  ) -> dict[str, Any]:
    url = self.base_url + '/' + path.lstrip('/')
    headers = {'Accept': 'application/json'}
    if token:
      headers['Authorization'] = f'Bearer {token}'
    if correlation_id:
      headers['X-Correlation-ID'] = correlation_id
    if json_payload is not None:
      headers['Content-Type'] = 'application/json'

    attempts = self.safe_retries if retry else 1
    last_error: Exception | None = None
    for attempt in range(1, attempts + 1):
      try:
        if self.verbose:
          print(f'       {method} {redact_url(url)} attempt={attempt}')
        response = self.client.request(method, url, headers=headers, json=json_payload)
      except (httpx.TimeoutException, httpx.ConnectError, httpx.TransportError) as exc:
        last_error = exc
        if attempt < attempts:
          time.sleep(self.retry_backoff_seconds * attempt)
          continue
        raise AcceptanceFailure(
          step,
          f'{self.name} request failed: {type(exc).__name__}',
          correlation_id=correlation_id,
        ) from exc

      body = response_to_body(response)
      if response.status_code in expected:
        return body if isinstance(body, dict) else {'body': body}

      if retry and response.status_code in (502, 503, 504) and attempt < attempts:
        time.sleep(self.retry_backoff_seconds * attempt)
        continue

      raise AcceptanceFailure(
        step,
        f'{self.name} returned an unexpected response.',
        status_code=response.status_code,
        response_body=body,
        correlation_id=correlation_id or response.headers.get('X-Correlation-ID'),
      )

    raise AcceptanceFailure(step, f'{self.name} request failed: {last_error}', correlation_id=correlation_id)


def generate_load_id(now: datetime | None = None) -> str:
  now = now or datetime.now(UTC)
  suffix = ''.join(random.choice(string.ascii_uppercase + string.digits) for _ in range(4))
  return f'LOAD{now:%m%d%H%M%S}{suffix}'


def load_numeric_suffix(load_id: str) -> str:
  digits = ''.join(ch for ch in load_id if ch.isdigit())
  if not digits:
    return '900'
  return digits[-6:].lstrip('0') or '900'


def correlation_id(load_id: str, step: str) -> str:
  slug = re.sub(r'[^A-Za-z0-9]+', '-', step).strip('-').lower()[:32]
  return f'fb-acceptance-{load_id}-{slug}-{uuid4()}'


def response_to_body(response: httpx.Response) -> object:
  try:
    return response.json()
  except ValueError:
    text = response.text
    return text[:1000] if len(text) > 1000 else text


def safe_body(body: object) -> str:
  try:
    rendered = json.dumps(redact_value(body), sort_keys=True)
  except TypeError:
    rendered = str(redact_value(body))
  return rendered[:2000]


def redact_value(value: object) -> object:
  if isinstance(value, dict):
    redacted = {}
    for key, item in value.items():
      if SECRET_NAME_PATTERN.search(str(key)):
        redacted[key] = '<redacted>'
      else:
        redacted[key] = redact_value(item)
    return redacted
  if isinstance(value, list):
    return [redact_value(item) for item in value]
  if isinstance(value, str) and value.startswith(('postgres://', 'postgresql://')):
    return '<redacted-database-url>'
  return value


def redact_url(url: str) -> str:
  return re.sub(r'(token|key|password|secret)=([^&]+)', r'\1=<redacted>', url, flags=re.IGNORECASE)


def require_field(body: dict[str, Any], field_name: str, step: str) -> Any:
  if field_name not in body or body[field_name] is None:
    raise AcceptanceFailure(step, f'Missing response field: {field_name}', response_body=body)
  return body[field_name]


def assert_equal(actual: object, expected: object, step: str, label: str) -> None:
  if actual != expected:
    raise AcceptanceFailure(step, f'{label}: expected {expected!r}, got {actual!r}')


def assert_truth(condition: bool, step: str, message: str) -> None:
  if not condition:
    raise AcceptanceFailure(step, message)


def parse_instant(value: str) -> datetime:
  normalized = value.replace('Z', '+00:00')
  parsed = datetime.fromisoformat(normalized)
  if parsed.tzinfo is None:
    parsed = parsed.replace(tzinfo=UTC)
  return parsed.astimezone(UTC)


def assert_same_instant(actual: str, expected: str, step: str, label: str) -> None:
  if parse_instant(actual) != parse_instant(expected):
    raise AcceptanceFailure(step, f'{label}: expected {expected}, got {actual}')


def find_processed_file(poll_body: dict[str, Any], *, file_name: str, expected_status: str, step: str) -> dict[str, Any]:
  processed = poll_body.get('processed')
  if not isinstance(processed, list):
    raise AcceptanceFailure(step, 'Poll response did not include processed files.', response_body=poll_body)
  for item in processed:
    if isinstance(item, dict) and item.get('fileName') == file_name:
      assert_equal(item.get('status'), expected_status, step, f'{file_name} poll status')
      return item
  raise AcceptanceFailure(step, f'Poll response did not include {file_name}.', response_body=poll_body)


def assert_archive_path(item: dict[str, Any], step: str) -> None:
  destination = item.get('destinationPath')
  assert_truth(isinstance(destination, str) and destination.startswith('/archive/'), step, 'File was not archived.')


def print_required_env() -> None:
  print('Required environment variables:')
  for name in (
    'APEX_BASE_URL',
    'APEX_BEARER_TOKEN',
    'FREIGHTBRIDGE_BASE_URL',
    'MIDWEST_BASE_URL',
    'MIDWEST_BEARER_TOKEN',
  ):
    print(f'  {name}')
  print('Optional environment variables:')
  for name in ('APEX_READONLY_TOKEN', 'MIDWEST_READONLY_TOKEN', 'DATABASE_URL'):
    print(f'  {name}')
