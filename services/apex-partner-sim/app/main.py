from uuid import uuid4
import re

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response

from app.api.router import api_router
from app.models.errors import ApexAPIError, ErrorCode, ErrorDetail, ErrorEnvelope


CORRELATION_HEADER = 'X-Correlation-ID'
CORRELATION_PATTERN = re.compile(r'^[A-Za-z0-9._:-]{1,80}$')


def get_correlation_id(request: Request) -> str:
  correlation_id = getattr(request.state, 'correlation_id', None)
  if isinstance(correlation_id, str):
    return correlation_id
  return f'apex-{uuid4()}'


def error_response(
  request: Request,
  status_code: int,
  code: ErrorCode,
  message: str,
) -> JSONResponse:
  correlation_id = get_correlation_id(request)
  envelope = ErrorEnvelope(
    error=ErrorDetail(
      code=code,
      message=message,
      correlation_id=correlation_id,
    )
  )
  return JSONResponse(
    status_code=status_code,
    content=envelope.model_dump(mode='json', by_alias=True),
    headers={CORRELATION_HEADER: correlation_id},
  )


def create_app() -> FastAPI:
  app = FastAPI(
    title='Apex Logistics Partner Simulator',
    version='0.1.0',
    description='Synthetic REST/JSON partner backend for the FreightBridge portfolio lab.',
  )

  @app.middleware('http')
  async def correlation_middleware(request: Request, call_next) -> Response:
    inbound = request.headers.get(CORRELATION_HEADER)
    correlation_id = inbound if inbound and CORRELATION_PATTERN.fullmatch(inbound) else f'apex-{uuid4()}'
    request.state.correlation_id = correlation_id
    response = await call_next(request)
    response.headers[CORRELATION_HEADER] = correlation_id
    return response

  @app.exception_handler(ApexAPIError)
  async def apex_api_error_handler(request: Request, exc: ApexAPIError) -> JSONResponse:
    return error_response(request, exc.status_code, exc.code, exc.message)

  @app.exception_handler(RequestValidationError)
  async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    if any(error.get('type') == 'json_invalid' for error in exc.errors()):
      return error_response(
        request,
        status.HTTP_400_BAD_REQUEST,
        ErrorCode.INVALID_REQUEST,
        'Request body is invalid JSON.',
      )

    return error_response(
      request,
      status.HTTP_422_UNPROCESSABLE_ENTITY,
      ErrorCode.BUSINESS_VALIDATION_ERROR,
      'Request body failed Apex validation.',
    )

  app.include_router(api_router)
  return app


app = create_app()
