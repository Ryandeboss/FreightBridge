from datetime import datetime, timezone

from fastapi import APIRouter, Depends, status

from app.api.dependencies import get_load_repository
from app.core.security import require_read_access, require_write_access
from app.models.errors import ApexAPIError, ErrorCode
from app.models.load import ApexLoad
from app.repositories.loads import ApexLoadRepository

router = APIRouter(prefix='/v1', tags=['loads'])


@router.post(
  '/load-tenders',
  status_code=status.HTTP_202_ACCEPTED,
  dependencies=[Depends(require_write_access)],
)
def create_load_tender(
  load: ApexLoad,
  repository: ApexLoadRepository = Depends(get_load_repository),
) -> dict[str, str]:
  created = repository.create_load(load)
  if not created:
    raise ApexAPIError(
      status.HTTP_409_CONFLICT,
      ErrorCode.DUPLICATE_LOAD,
      f'Load {load.load_id} already exists.',
    )

  return {
    'loadId': load.load_id,
    'status': 'ACCEPTED_FOR_PROCESSING',
    'acceptedAt': datetime.now(timezone.utc).isoformat(),
  }


@router.get(
  '/loads/{load_id}',
  response_model=ApexLoad,
  response_model_by_alias=True,
  dependencies=[Depends(require_read_access)],
)
def get_load(
  load_id: str,
  repository: ApexLoadRepository = Depends(get_load_repository),
) -> ApexLoad:
  load = repository.fetch_load(load_id)
  if load is None:
    raise ApexAPIError(
      status.HTTP_404_NOT_FOUND,
      ErrorCode.LOAD_NOT_FOUND,
      f'Load {load_id} was not found.',
    )
  return load
