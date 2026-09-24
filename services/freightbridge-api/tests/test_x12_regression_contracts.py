from datetime import datetime, timezone

from app.domain import EquipmentType, ReferenceType
from app.integrations.apex.mapper import map_apex_load_to_canonical
from app.integrations.apex.models import ApexInboundLoad
from app.integrations.midwest import generate_midwest_204
from app.integrations.x12 import parse_x12, validate_x12_envelopes
from tests.support.builders import (
  apex_load_json,
  canonical_shipment,
  deterministic_controls,
)


FIXED_GENERATED_AT = datetime(2026, 9, 24, 15, 0, tzinfo=timezone.utc)


def test_204_golden_contract_preserves_profile_controls_and_business_segments() -> None:
  generated = generate_midwest_204(
    canonical_shipment(),
    generated_at=FIXED_GENERATED_AT,
    control_numbers=deterministic_controls(),
  )
  interchange = parse_x12(generated.serialized_x12)
  validate_x12_envelopes(interchange)
  segments = [(segment.segment_id, tuple(segment.elements)) for segment in interchange.segments]
  transaction = interchange.functional_groups[0].transaction_sets[0]

  assert interchange.interchange_control_version == '00401'
  assert interchange.functional_groups[0].functional_identifier == 'SM'
  assert interchange.functional_groups[0].version_release == '004010'
  assert transaction.transaction_set_identifier == '204'
  assert ('B2', ('', 'MWCX', '', 'LOAD500', '', 'PP')) in segments
  assert not any(segment_id == 'B2A' for segment_id, _ in segments)
  assert ('L11', ('BOL900', 'BM')) in segments
  assert ('L11', ('PO111', 'PO')) in segments
  assert ('N1', ('SH', 'ABC Factory')) in segments
  assert ('N1', ('CN', 'XYZ Warehouse')) in segments
  assert transaction.se_segment.element(1) == str(len(transaction.segments))
  assert interchange.functional_groups[0].ge_segment.element(1) == '1'
  assert interchange.iea_segment.element(1) == '1'


def test_apex_to_canonical_to_204_offline_contract_chain_preserves_business_values() -> None:
  apex_load = ApexInboundLoad.model_validate(apex_load_json())
  mapping = map_apex_load_to_canonical(apex_load)
  generated = generate_midwest_204(
    mapping.shipment,
    generated_at=FIXED_GENERATED_AT,
    control_numbers=deterministic_controls(),
  )
  interchange = parse_x12(generated.serialized_x12)
  validate_x12_envelopes(interchange)
  segments = [(segment.segment_id, tuple(segment.elements)) for segment in interchange.segments]

  assert mapping.shipment.shipment_number == 'LOAD500'
  assert mapping.shipment.equipment_type == EquipmentType.DRY_VAN_53
  assert mapping.shipment.weight_lbs == 42000
  assert {
    (reference.reference_type, reference.reference_value)
    for reference in mapping.shipment.references
  } >= {
    (ReferenceType.BOL, 'BOL900'),
    (ReferenceType.PO, 'PO111'),
  }
  assert ('B2', ('', 'MWCX', '', 'LOAD500', '', 'PP')) in segments
  assert ('L11', ('BOL900', 'BM')) in segments
  assert ('L11', ('PO111', 'PO')) in segments
  assert ('N4', ('Aurora', 'IL', '60505')) in segments
  assert ('N4', ('Detroit', 'MI', '48201')) in segments
