from datetime import datetime, timezone
from decimal import Decimal

from app.domain import (
  CanonicalLocation,
  CanonicalShipment,
  EquipmentType,
  ReferenceType,
  ShipmentReference,
)
from app.integrations.midwest.control_numbers import X12ControlNumbers


FIXED_NOW = datetime(2026, 9, 24, 15, 0, tzinfo=timezone.utc)


def apex_load_json(**overrides: object) -> dict[str, object]:
  payload: dict[str, object] = {
    'loadId': 'LOAD500',
    'bolNumber': 'BOL900',
    'purchaseOrderNumber': 'PO111',
    'customerReference': 'CUST-REF-500',
    'equipmentType': 'VAN_53',
    'weightLbs': 42000,
    'pieces': 22,
    'commodityDescription': 'Packaged auto parts',
    'pickup': {
      'facilityName': 'ABC Factory',
      'address1': '200 Industrial Rd',
      'address2': 'Dock 4',
      'city': 'Aurora',
      'state': 'IL',
      'postalCode': '60505',
      'scheduledDateTime': '2026-10-01T14:00:00Z',
    },
    'delivery': {
      'facilityName': 'XYZ Warehouse',
      'address1': '900 Commerce St',
      'address2': None,
      'city': 'Detroit',
      'state': 'MI',
      'postalCode': '48201',
      'scheduledDateTime': '2026-10-02T18:00:00Z',
    },
    'references': [
      {'type': 'CUSTOMER_REF', 'value': 'CUST-REF-500', 'description': 'Customer routing reference'},
    ],
    'createdAt': '2026-09-19T14:00:00Z',
    'updatedAt': '2026-09-19T14:05:00Z',
  }
  payload.update(overrides)
  return payload


def canonical_shipment(**overrides: object) -> CanonicalShipment:
  shipment = CanonicalShipment(
    shipment_number='LOAD500',
    equipment_type=EquipmentType.DRY_VAN_53,
    weight_lbs=Decimal('42000'),
    pieces=22,
    commodity_description='Packaged auto parts',
    origin=CanonicalLocation(
      facility_name='ABC Factory',
      address_line_1='200 Industrial Rd',
      address_line_2='Dock 4',
      city='Aurora',
      state='IL',
      postal_code='60505',
      scheduled_at=datetime(2026, 10, 1, 14, 0, tzinfo=timezone.utc),
    ),
    destination=CanonicalLocation(
      facility_name='XYZ Warehouse',
      address_line_1='900 Commerce St',
      address_line_2=None,
      city='Detroit',
      state='MI',
      postal_code='48201',
      scheduled_at=datetime(2026, 10, 2, 18, 0, tzinfo=timezone.utc),
    ),
    references=[
      ShipmentReference(reference_type=ReferenceType.BOL, reference_value='BOL900'),
      ShipmentReference(reference_type=ReferenceType.PO, reference_value='PO111'),
      ShipmentReference(reference_type=ReferenceType.CUSTOMER_REFERENCE, reference_value='CUST-REF-500'),
    ],
  )
  return shipment.model_copy(update=overrides)


def deterministic_controls(
  *,
  isa13: str = '000000905',
  gs06: str = '905',
  st02: str = '0001',
) -> X12ControlNumbers:
  return X12ControlNumbers(
    interchange_control_number=isa13,
    group_control_number=gs06,
    transaction_control_number=st02,
  )


def correlation_id(label: str = 'regression') -> str:
  return f'corr-{label}-20260924'


def midwest_214(
  *,
  shipment_number: str = 'LOAD500',
  carrier_load_number: str = 'MWC900500',
  at7_code: str = 'AF',
  occurred_at: datetime = datetime(2026, 10, 7, 14, 30, tzinfo=timezone.utc),
  city: str = 'Aurora',
  state: str = 'IL',
  interchange_control: str = '000000907',
  group_control: str = '907',
  transaction_control: str = '0001',
) -> str:
  date = occurred_at.strftime('%Y%m%d')
  time = occurred_at.strftime('%H%M')
  isa_date = occurred_at.strftime('%y%m%d')
  return (
    f'ISA*00*          *00*          *ZZ*MWCX           *ZZ*FREIGHTBRIDGE  *{isa_date}*{time}*U*00401*{interchange_control}*0*T*:~'
    f'GS*QM*MWCX*FREIGHTBRIDGE*{date}*{time}*{group_control}*X*004010~'
    f'ST*214*{transaction_control}~'
    f'B10*{carrier_load_number}*{shipment_number}*MWCX~'
    'L11*BOL900*BM~'
    'L11*PO111*PO~'
    f'AT7*{at7_code}****{date}*{time}*UT~'
    f'MS1*{city}*{state}~'
    f'SE*7*{transaction_control}~'
    f'GE*1*{group_control}~'
    f'IEA*1*{interchange_control}~'
  )


def midwest_997(
  *,
  ak5_code: str = 'A',
  ak9_code: str = 'A',
  accepted_count: int = 1,
  original_group_control: str = '905',
  original_transaction_control: str = '0001',
  interchange_control: str = '000000917',
  group_control: str = '917',
) -> str:
  return (
    f'ISA*00*          *00*          *ZZ*MWCX           *ZZ*FREIGHTBRIDGE  *260923*1430*U*00401*{interchange_control}*0*T*:~'
    f'GS*FA*MWCX*FREIGHTBRIDGE*20260923*1430*{group_control}*X*004010~'
    'ST*997*0001~'
    f'AK1*SM*{original_group_control}~'
    f'AK2*204*{original_transaction_control}~'
    f'AK5*{ak5_code}~'
    f'AK9*{ak9_code}*1*1*{accepted_count}~'
    'SE*6*0001~'
    f'GE*1*{group_control}~'
    f'IEA*1*{interchange_control}~'
  )
