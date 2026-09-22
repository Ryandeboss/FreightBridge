from fastapi import APIRouter, Depends, status

from app.api.dependencies import get_load_repository
from app.core.security import require_read_access, require_write_access
from app.models.errors import ErrorCode, MidwestAPIError
from app.repositories.loads import MidwestLoadRepository
from app.services.sftp_transport import MidwestSftpInboundPollService, MidwestSftpReadinessService

router = APIRouter(prefix='/v1/sftp', tags=['sftp'])


@router.get('/readiness', dependencies=[Depends(require_read_access)])
def sftp_readiness() -> dict[str, object]:
  try:
    return MidwestSftpReadinessService().check()
  except Exception:
    return {
      'status': 'not_ready',
      'transport': 'SFTP',
      'directories': {'inbound': False, 'outbound': False, 'archive': False, 'error': False},
    }


@router.post(
  '/inbound/poll',
  status_code=status.HTTP_202_ACCEPTED,
  dependencies=[Depends(require_write_access)],
)
def poll_inbound_sftp(
  repository: MidwestLoadRepository = Depends(get_load_repository),
) -> dict[str, object]:
  try:
    return MidwestSftpInboundPollService(repository=repository).poll().response_body()
  except Exception as exc:
    raise MidwestAPIError(
      status.HTTP_503_SERVICE_UNAVAILABLE,
      ErrorCode.DEPENDENCY_ERROR,
      'Midwest SFTP inbound poll failed.',
    ) from exc
