from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal

from app.models.errors import ErrorCode


@dataclass(frozen=True)
class Segment:
  segment_id: str
  elements: tuple[str, ...]

  def element(self, position: int) -> str | None:
    if position < 1 or position > len(self.elements):
      return None
    return self.elements[position - 1]


@dataclass(frozen=True)
class Parsed204:
  cust_ship_no: str
  bol_ref: str
  po_ref: str | None
  gross_weight_lb: Decimal
  handling_units: int
  shipper_name: str
  shipper_addr_line_1: str
  shipper_city: str
  shipper_state_cd: str
  shipper_zip: str
  cons_name: str
  cons_addr_line_1: str
  cons_city: str
  cons_state_cd: str
  cons_zip: str
  pickup_appt_ts: datetime
  delivery_appt_ts: datetime
  x12_version: str
  interchange_control_number: str
  group_control_number: str
  transaction_control_number: str


class X12ReceiveError(Exception):
  def __init__(self, code: ErrorCode, message: str) -> None:
    self.code = code
    self.message = message
    super().__init__(message)


def parse_midwest_204(raw_payload: bytes | str) -> Parsed204:
  payload = _decode(raw_payload).strip()
  segments = _parse_segments(payload)
  _validate_envelope(segments)
  return _extract_204(segments)


def _decode(raw_payload: bytes | str) -> str:
  if isinstance(raw_payload, str):
    return raw_payload
  try:
    return raw_payload.decode('utf-8')
  except UnicodeDecodeError as exc:
    raise X12ReceiveError(ErrorCode.INVALID_X12, 'X12 payload must be valid UTF-8.') from exc


def _parse_segments(payload: str) -> list[Segment]:
  if len(payload) < 106 or not payload.startswith('ISA'):
    raise X12ReceiveError(ErrorCode.INVALID_X12, 'X12 payload must start with a valid ISA segment.')
  element_separator = payload[3]
  segment_terminator = payload[105]
  segments: list[Segment] = []
  for raw_segment in payload.split(segment_terminator):
    text = raw_segment.strip('\r\n')
    if not text:
      continue
    parts = text.split(element_separator)
    segments.append(Segment(parts[0], tuple(parts[1:])))
  return segments


def _validate_envelope(segments: list[Segment]) -> None:
  if not segments or segments[0].segment_id != 'ISA':
    raise X12ReceiveError(ErrorCode.INVALID_X12, 'Missing ISA segment.')
  if segments[-1].segment_id != 'IEA':
    raise X12ReceiveError(ErrorCode.INVALID_X12, 'Missing IEA segment.')

  isa = segments[0]
  gs = _first(segments, 'GS')
  st = _first(segments, 'ST')
  se = _first(segments, 'SE')
  ge = _first(segments, 'GE')
  iea = segments[-1]
  if not all((gs, st, se, ge)):
    raise X12ReceiveError(ErrorCode.INVALID_X12, 'Missing required X12 envelope segment.')

  if isa.element(12) != '00401' or gs.element(8) != '004010':
    raise X12ReceiveError(ErrorCode.UNSUPPORTED_X12_VERSION, 'Unsupported Midwest X12 version.')
  if isa.element(6).strip() != 'FREIGHTBRIDGE' or isa.element(8).strip() != 'MWCX':
    raise X12ReceiveError(ErrorCode.BUSINESS_VALIDATION_ERROR, 'Unsupported X12 sender or receiver.')
  if gs.element(1) != 'SM' or st.element(1) != '204':
    raise X12ReceiveError(ErrorCode.BUSINESS_VALIDATION_ERROR, 'Unsupported Midwest transaction profile.')

  if isa.element(13) != iea.element(2):
    raise X12ReceiveError(ErrorCode.INVALID_X12, 'ISA13 must match IEA02.')
  if gs.element(6) != ge.element(2):
    raise X12ReceiveError(ErrorCode.INVALID_X12, 'GS06 must match GE02.')
  if st.element(2) != se.element(2):
    raise X12ReceiveError(ErrorCode.INVALID_X12, 'ST02 must match SE02.')

  transaction_segments = _between_inclusive(segments, 'ST', 'SE')
  if _int(se.element(1), 'SE01') != len(transaction_segments):
    raise X12ReceiveError(ErrorCode.INVALID_X12, 'SE01 does not match transaction segment count.')
  if _int(ge.element(1), 'GE01') != 1:
    raise X12ReceiveError(ErrorCode.INVALID_X12, 'GE01 must match transaction count.')
  if _int(iea.element(1), 'IEA01') != 1:
    raise X12ReceiveError(ErrorCode.INVALID_X12, 'IEA01 must match functional group count.')


def _extract_204(segments: list[Segment]) -> Parsed204:
  isa = segments[0]
  gs = _first(segments, 'GS')
  st = _first(segments, 'ST')
  b2 = _first(segments, 'B2')
  l3 = _first(segments, 'L3')
  if b2 is None or l3 is None:
    raise X12ReceiveError(ErrorCode.BUSINESS_VALIDATION_ERROR, '204 is missing required B2 or L3.')

  references = {
    segment.element(2): segment.element(1)
    for segment in segments
    if segment.segment_id == 'L11'
  }
  g62 = {
    segment.element(1): segment
    for segment in segments
    if segment.segment_id == 'G62'
  }
  shipper = _party_after_n1(segments, 'SH')
  consignee = _party_after_n1(segments, 'CN')

  parsed = Parsed204(
    cust_ship_no=_require(b2.element(4), 'Missing customer shipment number.'),
    bol_ref=_require(references.get('BM'), 'Missing BOL reference.'),
    po_ref=references.get('PO'),
    gross_weight_lb=Decimal(_require(l3.element(1), 'Missing gross weight.')),
    handling_units=_int(_require(l3.element(5), 'Missing handling units.'), 'L3-05'),
    shipper_name=_require(shipper['name'], 'Missing shipper name.'),
    shipper_addr_line_1=_require(shipper['address'], 'Missing shipper address.'),
    shipper_city=_require(shipper['city'], 'Missing shipper city.'),
    shipper_state_cd=_require(shipper['state'], 'Missing shipper state.'),
    shipper_zip=_require(shipper['postal'], 'Missing shipper postal code.'),
    cons_name=_require(consignee['name'], 'Missing consignee name.'),
    cons_addr_line_1=_require(consignee['address'], 'Missing consignee address.'),
    cons_city=_require(consignee['city'], 'Missing consignee city.'),
    cons_state_cd=_require(consignee['state'], 'Missing consignee state.'),
    cons_zip=_require(consignee['postal'], 'Missing consignee postal code.'),
    pickup_appt_ts=_datetime_from_g62(g62.get('37'), 'pickup'),
    delivery_appt_ts=_datetime_from_g62(g62.get('38'), 'delivery'),
    x12_version=gs.element(8),
    interchange_control_number=isa.element(13),
    group_control_number=gs.element(6),
    transaction_control_number=st.element(2),
  )
  if parsed.gross_weight_lb <= 0 or parsed.handling_units <= 0:
    raise X12ReceiveError(ErrorCode.BUSINESS_VALIDATION_ERROR, 'Weight and handling units must be positive.')
  return parsed


def _first(segments: list[Segment], segment_id: str) -> Segment | None:
  return next((segment for segment in segments if segment.segment_id == segment_id), None)


def _between_inclusive(segments: list[Segment], start_id: str, end_id: str) -> list[Segment]:
  start = next(i for i, segment in enumerate(segments) if segment.segment_id == start_id)
  end = next(i for i, segment in enumerate(segments) if segment.segment_id == end_id)
  return segments[start:end + 1]


def _party_after_n1(segments: list[Segment], entity_code: str) -> dict[str, str | None]:
  for index, segment in enumerate(segments):
    if segment.segment_id == 'N1' and segment.element(1) == entity_code:
      n3 = _next_before_next_n1(segments, index, 'N3')
      n4 = _next_before_next_n1(segments, index, 'N4')
      return {
        'name': segment.element(2),
        'address': n3.element(1) if n3 else None,
        'city': n4.element(1) if n4 else None,
        'state': n4.element(2) if n4 else None,
        'postal': n4.element(3) if n4 else None,
      }
  return {'name': None, 'address': None, 'city': None, 'state': None, 'postal': None}


def _next_before_next_n1(segments: list[Segment], start_index: int, segment_id: str) -> Segment | None:
  for segment in segments[start_index + 1:]:
    if segment.segment_id in ('N1', 'SE', 'GE', 'IEA'):
      return None
    if segment.segment_id == segment_id:
      return segment
  return None


def _datetime_from_g62(segment: Segment | None, label: str) -> datetime:
  if segment is None:
    raise X12ReceiveError(ErrorCode.BUSINESS_VALIDATION_ERROR, f'Missing {label} appointment.')
  date = _require(segment.element(2), f'Missing {label} appointment date.')
  time = _require(segment.element(4), f'Missing {label} appointment time.')
  try:
    return datetime.strptime(date + time, '%Y%m%d%H%M').replace(tzinfo=timezone.utc)
  except ValueError as exc:
    raise X12ReceiveError(ErrorCode.BUSINESS_VALIDATION_ERROR, f'Invalid {label} appointment.') from exc


def _require(value: str | None, message: str) -> str:
  if value is None or not value.strip():
    raise X12ReceiveError(ErrorCode.BUSINESS_VALIDATION_ERROR, message)
  return value


def _int(value: str | None, field: str) -> int:
  try:
    return int(value or '')
  except ValueError as exc:
    raise X12ReceiveError(ErrorCode.INVALID_X12, f'{field} must be numeric.') from exc
