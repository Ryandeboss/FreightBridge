from pathlib import Path

import pytest

from app.integrations.x12 import (
  X12ErrorCode,
  X12ParseError,
  X12ValidationError,
  parse_x12,
  serialize_x12,
  validate_x12_envelopes,
)


PROJECT_ROOT = Path(__file__).resolve().parents[3]
MIDWEST_FIXTURE_DIR = PROJECT_ROOT / 'sample-data' / 'x12' / 'midwest'
STRUCTURAL_FIXTURE_DIR = Path(__file__).parent / 'fixtures' / 'x12'


@pytest.mark.parametrize(
  ('filename', 'transaction_set_identifier'),
  [
    ('204-valid.edi', '204'),
    ('204-invalid-missing-required-field.edi', '204'),
    ('990-accepted.edi', '990'),
    ('990-rejected.edi', '990'),
    ('214-picked-up.edi', '214'),
    ('214-in-transit.edi', '214'),
    ('214-arrived.edi', '214'),
    ('214-delivered.edi', '214'),
    ('997-accepted.edi', '997'),
  ],
)
def test_midwest_profile_fixtures_parse_as_generic_x12(
  filename: str,
  transaction_set_identifier: str,
) -> None:
  interchange = parse_x12(_read_midwest_fixture(filename))
  validate_x12_envelopes(interchange)

  group = interchange.functional_groups[0]
  transaction_set = group.transaction_sets[0]

  assert interchange.separators.element_separator == '*'
  assert interchange.separators.segment_terminator == '~'
  assert interchange.separators.component_separator == ':'
  assert interchange.separators.repetition_separator is None
  assert interchange.interchange_control_version == '00401'
  assert group.version_release == '004010'
  assert transaction_set.transaction_set_identifier == transaction_set_identifier
  assert transaction_set.st_segment.element(1) == transaction_set_identifier
  assert transaction_set.st_segment.element(2) == transaction_set.control_number
  assert transaction_set.st_segment.element(0) is None
  assert transaction_set.st_segment.element(99) is None


def test_round_trip_preserves_x12_segments_and_envelopes() -> None:
  original = parse_x12(_read_midwest_fixture('204-valid.edi'))

  serialized = serialize_x12(original)
  reparsed = parse_x12(serialized)
  validate_x12_envelopes(reparsed)

  assert reparsed.separators == original.separators
  assert reparsed.interchange_control_number == original.interchange_control_number
  assert [
    (segment.segment_id, segment.elements)
    for segment in reparsed.segments
  ] == [
    (segment.segment_id, segment.elements)
    for segment in original.segments
  ]


def test_custom_delimiters_are_discovered_from_isa() -> None:
  interchange = parse_x12(_read_structural_fixture('custom-delimiters.edi'))
  validate_x12_envelopes(interchange)

  assert interchange.separators.element_separator == '^'
  assert interchange.separators.segment_terminator == '!'
  assert interchange.separators.component_separator == '>'
  assert interchange.functional_groups[0].transaction_sets[0].transaction_set_identifier == '204'


def test_multiple_transaction_sets_are_grouped_without_business_mapping() -> None:
  interchange = parse_x12(_read_structural_fixture('multiple-transactions.edi'))
  validate_x12_envelopes(interchange)

  group = interchange.functional_groups[0]

  assert len(interchange.functional_groups) == 1
  assert [transaction.transaction_set_identifier for transaction in group.transaction_sets] == [
    '204',
    '990',
  ]


def test_multiple_functional_groups_are_grouped_without_business_mapping() -> None:
  interchange = parse_x12(_read_structural_fixture('multiple-groups.edi'))
  validate_x12_envelopes(interchange)

  assert len(interchange.functional_groups) == 2
  assert [
    group.functional_identifier
    for group in interchange.functional_groups
  ] == ['SM', 'FA']


@pytest.mark.parametrize(
  ('filename', 'error_code'),
  [
    ('malformed-isa.edi', X12ErrorCode.MALFORMED_ISA),
    ('orphan-se.edi', X12ErrorCode.UNEXPECTED_ENVELOPE_SEGMENT),
    ('orphan-ge.edi', X12ErrorCode.UNEXPECTED_ENVELOPE_SEGMENT),
    ('missing-se.edi', X12ErrorCode.UNTERMINATED_TRANSACTION),
    ('missing-ge.edi', X12ErrorCode.UNTERMINATED_GROUP),
    ('missing-iea.edi', X12ErrorCode.MISSING_INTERCHANGE_TRAILER),
  ],
)
def test_structural_parse_errors_report_stable_error_codes(
  filename: str,
  error_code: X12ErrorCode,
) -> None:
  with pytest.raises(X12ParseError) as exc_info:
    parse_x12(_read_structural_fixture(filename))

  assert exc_info.value.code == error_code


@pytest.mark.parametrize(
  ('filename', 'error_code'),
  [
    ('mismatched-isa-iea.edi', X12ErrorCode.CONTROL_NUMBER_MISMATCH),
    ('mismatched-gs-ge.edi', X12ErrorCode.CONTROL_NUMBER_MISMATCH),
    ('mismatched-st-se.edi', X12ErrorCode.CONTROL_NUMBER_MISMATCH),
    ('incorrect-se-count.edi', X12ErrorCode.SEGMENT_COUNT_MISMATCH),
    ('incorrect-ge-count.edi', X12ErrorCode.TRANSACTION_COUNT_MISMATCH),
    ('incorrect-iea-count.edi', X12ErrorCode.GROUP_COUNT_MISMATCH),
  ],
)
def test_envelope_validation_errors_report_stable_error_codes(
  filename: str,
  error_code: X12ErrorCode,
) -> None:
  interchange = parse_x12(_read_structural_fixture(filename))

  with pytest.raises(X12ValidationError) as exc_info:
    validate_x12_envelopes(interchange)

  assert exc_info.value.code == error_code


def _read_midwest_fixture(filename: str) -> str:
  return (MIDWEST_FIXTURE_DIR / filename).read_text(encoding='utf-8')


def _read_structural_fixture(filename: str) -> str:
  return (STRUCTURAL_FIXTURE_DIR / filename).read_text(encoding='utf-8')
