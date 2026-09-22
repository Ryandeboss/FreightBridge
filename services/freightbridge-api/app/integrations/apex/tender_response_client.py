from dataclasses import dataclass
import json

import httpx

from app.core.config import get_settings
from app.domain import TenderResponse


@dataclass(frozen=True)
class ApexTenderResponseDeliveryResult:
  status: str
  response_body: dict[str, object]


class ApexTenderResponseDeliveryError(Exception):
  def __init__(
    self,
    *,
    status_code: int,
    code: str,
    message: str,
    response_body: dict[str, object] | None = None,
  ) -> None:
    self.status_code = status_code
    self.code = code
    self.message = message
    self.response_body = response_body or {}
    super().__init__(message)


class ApexTenderResponseClient:
  transport_name = 'APEX_REST_TEST_HARNESS'

  def deliver_tender_response(self, *, shipment_number: str, response: TenderResponse) -> ApexTenderResponseDeliveryResult:
    settings = get_settings()
    if not settings.apex_sim_base_url or not settings.apex_sim_bearer_token:
      raise ApexTenderResponseDeliveryError(
        status_code=503,
        code='DEPENDENCY_ERROR',
        message='Apex tender-response dispatch configuration is incomplete.',
      )

    payload = apex_tender_response_payload(shipment_number=shipment_number, response=response)
    try:
      http_response = httpx.post(
        settings.apex_sim_base_url.rstrip('/') + '/v1/tender-responses',
        content=json.dumps(payload).encode('utf-8'),
        headers={
          'Authorization': f'Bearer {settings.apex_sim_bearer_token}',
          'Content-Type': 'application/json',
        },
        timeout=10.0,
      )
    except (httpx.TimeoutException, httpx.HTTPError) as exc:
      raise ApexTenderResponseDeliveryError(
        status_code=503,
        code='DEPENDENCY_ERROR',
        message='Apex simulator could not be reached.',
      ) from exc

    body = _safe_json(http_response)
    if http_response.status_code == 202:
      return ApexTenderResponseDeliveryResult(status='DELIVERED_TO_APEX', response_body=body)

    raise ApexTenderResponseDeliveryError(
      status_code=http_response.status_code,
      code='APEX_REJECTED_TENDER_RESPONSE',
      message='Apex simulator rejected the tender response.',
      response_body=body,
    )


def apex_tender_response_payload(*, shipment_number: str, response: TenderResponse) -> dict[str, object]:
  payload: dict[str, object] = {
    'loadId': shipment_number,
    'decision': response.decision.value,
    'carrierCode': 'MWCX',
    'decidedAt': response.decided_at.isoformat(),
  }
  if response.carrier_load_number:
    payload['carrierLoadNumber'] = response.carrier_load_number
  if response.reason_code:
    payload['reasonCode'] = response.reason_code
  if response.message:
    payload['message'] = response.message
  return payload


def serialized_apex_tender_response_payload(*, shipment_number: str, response: TenderResponse) -> bytes:
  return json.dumps(
    apex_tender_response_payload(shipment_number=shipment_number, response=response),
    sort_keys=True,
    separators=(',', ':'),
  ).encode('utf-8')


def _safe_json(response: httpx.Response) -> dict[str, object]:
  try:
    body = response.json()
    return body if isinstance(body, dict) else {'body': body}
  except ValueError:
    return {'status': 'UNKNOWN'}
