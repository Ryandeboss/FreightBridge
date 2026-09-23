from uuid import UUID

from fastapi import APIRouter, Depends, status

from app.api.dependencies import get_load_repository
from app.core.security import require_read_access, require_write_access
from app.models.errors import ErrorCode, MidwestAPIError
from app.models.shipment_event import (
  MidwestShipmentEventRead,
  MidwestShipmentEventRequest,
  MidwestShipmentEventResponse,
)
from app.repositories.loads import (
  LoadNotFoundError,
  MidwestLoadRepository,
  ShipmentEventNotAllowedError,
)
from app.services.sftp_transport import MidwestSftpShipmentStatusDispatchService

router = APIRouter(prefix='/v1', tags=['shipment events'])


@router.post(
  '/loads/{customer_shipment_number}/shipment-events',
  response_model=MidwestShipmentEventResponse,
  response_model_by_alias=True,
  dependencies=[Depends(require_write_access)],
)
def create_shipment_event(
  customer_shipment_number: str,
  event: MidwestShipmentEventRequest,
  repository: MidwestLoadRepository = Depends(get_load_repository),
) -> MidwestShipmentEventResponse:
  try:
    result = repository.create_shipment_event(customer_shipment_number, event)
  except LoadNotFoundError as exc:
    raise MidwestAPIError(
      status.HTTP_404_NOT_FOUND,
      ErrorCode.LOAD_NOT_FOUND,
      f'Load {customer_shipment_number} was not found.',
    ) from exc
  except ShipmentEventNotAllowedError as exc:
    raise MidwestAPIError(
      status.HTTP_409_CONFLICT,
      ErrorCode.BUSINESS_VALIDATION_ERROR,
      f'Load {customer_shipment_number} must be ACCEPTED before shipment events can be created.',
    ) from exc

  return MidwestShipmentEventResponse(
    eventId=result['event_id'],
    customerShipmentNumber=result['customer_shipment_number'],
    status=result['status'],
    at7Code=result['at7_code'],
    statusDescription=result['status_description'],
    occurredAt=result['occurred_at'],
    city=result['city'],
    state=result['state'],
    outboundDocumentId=result['outbound_document_id'],
  )


@router.get(
  '/loads/{customer_shipment_number}/shipment-events',
  dependencies=[Depends(require_read_access)],
)
def list_shipment_events(
  customer_shipment_number: str,
  repository: MidwestLoadRepository = Depends(get_load_repository),
) -> dict[str, object]:
  events = repository.fetch_shipment_events(customer_shipment_number)
  if events is None:
    raise MidwestAPIError(
      status.HTTP_404_NOT_FOUND,
      ErrorCode.LOAD_NOT_FOUND,
      f'Load {customer_shipment_number} was not found.',
    )
  return {
    'customerShipmentNumber': customer_shipment_number,
    'events': [
      MidwestShipmentEventRead(
        eventId=event['id'],
        status=event['status'],
        at7Code=event['at7_code'],
        statusDescription=event['status_description'],
        occurredAt=event['occurred_at'],
        city=event['city'],
        state=event['state'],
        createdAt=event['created_at'],
      ).model_dump(by_alias=True, mode='json')
      for event in events
    ],
  }


@router.post(
  '/loads/{customer_shipment_number}/shipment-events/{event_id}/dispatch-sftp',
  status_code=status.HTTP_202_ACCEPTED,
  dependencies=[Depends(require_write_access)],
)
def dispatch_shipment_event_sftp(
  customer_shipment_number: str,
  event_id: UUID,
  repository: MidwestLoadRepository = Depends(get_load_repository),
) -> dict[str, object]:
  try:
    result = MidwestSftpShipmentStatusDispatchService(repository=repository).dispatch(
      customer_shipment_number,
      event_id,
    )
  except Exception as exc:
    raise MidwestAPIError(
      status.HTTP_503_SERVICE_UNAVAILABLE,
      ErrorCode.DEPENDENCY_ERROR,
      'Midwest 214 SFTP dispatch failed.',
    ) from exc
  if result is None:
    raise MidwestAPIError(
      status.HTTP_404_NOT_FOUND,
      ErrorCode.SHIPMENT_EVENT_NOT_FOUND,
      f'No Midwest 214 is available for {customer_shipment_number} event {event_id}.',
    )
  return result
