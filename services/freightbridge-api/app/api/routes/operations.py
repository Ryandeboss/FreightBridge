from collections.abc import Iterator
from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID
import hmac
import logging

import psycopg
from fastapi import APIRouter, Depends, Header, HTTPException, Query, status

from app.core.config import get_settings
from app.infrastructure.database import DatabaseConnectivityError, connect
from app.infrastructure.operations_repository import OperationsRepository
from app.integrations.midwest.retry_service import Midwest204ManualRetryService, RetryNotFoundError, RetryRejectedError
from app.integrations.midwest.transport import MidwestDeliveryError
from app.models.operations import (
  BusinessTraceResponse,
  CorrelationLookupResponse,
  ErrorDetailResponse,
  ErrorQueueResponse,
  OperationalSummary,
  RetryTransactionRequest,
  RetryTransactionResponse,
  ResolveErrorRequest,
  TransactionDetailResponse,
  TransactionSearchResponse,
)

router = APIRouter(prefix='/api/operations', tags=['operations'])
logger = logging.getLogger(__name__)


def require_operations_access(
  authorization: Annotated[str | None, Header(alias='Authorization')] = None,
) -> None:
  expected = get_settings().operations_api_bearer_token
  if not expected or not authorization or not authorization.startswith('Bearer '):
    raise_operations_auth_error()
  supplied = authorization.removeprefix('Bearer ').strip()
  if not hmac.compare_digest(supplied, expected):
    raise_operations_auth_error()


def raise_operations_auth_error() -> None:
  raise HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail={
      'error': {
        'code': 'AUTHENTICATION_ERROR',
        'message': 'Missing or invalid operations bearer token.',
      }
    },
  )


def get_operations_repository() -> Iterator[OperationsRepository]:
  try:
    with connect() as connection:
      yield OperationsRepository(connection)
  except DatabaseConnectivityError as exc:
    raise dependency_error('Operations database is temporarily unavailable.') from exc


def get_retry_service() -> Iterator[Midwest204ManualRetryService]:
  try:
    with connect() as connection:
      yield Midwest204ManualRetryService(repository=OperationsRepository(connection))
  except DatabaseConnectivityError as exc:
    raise dependency_error('Operations retry database is temporarily unavailable.') from exc


def dependency_error(message: str) -> HTTPException:
  return HTTPException(
    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
    detail={'error': {'code': 'DEPENDENCY_ERROR', 'message': message}},
  )


def bounded_limit(limit: int) -> int:
  return min(max(limit, 1), 100)


@router.get('/transactions', dependencies=[Depends(require_operations_access)])
def search_transactions(
  businessIdentifier: str | None = None,
  correlationId: str | None = None,
  partnerCode: str | None = None,
  direction: str | None = None,
  transport: str | None = None,
  messageFormat: str | None = None,
  documentType: str | None = None,
  status: str | None = None,
  stage: str | None = None,
  limit: Annotated[int, Query(ge=1, le=500)] = 50,
  offset: Annotated[int, Query(ge=0)] = 0,
  repository: OperationsRepository = Depends(get_operations_repository),
) -> dict[str, object]:
  try:
    result = repository.search_transactions(
      business_identifier=businessIdentifier,
      correlation_id=correlationId,
      partner_code=partnerCode,
      direction=direction,
      transport=transport,
      message_format=messageFormat,
      document_type=documentType,
      status=status,
      stage=stage,
      limit=bounded_limit(limit),
      offset=offset,
    )
  except psycopg.Error as exc:
    raise dependency_error('Operations transaction search failed.') from exc
  return TransactionSearchResponse.model_validate(result).model_dump(mode='json', by_alias=True)


@router.get('/transactions/{transaction_id}', dependencies=[Depends(require_operations_access)])
def get_transaction_detail(
  transaction_id: UUID,
  repository: OperationsRepository = Depends(get_operations_repository),
) -> dict[str, object]:
  try:
    result = repository.get_transaction_detail(transaction_id)
  except psycopg.Error as exc:
    raise dependency_error('Operations transaction detail lookup failed.') from exc
  if result is None:
    raise HTTPException(
      status_code=status.HTTP_404_NOT_FOUND,
      detail={'error': {'code': 'TRANSACTION_NOT_FOUND', 'message': 'Transaction was not found.'}},
    )
  return TransactionDetailResponse.model_validate(result).model_dump(mode='json', by_alias=True)


@router.post('/transactions/{transaction_id}/retry', dependencies=[Depends(require_operations_access)])
def retry_transaction(
  transaction_id: UUID,
  request: RetryTransactionRequest,
  service: Midwest204ManualRetryService = Depends(get_retry_service),
) -> dict[str, object]:
  try:
    result = service.retry(transaction_id, note=request.note)
  except RetryNotFoundError:
    raise HTTPException(
      status_code=status.HTTP_404_NOT_FOUND,
      detail={'error': {'code': 'TRANSACTION_NOT_FOUND', 'message': 'Transaction was not found.'}},
    )
  except RetryRejectedError as exc:
    raise HTTPException(
      status_code=exc.status_code,
      detail={'error': {'code': exc.code, 'message': 'Transaction is not currently retryable.'}},
    )
  except MidwestDeliveryError as exc:
    raise HTTPException(
      status_code=exc.status_code,
      detail={'error': {'code': exc.code, 'message': exc.message}},
    )
  return RetryTransactionResponse.model_validate(result).model_dump(mode='json', by_alias=True)


@router.get('/business/{business_identifier}/trace', dependencies=[Depends(require_operations_access)])
def get_business_trace(
  business_identifier: str,
  repository: OperationsRepository = Depends(get_operations_repository),
) -> dict[str, object]:
  try:
    result = repository.get_business_trace(business_identifier)
  except psycopg.Error as exc:
    raise dependency_error('Operations business trace lookup failed.') from exc
  return BusinessTraceResponse.model_validate(result).model_dump(mode='json', by_alias=True)


@router.get('/correlations/{correlation_id}', dependencies=[Depends(require_operations_access)])
def get_correlation_lookup(
  correlation_id: str,
  repository: OperationsRepository = Depends(get_operations_repository),
) -> dict[str, object]:
  try:
    result = repository.get_correlation_lookup(correlation_id)
  except psycopg.Error as exc:
    raise dependency_error('Operations correlation lookup failed.') from exc
  return CorrelationLookupResponse.model_validate(result).model_dump(mode='json', by_alias=True)


@router.get('/errors', dependencies=[Depends(require_operations_access)])
def list_errors(
  resolved: bool | None = False,
  retryable: bool | None = None,
  category: str | None = None,
  errorCode: str | None = None,
  stage: str | None = None,
  partnerCode: str | None = None,
  businessIdentifier: str | None = None,
  documentType: str | None = None,
  limit: Annotated[int, Query(ge=1, le=500)] = 50,
  offset: Annotated[int, Query(ge=0)] = 0,
  repository: OperationsRepository = Depends(get_operations_repository),
) -> dict[str, object]:
  try:
    result = repository.search_errors(
      resolved=resolved,
      retryable=retryable,
      category=category,
      error_code=errorCode,
      stage=stage,
      partner_code=partnerCode,
      business_identifier=businessIdentifier,
      document_type=documentType,
      limit=bounded_limit(limit),
      offset=offset,
    )
  except psycopg.Error as exc:
    raise dependency_error('Operations error queue lookup failed.') from exc
  return ErrorQueueResponse.model_validate(result).model_dump(mode='json', by_alias=True)


@router.get('/errors/{error_id}', dependencies=[Depends(require_operations_access)])
def get_error_detail(
  error_id: UUID,
  repository: OperationsRepository = Depends(get_operations_repository),
) -> dict[str, object]:
  try:
    result = repository.get_error_detail(error_id)
  except psycopg.Error as exc:
    raise dependency_error('Operations error detail lookup failed.') from exc
  if result is None:
    raise HTTPException(
      status_code=status.HTTP_404_NOT_FOUND,
      detail={'error': {'code': 'ERROR_NOT_FOUND', 'message': 'Integration error was not found.'}},
    )
  return ErrorDetailResponse.model_validate(result).model_dump(mode='json', by_alias=True)


@router.post('/errors/{error_id}/resolve', dependencies=[Depends(require_operations_access)])
def resolve_error(
  error_id: UUID,
  request: ResolveErrorRequest,
  repository: OperationsRepository = Depends(get_operations_repository),
) -> dict[str, object]:
  try:
    result = repository.resolve_error(error_id, note=request.note)
  except psycopg.Error as exc:
    raise dependency_error('Operations error resolution failed.') from exc
  if result is None:
    raise HTTPException(
      status_code=status.HTTP_404_NOT_FOUND,
      detail={'error': {'code': 'ERROR_NOT_FOUND', 'message': 'Integration error was not found.'}},
    )
  logger.info(
    'operations_error_resolved',
    extra={'event': 'operations_error_resolved', 'error_id': str(error_id)},
  )
  return ErrorDetailResponse.model_validate(result).model_dump(mode='json', by_alias=True)


@router.post('/errors/{error_id}/reopen', dependencies=[Depends(require_operations_access)])
def reopen_error(
  error_id: UUID,
  repository: OperationsRepository = Depends(get_operations_repository),
) -> dict[str, object]:
  try:
    result = repository.reopen_error(error_id)
  except psycopg.Error as exc:
    raise dependency_error('Operations error reopen failed.') from exc
  if result is None:
    raise HTTPException(
      status_code=status.HTTP_404_NOT_FOUND,
      detail={'error': {'code': 'ERROR_NOT_FOUND', 'message': 'Integration error was not found.'}},
    )
  logger.info(
    'operations_error_reopened',
    extra={'event': 'operations_error_reopened', 'error_id': str(error_id)},
  )
  return ErrorDetailResponse.model_validate(result).model_dump(mode='json', by_alias=True)


@router.get('/summary', dependencies=[Depends(require_operations_access)])
def get_summary(
  hours: Annotated[int, Query(ge=1, le=720)] = 24,
  repository: OperationsRepository = Depends(get_operations_repository),
) -> dict[str, object]:
  try:
    result = repository.get_summary(hours=hours, now=datetime.now(UTC))
  except psycopg.Error as exc:
    raise dependency_error('Operations summary lookup failed.') from exc
  return OperationalSummary.model_validate(result).model_dump(mode='json', by_alias=True)
