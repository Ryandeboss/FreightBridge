from dataclasses import dataclass
import json

import httpx

from app.core.config import get_settings
from app.domain import ShipmentEvent


@dataclass(frozen=True)
class ApexShipmentStatusDeliveryResult:
  status: str
  response_body: dict[str, object]


class ApexShipmentStatusDeliveryError(Exception):
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


class ApexShipmentStatusClient:
  transport_name = 'APEX_REST_TEST_HARNESS'

  def deliver_shipment_status(
    self,
    *,
    shipment_number: str,
    event: ShipmentEvent,
    status_description: str | None = None,
  ) -> ApexShipmentStatusDeliveryResult:
    settings = get_settings()
    if not settings.apex_sim_base_url or not settings.apex_sim_bearer_token:
      raise ApexShipmentStatusDeliveryError(
        status_code=503,
        code='DEPENDENCY_ERROR',
        message='Apex shipment-status dispatch configuration is incomplete.',
      )

    payload = apex_shipment_status_payload(
      shipment_number=shipment_number,
      event=event,
      status_description=status_description,
    )
    try:
      http_response = httpx.post(
        settings.apex_sim_base_url.rstrip('/') + '/v1/shipment-statuses',
        content=json.dumps(payload).encode('utf-8'),
        headers={
          'Authorization': f'Bearer {settings.apex_sim_bearer_token}',
          'Content-Type': 'application/json',
        },
        timeout=10.0,
      )
    except (httpx.TimeoutException, httpx.HTTPError) as exc:
      raise ApexShipmentStatusDeliveryError(
        status_code=503,
        code='DEPENDENCY_ERROR',
        message='Apex simulator could not be reached.',
      ) from exc

    body = _safe_json(http_response)
    if http_response.status_code == 202:
      return ApexShipmentStatusDeliveryResult(status='DELIVERED_TO_APEX', response_body=body)

    raise ApexShipmentStatusDeliveryError(
      status_code=http_response.status_code,
      code='APEX_REJECTED_SHIPMENT_STATUS',
      message='Apex simulator rejected the shipment status.',
      response_body=body,
    )


def apex_shipment_status_payload(
  *,
  shipment_number: str,
  event: ShipmentEvent,
  status_description: str | None = None,
) -> dict[str, object]:
  payload: dict[str, object] = {
    'loadId': shipment_number,
    'carrierCode': 'MWCX',
    'statusCode': event.status.value,
    'occurredAt': event.occurred_at.isoformat(),
  }
  if status_description:
    payload['statusDescription'] = status_description
  if event.city:
    payload['city'] = event.city
  if event.state:
    payload['state'] = event.state
  return payload


def serialized_apex_shipment_status_payload(
  *,
  shipment_number: str,
  event: ShipmentEvent,
  status_description: str | None = None,
) -> bytes:
  return json.dumps(
    apex_shipment_status_payload(
      shipment_number=shipment_number,
      event=event,
      status_description=status_description,
    ),
    sort_keys=True,
    separators=(',', ':'),
  ).encode('utf-8')


def _safe_json(response: httpx.Response) -> dict[str, object]:
  try:
    body = response.json()
    return body if isinstance(body, dict) else {'body': body}
  except ValueError:
    return {'status': 'UNKNOWN'}
