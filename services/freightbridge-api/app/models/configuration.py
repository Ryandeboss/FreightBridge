from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from app.domain import EquipmentType, ReferenceType, ShipmentStatus, TenderDecision


class ConfigurationModel(BaseModel):
  model_config = ConfigDict(populate_by_name=True, extra='forbid')


class CapabilityView(ConfigurationModel):
  id: UUID
  partner_id: UUID = Field(alias='partnerId')
  direction: str
  document_type: str = Field(alias='documentType')
  transport: str
  message_format: str = Field(alias='messageFormat')
  protocol_version: str | None = Field(default=None, alias='protocolVersion')
  enabled: bool
  created_at: datetime = Field(alias='createdAt')
  updated_at: datetime = Field(alias='updatedAt')


class TradingPartnerView(ConfigurationModel):
  id: UUID
  partner_code: str = Field(alias='partnerCode')
  name: str
  business_role: str = Field(alias='businessRole')
  integration_style: str = Field(alias='integrationStyle')
  active: bool
  description: str | None = None
  support_contact: str | None = Field(default=None, alias='supportContact')
  config_revision: int = Field(alias='configRevision')
  capabilities_enabled: int = Field(default=0, alias='capabilitiesEnabled')
  capabilities_total: int = Field(default=0, alias='capabilitiesTotal')
  capabilities: list[CapabilityView] = Field(default_factory=list)
  created_at: datetime = Field(alias='createdAt')
  updated_at: datetime = Field(alias='updatedAt')


class UpdateTradingPartnerRequest(ConfigurationModel):
  name: str | None = Field(default=None, min_length=1, max_length=120)
  description: str | None = Field(default=None, max_length=1000)
  support_contact: str | None = Field(default=None, alias='supportContact', max_length=200)
  active: bool | None = None


class UpdateCapabilityRequest(ConfigurationModel):
  enabled: bool
  note: str | None = Field(default=None, max_length=500)


class MappingRuleView(ConfigurationModel):
  id: UUID
  mapping_profile_id: UUID = Field(alias='mappingProfileId')
  sequence: int
  rule_key: str = Field(alias='ruleKey')
  source_path: str | None = Field(alias='sourcePath')
  target_path: str | None = Field(alias='targetPath')
  transformation: str
  required: bool
  qualifier_or_condition: str | None = Field(alias='qualifierOrCondition')
  failure_code: str | None = Field(alias='failureCode')
  configuration: dict[str, object]
  notes: str | None
  created_at: datetime = Field(alias='createdAt')
  updated_at: datetime = Field(alias='updatedAt')


class MappingProfileView(ConfigurationModel):
  id: UUID
  partner_id: UUID = Field(alias='partnerId')
  partner_code: str = Field(alias='partnerCode')
  partner_name: str = Field(alias='partnerName')
  mapping_key: str = Field(alias='mappingKey')
  name: str
  description: str | None
  direction: str
  source_format: str = Field(alias='sourceFormat')
  target_format: str = Field(alias='targetFormat')
  source_document_type: str = Field(alias='sourceDocumentType')
  target_document_type: str = Field(alias='targetDocumentType')
  version_number: int = Field(alias='versionNumber')
  status: str
  settings: dict[str, object]
  validation_status: str = Field(alias='validationStatus')
  validation_errors: list[dict[str, object]] = Field(alias='validationErrors')
  based_on_profile_id: UUID | None = Field(alias='basedOnProfileId')
  change_note: str | None = Field(alias='changeNote')
  created_at: datetime = Field(alias='createdAt')
  updated_at: datetime = Field(alias='updatedAt')
  validated_at: datetime | None = Field(alias='validatedAt')
  activated_at: datetime | None = Field(alias='activatedAt')
  rules: list[MappingRuleView] = Field(default_factory=list)
  versions: list['MappingProfileView'] = Field(default_factory=list)


class UpdateMappingProfileRequest(ConfigurationModel):
  name: str | None = Field(default=None, min_length=1, max_length=160)
  description: str | None = Field(default=None, max_length=1000)
  change_note: str | None = Field(default=None, alias='changeNote', max_length=500)
  settings: dict[str, object] | None = None


class UpdateMappingRuleRequest(ConfigurationModel):
  configuration: dict[str, object] | None = None
  notes: str | None = Field(default=None, max_length=1000)


class CloneDraftRequest(ConfigurationModel):
  change_note: str | None = Field(default=None, alias='changeNote', max_length=500)


class ConfigurationChangeView(ConfigurationModel):
  id: UUID
  entity_type: str = Field(alias='entityType')
  entity_id: UUID = Field(alias='entityId')
  action: str
  before_snapshot: dict[str, object] | None = Field(alias='beforeSnapshot')
  after_snapshot: dict[str, object] | None = Field(alias='afterSnapshot')
  note: str | None
  source: str
  created_at: datetime = Field(alias='createdAt')


class ChangeSearchResponse(ConfigurationModel):
  limit: int
  offset: int
  count: int
  changes: list[ConfigurationChangeView]


class MappingSearchResponse(ConfigurationModel):
  limit: int
  offset: int
  count: int
  mappings: list[MappingProfileView]


class ValidationResult(ConfigurationModel):
  status: Literal['VALID', 'INVALID']
  errors: list[dict[str, object]]


class ApexLoadMappingConfig(BaseModel):
  model_config = ConfigDict(extra='forbid', populate_by_name=True)

  equipment_map: dict[str, EquipmentType] = Field(alias='equipmentMap')
  reference_map: dict[str, ReferenceType] = Field(alias='referenceMap')
  ignored_reference_types: list[str] = Field(default_factory=list, alias='ignoredReferenceTypes')


class Midwest204MappingConfig(BaseModel):
  model_config = ConfigDict(extra='forbid', populate_by_name=True)

  sender_id: str = Field(alias='senderId', min_length=1, max_length=15)
  receiver_id: str = Field(alias='receiverId', min_length=1, max_length=15)
  x12_version: Literal['004010'] = Field(alias='x12Version')
  isa_control_version: Literal['00401'] = Field(alias='isaControlVersion')
  functional_identifier: Literal['SM'] = Field(alias='functionalIdentifier')
  transaction_set: Literal['204'] = Field(alias='transactionSet')
  usage_indicator: Literal['T'] = Field(alias='usageIndicator')
  payment_method: str = Field(alias='paymentMethod', min_length=1)
  bol_qualifier: str = Field(alias='bolQualifier', min_length=1)
  po_qualifier: str = Field(alias='poQualifier', min_length=1)
  pickup_date_qualifier: str = Field(alias='pickupDateQualifier', min_length=1)
  pickup_time_qualifier: str = Field(alias='pickupTimeQualifier', min_length=1)
  delivery_date_qualifier: str = Field(alias='deliveryDateQualifier', min_length=1)
  delivery_time_qualifier: str = Field(alias='deliveryTimeQualifier', min_length=1)
  pickup_stop_reason: str = Field(alias='pickupStopReason', min_length=1)
  delivery_stop_reason: str = Field(alias='deliveryStopReason', min_length=1)
  shipper_entity_identifier: str = Field(alias='shipperEntityIdentifier', min_length=1)
  consignee_entity_identifier: str = Field(alias='consigneeEntityIdentifier', min_length=1)
  weight_qualifier: str = Field(alias='weightQualifier', min_length=1)
  timestamp_policy: Literal['UTC'] = Field(alias='timestampPolicy')


class Midwest990MappingConfig(BaseModel):
  model_config = ConfigDict(extra='forbid', populate_by_name=True)

  expected_sender: Literal['MWCX'] = Field(alias='expectedSender')
  expected_receiver: Literal['FREIGHTBRIDGE'] = Field(alias='expectedReceiver')
  x12_version: Literal['004010'] = Field(alias='x12Version')
  isa_control_version: Literal['00401'] = Field(alias='isaControlVersion')
  functional_identifier: Literal['GF'] = Field(alias='functionalIdentifier')
  transaction_set: Literal['990'] = Field(alias='transactionSet')
  decision_code_map: dict[str, TenderDecision] = Field(alias='decisionCodeMap')
  carrier_load_qualifier: str = Field(alias='carrierLoadQualifier')
  rejection_reason_qualifier: str = Field(alias='rejectionReasonQualifier')
  bol_qualifier: str = Field(alias='bolQualifier')
  po_qualifier: str = Field(alias='poQualifier')

  @field_validator('decision_code_map')
  @classmethod
  def validate_decision_map(cls, value: dict[str, TenderDecision]) -> dict[str, TenderDecision]:
    if set(value.keys()) != {'A', 'D'}:
      raise ValueError('decisionCodeMap must contain A and D')
    return value


class Midwest214MappingConfig(BaseModel):
  model_config = ConfigDict(extra='forbid', populate_by_name=True)

  expected_sender: Literal['MWCX'] = Field(alias='expectedSender')
  expected_receiver: Literal['FREIGHTBRIDGE'] = Field(alias='expectedReceiver')
  x12_version: Literal['004010'] = Field(alias='x12Version')
  isa_control_version: Literal['00401'] = Field(alias='isaControlVersion')
  functional_identifier: Literal['QM'] = Field(alias='functionalIdentifier')
  transaction_set: Literal['214'] = Field(alias='transactionSet')
  status_code_map: dict[str, ShipmentStatus] = Field(alias='statusCodeMap')
  event_time_code: Literal['UT'] = Field(alias='eventTimeCode')
  bol_qualifier: str = Field(alias='bolQualifier')
  po_qualifier: str = Field(alias='poQualifier')


class Midwest997MappingConfig(BaseModel):
  model_config = ConfigDict(extra='forbid', populate_by_name=True)

  expected_sender: Literal['MWCX'] = Field(alias='expectedSender')
  expected_receiver: Literal['FREIGHTBRIDGE'] = Field(alias='expectedReceiver')
  x12_version: Literal['004010'] = Field(alias='x12Version')
  isa_control_version: Literal['00401'] = Field(alias='isaControlVersion')
  functional_identifier: Literal['FA'] = Field(alias='functionalIdentifier')
  transaction_set: Literal['997'] = Field(alias='transactionSet')
  acknowledged_functional_identifier: Literal['SM'] = Field(alias='acknowledgedFunctionalIdentifier')
  acknowledged_transaction_set: Literal['204'] = Field(alias='acknowledgedTransactionSet')
  supported_ack_codes: list[Literal['A', 'R']] = Field(alias='supportedAckCodes')
  expected_included_count: Literal[1] = Field(alias='expectedIncludedCount')
  expected_received_count: Literal[1] = Field(alias='expectedReceivedCount')


CONFIG_MODELS = {
  'APEX_LOAD_TO_CANONICAL': ApexLoadMappingConfig,
  'CANONICAL_TO_MWCX_204': Midwest204MappingConfig,
  'MWCX_990_TO_CANONICAL': Midwest990MappingConfig,
  'MWCX_214_TO_CANONICAL': Midwest214MappingConfig,
  'MWCX_997_TO_ACK': Midwest997MappingConfig,
}


def validate_mapping_settings(mapping_key: str, settings: dict[str, object]) -> ValidationResult:
  model = CONFIG_MODELS.get(mapping_key)
  if model is None:
    return ValidationResult(status='INVALID', errors=[{'field': 'mappingKey', 'message': 'Unsupported mapping key.'}])
  try:
    model.model_validate(settings)
  except ValidationError as exc:
    return ValidationResult(
      status='INVALID',
      errors=[
        {'field': '.'.join(str(part) for part in error['loc']), 'message': str(error['msg'])}
        for error in exc.errors()
      ],
    )
  return ValidationResult(status='VALID', errors=[])
