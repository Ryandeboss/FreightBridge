from collections.abc import Iterator
from contextlib import ExitStack

from fastapi import APIRouter, Depends, Request, status
from fastapi.responses import JSONResponse

from app.infrastructure.database import connect
from app.infrastructure.configuration_repository import IntegrationConfigurationRepository
from app.integrations.apex.service import ApexLoadTenderIngestionService
from app.integrations.common.correlation import CORRELATION_HEADER, resolve_correlation_id
from app.integrations.common.errors import IntegrationAPIError

router = APIRouter(prefix='/api/integrations/apex', tags=['apex integrations'])


def get_apex_ingestion_service() -> Iterator[ApexLoadTenderIngestionService]:
  with ExitStack() as stack:
    audit_connection = stack.enter_context(connect())
    business_connection = stack.enter_context(connect())
    yield ApexLoadTenderIngestionService(
      audit_connection=audit_connection,
      business_connection=business_connection,
      configuration_repository=IntegrationConfigurationRepository(audit_connection),
    )


@router.post('/load-tenders', status_code=status.HTTP_202_ACCEPTED)
async def receive_apex_load_tender(
  request: Request,
  service: ApexLoadTenderIngestionService = Depends(get_apex_ingestion_service),
) -> JSONResponse:
  correlation_id = resolve_correlation_id(request.headers.get(CORRELATION_HEADER))
  raw_body = await request.body()

  try:
    result = service.ingest(
      raw_body=raw_body,
      authorization_header=request.headers.get('Authorization'),
      correlation_id=correlation_id,
      idempotency_key=request.headers.get('Idempotency-Key'),
    )
  except IntegrationAPIError as exc:
    return JSONResponse(
      status_code=exc.status_code,
      content={
        'error': {
          'code': exc.code,
          'message': exc.message,
          'correlationId': exc.correlation_id,
        }
      },
      headers={CORRELATION_HEADER: exc.correlation_id},
    )

  return JSONResponse(
    status_code=status.HTTP_202_ACCEPTED,
    content=result.response_body(),
    headers={CORRELATION_HEADER: result.correlation_id},
  )
