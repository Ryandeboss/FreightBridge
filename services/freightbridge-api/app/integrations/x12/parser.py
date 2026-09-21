from app.integrations.x12.errors import X12ErrorCode, X12ParseError
from app.integrations.x12.models import (
  X12FunctionalGroup,
  X12Interchange,
  X12Segment,
  X12Separators,
  X12TransactionSet,
)


ISA_FIXED_LENGTH_WITH_TERMINATOR = 106
ISA_SEGMENT_LENGTH = 105


def parse_x12(raw_payload: str | bytes) -> X12Interchange:
  payload = _decode_payload(raw_payload)
  if payload.startswith('\ufeff'):
    payload = payload.removeprefix('\ufeff')
  payload = payload.lstrip('\r\n')

  separators = discover_separators(payload)
  segments = _parse_segments(payload, separators)
  return _build_interchange(segments, separators)


def discover_separators(payload: str) -> X12Separators:
  if len(payload) < ISA_FIXED_LENGTH_WITH_TERMINATOR:
    raise X12ParseError(
      X12ErrorCode.MALFORMED_ISA,
      'ISA segment is too short for delimiter discovery.',
      segment_id='ISA',
    )
  if not payload.startswith('ISA'):
    raise X12ParseError(
      X12ErrorCode.MISSING_INTERCHANGE_HEADER,
      'X12 payload must start with ISA.',
      segment_id='ISA',
    )

  element_separator = payload[3]
  component_separator = payload[104]
  segment_terminator = payload[105]
  isa_segment_text = payload[:ISA_SEGMENT_LENGTH]
  parts = isa_segment_text.split(element_separator)
  if len(parts) != 17 or parts[0] != 'ISA':
    raise X12ParseError(
      X12ErrorCode.MALFORMED_ISA,
      'ISA segment must contain 16 fixed-width elements.',
      segment_id='ISA',
    )

  interchange_version = parts[12]
  repetition_separator = parts[11] if interchange_version and interchange_version >= '00501' else None
  return X12Separators(
    element_separator=element_separator,
    component_separator=component_separator,
    segment_terminator=segment_terminator,
    repetition_separator=repetition_separator,
  )


def _decode_payload(raw_payload: str | bytes) -> str:
  if isinstance(raw_payload, str):
    return raw_payload
  try:
    return raw_payload.decode('utf-8')
  except UnicodeDecodeError as exc:
    raise X12ParseError(
      X12ErrorCode.INVALID_ENCODING,
      'X12 payload bytes must be valid UTF-8.',
    ) from exc


def _parse_segments(payload: str, separators: X12Separators) -> list[X12Segment]:
  segments: list[X12Segment] = []
  for raw_segment in payload.split(separators.segment_terminator):
    segment_text = raw_segment.strip('\r\n')
    if not segment_text:
      continue
    parts = segment_text.split(separators.element_separator)
    segments.append(
      X12Segment(
        segment_id=parts[0],
        elements=tuple(parts[1:]),
        segment_index=len(segments) + 1,
      )
    )
  return segments


def _build_interchange(segments: list[X12Segment], separators: X12Separators) -> X12Interchange:
  if not segments or segments[0].segment_id != 'ISA':
    raise X12ParseError(
      X12ErrorCode.MISSING_INTERCHANGE_HEADER,
      'X12 interchange is missing ISA.',
      segment_id=segments[0].segment_id if segments else None,
      segment_index=segments[0].segment_index if segments else None,
    )

  isa_segment = segments[0]
  iea_segment: X12Segment | None = None
  groups: list[X12FunctionalGroup] = []
  current_gs: X12Segment | None = None
  current_transactions: list[X12TransactionSet] = []
  current_st: X12Segment | None = None
  current_body: list[X12Segment] = []

  for segment in segments[1:]:
    if segment.segment_id == 'ISA':
      raise _unexpected(segment, 'Nested ISA segments are not supported.')
    if segment.segment_id == 'GS':
      if iea_segment is not None or current_gs is not None or current_st is not None:
        raise _unexpected(segment, 'GS appeared before the previous envelope was closed.')
      current_gs = segment
      current_transactions = []
      continue
    if segment.segment_id == 'ST':
      if current_gs is None or current_st is not None:
        raise _unexpected(segment, 'ST appeared outside a valid functional group or before prior SE.')
      current_st = segment
      current_body = []
      continue
    if segment.segment_id == 'SE':
      if current_st is None:
        raise _unexpected(segment, 'SE appeared without an open ST.')
      current_transactions.append(
        X12TransactionSet(
          st_segment=current_st,
          body_segments=tuple(current_body),
          se_segment=segment,
        )
      )
      current_st = None
      current_body = []
      continue
    if segment.segment_id == 'GE':
      if current_gs is None:
        raise _unexpected(segment, 'GE appeared without an open GS.')
      if current_st is not None:
        raise X12ParseError(
          X12ErrorCode.UNTERMINATED_TRANSACTION,
          'GE appeared while a transaction set was still open.',
          segment_id=segment.segment_id,
          segment_index=segment.segment_index,
        )
      groups.append(
        X12FunctionalGroup(
          gs_segment=current_gs,
          transaction_sets=tuple(current_transactions),
          ge_segment=segment,
        )
      )
      current_gs = None
      current_transactions = []
      continue
    if segment.segment_id == 'IEA':
      if current_st is not None:
        raise X12ParseError(
          X12ErrorCode.UNTERMINATED_TRANSACTION,
          'IEA appeared while a transaction set was still open.',
          segment_id=segment.segment_id,
          segment_index=segment.segment_index,
        )
      if current_gs is not None:
        raise X12ParseError(
          X12ErrorCode.UNTERMINATED_GROUP,
          'IEA appeared while a functional group was still open.',
          segment_id=segment.segment_id,
          segment_index=segment.segment_index,
        )
      if iea_segment is not None:
        raise _unexpected(segment, 'Multiple IEA segments were found.')
      iea_segment = segment
      continue

    if iea_segment is not None:
      raise _unexpected(segment, 'Business segment appeared after IEA.')
    if current_st is None:
      raise _unexpected(segment, 'Business segment appeared outside ST/SE.')
    current_body.append(segment)

  if current_st is not None:
    raise X12ParseError(
      X12ErrorCode.UNTERMINATED_TRANSACTION,
      'Transaction set is missing SE.',
      segment_id=current_st.segment_id,
      segment_index=current_st.segment_index,
    )
  if current_gs is not None:
    raise X12ParseError(
      X12ErrorCode.UNTERMINATED_GROUP,
      'Functional group is missing GE.',
      segment_id=current_gs.segment_id,
      segment_index=current_gs.segment_index,
    )
  if iea_segment is None:
    raise X12ParseError(
      X12ErrorCode.MISSING_INTERCHANGE_TRAILER,
      'Interchange is missing IEA.',
      segment_id='IEA',
    )

  return X12Interchange(
    isa_segment=isa_segment,
    functional_groups=tuple(groups),
    iea_segment=iea_segment,
    separators=separators,
  )


def _unexpected(segment: X12Segment, message: str) -> X12ParseError:
  return X12ParseError(
    X12ErrorCode.UNEXPECTED_ENVELOPE_SEGMENT,
    message,
    segment_id=segment.segment_id,
    segment_index=segment.segment_index,
  )
