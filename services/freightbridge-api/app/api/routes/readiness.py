from fastapi import APIRouter, HTTPException, status

from app.core.config import get_settings
from app.infrastructure.database import (
  DatabaseConnectivityError,
  DomainSchemaUnavailableError,
  check_database_connectivity,
  check_domain_schema,
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
        'service': 'freightbridge-api',
        'dependencies': {
          'configuration': 'ok',
          'database': 'error',
        },
      },
    ) from exc

  try:
    check_domain_schema()
  except DomainSchemaUnavailableError as exc:
    raise HTTPException(
      status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
      detail={
        'status': 'not_ready',
        'service': 'freightbridge-api',
        'dependencies': {
          'configuration': 'ok',
          'database': 'ok',
          'domain_schema': 'error',
        },
      },
    ) from exc

  return {
    'status': 'ready',
    'service': 'freightbridge-api',
    'environment': settings.app_env,
    'dependencies': {
      'configuration': 'ok',
      'database': 'ok',
      'domain_schema': 'ok',
    },
  }
