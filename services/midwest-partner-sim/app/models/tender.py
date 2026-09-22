from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field, model_validator


class TenderDecisionValue(StrEnum):
  ACCEPTED = 'ACCEPTED'
  REJECTED = 'REJECTED'


class MidwestTenderDecisionRequest(BaseModel):
  model_config = ConfigDict(populate_by_name=True)

  decision: TenderDecisionValue
  reason_code: str | None = Field(default=None, alias='reasonCode', max_length=40)
  message: str | None = Field(default=None, max_length=240)

  @model_validator(mode='after')
  def validate_decision_fields(self) -> 'MidwestTenderDecisionRequest':
    if self.decision == TenderDecisionValue.ACCEPTED and self.reason_code:
      raise ValueError('reasonCode must be omitted for ACCEPTED decisions')
    if self.decision == TenderDecisionValue.REJECTED and not self.reason_code:
      raise ValueError('reasonCode is required for REJECTED decisions')
    return self


class MidwestTenderDecisionResponse(BaseModel):
  model_config = ConfigDict(populate_by_name=True)

  customer_shipment_number: str = Field(alias='customerShipmentNumber')
  decision: TenderDecisionValue
  carrier_load_number: str | None = Field(default=None, alias='carrierLoadNumber')
  reason_code: str | None = Field(default=None, alias='reasonCode')
  message: str | None = None
  decided_at: datetime = Field(alias='decidedAt')
  outbound_document_id: str = Field(alias='outboundDocumentId')
