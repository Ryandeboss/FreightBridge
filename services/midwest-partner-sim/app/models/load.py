from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class Party(BaseModel):
  model_config = ConfigDict(populate_by_name=True)

  name: str
  address_line_1: str = Field(alias='addressLine1')
  city: str
  state: str
  postal_code: str = Field(alias='postalCode')


class MidwestLoad(BaseModel):
  model_config = ConfigDict(populate_by_name=True)

  id: UUID
  customer_shipment_number: str = Field(alias='customerShipmentNumber')
  bol_reference: str = Field(alias='bolReference')
  purchase_order_reference: str | None = Field(default=None, alias='purchaseOrderReference')
  gross_weight_lb: Decimal = Field(alias='grossWeightLb')
  handling_units: int = Field(alias='handlingUnits')
  shipper: Party
  consignee: Party
  pickup_appointment: datetime = Field(alias='pickupAppointment')
  delivery_appointment: datetime = Field(alias='deliveryAppointment')
  tender_status: str = Field(alias='tenderStatus')
  carrier_load_number: str | None = Field(default=None, alias='carrierLoadNumber')
