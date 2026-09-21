from app.domain import EquipmentType, ReferenceType
from app.integrations.apex.mapper import map_apex_load_to_canonical
from app.integrations.apex.models import ApexInboundLoad


def apex_payload(**overrides) -> dict[str, object]:
  payload: dict[str, object] = {
    'loadId': 'LOAD500',
    'bolNumber': 'BOL900',
    'purchaseOrderNumber': 'PO111',
    'customerReference': 'CUST-REF-500',
    'equipmentType': 'VAN_53',
    'weightLbs': 42000,
    'pieces': 22,
    'commodityDescription': 'Packaged auto parts',
    'pickup': {
      'facilityName': 'ABC Factory',
      'address1': '200 Industrial Rd',
      'address2': 'Dock 4',
      'city': 'Aurora',
      'state': 'IL',
      'postalCode': '60505',
      'scheduledDateTime': '2026-10-01T14:00:00Z',
    },
    'delivery': {
      'facilityName': 'XYZ Warehouse',
      'address1': '900 Commerce St',
      'address2': None,
      'city': 'Detroit',
      'state': 'MI',
      'postalCode': '48201',
      'scheduledDateTime': '2026-10-02T18:00:00Z',
    },
    'references': [
      {'type': 'CUSTOMER_REF', 'value': 'CUST-REF-500', 'description': 'Customer routing reference'},
    ],
    'createdAt': '2026-09-19T14:00:00Z',
    'updatedAt': '2026-09-19T14:05:00Z',
  }
  payload.update(overrides)
  return payload


def test_load500_maps_to_canonical_shipment() -> None:
  mapping = map_apex_load_to_canonical(ApexInboundLoad.model_validate(apex_payload()))
  shipment = mapping.shipment

  assert shipment.shipment_number == 'LOAD500'
  assert shipment.equipment_type == EquipmentType.DRY_VAN_53
  assert shipment.weight_lbs == 42000
  assert shipment.pieces == 22
  assert shipment.commodity_description == 'Packaged auto parts'
  assert shipment.origin.facility_name == 'ABC Factory'
  assert shipment.origin.address_line_1 == '200 Industrial Rd'
  assert shipment.origin.city == 'Aurora'
  assert shipment.origin.state == 'IL'
  assert shipment.origin.postal_code == '60505'
  assert shipment.destination.facility_name == 'XYZ Warehouse'
  assert shipment.destination.address_line_1 == '900 Commerce St'
  assert shipment.destination.city == 'Detroit'
  assert shipment.destination.state == 'MI'
  assert shipment.destination.postal_code == '48201'
  assert {
    (reference.reference_type, reference.reference_value)
    for reference in shipment.references
  } == {
    (ReferenceType.BOL, 'BOL900'),
    (ReferenceType.PO, 'PO111'),
    (ReferenceType.CUSTOMER_REFERENCE, 'CUST-REF-500'),
  }


def test_equipment_mappings() -> None:
  reefer = map_apex_load_to_canonical(
    ApexInboundLoad.model_validate(apex_payload(equipmentType='REEFER_53'))
  )
  flatbed = map_apex_load_to_canonical(
    ApexInboundLoad.model_validate(apex_payload(equipmentType='FLATBED'))
  )

  assert reefer.shipment.equipment_type == EquipmentType.REFRIGERATED_53
  assert flatbed.shipment.equipment_type == EquipmentType.FLATBED


def test_optional_po_and_customer_reference_can_be_absent() -> None:
  mapping = map_apex_load_to_canonical(
    ApexInboundLoad.model_validate(
      apex_payload(purchaseOrderNumber=None, customerReference=None, references=[])
    )
  )

  assert {
    reference.reference_type
    for reference in mapping.shipment.references
  } == {ReferenceType.BOL}


def test_duplicate_source_references_are_deduplicated() -> None:
  mapping = map_apex_load_to_canonical(
    ApexInboundLoad.model_validate(
      apex_payload(
        references=[
          {'type': 'BOL', 'value': 'BOL900'},
          {'type': 'PO', 'value': 'PO111'},
          {'type': 'CUSTOMER_REF', 'value': 'CUST-REF-500'},
        ]
      )
    )
  )

  assert len(mapping.shipment.references) == 3


def test_appointment_reference_is_deterministically_ignored() -> None:
  mapping = map_apex_load_to_canonical(
    ApexInboundLoad.model_validate(
      apex_payload(
        references=[
          {'type': 'APPOINTMENT', 'value': 'APT-1'},
        ]
      )
    )
  )

  assert mapping.metadata['ignored_reference_types'] == ['APPOINTMENT']
  assert all(
    reference.reference_value != 'APT-1'
    for reference in mapping.shipment.references
  )
