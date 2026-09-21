from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.load import AwareDatetime


class TenderDecision(StrEnum):
  ACCEPTED = 'ACCEPTED'
  REJECTED = 'REJECTED'


class ApexTenderResponse(BaseModel):
  load_id: str = Field(alias='loadId', min_length=6, max_length=30)
  decision: TenderDecision
  carrier_code: str = Field(alias='carrierCode', min_length=2, max_length=10)
  carrier_load_number: str | None = Field(default=None, alias='carrierLoadNumber', max_length=40)
  reason_code: str | None = Field(default=None, alias='reasonCode', max_length=40)
  message: str | None = Field(default=None, max_length=240)
  decided_at: AwareDatetime = Field(alias='decidedAt')

  model_config = ConfigDict(populate_by_name=True)

  @model_validator(mode='after')
  def decision_fields_must_match_decision(self) -> 'ApexTenderResponse':
    if self.decision == TenderDecision.REJECTED and not self.reason_code:
      raise ValueError('reasonCode is required when decision is REJECTED')
    if self.decision == TenderDecision.ACCEPTED and self.reason_code:
      raise ValueError('reasonCode must be omitted when decision is ACCEPTED')
    return self
