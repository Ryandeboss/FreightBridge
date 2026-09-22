from fastapi import APIRouter, Depends, Request, status

from app.api.dependencies import get_load_repository
from app.core.security import require_write_access
from app.models.errors import MidwestAPIError
from app.repositories.loads import MidwestLoadRepository
from app.services.inbound_204 import Midwest204ReceiveFailure, Midwest204ReceiveService

router = APIRouter(prefix='/v1/edi', tags=['edi'])


@router.post(
  '/inbound/204',
  status_code=status.HTTP_202_ACCEPTED,
  dependencies=[Depends(require_write_access)],
)
async def receive_204(
  request: Request,
  repository: MidwestLoadRepository = Depends(get_load_repository),
) -> dict[str, object]:
  raw_body = await request.body()
  try:
    result = Midwest204ReceiveService(repository).process(raw_body=raw_body)
  except Midwest204ReceiveFailure as exc:
    raise MidwestAPIError(exc.status_code, exc.code, exc.message) from exc

  return result.response_body()
