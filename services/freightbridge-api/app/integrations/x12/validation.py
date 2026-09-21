from app.integrations.x12.errors import X12ErrorCode, X12ValidationError
from app.integrations.x12.models import X12FunctionalGroup, X12Interchange, X12Segment, X12TransactionSet


def validate_x12_envelopes(interchange: X12Interchange) -> None:
  _require_element(interchange.isa_segment, 13)
  _require_element(interchange.iea_segment, 1)
  _require_element(interchange.iea_segment, 2)

  if interchange.isa_segment.element(13) != interchange.iea_segment.element(2):
    raise X12ValidationError(
      X12ErrorCode.CONTROL_NUMBER_MISMATCH,
      'ISA13 must match IEA02.',
      segment_id='IEA',
      segment_index=interchange.iea_segment.segment_index,
      element_position=2,
    )
  if _as_int(interchange.iea_segment, 1) != len(interchange.functional_groups):
    raise X12ValidationError(
      X12ErrorCode.GROUP_COUNT_MISMATCH,
      'IEA01 must match the number of functional groups.',
      segment_id='IEA',
      segment_index=interchange.iea_segment.segment_index,
      element_position=1,
    )

  for group in interchange.functional_groups:
    _validate_group(group)


def _validate_group(group: X12FunctionalGroup) -> None:
  _require_element(group.gs_segment, 6)
  _require_element(group.ge_segment, 1)
  _require_element(group.ge_segment, 2)

  if group.gs_segment.element(6) != group.ge_segment.element(2):
    raise X12ValidationError(
      X12ErrorCode.CONTROL_NUMBER_MISMATCH,
      'GS06 must match GE02.',
      segment_id='GE',
      segment_index=group.ge_segment.segment_index,
      element_position=2,
    )
  if _as_int(group.ge_segment, 1) != len(group.transaction_sets):
    raise X12ValidationError(
      X12ErrorCode.TRANSACTION_COUNT_MISMATCH,
      'GE01 must match the number of transaction sets.',
      segment_id='GE',
      segment_index=group.ge_segment.segment_index,
      element_position=1,
    )

  for transaction_set in group.transaction_sets:
    _validate_transaction_set(transaction_set)


def _validate_transaction_set(transaction_set: X12TransactionSet) -> None:
  _require_element(transaction_set.st_segment, 2)
  _require_element(transaction_set.se_segment, 1)
  _require_element(transaction_set.se_segment, 2)

  if transaction_set.st_segment.element(2) != transaction_set.se_segment.element(2):
    raise X12ValidationError(
      X12ErrorCode.CONTROL_NUMBER_MISMATCH,
      'ST02 must match SE02.',
      segment_id='SE',
      segment_index=transaction_set.se_segment.segment_index,
      element_position=2,
    )
  if _as_int(transaction_set.se_segment, 1) != len(transaction_set.segments):
    raise X12ValidationError(
      X12ErrorCode.SEGMENT_COUNT_MISMATCH,
      'SE01 must match the transaction segment count including ST and SE.',
      segment_id='SE',
      segment_index=transaction_set.se_segment.segment_index,
      element_position=1,
    )


def _require_element(segment: X12Segment, position: int) -> None:
  if not segment.element(position):
    raise X12ValidationError(
      X12ErrorCode.INVALID_ENVELOPE_COUNT,
      f'{segment.segment_id}{position:02d} is required for envelope validation.',
      segment_id=segment.segment_id,
      segment_index=segment.segment_index,
      element_position=position,
    )


def _as_int(segment: X12Segment, position: int) -> int:
  value = segment.element(position)
  try:
    return int(value or '')
  except ValueError as exc:
    raise X12ValidationError(
      X12ErrorCode.INVALID_ENVELOPE_COUNT,
      f'{segment.segment_id}{position:02d} must be numeric.',
      segment_id=segment.segment_id,
      segment_index=segment.segment_index,
      element_position=position,
    ) from exc
