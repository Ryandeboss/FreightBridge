from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.domain.enums import (
  EquipmentType,
  ReferenceType,
  ShipmentStatus,
  StopType,
  TenderStatus,
)
from app.domain.location import CanonicalLocation
from app.domain.validation import AwareDatetime


class ShipmentReference(BaseModel):
  model_config = ConfigDict(str_strip_whitespace=True)

  reference_type: ReferenceType
  reference_value: str = Field(min_length=1, max_length=120)
  source_partner_id: UUID | None = None
  created_at: AwareDatetime | None = None


class ShipmentStop(BaseModel):
  model_config = ConfigDict(str_strip_whitespace=True)

  stop_sequence: int = Field(gt=0)
  stop_type: StopType
  location: CanonicalLocation


class CanonicalShipment(BaseModel):
  model_config = ConfigDict(str_strip_whitespace=True)

  shipment_id: UUID | None = None
  shipment_number: str = Field(min_length=1, max_length=80)
  equipment_type: EquipmentType
  weight_lbs: Decimal = Field(gt=Decimal('0'))
  pieces: int | None = Field(default=None, gt=0)
  commodity_description: str = Field(min_length=1, max_length=240)
  origin: CanonicalLocation
  destination: CanonicalLocation
  references: list[ShipmentReference] = Field(default_factory=list)
  tender_status: TenderStatus = TenderStatus.PENDING
  current_status: ShipmentStatus = ShipmentStatus.PLANNED
  current_status_occurred_at: AwareDatetime | None = None
  created_at: AwareDatetime | None = None
  updated_at: AwareDatetime | None = None

  @field_validator('shipment_number')
  @classmethod
  def normalize_shipment_number(cls, value: str) -> str:
    return value.strip()

  @model_validator(mode='after')
  def validate_status_timestamp(self) -> 'CanonicalShipment':
    if self.current_status != ShipmentStatus.PLANNED and self.current_status_occurred_at is None:
      raise ValueError('current_status_occurred_at is required for active shipment statuses')
    return self

  def stops(self) -> list[ShipmentStop]:
    return [
      ShipmentStop(
        stop_sequence=1,
        stop_type=StopType.PICKUP,
        location=self.origin,
      ),
      ShipmentStop(
        stop_sequence=2,
        stop_type=StopType.DELIVERY,
        location=self.destination,
      ),
    ]
