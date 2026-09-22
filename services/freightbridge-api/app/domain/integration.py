from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.domain.enums import (
  ErrorCategory,
  IntegrationDirection,
  MessageFormat,
  ProcessingStage,
  ProcessingStatus,
  Transport,
)
from app.domain.validation import AwareDatetime


class IntegrationTransaction(BaseModel):
  model_config = ConfigDict(str_strip_whitespace=True)

  id: UUID | None = None
  correlation_id: str = Field(min_length=1, max_length=120)
  partner_id: UUID
  direction: IntegrationDirection
  transport: Transport
  message_format: MessageFormat
  document_type: str = Field(min_length=1, max_length=80)
  business_identifier: str | None = Field(default=None, max_length=120)
  x12_version: str | None = Field(default=None, max_length=20)
  interchange_control_number: str | None = Field(default=None, max_length=40)
  group_control_number: str | None = Field(default=None, max_length=40)
  transaction_control_number: str | None = Field(default=None, max_length=40)
  payload_hash: str | None = Field(default=None, max_length=128)
  raw_payload_location: str | None = Field(default=None, max_length=500)
  processing_status: ProcessingStatus = ProcessingStatus.RECEIVED
  processing_stage: ProcessingStage = ProcessingStage.RECEIVED
  retry_count: int = Field(default=0, ge=0)
  parent_transaction_id: UUID | None = None
  received_at: AwareDatetime | None = None
  processed_at: AwareDatetime | None = None
  created_at: AwareDatetime | None = None
  updated_at: AwareDatetime | None = None

  @model_validator(mode='after')
  def validate_transport_format(self) -> 'IntegrationTransaction':
    if self.transport == Transport.REST and self.message_format != MessageFormat.JSON:
      if self.message_format != MessageFormat.X12:
        raise ValueError('REST transactions use JSON or X12 test-harness payloads')
    if self.transport == Transport.SFTP and self.message_format != MessageFormat.X12:
      raise ValueError('SFTP transactions use X12 in the MVP domain')
    return self


class ProcessingLog(BaseModel):
  model_config = ConfigDict(str_strip_whitespace=True)

  id: UUID | None = None
  transaction_id: UUID
  stage: ProcessingStage
  status: ProcessingStatus
  message: str = Field(min_length=1, max_length=500)
  metadata: dict[str, object] = Field(default_factory=dict)
  created_at: AwareDatetime | None = None


class IntegrationError(BaseModel):
  model_config = ConfigDict(str_strip_whitespace=True)

  id: UUID | None = None
  transaction_id: UUID
  category: ErrorCategory
  error_code: str = Field(min_length=1, max_length=120)
  safe_message: str = Field(min_length=1, max_length=500)
  stage: ProcessingStage
  retryable: bool = False
  resolved: bool = False
  created_at: AwareDatetime | None = None
  resolved_at: AwareDatetime | None = None
