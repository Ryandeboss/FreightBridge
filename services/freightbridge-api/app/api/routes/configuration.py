from collections.abc import Iterator
from typing import Annotated
from uuid import UUID

import psycopg
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.routes.operations import bounded_limit, dependency_error, require_operations_access
from app.infrastructure.configuration_repository import (
  ConfigurationConflictError,
  IntegrationConfigurationRepository,
)
from app.infrastructure.database import DatabaseConnectivityError, connect
from app.models.configuration import (
  CapabilityView,
  ChangeSearchResponse,
  CloneDraftRequest,
  ConfigurationChangeView,
  MappingProfileView,
  MappingRuleView,
  MappingSearchResponse,
  TradingPartnerView,
  UpdateCapabilityRequest,
  UpdateMappingProfileRequest,
  UpdateMappingRuleRequest,
  UpdateTradingPartnerRequest,
)

router = APIRouter(prefix='/api/configuration', tags=['configuration'])


def get_configuration_repository() -> Iterator[IntegrationConfigurationRepository]:
  try:
    with connect() as connection:
      yield IntegrationConfigurationRepository(connection)
  except DatabaseConnectivityError as exc:
    raise dependency_error('Configuration database is temporarily unavailable.') from exc


def conflict_error(exc: ConfigurationConflictError) -> HTTPException:
  return HTTPException(
    status_code=status.HTTP_409_CONFLICT,
    detail={'error': {'code': exc.code, 'message': exc.message}},
  )


def not_found(code: str, message: str) -> HTTPException:
  return HTTPException(
    status_code=status.HTTP_404_NOT_FOUND,
    detail={'error': {'code': code, 'message': message}},
  )


@router.get('/partners', dependencies=[Depends(require_operations_access)])
def list_partners(
  repository: IntegrationConfigurationRepository = Depends(get_configuration_repository),
) -> list[dict[str, object]]:
  try:
    partners = repository.list_partners()
  except psycopg.Error as exc:
    raise dependency_error('Configuration partner lookup failed.') from exc
  return [TradingPartnerView.model_validate(partner).model_dump(mode='json', by_alias=True) for partner in partners]


@router.get('/partners/{partner_code}', dependencies=[Depends(require_operations_access)])
def get_partner(
  partner_code: str,
  repository: IntegrationConfigurationRepository = Depends(get_configuration_repository),
) -> dict[str, object]:
  try:
    partner = repository.get_partner(partner_code)
  except psycopg.Error as exc:
    raise dependency_error('Configuration partner detail lookup failed.') from exc
  if partner is None:
    raise not_found('PARTNER_NOT_FOUND', 'Trading partner was not found.')
  return TradingPartnerView.model_validate(partner).model_dump(mode='json', by_alias=True)


@router.patch('/partners/{partner_code}', dependencies=[Depends(require_operations_access)])
def update_partner(
  partner_code: str,
  request: UpdateTradingPartnerRequest,
  repository: IntegrationConfigurationRepository = Depends(get_configuration_repository),
) -> dict[str, object]:
  updates = request.model_dump(exclude_unset=True, by_alias=False)
  try:
    partner = repository.update_partner(partner_code, updates)
  except ConfigurationConflictError as exc:
    raise conflict_error(exc) from exc
  except psycopg.Error as exc:
    raise dependency_error('Configuration partner update failed.') from exc
  if partner is None:
    raise not_found('PARTNER_NOT_FOUND', 'Trading partner was not found.')
  return TradingPartnerView.model_validate(partner).model_dump(mode='json', by_alias=True)


@router.get('/partners/{partner_code}/capabilities', dependencies=[Depends(require_operations_access)])
def list_capabilities(
  partner_code: str,
  repository: IntegrationConfigurationRepository = Depends(get_configuration_repository),
) -> list[dict[str, object]]:
  try:
    capabilities = repository.list_capabilities(partner_code)
  except psycopg.Error as exc:
    raise dependency_error('Configuration capability lookup failed.') from exc
  return [CapabilityView.model_validate(item).model_dump(mode='json', by_alias=True) for item in capabilities]


@router.patch('/capabilities/{capability_id}', dependencies=[Depends(require_operations_access)])
def update_capability(
  capability_id: UUID,
  request: UpdateCapabilityRequest,
  repository: IntegrationConfigurationRepository = Depends(get_configuration_repository),
) -> dict[str, object]:
  try:
    capability = repository.update_capability(capability_id, enabled=request.enabled, note=request.note)
  except psycopg.Error as exc:
    raise dependency_error('Configuration capability update failed.') from exc
  if capability is None:
    raise not_found('CAPABILITY_NOT_FOUND', 'Partner capability was not found.')
  return CapabilityView.model_validate(capability).model_dump(mode='json', by_alias=True)


@router.get('/mappings', dependencies=[Depends(require_operations_access)])
def list_mappings(
  partnerCode: str | None = None,
  mappingKey: str | None = None,
  direction: str | None = None,
  status: str | None = None,
  documentType: str | None = None,
  limit: Annotated[int, Query(ge=1, le=500)] = 50,
  offset: Annotated[int, Query(ge=0)] = 0,
  repository: IntegrationConfigurationRepository = Depends(get_configuration_repository),
) -> dict[str, object]:
  try:
    result = repository.list_mappings(
      partner_code=partnerCode,
      mapping_key=mappingKey,
      direction=direction,
      status=status,
      document_type=documentType,
      limit=bounded_limit(limit),
      offset=offset,
    )
  except psycopg.Error as exc:
    raise dependency_error('Configuration mapping lookup failed.') from exc
  return MappingSearchResponse.model_validate(result).model_dump(mode='json', by_alias=True)


@router.get('/mappings/{mapping_id}', dependencies=[Depends(require_operations_access)])
def get_mapping(
  mapping_id: UUID,
  repository: IntegrationConfigurationRepository = Depends(get_configuration_repository),
) -> dict[str, object]:
  try:
    mapping = repository.get_mapping(mapping_id)
  except psycopg.Error as exc:
    raise dependency_error('Configuration mapping detail lookup failed.') from exc
  if mapping is None:
    raise not_found('MAPPING_NOT_FOUND', 'Mapping profile was not found.')
  return MappingProfileView.model_validate(mapping).model_dump(mode='json', by_alias=True)


@router.post(
  '/mappings/{mapping_id}/clone-draft',
  status_code=status.HTTP_201_CREATED,
  dependencies=[Depends(require_operations_access)],
)
def clone_mapping_draft(
  mapping_id: UUID,
  request: CloneDraftRequest | None = None,
  repository: IntegrationConfigurationRepository = Depends(get_configuration_repository),
) -> dict[str, object]:
  try:
    mapping = repository.clone_draft(mapping_id, change_note=request.change_note if request else None)
  except ConfigurationConflictError as exc:
    raise conflict_error(exc) from exc
  except psycopg.Error as exc:
    raise dependency_error('Configuration draft creation failed.') from exc
  if mapping is None:
    raise not_found('MAPPING_NOT_FOUND', 'Mapping profile was not found.')
  return MappingProfileView.model_validate(mapping).model_dump(mode='json', by_alias=True)


@router.patch('/mappings/{mapping_id}', dependencies=[Depends(require_operations_access)])
def update_mapping(
  mapping_id: UUID,
  request: UpdateMappingProfileRequest,
  repository: IntegrationConfigurationRepository = Depends(get_configuration_repository),
) -> dict[str, object]:
  try:
    mapping = repository.update_draft(mapping_id, request.model_dump(exclude_unset=True, by_alias=False))
  except ConfigurationConflictError as exc:
    raise conflict_error(exc) from exc
  except psycopg.Error as exc:
    raise dependency_error('Configuration draft update failed.') from exc
  if mapping is None:
    raise not_found('MAPPING_NOT_FOUND', 'Mapping profile was not found.')
  return MappingProfileView.model_validate(mapping).model_dump(mode='json', by_alias=True)


@router.patch('/mappings/{mapping_id}/rules/{rule_id}', dependencies=[Depends(require_operations_access)])
def update_mapping_rule(
  mapping_id: UUID,
  rule_id: UUID,
  request: UpdateMappingRuleRequest,
  repository: IntegrationConfigurationRepository = Depends(get_configuration_repository),
) -> dict[str, object]:
  try:
    rule = repository.update_rule(mapping_id, rule_id, request.model_dump(exclude_unset=True, by_alias=False))
  except ConfigurationConflictError as exc:
    raise conflict_error(exc) from exc
  except psycopg.Error as exc:
    raise dependency_error('Configuration rule update failed.') from exc
  if rule is None:
    raise not_found('MAPPING_RULE_NOT_FOUND', 'Mapping rule was not found.')
  return MappingRuleView.model_validate(rule).model_dump(mode='json', by_alias=True)


@router.post('/mappings/{mapping_id}/validate', dependencies=[Depends(require_operations_access)])
def validate_mapping(
  mapping_id: UUID,
  repository: IntegrationConfigurationRepository = Depends(get_configuration_repository),
) -> dict[str, object]:
  try:
    mapping = repository.validate_draft(mapping_id)
  except ConfigurationConflictError as exc:
    raise conflict_error(exc) from exc
  except psycopg.Error as exc:
    raise dependency_error('Configuration draft validation failed.') from exc
  if mapping is None:
    raise not_found('MAPPING_NOT_FOUND', 'Mapping profile was not found.')
  return MappingProfileView.model_validate(mapping).model_dump(mode='json', by_alias=True)


@router.post('/mappings/{mapping_id}/activate', dependencies=[Depends(require_operations_access)])
def activate_mapping(
  mapping_id: UUID,
  repository: IntegrationConfigurationRepository = Depends(get_configuration_repository),
) -> dict[str, object]:
  try:
    mapping = repository.activate_draft(mapping_id)
  except ConfigurationConflictError as exc:
    raise conflict_error(exc) from exc
  except psycopg.Error as exc:
    raise dependency_error('Configuration draft activation failed.') from exc
  if mapping is None:
    raise not_found('MAPPING_NOT_FOUND', 'Mapping profile was not found.')
  return MappingProfileView.model_validate(mapping).model_dump(mode='json', by_alias=True)


@router.post('/mappings/{mapping_id}/abandon', dependencies=[Depends(require_operations_access)])
def abandon_mapping(
  mapping_id: UUID,
  repository: IntegrationConfigurationRepository = Depends(get_configuration_repository),
) -> dict[str, object]:
  try:
    mapping = repository.abandon_draft(mapping_id)
  except ConfigurationConflictError as exc:
    raise conflict_error(exc) from exc
  except psycopg.Error as exc:
    raise dependency_error('Configuration draft abandonment failed.') from exc
  if mapping is None:
    raise not_found('MAPPING_NOT_FOUND', 'Mapping profile was not found.')
  return MappingProfileView.model_validate(mapping).model_dump(mode='json', by_alias=True)


@router.get('/changes', dependencies=[Depends(require_operations_access)])
def list_changes(
  entityType: str | None = None,
  entityId: UUID | None = None,
  limit: Annotated[int, Query(ge=1, le=500)] = 50,
  offset: Annotated[int, Query(ge=0)] = 0,
  repository: IntegrationConfigurationRepository = Depends(get_configuration_repository),
) -> dict[str, object]:
  try:
    result = repository.list_changes(entity_type=entityType, entity_id=entityId, limit=bounded_limit(limit), offset=offset)
  except psycopg.Error as exc:
    raise dependency_error('Configuration change-history lookup failed.') from exc
  return ChangeSearchResponse.model_validate(result).model_dump(mode='json', by_alias=True)
