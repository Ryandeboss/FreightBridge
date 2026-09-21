from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.domain.enums import TenderDecision
from app.domain.validation import AwareDatetime


class TenderResponse(BaseModel):
  model_config = ConfigDict(str_strip_whitespace=True)

  id: UUID | None = None
  shipment_id: UUID
  carrier_partner_id: UUID
  decision: TenderDecision
  carrier_load_number: str | None = Field(default=None, max_length=80)
  reason_code: str | None = Field(default=None, max_length=80)
  message: str | None = Field(default=None, max_length=500)
  decided_at: AwareDatetime
  received_at: AwareDatetime
  source_transaction_id: UUID | None = None
  created_at: AwareDatetime | None = None

  @model_validator(mode='after')
  def validate_conditional_fields(self) -> 'TenderResponse':
    if self.decision == TenderDecision.REJECTED and not self.reason_code:
      raise ValueError('reason_code is expected when a tender is rejected')
    if self.decision == TenderDecision.ACCEPTED and self.reason_code:
      raise ValueError('reason_code should not be set when a tender is accepted')
    return self
