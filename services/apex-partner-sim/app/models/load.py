from datetime import datetime
from enum import StrEnum
import re
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, field_validator, model_validator


def ensure_aware_datetime(value: datetime) -> datetime:
  if value.tzinfo is None or value.tzinfo.utcoffset(value) is None:
    raise ValueError('datetime must include timezone information')
  return value


AwareDatetime = Annotated[datetime, AfterValidator(ensure_aware_datetime)]


class EquipmentType(StrEnum):
  VAN_53 = 'VAN_53'
  REEFER_53 = 'REEFER_53'
  FLATBED = 'FLATBED'


class LocationRole(StrEnum):
  PICKUP = 'PICKUP'
  DELIVERY = 'DELIVERY'


class ReferenceType(StrEnum):
  BOL = 'BOL'
  PO = 'PO'
  CUSTOMER_REF = 'CUSTOMER_REF'
  APPOINTMENT = 'APPOINTMENT'


STATE_PATTERN = re.compile(r'^[A-Z]{2}$')


class ApexLocation(BaseModel):
  facility_name: str = Field(alias='facilityName', min_length=1, max_length=60)
  address_1: str = Field(alias='address1', min_length=1, max_length=80)
  address_2: str | None = Field(default=None, alias='address2', max_length=80)
  city: str = Field(min_length=1, max_length=40)
  state: str = Field(min_length=2, max_length=2)
  postal_code: str = Field(alias='postalCode', min_length=5, max_length=10)
  scheduled_datetime: AwareDatetime = Field(alias='scheduledDateTime')

  model_config = ConfigDict(populate_by_name=True)

  @field_validator('state')
  @classmethod
  def state_must_be_two_uppercase_letters(cls, value: str) -> str:
    if not STATE_PATTERN.fullmatch(value):
      raise ValueError('state must be a two-letter uppercase code')
    return value


class ApexReference(BaseModel):
  type: ReferenceType
  value: str = Field(min_length=1, max_length=80)
  description: str | None = Field(default=None, max_length=120)

  model_config = ConfigDict(populate_by_name=True)


class ApexLoad(BaseModel):
  load_id: str = Field(alias='loadId', min_length=6, max_length=30)
  bol_number: str = Field(alias='bolNumber', min_length=1, max_length=40)
  purchase_order_number: str | None = Field(default=None, alias='purchaseOrderNumber', max_length=40)
  customer_reference: str | None = Field(default=None, alias='customerReference', min_length=1, max_length=40)
  equipment_type: EquipmentType = Field(alias='equipmentType')
  weight_lbs: float = Field(alias='weightLbs', gt=0)
  pieces: int | None = Field(default=None, gt=0)
  commodity_description: str = Field(alias='commodityDescription', min_length=1, max_length=80)
  pickup: ApexLocation
  delivery: ApexLocation
  references: list[ApexReference] = Field(default_factory=list)
  created_at: AwareDatetime = Field(alias='createdAt')
  updated_at: AwareDatetime = Field(alias='updatedAt')

  model_config = ConfigDict(populate_by_name=True)

  @model_validator(mode='after')
  def updated_at_cannot_precede_created_at(self) -> 'ApexLoad':
    if self.updated_at < self.created_at:
      raise ValueError('updatedAt cannot precede createdAt')
    return self
