from datetime import datetime
import re
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


RunStatus = Literal['READY', 'RUNNING', 'SUCCEEDED', 'FAILED']
StepStatus = Literal['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED']


class LabModel(BaseModel):
  model_config = ConfigDict(populate_by_name=True, extra='forbid')


class LabLocationInput(LabModel):
  facility_name: str | None = Field(default=None, alias='facilityName', max_length=120)
  address_1: str | None = Field(default=None, alias='address1', max_length=160)
  address_2: str | None = Field(default=None, alias='address2', max_length=160)
  city: str | None = Field(default=None, max_length=80)
  state: str | None = Field(default=None, min_length=2, max_length=2)
  postal_code: str | None = Field(default=None, alias='postalCode', max_length=20)
  scheduled_date_time: datetime | None = Field(default=None, alias='scheduledDateTime')

  @field_validator('state')
  @classmethod
  def state_must_be_uppercase(cls, value: str | None) -> str | None:
    if value is not None and not re.fullmatch(r'[A-Z]{2}', value):
      raise ValueError('state must be a two-letter uppercase code')
    return value

  @field_validator('scheduled_date_time')
  @classmethod
  def scheduled_time_must_be_aware(cls, value: datetime | None) -> datetime | None:
    if value is not None and (value.tzinfo is None or value.tzinfo.utcoffset(value) is None):
      raise ValueError('scheduledDateTime must include timezone information')
    return value


class CreateLabRunRequest(LabModel):
  scenario_key: Literal[
    'TECHNICAL_ACK_ONLY',
    'TENDER_ACCEPTED',
    'TENDER_REJECTED',
    'FULL_SHIPMENT_LIFECYCLE',
    'APEX_BAD_AUTH',
    'APEX_INVALID_JSON',
    'APEX_INVALID_CONTRACT',
    'APEX_DUPLICATE_SHIPMENT',
    'X12_214_CONTROL_MISMATCH',
    'X12_214_UNSUPPORTED_STATUS',
    'X12_214_WRONG_VERSION',
    'SFTP_HOST_KEY_MISMATCH',
  ] = Field(alias='scenarioKey')
  load_id: str | None = Field(default=None, alias='loadId', min_length=6, max_length=30)
  equipment_type: Literal['VAN_53', 'REEFER_53', 'FLATBED'] | None = Field(default='VAN_53', alias='equipmentType')
  weight_lbs: int | None = Field(default=42000, alias='weightLbs', gt=0)
  pieces: int | None = Field(default=22, gt=0)
  commodity_description: str | None = Field(default='Industrial Components', alias='commodityDescription')
  bol_number: str | None = Field(default=None, alias='bolNumber', min_length=3, max_length=40)
  purchase_order_number: str | None = Field(default=None, alias='purchaseOrderNumber', min_length=3, max_length=40)
  customer_reference: str | None = Field(default=None, alias='customerReference', max_length=80)
  pickup: LabLocationInput | None = None
  delivery: LabLocationInput | None = None
  rejection_reason_code: str | None = Field(default='CAPACITY', alias='rejectionReasonCode', max_length=40)
  rejection_message: str | None = Field(default='Synthetic carrier rejection.', alias='rejectionMessage', max_length=240)


class LabScenarioView(LabModel):
  scenario_key: str = Field(alias='scenarioKey')
  name: str
  description: str
  step_count: int = Field(alias='stepCount')
  kind: Literal['HAPPY_PATH', 'FAILURE_DRILL'] = 'HAPPY_PATH'
  expected_failure: dict[str, object] | None = Field(default=None, alias='expectedFailure')
  guidance: str | None = None
  injected_fault: str | None = Field(default=None, alias='injectedFault')
  layer: str | None = None


class LabStepView(LabModel):
  id: UUID
  run_id: UUID = Field(alias='runId')
  step_key: str = Field(alias='stepKey')
  sequence: int
  display_name: str = Field(alias='displayName')
  sender: str
  receiver: str
  transport: str
  message_format: str = Field(alias='messageFormat')
  document_type: str = Field(alias='documentType')
  status: StepStatus
  attempt_count: int = Field(alias='attemptCount')
  request_summary: dict[str, object] = Field(alias='requestSummary')
  response_summary: dict[str, object] = Field(alias='responseSummary')
  related_transaction_ids: list[str] = Field(alias='relatedTransactionIds')
  error_code: str | None = Field(alias='errorCode')
  safe_message: str | None = Field(alias='safeMessage')
  created_at: datetime = Field(alias='createdAt')
  updated_at: datetime = Field(alias='updatedAt')
  started_at: datetime | None = Field(alias='startedAt')
  completed_at: datetime | None = Field(alias='completedAt')


class LabRunView(LabModel):
  id: UUID
  scenario_key: str = Field(alias='scenarioKey')
  business_identifier: str = Field(alias='businessIdentifier')
  status: RunStatus
  input_snapshot: dict[str, object] = Field(alias='inputSnapshot')
  result_summary: dict[str, object] = Field(alias='resultSummary')
  created_at: datetime = Field(alias='createdAt')
  updated_at: datetime = Field(alias='updatedAt')
  started_at: datetime | None = Field(alias='startedAt')
  completed_at: datetime | None = Field(alias='completedAt')
  steps: list[LabStepView] = Field(default_factory=list)


class LabRunListResponse(LabModel):
  limit: int
  offset: int
  count: int
  runs: list[LabRunView]


class LabReadinessResponse(LabModel):
  status: str
  scenarios: list[LabScenarioView]
  dependencies: dict[str, object]


class LabStepExecutionResponse(LabModel):
  run: LabRunView
  step: LabStepView | None = None
  already_completed: bool = Field(default=False, alias='alreadyCompleted')
