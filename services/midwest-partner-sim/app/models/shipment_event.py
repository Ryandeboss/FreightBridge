from datetime import datetime
from enum import StrEnum
import re
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


STATE_PATTERN = re.compile(r'^[A-Z]{2}$')


class MidwestShipmentStatus(StrEnum):
  PICKED_UP = 'PICKED_UP'
  IN_TRANSIT = 'IN_TRANSIT'
  ARRIVED = 'ARRIVED'
  DELIVERED = 'DELIVERED'


STATUS_TO_AT7: dict[MidwestShipmentStatus, str] = {
  MidwestShipmentStatus.PICKED_UP: 'AF',
  MidwestShipmentStatus.IN_TRANSIT: 'X6',
  MidwestShipmentStatus.ARRIVED: 'X1',
  MidwestShipmentStatus.DELIVERED: 'D1',
}


DEFAULT_STATUS_DESCRIPTIONS: dict[MidwestShipmentStatus, str] = {
  MidwestShipmentStatus.PICKED_UP: 'Shipment departed pickup facility.',
  MidwestShipmentStatus.IN_TRANSIT: 'Shipment is in transit.',
  MidwestShipmentStatus.ARRIVED: 'Shipment arrived at delivery location.',
  MidwestShipmentStatus.DELIVERED: 'Shipment delivery completed.',
}


class MidwestShipmentEventRequest(BaseModel):
  model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)

  status: MidwestShipmentStatus
  occurred_at: datetime = Field(alias='occurredAt')
  city: str = Field(min_length=1, max_length=80)
  state: str = Field(min_length=2, max_length=2)
  status_description: str | None = Field(default=None, alias='statusDescription', max_length=240)

  @field_validator('state')
  @classmethod
  def state_must_be_uppercase(cls, value: str) -> str:
    if not STATE_PATTERN.fullmatch(value):
      raise ValueError('state must be a two-letter uppercase code')
    return value


class MidwestShipmentEventResponse(BaseModel):
  model_config = ConfigDict(populate_by_name=True)

  event_id: UUID = Field(alias='eventId')
  customer_shipment_number: str = Field(alias='customerShipmentNumber')
  status: MidwestShipmentStatus
  at7_code: str = Field(alias='at7Code')
  status_description: str = Field(alias='statusDescription')
  occurred_at: datetime = Field(alias='occurredAt')
  city: str
  state: str
  outbound_document_id: UUID = Field(alias='outboundDocumentId')


class MidwestShipmentEventRead(BaseModel):
  model_config = ConfigDict(populate_by_name=True)

  event_id: UUID = Field(alias='eventId')
  status: MidwestShipmentStatus
  at7_code: str = Field(alias='at7Code')
  status_description: str | None = Field(default=None, alias='statusDescription')
  occurred_at: datetime = Field(alias='occurredAt')
  city: str
  state: str
  created_at: datetime = Field(alias='createdAt')
