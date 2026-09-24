from dataclasses import dataclass
from datetime import datetime, timezone

from app.domain import TenderDecision
from app.integrations.x12 import X12Interchange, X12Segment
from app.models.configuration import Midwest990MappingConfig


@dataclass(frozen=True)
class Midwest990MappingResult:
  shipment_number: str
  decision: TenderDecision
  carrier_code: str
  carrier_load_number: str | None
  reason_code: str | None
  bol_reference: str | None
  po_reference: str | None
  decided_at: datetime
  x12_version: str
  interchange_control_number: str
  group_control_number: str
  transaction_control_number: str


class Midwest990MappingError(Exception):
  def __init__(self, code: str, message: str) -> None:
    self.code = code
    self.message = message
    super().__init__(message)


def default_midwest_990_mapping_config() -> Midwest990MappingConfig:
  return Midwest990MappingConfig(
    expected_sender='MWCX',
    expected_receiver='FREIGHTBRIDGE',
    x12_version='004010',
    isa_control_version='00401',
    functional_identifier='GF',
    transaction_set='990',
    decision_code_map={'A': TenderDecision.ACCEPTED, 'D': TenderDecision.REJECTED},
    carrier_load_qualifier='CN',
    rejection_reason_qualifier='ZZ',
    bol_qualifier='BM',
    po_qualifier='PO',
  )


def map_midwest_990(
  interchange: X12Interchange,
  *,
  config: Midwest990MappingConfig | None = None,
) -> Midwest990MappingResult:
  resolved_config = config or default_midwest_990_mapping_config()
  group = interchange.functional_groups[0]
  transaction = group.transaction_sets[0]
  _validate_profile(interchange, resolved_config)
  b1 = _first(transaction.segments, 'B1')
  if b1 is None:
    raise Midwest990MappingError('MISSING_B1', 'Midwest 990 is missing B1.')
  decision_code = b1.element(4)
  try:
    decision = resolved_config.decision_code_map[decision_code or '']
  except KeyError as exc:
    raise Midwest990MappingError('UNSUPPORTED_TENDER_DECISION', 'Unsupported Midwest 990 decision code.') from exc

  references = {
    segment.element(2): segment.element(1)
    for segment in transaction.segments
    if segment.segment_id == 'L11'
  }
  decided_at = _decided_at(b1.element(3), group.gs_segment.element(5))
  carrier_load_number = references.get(resolved_config.carrier_load_qualifier)
  reason_code = references.get(resolved_config.rejection_reason_qualifier)
  if decision == TenderDecision.ACCEPTED and not carrier_load_number:
    raise Midwest990MappingError('MISSING_CARRIER_LOAD_NUMBER', 'Accepted Midwest 990 requires L11/CN.')
  if decision == TenderDecision.ACCEPTED and reason_code:
    raise Midwest990MappingError('INVALID_ACCEPTED_REASON', 'Accepted Midwest 990 must not include rejection reason.')
  if decision == TenderDecision.REJECTED and not reason_code:
    raise Midwest990MappingError('MISSING_REJECTION_REASON', 'Rejected Midwest 990 requires L11/ZZ.')
  if decision == TenderDecision.REJECTED and carrier_load_number:
    raise Midwest990MappingError('INVALID_REJECTED_CARRIER_LOAD', 'Rejected Midwest 990 must not include carrier load number.')

  return Midwest990MappingResult(
    shipment_number=_require(b1.element(2), 'MISSING_SHIPMENT_NUMBER', 'B1-02 is required.'),
    decision=decision,
    carrier_code=_require(b1.element(1), 'MISSING_CARRIER_CODE', 'B1-01 is required.'),
    carrier_load_number=carrier_load_number,
    reason_code=reason_code,
    bol_reference=references.get(resolved_config.bol_qualifier),
    po_reference=references.get(resolved_config.po_qualifier),
    decided_at=decided_at,
    x12_version=group.version_release or '',
    interchange_control_number=interchange.interchange_control_number or '',
    group_control_number=group.control_number or '',
    transaction_control_number=transaction.control_number or '',
  )


def _validate_profile(interchange: X12Interchange, config: Midwest990MappingConfig) -> None:
  if interchange.interchange_control_version != config.isa_control_version:
    raise Midwest990MappingError('UNSUPPORTED_X12_VERSION', 'Unsupported Midwest ISA version.')
  if interchange.isa_segment.element(6).strip() != config.expected_sender or interchange.isa_segment.element(8).strip() != config.expected_receiver:
    raise Midwest990MappingError('INVALID_PARTNER_PROFILE', 'Unexpected Midwest 990 sender or receiver.')
  group = interchange.functional_groups[0]
  transaction = group.transaction_sets[0]
  if group.functional_identifier != config.functional_identifier or group.version_release != config.x12_version:
    raise Midwest990MappingError('INVALID_PARTNER_PROFILE', 'Unexpected Midwest 990 functional group.')
  if transaction.transaction_set_identifier != config.transaction_set:
    raise Midwest990MappingError('UNEXPECTED_TRANSACTION_SET', 'Expected Midwest 990 transaction set.')


def _first(segments: tuple[X12Segment, ...], segment_id: str) -> X12Segment | None:
  return next((segment for segment in segments if segment.segment_id == segment_id), None)


def _decided_at(date_value: str | None, time_value: str | None) -> datetime:
  if not date_value or not time_value:
    raise Midwest990MappingError('MISSING_DECISION_TIMESTAMP', 'B1 date and GS time are required.')
  try:
    return datetime.strptime(date_value + time_value, '%Y%m%d%H%M').replace(tzinfo=timezone.utc)
  except ValueError as exc:
    raise Midwest990MappingError('INVALID_DECISION_TIMESTAMP', 'Midwest 990 decision timestamp is invalid.') from exc


def _require(value: str | None, code: str, message: str) -> str:
  if not value:
    raise Midwest990MappingError(code, message)
  return value
