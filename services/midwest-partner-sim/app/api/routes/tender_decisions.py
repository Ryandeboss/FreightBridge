from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, Request, status

from app.api.dependencies import get_load_repository
from app.core.config import get_settings
from app.core.security import require_write_access
from app.models.errors import ErrorCode, MidwestAPIError
from app.models.tender import MidwestTenderDecisionRequest, MidwestTenderDecisionResponse
from app.repositories.loads import (
  LoadNotFoundError,
  MidwestLoadRepository,
  TenderAlreadyDecidedError,
)

router = APIRouter(prefix='/v1', tags=['tender decisions'])


@router.post(
  '/loads/{customer_shipment_number}/tender-decisions',
  response_model=MidwestTenderDecisionResponse,
  response_model_by_alias=True,
  dependencies=[Depends(require_write_access)],
)
def create_tender_decision(
  customer_shipment_number: str,
  decision: MidwestTenderDecisionRequest,
  repository: MidwestLoadRepository = Depends(get_load_repository),
) -> MidwestTenderDecisionResponse:
  try:
    result = repository.create_tender_decision(customer_shipment_number, decision)
  except LoadNotFoundError as exc:
    raise MidwestAPIError(
      status.HTTP_404_NOT_FOUND,
      ErrorCode.LOAD_NOT_FOUND,
      f'Load {customer_shipment_number} was not found.',
    ) from exc
  except TenderAlreadyDecidedError as exc:
    raise MidwestAPIError(
      status.HTTP_409_CONFLICT,
      ErrorCode.TENDER_ALREADY_DECIDED,
      f'Load {customer_shipment_number} already has a final tender decision.',
    ) from exc

  return MidwestTenderDecisionResponse(
    customerShipmentNumber=result['customer_shipment_number'],
    decision=result['decision'],
    carrierLoadNumber=result['carrier_load_number'],
    reasonCode=result['reason_code'],
    message=result['message'],
    decidedAt=result['decided_at'],
    outboundDocumentId=str(result['outbound_document_id']),
  )


@router.post(
  '/loads/{customer_shipment_number}/tender-response/dispatch-direct',
  status_code=status.HTTP_202_ACCEPTED,
  dependencies=[Depends(require_write_access)],
)
def dispatch_tender_response_direct(
  customer_shipment_number: str,
  request: Request,
  repository: MidwestLoadRepository = Depends(get_load_repository),
) -> dict[str, object]:
  outbound = repository.fetch_outbound_990(customer_shipment_number)
  if outbound is None:
    raise MidwestAPIError(
      status.HTTP_404_NOT_FOUND,
      ErrorCode.TENDER_DECISION_NOT_FOUND,
      f'No Midwest 990 is available for {customer_shipment_number}.',
    )

  settings = get_settings()
  if not settings.freightbridge_api_base_url or not settings.freightbridge_midwest_bearer_token:
    raise MidwestAPIError(
      status.HTTP_503_SERVICE_UNAVAILABLE,
      ErrorCode.DEPENDENCY_ERROR,
      'FreightBridge 990 dispatch configuration is incomplete.',
    )

  repository.mark_outbound_delivering(outbound['id'])
  try:
    response = httpx.post(
      settings.freightbridge_api_base_url.rstrip('/') + '/api/integrations/midwest/tender-responses',
      content=outbound['raw_x12'].encode('utf-8'),
      headers={
        'Authorization': f'Bearer {settings.freightbridge_midwest_bearer_token}',
        'Content-Type': 'application/edi-x12',
        'X-Correlation-ID': getattr(request.state, 'correlation_id', 'midwest-direct'),
      },
      timeout=10.0,
    )
  except (httpx.TimeoutException, httpx.HTTPError) as exc:
    repository.mark_outbound_failed(outbound['id'], 'DEPENDENCY_ERROR', 'FreightBridge could not be reached.')
    raise MidwestAPIError(
      status.HTTP_503_SERVICE_UNAVAILABLE,
      ErrorCode.DEPENDENCY_ERROR,
      'FreightBridge could not be reached.',
    ) from exc

  body = _safe_json(response)
  if response.status_code == status.HTTP_202_ACCEPTED:
    repository.mark_outbound_delivered(outbound['id'])
    return {
      'status': 'DELIVERED_TO_FREIGHTBRIDGE_TEST_GATEWAY',
      'transport': 'REST_TEST_HARNESS',
      'customerShipmentNumber': customer_shipment_number,
      'documentType': '990',
      'freightbridge': body,
      'deliveredAt': datetime.now(timezone.utc).isoformat(),
    }

  repository.mark_outbound_failed(outbound['id'], 'FREIGHTBRIDGE_REJECTED_990', 'FreightBridge rejected the 990.')
  raise MidwestAPIError(
    status.HTTP_503_SERVICE_UNAVAILABLE if response.status_code >= 500 else response.status_code,
    ErrorCode.DEPENDENCY_ERROR,
    'FreightBridge rejected the Midwest 990.',
  )


def _safe_json(response: httpx.Response) -> dict[str, object]:
  try:
    body = response.json()
    return body if isinstance(body, dict) else {'body': body}
  except ValueError:
    return {'status': 'UNKNOWN'}
