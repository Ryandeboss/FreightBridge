from datetime import datetime, timezone
from decimal import Decimal

from fastapi.testclient import TestClient
import pytest

from app.api.routes.midwest_integrations import get_midwest_204_generation_service
from app.domain import (
  CanonicalLocation,
  CanonicalShipment,
  EquipmentType,
  ReferenceType,
  ShipmentReference,
)
from app.integrations.midwest import (
  FixedControlNumberProvider,
  Midwest204ErrorCode,
  Midwest204GenerationService,
  Midwest204MappingError,
  generate_midwest_204,
  load_mapping_spec,
)
from app.integrations.midwest.control_numbers import X12ControlNumbers
from app.integrations.midwest.errors import MidwestShipmentNotFoundError
from app.integrations.x12 import parse_x12, validate_x12_envelopes
from app.main import app


FIXED_GENERATED_AT = datetime(2026, 9, 19, 14, 0, tzinfo=timezone.utc)
FIXED_CONTROL_NUMBERS = X12ControlNumbers(
  interchange_control_number='000000905',
  group_control_number='905',
  transaction_control_number='0001',
)


def test_load500_generates_structurally_equivalent_midwest_204_fixture() -> None:
  generated = generate_midwest_204(
    canonical_load500(),
    generated_at=FIXED_GENERATED_AT,
    control_numbers=FIXED_CONTROL_NUMBERS,
  )

  expected = parse_x12(_read_fixture_204())
  actual = parse_x12(generated.serialized_x12)
  validate_x12_envelopes(actual)

  assert _segment_signature(actual) == _segment_signature(expected)
  assert generated.document_type == '204'
  assert generated.x12_version == '004010'
  assert generated.mapping_spec_version == load_mapping_spec()['version']


def test_generated_204_passes_generic_x12_round_trip_validation() -> None:
  generated = generate_midwest_204(
    canonical_load500(),
    generated_at=FIXED_GENERATED_AT,
    control_numbers=FIXED_CONTROL_NUMBERS,
  )

  interchange = parse_x12(generated.serialized_x12)
  validate_x12_envelopes(interchange)

  assert interchange.interchange_control_version == '00401'
  assert len(interchange.functional_groups) == 1
  assert interchange.functional_groups[0].version_release == '004010'
  assert interchange.functional_groups[0].transaction_sets[0].transaction_set_identifier == '204'
  assert len(generated.serialized_x12.split('~')[0]) == 105


def test_optional_po_is_omitted_and_counts_are_derived() -> None:
  shipment = canonical_load500(
    references=[
      ShipmentReference(reference_type=ReferenceType.BOL, reference_value='BOL900'),
      ShipmentReference(
        reference_type=ReferenceType.CUSTOMER_REFERENCE,
        reference_value='CUST-REF-500',
      ),
    ]
  )

  generated = generate_midwest_204(
    shipment,
    generated_at=FIXED_GENERATED_AT,
    control_numbers=FIXED_CONTROL_NUMBERS,
  )
  interchange = parse_x12(generated.serialized_x12)
  validate_x12_envelopes(interchange)

  transaction = interchange.functional_groups[0].transaction_sets[0]
  segments = _segment_signature(interchange)

  assert ('L11', ('PO111', 'PO')) not in segments
  assert ('L11', ('CUST-REF-500', 'CR')) not in segments
  assert transaction.se_segment.element(1) == str(len(transaction.segments))


@pytest.mark.parametrize(
  ('case_name', 'expected_code'),
  [
    (
      'missing_bol',
      Midwest204ErrorCode.MISSING_BOL_REFERENCE,
    ),
    (
      'missing_pickup_scheduled_at',
      Midwest204ErrorCode.MISSING_PICKUP_APPOINTMENT,
    ),
    (
      'missing_delivery_scheduled_at',
      Midwest204ErrorCode.MISSING_DELIVERY_APPOINTMENT,
    ),
    (
      'missing_origin_address',
      Midwest204ErrorCode.MISSING_ORIGIN_ADDRESS,
    ),
    (
      'missing_destination_address',
      Midwest204ErrorCode.MISSING_DESTINATION_ADDRESS,
    ),
    (
      'missing_shipment_number',
      Midwest204ErrorCode.MISSING_SHIPMENT_NUMBER,
    ),
    (
      'missing_weight',
      Midwest204ErrorCode.MISSING_WEIGHT,
    ),
    (
      'missing_pieces',
      Midwest204ErrorCode.MISSING_PIECES,
    ),
  ],
)
def test_midwest_business_validation_fails_before_x12_generation(
  case_name: str,
  expected_code: Midwest204ErrorCode,
) -> None:
  shipment = _invalid_shipment(case_name)

  with pytest.raises(Midwest204MappingError) as exc_info:
    generate_midwest_204(
      shipment,
      generated_at=FIXED_GENERATED_AT,
      control_numbers=FIXED_CONTROL_NUMBERS,
    )

  assert exc_info.value.code == expected_code


def test_generation_service_loads_canonical_shipment_by_number() -> None:
  repository = FakeShipmentRepository(canonical_load500())
  service = Midwest204GenerationService(
    repository=repository,
    control_number_provider=FixedControlNumberProvider('000000905', '905', '0001'),
    clock=lambda: FIXED_GENERATED_AT,
  )

  result = service.generate_for_shipment_number('LOAD500')

  assert repository.requested_shipment_number == 'LOAD500'
  assert result.shipment_number == 'LOAD500'
  validate_x12_envelopes(parse_x12(result.serialized_x12))


def test_generation_endpoint_returns_preview_payload() -> None:
  app.dependency_overrides[get_midwest_204_generation_service] = lambda: FakeGenerationService(
    generate_midwest_204(
      canonical_load500(),
      generated_at=FIXED_GENERATED_AT,
      control_numbers=FIXED_CONTROL_NUMBERS,
    )
  )
  client = TestClient(app)

  response = client.post('/api/integrations/midwest/load-tenders/LOAD500/generate')

  app.dependency_overrides.clear()
  assert response.status_code == 200
  body = response.json()
  assert body['shipmentNumber'] == 'LOAD500'
  assert body['documentType'] == '204'
  assert body['x12Version'] == '004010'
  assert 'ST*204*0001' in body['x12']
  assert 'B2**MWCX**LOAD500**PP' in body['x12']


def test_generation_endpoint_returns_404_for_missing_shipment() -> None:
  app.dependency_overrides[get_midwest_204_generation_service] = lambda: FakeMissingShipmentService()
  client = TestClient(app)

  response = client.post('/api/integrations/midwest/load-tenders/UNKNOWN/generate')

  app.dependency_overrides.clear()
  assert response.status_code == 404
  assert response.json()['error']['code'] == 'SHIPMENT_NOT_FOUND'


def test_generation_endpoint_returns_422_for_mapping_error() -> None:
  app.dependency_overrides[get_midwest_204_generation_service] = lambda: FakeMappingErrorService()
  client = TestClient(app)

  response = client.post('/api/integrations/midwest/load-tenders/LOAD500/generate')

  app.dependency_overrides.clear()
  assert response.status_code == 422
  assert response.json()['error']['code'] == 'MIDWEST_204_MAPPING_ERROR'
  assert response.json()['error']['detailCode'] == 'MISSING_BOL_REFERENCE'


class FakeShipmentRepository:
  def __init__(self, shipment: CanonicalShipment | None) -> None:
    self.shipment = shipment
    self.requested_shipment_number: str | None = None

  def fetch_shipment_by_number(self, shipment_number: str) -> CanonicalShipment | None:
    self.requested_shipment_number = shipment_number
    return self.shipment


class FakeGenerationService:
  def __init__(self, result) -> None:
    self.result = result

  def generate_for_shipment_number(self, shipment_number: str):
    return self.result


class FakeMissingShipmentService:
  def generate_for_shipment_number(self, shipment_number: str):
    raise MidwestShipmentNotFoundError(shipment_number)


class FakeMappingErrorService:
  def generate_for_shipment_number(self, shipment_number: str):
    raise Midwest204MappingError(
      Midwest204ErrorCode.MISSING_BOL_REFERENCE,
      'BOL reference is required for Midwest 204 generation.',
      'references.BOL',
    )


def canonical_load500(**overrides) -> CanonicalShipment:
  payload = {
    'shipment_number': 'LOAD500',
    'equipment_type': EquipmentType.DRY_VAN_53,
    'weight_lbs': Decimal('42000'),
    'pieces': 22,
    'commodity_description': 'Packaged auto parts',
    'origin': CanonicalLocation(
      facility_name='ABC Factory',
      address_line_1='200 Industrial Rd',
      address_line_2='Dock 4',
      city='Aurora',
      state='IL',
      postal_code='60505',
      scheduled_at=datetime(2026, 10, 1, 14, 0, tzinfo=timezone.utc),
    ),
    'destination': CanonicalLocation(
      facility_name='XYZ Warehouse',
      address_line_1='900 Commerce St',
      address_line_2=None,
      city='Detroit',
      state='MI',
      postal_code='48201',
      scheduled_at=datetime(2026, 10, 2, 18, 0, tzinfo=timezone.utc),
    ),
    'references': [
      ShipmentReference(reference_type=ReferenceType.BOL, reference_value='BOL900'),
      ShipmentReference(reference_type=ReferenceType.PO, reference_value='PO111'),
      ShipmentReference(
        reference_type=ReferenceType.CUSTOMER_REFERENCE,
        reference_value='CUST-REF-500',
      ),
    ],
  }
  payload.update(overrides)
  return CanonicalShipment.model_validate(payload)


def _invalid_shipment(case_name: str) -> CanonicalShipment:
  shipment = canonical_load500()
  if case_name == 'missing_bol':
    return shipment.model_copy(update={'references': []})
  if case_name == 'missing_pickup_scheduled_at':
    return shipment.model_copy(
      update={'origin': shipment.origin.model_copy(update={'scheduled_at': None})}
    )
  if case_name == 'missing_delivery_scheduled_at':
    return shipment.model_copy(
      update={'destination': shipment.destination.model_copy(update={'scheduled_at': None})}
    )
  if case_name == 'missing_origin_address':
    return shipment.model_copy(
      update={'origin': shipment.origin.model_copy(update={'address_line_1': ''})}
    )
  if case_name == 'missing_destination_address':
    return shipment.model_copy(
      update={'destination': shipment.destination.model_copy(update={'address_line_1': ''})}
    )
  if case_name == 'missing_shipment_number':
    return shipment.model_copy(update={'shipment_number': ''})
  if case_name == 'missing_weight':
    return shipment.model_copy(update={'weight_lbs': Decimal('0')})
  if case_name == 'missing_pieces':
    return shipment.model_copy(update={'pieces': None})
  raise AssertionError(f'Unknown invalid shipment case: {case_name}')


def _read_fixture_204() -> str:
  return (
    __import__('pathlib').Path(__file__).resolve().parents[3]
    / 'sample-data'
    / 'x12'
    / 'midwest'
    / '204-valid.edi'
  ).read_text(encoding='utf-8')


def _segment_signature(interchange) -> list[tuple[str, tuple[str, ...]]]:
  return [
    (segment.segment_id, segment.elements)
    for segment in interchange.segments
  ]
