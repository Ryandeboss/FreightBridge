from datetime import datetime, timezone
from uuid import uuid4

import httpx
from fastapi import APIRouter, Depends, Request, status

from app.api.dependencies import get_load_repository
from app.core.config import get_settings
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


@router.post(
  '/load-tenders/{load_id}/dispatch',
  status_code=status.HTTP_202_ACCEPTED,
  dependencies=[Depends(require_write_access)],
)
def dispatch_load_tender(
  load_id: str,
  request: Request,
  repository: ApexLoadRepository = Depends(get_load_repository),
) -> dict[str, object]:
  load = repository.fetch_load(load_id)
  if load is None:
    raise ApexAPIError(
      status.HTTP_404_NOT_FOUND,
      ErrorCode.LOAD_NOT_FOUND,
      f'Load {load_id} was not found.',
    )

  settings = get_settings()
  if not settings.freightbridge_api_base_url or not settings.freightbridge_apex_bearer_token:
    raise ApexAPIError(
      status.HTTP_503_SERVICE_UNAVAILABLE,
      ErrorCode.DEPENDENCY_ERROR,
      'FreightBridge dispatch configuration is incomplete.',
    )

  correlation_id = getattr(request.state, 'correlation_id', f'apex-{uuid4()}')
  url = settings.freightbridge_api_base_url.rstrip('/') + '/api/integrations/apex/load-tenders'
  try:
    response = httpx.post(
      url,
      json=load.model_dump(mode='json', by_alias=True),
      headers={
        'Authorization': f'Bearer {settings.freightbridge_apex_bearer_token}',
        'Content-Type': 'application/json',
        'X-Correlation-ID': correlation_id,
      },
      timeout=10.0,
    )
  except httpx.TimeoutException as exc:
    raise ApexAPIError(
      status.HTTP_503_SERVICE_UNAVAILABLE,
      ErrorCode.DEPENDENCY_ERROR,
      'FreightBridge dispatch did not complete.',
    ) from exc
  except httpx.HTTPError as exc:
    raise ApexAPIError(
      status.HTTP_503_SERVICE_UNAVAILABLE,
      ErrorCode.DEPENDENCY_ERROR,
      'FreightBridge could not be reached.',
    ) from exc

  if response.status_code == status.HTTP_202_ACCEPTED:
    return {
      'loadId': load.load_id,
      'status': 'DISPATCHED',
      'correlationId': correlation_id,
      'freightbridge': _safe_json(response),
    }

  if response.status_code in (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN):
    raise ApexAPIError(
      status.HTTP_503_SERVICE_UNAVAILABLE,
      ErrorCode.DEPENDENCY_ERROR,
      'FreightBridge rejected Apex integration authentication.',
    )
  if response.status_code == status.HTTP_409_CONFLICT:
    raise ApexAPIError(
      status.HTTP_409_CONFLICT,
      ErrorCode.DUPLICATE_LOAD,
      'FreightBridge already has a canonical shipment for this load.',
    )
  if response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY:
    raise ApexAPIError(
      status.HTTP_422_UNPROCESSABLE_ENTITY,
      ErrorCode.BUSINESS_VALIDATION_ERROR,
      'FreightBridge rejected the load tender payload.',
    )

  raise ApexAPIError(
    status.HTTP_503_SERVICE_UNAVAILABLE,
    ErrorCode.DEPENDENCY_ERROR,
    'FreightBridge returned an unexpected integration response.',
  )


def _safe_json(response: httpx.Response) -> object:
  try:
    return response.json()
  except ValueError:
    return {'status': 'UNKNOWN'}
