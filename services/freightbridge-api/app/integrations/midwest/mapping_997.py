from dataclasses import dataclass

from app.domain import FunctionalAcknowledgmentStatus
from app.integrations.x12 import X12Interchange, X12Segment


SUPPORTED_ACK_CODES = {'A', 'R'}


@dataclass(frozen=True)
class Midwest997MappingResult:
  status: FunctionalAcknowledgmentStatus
  functional_identifier: str
  acknowledged_group_control_number: str
  transaction_set_identifier: str
  acknowledged_transaction_control_number: str
  transaction_ack_code: str
  group_ack_code: str
  transaction_sets_included: int
  transaction_sets_received: int
  transaction_sets_accepted: int
  x12_version: str
  interchange_control_number: str
  group_control_number: str
  transaction_control_number: str


class Midwest997MappingError(Exception):
  def __init__(self, code: str, message: str) -> None:
    self.code = code
    self.message = message
    super().__init__(message)


def map_midwest_997(interchange: X12Interchange) -> Midwest997MappingResult:
  _validate_profile(interchange)
  group = interchange.functional_groups[0]
  transaction = group.transaction_sets[0]
  ak1 = _required_segment(transaction.segments, 'AK1')
  ak2 = _required_segment(transaction.segments, 'AK2')
  ak5 = _required_segment(transaction.segments, 'AK5')
  ak9 = _required_segment(transaction.segments, 'AK9')

  functional_identifier = _require(ak1.element(1), 'MISSING_FUNCTIONAL_IDENTIFIER', 'AK1-01 is required.')
  if functional_identifier != 'SM':
    raise Midwest997MappingError('UNSUPPORTED_FUNCTIONAL_IDENTIFIER', 'Midwest 997 must acknowledge an SM group.')
  transaction_set_identifier = _require(ak2.element(1), 'MISSING_TRANSACTION_SET_IDENTIFIER', 'AK2-01 is required.')
  if transaction_set_identifier != '204':
    raise Midwest997MappingError('UNSUPPORTED_ACKNOWLEDGED_TRANSACTION_SET', 'Midwest 997 must acknowledge a 204.')

  transaction_ack_code = _require(ak5.element(1), 'MISSING_TRANSACTION_ACK_CODE', 'AK5-01 is required.')
  group_ack_code = _require(ak9.element(1), 'MISSING_GROUP_ACK_CODE', 'AK9-01 is required.')
  if transaction_ack_code not in SUPPORTED_ACK_CODES:
    raise Midwest997MappingError('UNSUPPORTED_AK5_CODE', 'Unsupported Midwest 997 AK5 code.')
  if group_ack_code not in SUPPORTED_ACK_CODES:
    raise Midwest997MappingError('UNSUPPORTED_AK9_CODE', 'Unsupported Midwest 997 AK9 code.')
  if transaction_ack_code != group_ack_code:
    raise Midwest997MappingError('INCONSISTENT_ACK_CODES', 'Midwest 997 requires matching AK5 and AK9 status codes.')

  included = _int(ak9.element(2), 'AK9-02')
  received = _int(ak9.element(3), 'AK9-03')
  accepted = _int(ak9.element(4), 'AK9-04')
  expected_accepted = 1 if transaction_ack_code == 'A' else 0
  if (included, received, accepted) != (1, 1, expected_accepted):
    raise Midwest997MappingError('INVALID_AK9_COUNTS', 'Midwest 997 AK9 counts are inconsistent with the project profile.')

  return Midwest997MappingResult(
    status=FunctionalAcknowledgmentStatus.ACCEPTED
    if transaction_ack_code == 'A'
    else FunctionalAcknowledgmentStatus.REJECTED,
    functional_identifier=functional_identifier,
    acknowledged_group_control_number=_require(ak1.element(2), 'MISSING_GROUP_CONTROL_NUMBER', 'AK1-02 is required.'),
    transaction_set_identifier=transaction_set_identifier,
    acknowledged_transaction_control_number=_require(
      ak2.element(2),
      'MISSING_TRANSACTION_CONTROL_NUMBER',
      'AK2-02 is required.',
    ),
    transaction_ack_code=transaction_ack_code,
    group_ack_code=group_ack_code,
    transaction_sets_included=included,
    transaction_sets_received=received,
    transaction_sets_accepted=accepted,
    x12_version=group.version_release or '',
    interchange_control_number=interchange.interchange_control_number or '',
    group_control_number=group.control_number or '',
    transaction_control_number=transaction.control_number or '',
  )


def _validate_profile(interchange: X12Interchange) -> None:
  if interchange.interchange_control_version != '00401':
    raise Midwest997MappingError('UNSUPPORTED_X12_VERSION', 'Unsupported Midwest ISA version.')
  if interchange.isa_segment.element(6).strip() != 'MWCX':
    raise Midwest997MappingError('INVALID_PARTNER_PROFILE', 'Unexpected Midwest 997 sender.')
  if interchange.isa_segment.element(8).strip() != 'FREIGHTBRIDGE':
    raise Midwest997MappingError('INVALID_PARTNER_PROFILE', 'Unexpected Midwest 997 receiver.')
  group = interchange.functional_groups[0]
  transaction = group.transaction_sets[0]
  if group.functional_identifier != 'FA':
    raise Midwest997MappingError('INVALID_FUNCTIONAL_GROUP', 'Midwest 997 requires GS01 FA.')
  if group.version_release != '004010':
    raise Midwest997MappingError('UNSUPPORTED_X12_VERSION', 'Midwest 997 requires GS08 004010.')
  if transaction.transaction_set_identifier != '997':
    raise Midwest997MappingError('UNEXPECTED_TRANSACTION_SET', 'Expected Midwest 997 transaction set.')


def _required_segment(segments: tuple[X12Segment, ...], segment_id: str) -> X12Segment:
  segment = next((item for item in segments if item.segment_id == segment_id), None)
  if segment is None:
    raise Midwest997MappingError(f'MISSING_{segment_id}', f'Midwest 997 is missing {segment_id}.')
  return segment


def _require(value: str | None, code: str, message: str) -> str:
  if not value:
    raise Midwest997MappingError(code, message)
  return value


def _int(value: str | None, field: str) -> int:
  try:
    return int(value or '')
  except ValueError as exc:
    raise Midwest997MappingError('INVALID_AK9_COUNTS', f'{field} must be numeric.') from exc
