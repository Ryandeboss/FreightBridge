from datetime import datetime, timezone

from fastapi import APIRouter, Depends, status

from app.api.dependencies import get_load_repository
from app.core.security import require_read_access, require_write_access
from app.models.errors import ApexAPIError, ErrorCode
from app.models.status import ApexShipmentStatus
from app.repositories.loads import ApexLoadRepository

router = APIRouter(prefix='/v1', tags=['shipment statuses'])


@router.get(
  '/loads/{load_id}/shipment-statuses',
  dependencies=[Depends(require_read_access)],
)
def get_shipment_status_history(
  load_id: str,
  repository: ApexLoadRepository = Depends(get_load_repository),
) -> dict[str, object]:
  result = repository.fetch_shipment_status_history(load_id)
  if result is None:
    raise ApexAPIError(
      status.HTTP_404_NOT_FOUND,
      ErrorCode.LOAD_NOT_FOUND,
      f'Load {load_id} was not found.',
    )
  return result


@router.post(
  '/shipment-statuses',
  status_code=status.HTTP_202_ACCEPTED,
  dependencies=[Depends(require_write_access)],
)
def receive_shipment_status(
  shipment_status: ApexShipmentStatus,
  repository: ApexLoadRepository = Depends(get_load_repository),
) -> dict[str, str]:
  event_id = repository.record_shipment_status(shipment_status)
  if event_id is None:
    raise ApexAPIError(
      status.HTTP_404_NOT_FOUND,
      ErrorCode.LOAD_NOT_FOUND,
      f'Load {shipment_status.load_id} was not found.',
    )

  return {
    'eventId': str(event_id),
    'status': 'ACCEPTED',
    'acceptedAt': datetime.now(timezone.utc).isoformat(),
  }
