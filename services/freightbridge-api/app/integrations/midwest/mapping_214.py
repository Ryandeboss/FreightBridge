from dataclasses import dataclass
from datetime import datetime, timezone
import re

from app.domain import ReferenceType, ShipmentStatus
from app.integrations.x12 import X12Interchange, X12Segment


AT7_STATUS_MAP: dict[str, ShipmentStatus] = {
  'AF': ShipmentStatus.PICKED_UP,
  'X6': ShipmentStatus.IN_TRANSIT,
  'X1': ShipmentStatus.ARRIVED,
  'D1': ShipmentStatus.DELIVERED,
}

STATE_PATTERN = re.compile(r'^[A-Z]{2}$')


@dataclass(frozen=True)
class Midwest214MappingResult:
  shipment_number: str
  carrier_load_number: str
  carrier_code: str
  status: ShipmentStatus
  at7_code: str
  occurred_at: datetime
  city: str
  state: str
  bol_reference: str | None
  po_reference: str | None
  x12_version: str
  interchange_control_number: str
  group_control_number: str
  transaction_control_number: str


class Midwest214MappingError(Exception):
  def __init__(self, code: str, message: str) -> None:
    self.code = code
    self.message = message
    super().__init__(message)


def map_midwest_214(interchange: X12Interchange) -> Midwest214MappingResult:
  _validate_profile(interchange)
  group = interchange.functional_groups[0]
  transaction = group.transaction_sets[0]
  b10 = _required_segment(transaction.segments, 'B10')
  at7 = _required_segment(transaction.segments, 'AT7')
  ms1 = _required_segment(transaction.segments, 'MS1')
  references = {
    segment.element(2): segment.element(1)
    for segment in transaction.segments
    if segment.segment_id == 'L11'
  }

  at7_code = _require(at7.element(1), 'MISSING_STATUS_CODE', 'AT7-01 is required.')
  if at7_code not in AT7_STATUS_MAP:
    raise Midwest214MappingError('UNSUPPORTED_AT7_CODE', 'Unsupported Midwest 214 AT7 status code.')

  state = _require(ms1.element(2), 'MISSING_LOCATION_STATE', 'MS1-02 is required.')
  if not STATE_PATTERN.fullmatch(state):
    raise Midwest214MappingError('INVALID_LOCATION_STATE', 'MS1-02 must be a two-letter uppercase state code.')

  return Midwest214MappingResult(
    shipment_number=_require(b10.element(2), 'MISSING_SHIPMENT_NUMBER', 'B10-02 is required.'),
    carrier_load_number=_require(b10.element(1), 'MISSING_CARRIER_LOAD_NUMBER', 'B10-01 is required.'),
    carrier_code=_require(b10.element(3), 'MISSING_CARRIER_CODE', 'B10-03 is required.'),
    status=AT7_STATUS_MAP[at7_code],
    at7_code=at7_code,
    occurred_at=_event_time(at7.element(5), at7.element(6), at7.element(7)),
    city=_require(ms1.element(1), 'MISSING_LOCATION_CITY', 'MS1-01 is required.'),
    state=state,
    bol_reference=references.get(ReferenceType.BOL.value) or references.get('BM'),
    po_reference=references.get(ReferenceType.PO.value) or references.get('PO'),
    x12_version=group.version_release or '',
    interchange_control_number=interchange.interchange_control_number or '',
    group_control_number=group.control_number or '',
    transaction_control_number=transaction.control_number or '',
  )


def _validate_profile(interchange: X12Interchange) -> None:
  if interchange.interchange_control_version != '00401':
    raise Midwest214MappingError('UNSUPPORTED_X12_VERSION', 'Unsupported Midwest ISA version.')
  if interchange.isa_segment.element(6).strip() != 'MWCX':
    raise Midwest214MappingError('INVALID_PARTNER_PROFILE', 'Unexpected Midwest 214 sender.')
  if interchange.isa_segment.element(8).strip() != 'FREIGHTBRIDGE':
    raise Midwest214MappingError('INVALID_PARTNER_PROFILE', 'Unexpected Midwest 214 receiver.')
  group = interchange.functional_groups[0]
  transaction = group.transaction_sets[0]
  if group.functional_identifier != 'QM' or group.version_release != '004010':
    raise Midwest214MappingError('INVALID_PARTNER_PROFILE', 'Unexpected Midwest 214 functional group.')
  if transaction.transaction_set_identifier != '214':
    raise Midwest214MappingError('UNEXPECTED_TRANSACTION_SET', 'Expected Midwest 214 transaction set.')


def _required_segment(segments: tuple[X12Segment, ...], segment_id: str) -> X12Segment:
  segment = next((item for item in segments if item.segment_id == segment_id), None)
  if segment is None:
    raise Midwest214MappingError(f'MISSING_{segment_id}', f'Midwest 214 is missing {segment_id}.')
  return segment


def _event_time(date_value: str | None, time_value: str | None, time_code: str | None) -> datetime:
  if not date_value or not time_value or not time_code:
    raise Midwest214MappingError('MISSING_EVENT_TIMESTAMP', 'AT7 date, time, and time code are required.')
  if time_code != 'UT':
    raise Midwest214MappingError('UNSUPPORTED_TIME_CODE', 'Midwest 214 requires UTC AT7 time code UT.')
  try:
    return datetime.strptime(date_value + time_value, '%Y%m%d%H%M').replace(tzinfo=timezone.utc)
  except ValueError as exc:
    raise Midwest214MappingError('INVALID_EVENT_TIMESTAMP', 'Midwest 214 event timestamp is invalid.') from exc


def _require(value: str | None, code: str, message: str) -> str:
  if not value:
    raise Midwest214MappingError(code, message)
  return value
