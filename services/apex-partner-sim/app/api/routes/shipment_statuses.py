from datetime import datetime, timezone

from fastapi import APIRouter, Depends, status

from app.api.dependencies import get_load_repository
from app.core.security import require_write_access
from app.models.errors import ApexAPIError, ErrorCode
from app.models.status import ApexShipmentStatus
from app.repositories.loads import ApexLoadRepository

router = APIRouter(prefix='/v1', tags=['shipment statuses'])


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
