from datetime import datetime, timezone

from fastapi import APIRouter, Depends, status

from app.api.dependencies import get_load_repository
from app.core.security import require_read_access, require_write_access
from app.models.errors import ApexAPIError, ErrorCode
from app.models.tender import ApexTenderResponse
from app.repositories.loads import ApexLoadRepository

router = APIRouter(prefix='/v1', tags=['tender responses'])


@router.post(
  '/tender-responses',
  status_code=status.HTTP_202_ACCEPTED,
  dependencies=[Depends(require_write_access)],
)
def receive_tender_response(
  tender_response: ApexTenderResponse,
  repository: ApexLoadRepository = Depends(get_load_repository),
) -> dict[str, str]:
  event_id = repository.record_tender_response(tender_response)
  if event_id is None:
    raise ApexAPIError(
      status.HTTP_404_NOT_FOUND,
      ErrorCode.LOAD_NOT_FOUND,
      f'Load {tender_response.load_id} was not found.',
    )

  return {
    'eventId': str(event_id),
    'status': 'ACCEPTED',
    'acceptedAt': datetime.now(timezone.utc).isoformat(),
  }


@router.get(
  '/loads/{load_id}/tender-status',
  dependencies=[Depends(require_read_access)],
)
def get_tender_status(
  load_id: str,
  repository: ApexLoadRepository = Depends(get_load_repository),
) -> dict[str, object]:
  tender_status = repository.fetch_tender_status(load_id)
  if tender_status is None:
    raise ApexAPIError(
      status.HTTP_404_NOT_FOUND,
      ErrorCode.LOAD_NOT_FOUND,
      f'Load {load_id} was not found.',
    )

  return tender_status
