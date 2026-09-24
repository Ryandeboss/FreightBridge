from dataclasses import dataclass, field
from decimal import Decimal
from uuid import UUID

from app.domain import (
  CanonicalLocation,
  CanonicalShipment,
  EquipmentType,
  ReferenceType,
  ShipmentReference,
)
from app.integrations.apex.models import ApexEquipmentType, ApexInboundLoad, ApexReferenceType
from app.models.configuration import ApexLoadMappingConfig


class ApexMappingError(ValueError):
  pass


@dataclass(frozen=True)
class ApexMappingResult:
  shipment: CanonicalShipment
  metadata: dict[str, object] = field(default_factory=dict)


EQUIPMENT_MAP = {
  ApexEquipmentType.VAN_53: EquipmentType.DRY_VAN_53,
  ApexEquipmentType.REEFER_53: EquipmentType.REFRIGERATED_53,
  ApexEquipmentType.FLATBED: EquipmentType.FLATBED,
}

REFERENCE_MAP = {
  ApexReferenceType.BOL: ReferenceType.BOL,
  ApexReferenceType.PO: ReferenceType.PO,
  ApexReferenceType.CUSTOMER_REF: ReferenceType.CUSTOMER_REFERENCE,
}


def default_apex_load_mapping_config() -> ApexLoadMappingConfig:
  return ApexLoadMappingConfig(
    equipment_map={key.value: value for key, value in EQUIPMENT_MAP.items()},
    reference_map={key.value: value for key, value in REFERENCE_MAP.items()},
    ignored_reference_types=[ApexReferenceType.APPOINTMENT.value],
  )


def map_apex_load_to_canonical(
  load: ApexInboundLoad,
  source_partner_id: UUID | None = None,
  *,
  config: ApexLoadMappingConfig | None = None,
) -> ApexMappingResult:
  resolved_config = config or default_apex_load_mapping_config()
  try:
    equipment_type = resolved_config.equipment_map[load.equipment_type.value]
  except KeyError as exc:
    raise ApexMappingError('Unsupported Apex equipment type.') from exc

  configured_ignored_reference_types = set(resolved_config.ignored_reference_types)
  ignored_reference_types: set[str] = set()
  references: dict[tuple[ReferenceType, str], ShipmentReference] = {}

  def add_reference(reference_type: ReferenceType, value: str | None) -> None:
    if value:
      key = (reference_type, value)
      references[key] = ShipmentReference(
        reference_type=reference_type,
        reference_value=value,
        source_partner_id=source_partner_id,
      )

  add_reference(ReferenceType.BOL, load.bol_number)
  add_reference(ReferenceType.PO, load.purchase_order_number)
  add_reference(ReferenceType.CUSTOMER_REFERENCE, load.customer_reference)

  for source_reference in load.references:
    if source_reference.type.value in configured_ignored_reference_types:
      ignored_reference_types.add(source_reference.type.value)
      continue
    try:
      reference_type = resolved_config.reference_map[source_reference.type.value]
    except KeyError as exc:
      raise ApexMappingError('Unsupported Apex reference type.') from exc
    add_reference(reference_type, source_reference.value)

  metadata: dict[str, object] = {
    'loadId': load.load_id,
    'shipment_number': load.load_id,
  }
  if ignored_reference_types:
    metadata['ignored_reference_types'] = sorted(ignored_reference_types)

  return ApexMappingResult(
    shipment=CanonicalShipment(
      shipment_number=load.load_id,
      equipment_type=equipment_type,
      weight_lbs=Decimal(str(load.weight_lbs)),
      pieces=load.pieces,
      commodity_description=load.commodity_description,
      origin=CanonicalLocation(
        facility_name=load.pickup.facility_name,
        address_line_1=load.pickup.address_1,
        address_line_2=load.pickup.address_2,
        city=load.pickup.city,
        state=load.pickup.state,
        postal_code=load.pickup.postal_code,
        scheduled_at=load.pickup.scheduled_datetime,
      ),
      destination=CanonicalLocation(
        facility_name=load.delivery.facility_name,
        address_line_1=load.delivery.address_1,
        address_line_2=load.delivery.address_2,
        city=load.delivery.city,
        state=load.delivery.state,
        postal_code=load.delivery.postal_code,
        scheduled_at=load.delivery.scheduled_datetime,
      ),
      references=list(references.values()),
    ),
    metadata=metadata,
  )
