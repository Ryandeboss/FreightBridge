from fastapi import APIRouter, HTTPException, status

from app.core.config import get_settings
from app.infrastructure.database import (
  ApexSchemaUnavailableError,
  DatabaseConnectivityError,
  check_apex_schema,
  check_database_connectivity,
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
        'service': 'apex-partner-sim',
        'dependencies': {'database': 'error'},
      },
    ) from exc

  try:
    check_apex_schema()
  except ApexSchemaUnavailableError as exc:
    raise HTTPException(
      status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
      detail={
        'status': 'not_ready',
        'service': 'apex-partner-sim',
        'dependencies': {
          'database': 'ok',
          'apex_schema': 'error',
        },
      },
    ) from exc

  return {
    'status': 'ready',
    'service': 'apex-partner-sim',
    'environment': settings.app_env,
    'dependencies': {
      'database': 'ok',
      'apex_schema': 'ok',
    },
  }
