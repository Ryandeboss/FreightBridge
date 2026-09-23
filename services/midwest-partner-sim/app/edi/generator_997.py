from dataclasses import dataclass
from datetime import datetime, timezone

from app.edi.generator_990 import ControlNumbers


@dataclass(frozen=True)
class Midwest997Source:
  original_functional_identifier: str
  original_group_control_number: str
  original_transaction_set_identifier: str
  original_transaction_control_number: str
  transaction_ack_code: str
  group_ack_code: str
  transaction_sets_included: int
  transaction_sets_received: int
  transaction_sets_accepted: int
  generated_at: datetime


def generate_997(source: Midwest997Source, control_numbers: ControlNumbers) -> str:
  generated_at = source.generated_at.astimezone(timezone.utc)
  transaction_segments = [
    ('ST', ('997', control_numbers.transaction_control_number)),
    ('AK1', (source.original_functional_identifier, source.original_group_control_number)),
    ('AK2', (source.original_transaction_set_identifier, source.original_transaction_control_number)),
    ('AK5', (source.transaction_ack_code,)),
    (
      'AK9',
      (
        source.group_ack_code,
        str(source.transaction_sets_included),
        str(source.transaction_sets_received),
        str(source.transaction_sets_accepted),
      ),
    ),
  ]
  transaction_segments.append(('SE', (str(len(transaction_segments) + 1), control_numbers.transaction_control_number)))

  segments = [
    (
      'ISA',
      (
        '00',
        _fixed('', 10),
        '00',
        _fixed('', 10),
        'ZZ',
        _fixed('MWCX', 15),
        'ZZ',
        _fixed('FREIGHTBRIDGE', 15),
        generated_at.strftime('%y%m%d'),
        generated_at.strftime('%H%M'),
        'U',
        '00401',
        control_numbers.interchange_control_number,
        '0',
        'T',
        ':',
      ),
    ),
    (
      'GS',
      (
        'FA',
        'MWCX',
        'FREIGHTBRIDGE',
        generated_at.strftime('%Y%m%d'),
        generated_at.strftime('%H%M'),
        control_numbers.group_control_number,
        'X',
        '004010',
      ),
    ),
    *transaction_segments,
    ('GE', ('1', control_numbers.group_control_number)),
    ('IEA', ('1', control_numbers.interchange_control_number)),
  ]
  return '~'.join(_segment(segment_id, elements) for segment_id, elements in segments) + '~'


def accepted_204_997_source(
  *,
  original_group_control_number: str,
  original_transaction_control_number: str,
  generated_at: datetime,
) -> Midwest997Source:
  return Midwest997Source(
    original_functional_identifier='SM',
    original_group_control_number=original_group_control_number,
    original_transaction_set_identifier='204',
    original_transaction_control_number=original_transaction_control_number,
    transaction_ack_code='A',
    group_ack_code='A',
    transaction_sets_included=1,
    transaction_sets_received=1,
    transaction_sets_accepted=1,
    generated_at=generated_at,
  )


def rejected_204_997_source(
  *,
  original_group_control_number: str,
  original_transaction_control_number: str,
  generated_at: datetime,
) -> Midwest997Source:
  return Midwest997Source(
    original_functional_identifier='SM',
    original_group_control_number=original_group_control_number,
    original_transaction_set_identifier='204',
    original_transaction_control_number=original_transaction_control_number,
    transaction_ack_code='R',
    group_ack_code='R',
    transaction_sets_included=1,
    transaction_sets_received=1,
    transaction_sets_accepted=0,
    generated_at=generated_at,
  )


def _segment(segment_id: str, elements: tuple[str, ...]) -> str:
  return '*'.join((segment_id, *elements))


def _fixed(value: str, width: int) -> str:
  return value[:width].ljust(width)
