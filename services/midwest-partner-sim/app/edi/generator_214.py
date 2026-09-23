from dataclasses import dataclass
from datetime import datetime, timezone

from app.edi.generator_990 import ControlNumbers


@dataclass(frozen=True)
class Midwest214Source:
  cust_ship_no: str
  carrier_load_no: str
  bol_ref: str
  po_ref: str | None
  at7_code: str
  occurred_at: datetime
  city: str
  state: str


def generate_214(source: Midwest214Source, control_numbers: ControlNumbers) -> str:
  occurred_at = source.occurred_at.astimezone(timezone.utc)
  transaction_segments = [
    ('ST', ('214', control_numbers.transaction_control_number)),
    ('B10', (source.carrier_load_no, source.cust_ship_no, 'MWCX')),
    ('L11', (source.bol_ref, 'BM')),
  ]
  if source.po_ref:
    transaction_segments.append(('L11', (source.po_ref, 'PO')))
  transaction_segments.extend([
    ('AT7', (source.at7_code, '', '', '', occurred_at.strftime('%Y%m%d'), occurred_at.strftime('%H%M'), 'UT')),
    ('MS1', (source.city, source.state)),
  ])
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
        occurred_at.strftime('%y%m%d'),
        occurred_at.strftime('%H%M'),
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
        'QM',
        'MWCX',
        'FREIGHTBRIDGE',
        occurred_at.strftime('%Y%m%d'),
        occurred_at.strftime('%H%M'),
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


def _segment(segment_id: str, elements: tuple[str, ...]) -> str:
  return '*'.join((segment_id, *elements))


def _fixed(value: str, width: int) -> str:
  return value[:width].ljust(width)
