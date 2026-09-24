from dataclasses import dataclass
from typing import TypeVar, cast
from uuid import UUID

from pydantic import BaseModel, ValidationError

from app.domain import ErrorCategory, ProcessingStage
from app.infrastructure.configuration_repository import (
  ActiveMappingNotFoundError,
  IntegrationConfigurationRepository,
  InvalidMappingConfigurationError,
)
from app.integrations.common.errors import ClassifiedIntegrationFailure
from app.models.configuration import CONFIG_MODELS


ConfigT = TypeVar('ConfigT', bound=BaseModel)


@dataclass(frozen=True)
class ActiveMappingProfile:
  id: UUID
  mapping_key: str
  version_number: int
  config: BaseModel

  def audit_metadata(self) -> dict[str, object]:
    return {
      'mapping_profile_id': str(self.id),
      'mapping_profile_version': self.version_number,
      'mapping_key': self.mapping_key,
    }


def load_active_mapping_profile(
  repository: IntegrationConfigurationRepository,
  mapping_key: str,
  config_type: type[ConfigT],
) -> ActiveMappingProfile:
  try:
    profile = repository.get_active_mapping(mapping_key)
  except ActiveMappingNotFoundError as exc:
    raise ClassifiedIntegrationFailure(
      status_code=503,
      code='ACTIVE_MAPPING_NOT_FOUND',
      message=f'Active mapping profile was not found for {mapping_key}.',
      category=ErrorCategory.MAPPING_ERROR,
      stage=ProcessingStage.MAPPING,
      retryable=True,
    ) from exc
  except InvalidMappingConfigurationError as exc:
    raise ClassifiedIntegrationFailure(
      status_code=503,
      code='INVALID_MAPPING_CONFIGURATION',
      message=f'Active mapping profile is invalid for {mapping_key}.',
      category=ErrorCategory.MAPPING_ERROR,
      stage=ProcessingStage.MAPPING,
      retryable=True,
    ) from exc

  model = CONFIG_MODELS.get(mapping_key)
  if model is None or model is not config_type:
    raise ClassifiedIntegrationFailure(
      status_code=503,
      code='INVALID_MAPPING_CONFIGURATION',
      message=f'Active mapping profile has an unsupported configuration model for {mapping_key}.',
      category=ErrorCategory.MAPPING_ERROR,
      stage=ProcessingStage.MAPPING,
      retryable=True,
    )
  try:
    typed_config = config_type.model_validate(profile['settings'])
  except ValidationError as exc:
    raise ClassifiedIntegrationFailure(
      status_code=503,
      code='INVALID_MAPPING_CONFIGURATION',
      message=f'Active mapping profile is invalid for {mapping_key}.',
      category=ErrorCategory.MAPPING_ERROR,
      stage=ProcessingStage.MAPPING,
      retryable=True,
    ) from exc
  return ActiveMappingProfile(
    id=profile['id'],
    mapping_key=profile['mapping_key'],
    version_number=int(profile['version_number']),
    config=cast(BaseModel, typed_config),
  )


def ensure_partner_capability_enabled(
  repository: IntegrationConfigurationRepository,
  *,
  partner_code: str,
  direction: str,
  document_type: str,
  transport: str,
  message_format: str,
  protocol_version: str | None = None,
) -> None:
  if repository.check_capability_enabled(
    partner_code=partner_code,
    direction=direction,
    document_type=document_type,
    transport=transport,
    message_format=message_format,
    protocol_version=protocol_version,
  ):
    return
  raise ClassifiedIntegrationFailure(
    status_code=409,
    code='PARTNER_CAPABILITY_DISABLED',
    message=f'{partner_code} capability is disabled for {direction} {document_type}.',
    category=ErrorCategory.BUSINESS_VALIDATION_ERROR,
    stage=ProcessingStage.BUSINESS_VALIDATION,
  )
