from pathlib import Path

import yaml

from app.main import app
from app.models.load import EquipmentType, ReferenceType
from app.models.status import ShipmentStatusCode
from app.models.tender import TenderDecision


PROJECT_ROOT = Path(__file__).resolve().parents[3]
APEX_OPENAPI = PROJECT_ROOT / 'docs' / 'partners' / 'apex' / 'openapi.yaml'


def test_documented_apex_paths_and_methods_exist_in_simulator() -> None:
  documented = yaml.safe_load(APEX_OPENAPI.read_text(encoding='utf-8'))
  generated_paths = app.openapi()['paths']

  for path, operations in documented['paths'].items():
    generated_path = path.replace('{loadId}', '{load_id}')
    assert generated_path in generated_paths
    for method in operations:
      assert method in generated_paths[generated_path]


def test_documented_apex_load_field_names_match_simulator_schema() -> None:
  documented = yaml.safe_load(APEX_OPENAPI.read_text(encoding='utf-8'))
  documented_load = documented['components']['schemas']['ApexLoad']['properties']
  generated_load = app.openapi()['components']['schemas']['ApexLoad']['properties']
  generated_location = app.openapi()['components']['schemas']['ApexLocation']['properties']

  expected_load_fields = {
    'loadId',
    'bolNumber',
    'purchaseOrderNumber',
    'customerReference',
    'equipmentType',
    'weightLbs',
    'pieces',
    'commodityDescription',
    'pickup',
    'delivery',
    'createdAt',
    'updatedAt',
  }
  expected_location_fields = {
    'facilityName',
    'address1',
    'address2',
    'city',
    'state',
    'postalCode',
    'scheduledDateTime',
  }

  assert expected_load_fields <= set(documented_load)
  assert expected_load_fields <= set(generated_load)
  assert expected_location_fields <= set(generated_location)


def test_apex_documented_enums_are_stable() -> None:
  assert {item.value for item in EquipmentType} == {'VAN_53', 'REEFER_53', 'FLATBED'}
  assert {item.value for item in TenderDecision} == {'ACCEPTED', 'REJECTED'}
  assert {item.value for item in ShipmentStatusCode} == {'PICKED_UP', 'IN_TRANSIT', 'ARRIVED', 'DELIVERED'}
  assert {item.value for item in ReferenceType} == {'BOL', 'PO', 'CUSTOMER_REF', 'APPOINTMENT'}
