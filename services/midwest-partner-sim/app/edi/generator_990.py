from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal


@dataclass(frozen=True)
class ControlNumbers:
  interchange_control_number: str
  group_control_number: str
  transaction_control_number: str


@dataclass(frozen=True)
class Midwest990Source:
  cust_ship_no: str
  bol_ref: str
  po_ref: str | None
  decision: str
  carrier_load_no: str | None
  reason_code: str | None
  decided_at: datetime


def generate_990(source: Midwest990Source, control_numbers: ControlNumbers) -> str:
  decided_at = source.decided_at.astimezone(timezone.utc)
  transaction_segments = [
    ('ST', ('990', control_numbers.transaction_control_number)),
    ('B1', ('MWCX', source.cust_ship_no, decided_at.strftime('%Y%m%d'), _decision_code(source.decision))),
    ('L11', (source.bol_ref, 'BM')),
  ]
  if source.po_ref:
    transaction_segments.append(('L11', (source.po_ref, 'PO')))
  if source.decision == 'ACCEPTED':
    transaction_segments.append(('L11', (_require(source.carrier_load_no), 'CN')))
  else:
    transaction_segments.append(('L11', (_require(source.reason_code), 'ZZ')))
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
        decided_at.strftime('%y%m%d'),
        decided_at.strftime('%H%M'),
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
        'GF',
        'MWCX',
        'FREIGHTBRIDGE',
        decided_at.strftime('%Y%m%d'),
        decided_at.strftime('%H%M'),
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


def _decision_code(decision: str) -> str:
  return 'A' if decision == 'ACCEPTED' else 'D'


def _require(value: str | None) -> str:
  if not value:
    raise ValueError('Required 990 source value is missing')
  return value
