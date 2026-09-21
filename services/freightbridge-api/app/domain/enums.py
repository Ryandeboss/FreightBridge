from enum import Enum


class FreightBridgeEnum(str, Enum):
  def __str__(self) -> str:
    return self.value


class EquipmentType(FreightBridgeEnum):
  DRY_VAN_53 = 'DRY_VAN_53'
  REFRIGERATED_53 = 'REFRIGERATED_53'
  FLATBED = 'FLATBED'


class StopType(FreightBridgeEnum):
  PICKUP = 'PICKUP'
  DELIVERY = 'DELIVERY'


class ReferenceType(FreightBridgeEnum):
  BOL = 'BOL'
  PO = 'PO'
  CUSTOMER_REFERENCE = 'CUSTOMER_REFERENCE'


class TenderStatus(FreightBridgeEnum):
  PENDING = 'PENDING'
  ACCEPTED = 'ACCEPTED'
  REJECTED = 'REJECTED'


class TenderDecision(FreightBridgeEnum):
  ACCEPTED = 'ACCEPTED'
  REJECTED = 'REJECTED'


class ShipmentStatus(FreightBridgeEnum):
  PLANNED = 'PLANNED'
  PICKED_UP = 'PICKED_UP'
  IN_TRANSIT = 'IN_TRANSIT'
  ARRIVED = 'ARRIVED'
  DELIVERED = 'DELIVERED'


class PartnerBusinessRole(FreightBridgeEnum):
  BROKER_3PL = 'BROKER_3PL'
  MOTOR_CARRIER = 'MOTOR_CARRIER'


class IntegrationStyle(FreightBridgeEnum):
  REST_JSON = 'REST_JSON'
  X12_SFTP = 'X12_SFTP'


class IntegrationDirection(FreightBridgeEnum):
  INBOUND = 'INBOUND'
  OUTBOUND = 'OUTBOUND'


class Transport(FreightBridgeEnum):
  REST = 'REST'
  SFTP = 'SFTP'


class MessageFormat(FreightBridgeEnum):
  JSON = 'JSON'
  X12 = 'X12'


class ProcessingStatus(FreightBridgeEnum):
  RECEIVED = 'RECEIVED'
  PROCESSING = 'PROCESSING'
  SUCCEEDED = 'SUCCEEDED'
  FAILED = 'FAILED'


class ProcessingStage(FreightBridgeEnum):
  RECEIVED = 'RECEIVED'
  AUTHENTICATION = 'AUTHENTICATION'
  PARSING = 'PARSING'
  VALIDATION = 'VALIDATION'
  MAPPING = 'MAPPING'
  BUSINESS_VALIDATION = 'BUSINESS_VALIDATION'
  ROUTING = 'ROUTING'
  DELIVERY = 'DELIVERY'
  ACKNOWLEDGMENT = 'ACKNOWLEDGMENT'
  COMPLETED = 'COMPLETED'


class ErrorCategory(FreightBridgeEnum):
  TRANSPORT_ERROR = 'TRANSPORT_ERROR'
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR'
  AUTHORIZATION_ERROR = 'AUTHORIZATION_ERROR'
  SYNTAX_ERROR = 'SYNTAX_ERROR'
  UNSUPPORTED_VERSION = 'UNSUPPORTED_VERSION'
  MAPPING_ERROR = 'MAPPING_ERROR'
  BUSINESS_VALIDATION_ERROR = 'BUSINESS_VALIDATION_ERROR'
  DUPLICATE_TRANSACTION = 'DUPLICATE_TRANSACTION'
  DOWNSTREAM_ERROR = 'DOWNSTREAM_ERROR'
