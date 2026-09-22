from collections.abc import Iterator
from contextlib import ExitStack

import psycopg
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse

from app.infrastructure.database import DatabaseConnectivityError, connect
from app.integrations.common.correlation import CORRELATION_HEADER, resolve_correlation_id
from app.integrations.midwest.dispatch_service import MidwestDirectDispatchService
from app.integrations.midwest.errors import Midwest204MappingError, MidwestShipmentNotFoundError
from app.integrations.midwest.service import Midwest204DependencyError, Midwest204GenerationService
from app.integrations.midwest.transport import MidwestDeliveryError, MidwestHttpTestTransport

router = APIRouter(prefix='/api/integrations/midwest', tags=['midwest integrations'])


def get_midwest_204_generation_service() -> Iterator[Midwest204GenerationService]:
  try:
    with connect() as connection:
      yield Midwest204GenerationService(connection=connection)
  except DatabaseConnectivityError as exc:
    raise HTTPException(
      status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
      detail={
        'error': {
          'code': 'DEPENDENCY_ERROR',
          'message': 'A downstream dependency failed while generating the Midwest 204.',
        }
      },
    ) from exc


def get_midwest_direct_dispatch_service() -> Iterator[MidwestDirectDispatchService]:
  try:
    with ExitStack() as stack:
      audit_connection = stack.enter_context(connect())
      business_connection = stack.enter_context(connect())
      yield MidwestDirectDispatchService(
        audit_connection=audit_connection,
        business_connection=business_connection,
        transport=MidwestHttpTestTransport(),
      )
  except DatabaseConnectivityError as exc:
    raise HTTPException(
      status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
      detail={
        'error': {
          'code': 'DEPENDENCY_ERROR',
          'message': 'A downstream dependency failed while dispatching the Midwest 204.',
        }
      },
    ) from exc


@router.post('/load-tenders/{shipment_number}/generate', status_code=status.HTTP_200_OK)
def generate_midwest_load_tender_preview(
  shipment_number: str,
  service: Midwest204GenerationService = Depends(get_midwest_204_generation_service),
) -> JSONResponse:
  try:
    result = service.generate_for_shipment_number(shipment_number)
  except MidwestShipmentNotFoundError:
    return JSONResponse(
      status_code=status.HTTP_404_NOT_FOUND,
      content={
        'error': {
          'code': 'SHIPMENT_NOT_FOUND',
          'message': 'Canonical shipment was not found.',
        }
      },
    )
  except Midwest204MappingError as exc:
    return JSONResponse(
      status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
      content={
        'error': {
          'code': 'MIDWEST_204_MAPPING_ERROR',
          'message': exc.message,
          'detailCode': exc.code.value,
          'field': exc.field,
        }
      },
    )
  except (DatabaseConnectivityError, Midwest204DependencyError, psycopg.Error):
    return JSONResponse(
      status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
      content={
        'error': {
          'code': 'DEPENDENCY_ERROR',
          'message': 'A downstream dependency failed while generating the Midwest 204.',
        }
      },
    )

  return JSONResponse(
    status_code=status.HTTP_200_OK,
    content=result.response_body(),
  )


@router.post('/load-tenders/{shipment_number}/dispatch-direct', status_code=status.HTTP_202_ACCEPTED)
def dispatch_midwest_load_tender_direct(
  shipment_number: str,
  request: Request,
  service: MidwestDirectDispatchService = Depends(get_midwest_direct_dispatch_service),
) -> JSONResponse:
  correlation_id = resolve_correlation_id(request.headers.get(CORRELATION_HEADER))
  try:
    result = service.dispatch(
      shipment_number=shipment_number,
      correlation_id=correlation_id,
    )
  except MidwestShipmentNotFoundError:
    return JSONResponse(
      status_code=status.HTTP_404_NOT_FOUND,
      content={
        'error': {
          'code': 'SHIPMENT_NOT_FOUND',
          'message': 'Canonical shipment was not found.',
        }
      },
      headers={CORRELATION_HEADER: correlation_id},
    )
  except Midwest204MappingError as exc:
    return JSONResponse(
      status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
      content={
        'error': {
          'code': 'MIDWEST_204_MAPPING_ERROR',
          'message': exc.message,
          'detailCode': exc.code.value,
          'field': exc.field,
        }
      },
      headers={CORRELATION_HEADER: correlation_id},
    )
  except MidwestDeliveryError as exc:
    return JSONResponse(
      status_code=exc.status_code,
      content={
        'error': {
          'code': exc.code,
          'message': exc.message,
          'midwest': exc.response_body or {},
        }
      },
      headers={CORRELATION_HEADER: correlation_id},
    )
  except (DatabaseConnectivityError, Midwest204DependencyError, psycopg.Error):
    return JSONResponse(
      status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
      content={
        'error': {
          'code': 'DEPENDENCY_ERROR',
          'message': 'A downstream dependency failed while dispatching the Midwest 204.',
        }
      },
      headers={CORRELATION_HEADER: correlation_id},
    )

  return JSONResponse(
    status_code=status.HTTP_202_ACCEPTED,
    content=result.response_body(),
    headers={CORRELATION_HEADER: correlation_id},
  )
