import pytest
from pydantic import ValidationError

from app.models.load import ApexLoad
from app.models.status import (
  ShipmentStatusCode,
  should_advance_current_status,
)


def valid_load_payload() -> dict[str, object]:
  return {
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
      {
        'type': 'CUSTOMER_REF',
        'value': 'CUST-REF-500',
        'description': 'Customer routing reference',
      }
    ],
    'createdAt': '2026-09-19T14:00:00Z',
    'updatedAt': '2026-09-19T14:05:00Z',
  }


def test_valid_apex_load_uses_contract_aliases() -> None:
  load = ApexLoad.model_validate(valid_load_payload())

  assert load.load_id == 'LOAD500'
  assert load.pickup.facility_name == 'ABC Factory'
  assert load.model_dump(by_alias=True)['loadId'] == 'LOAD500'


@pytest.mark.parametrize(
  ('field', 'value'),
  [
    ('weightLbs', 0),
    ('pieces', 0),
  ],
)
def test_apex_load_rejects_invalid_quantities(field: str, value: object) -> None:
  payload = valid_load_payload()
  payload[field] = value

  with pytest.raises(ValidationError):
    ApexLoad.model_validate(payload)


def test_apex_load_rejects_invalid_state() -> None:
  payload = valid_load_payload()
  payload['pickup'] = {
    **payload['pickup'],  # type: ignore[arg-type]
    'state': 'Illinois',
  }

  with pytest.raises(ValidationError):
    ApexLoad.model_validate(payload)


def test_apex_load_rejects_updated_at_before_created_at() -> None:
  payload = valid_load_payload()
  payload['updatedAt'] = '2026-09-19T13:59:00Z'

  with pytest.raises(ValidationError):
    ApexLoad.model_validate(payload)


def test_status_progression_does_not_regress_for_late_event() -> None:
  assert not should_advance_current_status(
    ShipmentStatusCode.DELIVERED,
    ApexLoad.model_validate(valid_load_payload()).delivery.scheduled_datetime,
    ShipmentStatusCode.ARRIVED,
    ApexLoad.model_validate(valid_load_payload()).pickup.scheduled_datetime,
  )
