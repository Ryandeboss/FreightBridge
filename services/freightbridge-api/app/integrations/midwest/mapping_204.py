from datetime import datetime, timezone
from decimal import Decimal
import json
from pathlib import Path
from typing import Any

from app.domain import CanonicalLocation, CanonicalShipment, ReferenceType
from app.integrations.midwest.constants import (
  ACKNOWLEDGMENT_REQUESTED,
  BOL_REFERENCE_QUALIFIER,
  COMPONENT_SEPARATOR,
  CONSIGNEE_ENTITY_IDENTIFIER,
  DELIVERY_DATE_QUALIFIER,
  DELIVERY_STOP_REASON,
  DELIVERY_TIME_QUALIFIER,
  ELEMENT_SEPARATOR,
  FREIGHTBRIDGE_SENDER_ID,
  FUNCTIONAL_IDENTIFIER_CODE,
  ISA_AUTHORIZATION_QUALIFIER,
  ISA_CONTROL_VERSION,
  ISA_REPETITION_OR_STANDARDS_ID,
  ISA_SECURITY_QUALIFIER,
  ISA_TRADING_PARTNER_QUALIFIER,
  MIDWEST_RECEIVER_ID,
  PAYMENT_METHOD_PREPAID,
  PICKUP_DATE_QUALIFIER,
  PICKUP_STOP_REASON,
  PICKUP_TIME_QUALIFIER,
  PO_REFERENCE_QUALIFIER,
  RESPONSIBLE_AGENCY_CODE,
  SEGMENT_TERMINATOR,
  SHIPPER_ENTITY_IDENTIFIER,
  TRANSACTION_SET_IDENTIFIER_CODE,
  USAGE_INDICATOR_TEST,
  WEIGHT_QUALIFIER_GROSS,
  X12_VERSION,
)
from app.integrations.midwest.control_numbers import X12ControlNumbers
from app.integrations.midwest.errors import Midwest204ErrorCode, Midwest204MappingError
from app.integrations.midwest.models import Midwest204GenerationResult
from app.integrations.x12 import (
  X12FunctionalGroup,
  X12Interchange,
  X12Segment,
  X12Separators,
  X12TransactionSet,
  serialize_x12,
)


MAPPING_SPEC_PATH = Path(__file__).parent / 'mappings' / '204.json'


def load_mapping_spec() -> dict[str, Any]:
  return json.loads(MAPPING_SPEC_PATH.read_text(encoding='utf-8'))


def generate_midwest_204(
  shipment: CanonicalShipment,
  *,
  generated_at: datetime,
  control_numbers: X12ControlNumbers,
) -> Midwest204GenerationResult:
  validate_midwest_204_business_requirements(shipment)
  interchange = build_midwest_204_interchange(
    shipment,
    generated_at=generated_at,
    control_numbers=control_numbers,
  )
  mapping_spec = load_mapping_spec()
  return Midwest204GenerationResult(
    shipment_number=shipment.shipment_number,
    document_type=TRANSACTION_SET_IDENTIFIER_CODE,
    x12_version=X12_VERSION,
    interchange_control_number=control_numbers.interchange_control_number,
    group_control_number=control_numbers.group_control_number,
    transaction_control_number=control_numbers.transaction_control_number,
    serialized_x12=serialize_x12(interchange),
    mapping_spec_version=mapping_spec['version'],
  )


def build_midwest_204_interchange(
  shipment: CanonicalShipment,
  *,
  generated_at: datetime,
  control_numbers: X12ControlNumbers,
) -> X12Interchange:
  envelope_time = generated_at.astimezone(timezone.utc)
  body_segments = _build_body_segments(shipment)
  st_segment = X12Segment(
    segment_id='ST',
    elements=(TRANSACTION_SET_IDENTIFIER_CODE, control_numbers.transaction_control_number),
  )
  se_segment = X12Segment(
    segment_id='SE',
    elements=(str(len(body_segments) + 2), control_numbers.transaction_control_number),
  )
  transaction_set = X12TransactionSet(
    st_segment=st_segment,
    body_segments=tuple(body_segments),
    se_segment=se_segment,
  )
  gs_segment = X12Segment(
    segment_id='GS',
    elements=(
      FUNCTIONAL_IDENTIFIER_CODE,
      FREIGHTBRIDGE_SENDER_ID,
      MIDWEST_RECEIVER_ID,
      envelope_time.strftime('%Y%m%d'),
      envelope_time.strftime('%H%M'),
      control_numbers.group_control_number,
      RESPONSIBLE_AGENCY_CODE,
      X12_VERSION,
    ),
  )
  ge_segment = X12Segment(
    segment_id='GE',
    elements=(str(1), control_numbers.group_control_number),
  )
  functional_group = X12FunctionalGroup(
    gs_segment=gs_segment,
    transaction_sets=(transaction_set,),
    ge_segment=ge_segment,
  )
  isa_segment = X12Segment(
    segment_id='ISA',
    elements=(
      ISA_AUTHORIZATION_QUALIFIER,
      _fixed_width('', 10),
      ISA_SECURITY_QUALIFIER,
      _fixed_width('', 10),
      ISA_TRADING_PARTNER_QUALIFIER,
      _fixed_width(FREIGHTBRIDGE_SENDER_ID, 15),
      ISA_TRADING_PARTNER_QUALIFIER,
      _fixed_width(MIDWEST_RECEIVER_ID, 15),
      envelope_time.strftime('%y%m%d'),
      envelope_time.strftime('%H%M'),
      ISA_REPETITION_OR_STANDARDS_ID,
      ISA_CONTROL_VERSION,
      control_numbers.interchange_control_number,
      ACKNOWLEDGMENT_REQUESTED,
      USAGE_INDICATOR_TEST,
      COMPONENT_SEPARATOR,
    ),
  )
  iea_segment = X12Segment(
    segment_id='IEA',
    elements=(str(1), control_numbers.interchange_control_number),
  )
  return X12Interchange(
    isa_segment=isa_segment,
    functional_groups=(functional_group,),
    iea_segment=iea_segment,
    separators=X12Separators(
      element_separator=ELEMENT_SEPARATOR,
      segment_terminator=SEGMENT_TERMINATOR,
      component_separator=COMPONENT_SEPARATOR,
    ),
  )


def validate_midwest_204_business_requirements(shipment: CanonicalShipment) -> None:
  _require_text(shipment.shipment_number, Midwest204ErrorCode.MISSING_SHIPMENT_NUMBER, 'shipment_number')
  _require_reference(shipment, ReferenceType.BOL, Midwest204ErrorCode.MISSING_BOL_REFERENCE)
  _require_location(shipment.origin, 'origin', Midwest204ErrorCode.MISSING_ORIGIN_ADDRESS)
  _require_location(
    shipment.destination,
    'destination',
    Midwest204ErrorCode.MISSING_DESTINATION_ADDRESS,
  )
  if shipment.origin.scheduled_at is None:
    raise Midwest204MappingError(
      Midwest204ErrorCode.MISSING_PICKUP_APPOINTMENT,
      'Origin scheduled appointment is required for Midwest 204 generation.',
      'origin.scheduled_at',
    )
  if shipment.destination.scheduled_at is None:
    raise Midwest204MappingError(
      Midwest204ErrorCode.MISSING_DELIVERY_APPOINTMENT,
      'Destination scheduled appointment is required for Midwest 204 generation.',
      'destination.scheduled_at',
    )
  if shipment.weight_lbs is None or shipment.weight_lbs <= 0:
    raise Midwest204MappingError(
      Midwest204ErrorCode.MISSING_WEIGHT,
      'Positive shipment weight is required for Midwest 204 generation.',
      'weight_lbs',
    )
  if shipment.pieces is None or shipment.pieces <= 0:
    raise Midwest204MappingError(
      Midwest204ErrorCode.MISSING_PIECES,
      'Positive piece count is required for the current Midwest 204 L3 profile.',
      'pieces',
    )


def _build_body_segments(shipment: CanonicalShipment) -> list[X12Segment]:
  bol_reference = _reference_value(shipment, ReferenceType.BOL)
  po_reference = _reference_value(shipment, ReferenceType.PO)
  segments = [
    X12Segment(
      segment_id='B2',
      elements=('', MIDWEST_RECEIVER_ID, '', shipment.shipment_number, '', PAYMENT_METHOD_PREPAID),
    ),
    X12Segment(segment_id='L11', elements=(bol_reference, BOL_REFERENCE_QUALIFIER)),
  ]
  if po_reference is not None:
    segments.append(
      X12Segment(segment_id='L11', elements=(po_reference, PO_REFERENCE_QUALIFIER))
    )
  segments.extend(
    [
      X12Segment(
        segment_id='G62',
        elements=(
          PICKUP_DATE_QUALIFIER,
          _format_x12_date(shipment.origin.scheduled_at),
          PICKUP_TIME_QUALIFIER,
          _format_x12_time(shipment.origin.scheduled_at),
        ),
      ),
      X12Segment(
        segment_id='G62',
        elements=(
          DELIVERY_DATE_QUALIFIER,
          _format_x12_date(shipment.destination.scheduled_at),
          DELIVERY_TIME_QUALIFIER,
          _format_x12_time(shipment.destination.scheduled_at),
        ),
      ),
      X12Segment(segment_id='S5', elements=('1', PICKUP_STOP_REASON)),
      X12Segment(
        segment_id='N1',
        elements=(SHIPPER_ENTITY_IDENTIFIER, shipment.origin.facility_name),
      ),
      X12Segment(segment_id='N3', elements=(shipment.origin.address_line_1,)),
      X12Segment(
        segment_id='N4',
        elements=(shipment.origin.city, shipment.origin.state, shipment.origin.postal_code),
      ),
      X12Segment(segment_id='S5', elements=('2', DELIVERY_STOP_REASON)),
      X12Segment(
        segment_id='N1',
        elements=(CONSIGNEE_ENTITY_IDENTIFIER, shipment.destination.facility_name),
      ),
      X12Segment(segment_id='N3', elements=(shipment.destination.address_line_1,)),
      X12Segment(
        segment_id='N4',
        elements=(
          shipment.destination.city,
          shipment.destination.state,
          shipment.destination.postal_code,
        ),
      ),
      X12Segment(
        segment_id='L3',
        elements=(_format_decimal(shipment.weight_lbs), WEIGHT_QUALIFIER_GROSS, '', '', str(shipment.pieces)),
      ),
    ]
  )
  return segments


def _require_location(
  location: CanonicalLocation,
  prefix: str,
  error_code: Midwest204ErrorCode,
) -> None:
  required_fields = {
    'facility_name': location.facility_name,
    'address_line_1': location.address_line_1,
    'city': location.city,
    'state': location.state,
    'postal_code': location.postal_code,
  }
  for field_name, value in required_fields.items():
    _require_text(value, error_code, f'{prefix}.{field_name}')


def _require_text(value: str | None, code: Midwest204ErrorCode, field: str) -> None:
  if value is None or not value.strip():
    raise Midwest204MappingError(
      code,
      f'{field} is required for Midwest 204 generation.',
      field,
    )


def _require_reference(
  shipment: CanonicalShipment,
  reference_type: ReferenceType,
  error_code: Midwest204ErrorCode,
) -> None:
  if _reference_value(shipment, reference_type) is None:
    raise Midwest204MappingError(
      error_code,
      f'{reference_type.value} reference is required for Midwest 204 generation.',
      f'references.{reference_type.value}',
    )


def _reference_value(shipment: CanonicalShipment, reference_type: ReferenceType) -> str | None:
  for reference in shipment.references:
    if reference.reference_type == reference_type and reference.reference_value.strip():
      return reference.reference_value
  return None


def _format_x12_date(value: datetime) -> str:
  return value.astimezone(timezone.utc).strftime('%Y%m%d')


def _format_x12_time(value: datetime) -> str:
  return value.astimezone(timezone.utc).strftime('%H%M')


def _format_decimal(value: Decimal) -> str:
  if value == value.to_integral_value():
    return str(value.quantize(Decimal('1')))
  return format(value.normalize(), 'f')


def _fixed_width(value: str, width: int) -> str:
  return value[:width].ljust(width)
