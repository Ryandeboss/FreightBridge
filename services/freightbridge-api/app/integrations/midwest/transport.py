from dataclasses import dataclass

import httpx

from app.core.config import get_settings
from app.domain import ErrorCategory, ProcessingStage
from app.integrations.midwest.models import Midwest204GenerationResult


@dataclass(frozen=True)
class MidwestDeliveryResult:
  status: str
  status_code: int
  response_body: dict[str, object]


@dataclass
class MidwestDeliveryError(Exception):
  status_code: int
  code: str
  message: str
  category: ErrorCategory
  stage: ProcessingStage = ProcessingStage.DELIVERY
  retryable: bool = False
  response_body: dict[str, object] | None = None


class MidwestOutboundTransport:
  transport_name = 'REST_TEST_HARNESS'

  def deliver_204(
    self,
    *,
    generated: Midwest204GenerationResult,
    correlation_id: str,
  ) -> MidwestDeliveryResult:
    raise NotImplementedError


class MidwestHttpTestTransport(MidwestOutboundTransport):
  transport_name = 'REST_TEST_HARNESS'

  def __init__(
    self,
    *,
    base_url: str | None = None,
    bearer_token: str | None = None,
    timeout_seconds: float = 10.0,
  ) -> None:
    settings = get_settings()
    self.base_url = base_url or settings.midwest_sim_base_url
    self.bearer_token = bearer_token or settings.midwest_sim_bearer_token
    self.timeout_seconds = timeout_seconds

  def deliver_204(
    self,
    *,
    generated: Midwest204GenerationResult,
    correlation_id: str,
  ) -> MidwestDeliveryResult:
    if not self.base_url or not self.bearer_token:
      raise MidwestDeliveryError(
        status_code=503,
        code='DEPENDENCY_ERROR',
        message='Midwest simulator dispatch configuration is incomplete.',
        category=ErrorCategory.DOWNSTREAM_ERROR,
        retryable=True,
      )

    try:
      response = httpx.post(
        self.base_url.rstrip('/') + '/v1/edi/inbound/204',
        content=generated.serialized_x12.encode('utf-8'),
        headers={
          'Authorization': f'Bearer {self.bearer_token}',
          'Content-Type': 'application/edi-x12',
          'X-Correlation-ID': correlation_id,
        },
        timeout=self.timeout_seconds,
      )
    except (httpx.TimeoutException, httpx.HTTPError) as exc:
      raise MidwestDeliveryError(
        status_code=503,
        code='DEPENDENCY_ERROR',
        message='Midwest simulator could not be reached.',
        category=ErrorCategory.DOWNSTREAM_ERROR,
        retryable=True,
      ) from exc

    body = _safe_json(response)
    if response.status_code == 202:
      return MidwestDeliveryResult(
        status='ACCEPTED',
        status_code=response.status_code,
        response_body=body,
      )
    if response.status_code == 409:
      raise MidwestDeliveryError(
        status_code=409,
        code='DUPLICATE_LOAD',
        message='Midwest simulator already has this load.',
        category=ErrorCategory.DUPLICATE_TRANSACTION,
        response_body=body,
      )
    if response.status_code in (401, 403):
      raise MidwestDeliveryError(
        status_code=503,
        code='DEPENDENCY_ERROR',
        message='Midwest simulator rejected FreightBridge authentication.',
        category=ErrorCategory.AUTHENTICATION_ERROR,
        response_body=body,
      )
    if response.status_code == 422:
      raise MidwestDeliveryError(
        status_code=422,
        code='MIDWEST_REJECTED_X12',
        message='Midwest simulator rejected the generated X12 204.',
        category=ErrorCategory.BUSINESS_VALIDATION_ERROR,
        response_body=body,
      )

    raise MidwestDeliveryError(
      status_code=503,
      code='DEPENDENCY_ERROR',
      message='Midwest simulator returned an unexpected response.',
      category=ErrorCategory.DOWNSTREAM_ERROR,
      retryable=True,
      response_body=body,
    )


def _safe_json(response: httpx.Response) -> dict[str, object]:
  try:
    body = response.json()
    return body if isinstance(body, dict) else {'body': body}
  except ValueError:
    return {'status': 'UNKNOWN'}
