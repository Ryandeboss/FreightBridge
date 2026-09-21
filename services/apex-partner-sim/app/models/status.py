from enum import StrEnum
import re

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.load import AwareDatetime


STATE_PATTERN = re.compile(r'^[A-Z]{2}$')


class ShipmentStatusCode(StrEnum):
  PICKED_UP = 'PICKED_UP'
  IN_TRANSIT = 'IN_TRANSIT'
  ARRIVED = 'ARRIVED'
  DELIVERED = 'DELIVERED'


class ApexShipmentStatus(BaseModel):
  load_id: str = Field(alias='loadId', min_length=6, max_length=30)
  carrier_code: str = Field(alias='carrierCode', min_length=2, max_length=10)
  status_code: ShipmentStatusCode = Field(alias='statusCode')
  status_description: str | None = Field(default=None, alias='statusDescription', max_length=240)
  occurred_at: AwareDatetime = Field(alias='occurredAt')
  city: str | None = Field(default=None, min_length=1, max_length=40)
  state: str | None = Field(default=None, min_length=2, max_length=2)

  model_config = ConfigDict(populate_by_name=True)

  @field_validator('state')
  @classmethod
  def state_must_be_two_uppercase_letters(cls, value: str | None) -> str | None:
    if value is not None and not STATE_PATTERN.fullmatch(value):
      raise ValueError('state must be a two-letter uppercase code')
    return value


STATUS_PROGRESSION: dict[ShipmentStatusCode, int] = {
  ShipmentStatusCode.PICKED_UP: 1,
  ShipmentStatusCode.IN_TRANSIT: 2,
  ShipmentStatusCode.ARRIVED: 3,
  ShipmentStatusCode.DELIVERED: 4,
}


def should_advance_current_status(
  current_status: ShipmentStatusCode | None,
  current_occurred_at: AwareDatetime | None,
  incoming_status: ShipmentStatusCode,
  incoming_occurred_at: AwareDatetime,
) -> bool:
  if current_status is None or current_occurred_at is None:
    return True

  if incoming_occurred_at < current_occurred_at:
    return False

  current_rank = STATUS_PROGRESSION[current_status]
  incoming_rank = STATUS_PROGRESSION[incoming_status]

  if incoming_occurred_at > current_occurred_at:
    return incoming_rank >= current_rank

  return incoming_rank > current_rank
