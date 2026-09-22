from fastapi import APIRouter, Depends, status

from app.api.dependencies import get_load_repository
from app.core.security import require_read_access
from app.models.errors import ErrorCode, MidwestAPIError
from app.models.load import MidwestLoad
from app.repositories.loads import MidwestLoadRepository

router = APIRouter(prefix='/v1', tags=['loads'])


@router.get(
  '/loads/{customer_shipment_number}',
  response_model=MidwestLoad,
  response_model_by_alias=True,
  dependencies=[Depends(require_read_access)],
)
def get_load(
  customer_shipment_number: str,
  repository: MidwestLoadRepository = Depends(get_load_repository),
) -> MidwestLoad:
  load = repository.fetch_load(customer_shipment_number)
  if load is None:
    raise MidwestAPIError(
      status.HTTP_404_NOT_FOUND,
      ErrorCode.LOAD_NOT_FOUND,
      f'Load {customer_shipment_number} was not found.',
    )
  return load
