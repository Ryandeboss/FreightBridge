from datetime import datetime, timezone

from fastapi import APIRouter, Depends, status

from app.api.dependencies import get_load_repository
from app.core.security import require_write_access
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
