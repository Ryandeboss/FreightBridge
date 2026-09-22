from dataclasses import dataclass
from enum import Enum


class Midwest204ErrorCode(str, Enum):
  SHIPMENT_NOT_FOUND = 'SHIPMENT_NOT_FOUND'
  MISSING_SHIPMENT_NUMBER = 'MISSING_SHIPMENT_NUMBER'
  MISSING_BOL_REFERENCE = 'MISSING_BOL_REFERENCE'
  MISSING_ORIGIN_ADDRESS = 'MISSING_ORIGIN_ADDRESS'
  MISSING_DESTINATION_ADDRESS = 'MISSING_DESTINATION_ADDRESS'
  MISSING_PICKUP_APPOINTMENT = 'MISSING_PICKUP_APPOINTMENT'
  MISSING_DELIVERY_APPOINTMENT = 'MISSING_DELIVERY_APPOINTMENT'
  MISSING_WEIGHT = 'MISSING_WEIGHT'
  MISSING_PIECES = 'MISSING_PIECES'
  MIDWEST_204_ENVELOPE_VALIDATION_FAILED = 'MIDWEST_204_ENVELOPE_VALIDATION_FAILED'


@dataclass
class Midwest204MappingError(Exception):
  code: Midwest204ErrorCode
  message: str
  field: str | None = None


class MidwestShipmentNotFoundError(Exception):
  def __init__(self, shipment_number: str) -> None:
    self.shipment_number = shipment_number
    super().__init__(f'Shipment {shipment_number} was not found.')
