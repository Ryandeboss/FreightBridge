from fastapi import APIRouter, HTTPException, status

from app.core.config import get_settings
from app.infrastructure.database import (
  DatabaseConnectivityError,
  MidwestSchemaUnavailableError,
  check_database_connectivity,
  check_midwest_schema,
)

router = APIRouter(tags=['readiness'])


@router.get('/readiness')
def readiness_check() -> dict[str, object]:
  settings = get_settings()
  try:
    check_database_connectivity()
  except DatabaseConnectivityError as exc:
    raise HTTPException(
      status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
      detail={
        'status': 'not_ready',
        'service': 'midwest-partner-sim',
        'dependencies': {'database': 'error'},
      },
    ) from exc

  try:
    check_midwest_schema()
  except MidwestSchemaUnavailableError as exc:
    raise HTTPException(
      status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
      detail={
        'status': 'not_ready',
        'service': 'midwest-partner-sim',
        'dependencies': {
          'database': 'ok',
          'midwest_schema': 'error',
        },
      },
    ) from exc

  return {
    'status': 'ready',
    'service': 'midwest-partner-sim',
    'environment': settings.app_env,
    'dependencies': {
      'database': 'ok',
      'midwest_schema': 'ok',
    },
  }
