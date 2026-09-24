from collections.abc import Iterator
from typing import Annotated
from uuid import UUID

import psycopg
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.routes.operations import require_operations_access
from app.infrastructure.database import DatabaseConnectivityError, connect
from app.infrastructure.lab_repository import IntegrationLabRepository
from app.integrations.lab import IntegrationLabService, LabExecutionError
from app.models.lab import (
  CreateLabRunRequest,
  LabReadinessResponse,
  LabRunListResponse,
  LabRunView,
  LabStepExecutionResponse,
)

router = APIRouter(prefix='/api/lab', tags=['integration lab'])


def get_lab_repository() -> Iterator[IntegrationLabRepository]:
  try:
    with connect() as connection:
      yield IntegrationLabRepository(connection)
  except DatabaseConnectivityError as exc:
    raise dependency_error('Integration Lab database is temporarily unavailable.') from exc


def get_lab_service(
  repository: IntegrationLabRepository = Depends(get_lab_repository),
) -> IntegrationLabService:
  return IntegrationLabService(repository)


def dependency_error(message: str) -> HTTPException:
  return HTTPException(
    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
    detail={'error': {'code': 'DEPENDENCY_ERROR', 'message': message}},
  )


def lab_error(exc: LabExecutionError) -> HTTPException:
  status_code = status.HTTP_404_NOT_FOUND if exc.code in ('LAB_RUN_NOT_FOUND', 'LAB_STEP_NOT_FOUND', 'LAB_SCENARIO_NOT_FOUND') else status.HTTP_409_CONFLICT
  if exc.code in ('LAB_APEX_UNAVAILABLE', 'LAB_MIDWEST_UNAVAILABLE', 'LAB_SFTP_STEP_FAILED', 'LAB_PARTNER_AUTHENTICATION_FAILED'):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
  return HTTPException(status_code=status_code, detail={'error': {'code': exc.code, 'message': exc.message}})


def bounded_limit(limit: int) -> int:
  return min(max(limit, 1), 100)


@router.get('/readiness', dependencies=[Depends(require_operations_access)])
def readiness(service: IntegrationLabService = Depends(get_lab_service)) -> dict[str, object]:
  return LabReadinessResponse.model_validate(service.readiness()).model_dump(mode='json', by_alias=True)


@router.post('/runs', status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_operations_access)])
def create_run(
  request: CreateLabRunRequest,
  service: IntegrationLabService = Depends(get_lab_service),
) -> dict[str, object]:
  try:
    result = service.create_run(request)
  except LabExecutionError as exc:
    raise lab_error(exc) from exc
  except psycopg.Error as exc:
    raise dependency_error('Integration Lab run creation failed.') from exc
  return LabRunView.model_validate(result).model_dump(mode='json', by_alias=True)


@router.get('/runs', dependencies=[Depends(require_operations_access)])
def list_runs(
  scenarioKey: str | None = None,
  runStatus: str | None = Query(default=None, alias='status'),
  businessIdentifier: str | None = None,
  limit: Annotated[int, Query(ge=1, le=500)] = 25,
  offset: Annotated[int, Query(ge=0)] = 0,
  repository: IntegrationLabRepository = Depends(get_lab_repository),
) -> dict[str, object]:
  try:
    result = repository.list_runs(
      scenario_key=scenarioKey,
      status=runStatus,
      business_identifier=businessIdentifier,
      limit=bounded_limit(limit),
      offset=offset,
    )
  except psycopg.Error as exc:
    raise dependency_error('Integration Lab run lookup failed.') from exc
  return LabRunListResponse.model_validate(result).model_dump(mode='json', by_alias=True)


@router.get('/runs/{run_id}', dependencies=[Depends(require_operations_access)])
def get_run(
  run_id: UUID,
  repository: IntegrationLabRepository = Depends(get_lab_repository),
) -> dict[str, object]:
  try:
    result = repository.get_run(run_id)
  except psycopg.Error as exc:
    raise dependency_error('Integration Lab run lookup failed.') from exc
  if result is None:
    raise HTTPException(
      status_code=status.HTTP_404_NOT_FOUND,
      detail={'error': {'code': 'LAB_RUN_NOT_FOUND', 'message': 'Integration Lab run was not found.'}},
    )
  return LabRunView.model_validate(result).model_dump(mode='json', by_alias=True)


@router.post('/runs/{run_id}/steps/{step_key}/execute', dependencies=[Depends(require_operations_access)])
def execute_step(
  run_id: UUID,
  step_key: str,
  service: IntegrationLabService = Depends(get_lab_service),
) -> dict[str, object]:
  try:
    run, step, already_completed = service.execute_step(run_id, step_key)
  except LabExecutionError as exc:
    raise lab_error(exc) from exc
  except psycopg.Error as exc:
    raise dependency_error('Integration Lab step execution failed.') from exc
  return LabStepExecutionResponse.model_validate(
    {'run': run, 'step': step, 'already_completed': already_completed}
  ).model_dump(mode='json', by_alias=True)


@router.post('/runs/{run_id}/run-next', dependencies=[Depends(require_operations_access)])
def run_next(
  run_id: UUID,
  service: IntegrationLabService = Depends(get_lab_service),
) -> dict[str, object]:
  try:
    run, step, already_completed = service.run_next(run_id)
  except LabExecutionError as exc:
    raise lab_error(exc) from exc
  except psycopg.Error as exc:
    raise dependency_error('Integration Lab step execution failed.') from exc
  return LabStepExecutionResponse.model_validate(
    {'run': run, 'step': step, 'already_completed': already_completed}
  ).model_dump(mode='json', by_alias=True)
