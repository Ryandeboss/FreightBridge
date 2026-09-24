from app.main import app
from app.edi.parser import parse_midwest_204
from tests.test_midwest_api import MIDWEST_204


def test_midwest_public_routes_keep_expected_methods() -> None:
  routes = {
    (path, method.upper())
    for path, operations in app.openapi()['paths'].items()
    for method in operations
  }

  assert {
    ('/health', 'GET'),
    ('/readiness', 'GET'),
    ('/v1/edi/inbound/204', 'POST'),
    ('/v1/loads/{customer_shipment_number}', 'GET'),
    ('/v1/loads/{customer_shipment_number}/tender-decisions', 'POST'),
    ('/v1/loads/{customer_shipment_number}/shipment-events', 'POST'),
    ('/v1/loads/{customer_shipment_number}/shipment-events', 'GET'),
    ('/v1/loads/{customer_shipment_number}/functional-acknowledgments', 'GET'),
    ('/v1/sftp/readiness', 'GET'),
    ('/v1/sftp/inbound/poll', 'POST'),
  } <= routes


def test_midwest_204_profile_identity_is_stable() -> None:
  parsed = parse_midwest_204(MIDWEST_204)
  segments = {
    segment.strip().split('*', 1)[0]: segment.strip().split('*')
    for segment in MIDWEST_204.strip().split('~')
    if segment.strip()
  }

  assert segments['ISA'][12] == '00401'
  assert segments['GS'][8] == '004010'
  assert parsed.x12_version == '004010'
  assert parsed.cust_ship_no == 'LOAD500'
  assert segments['ISA'][6].strip() == 'FREIGHTBRIDGE'
  assert segments['ISA'][8].strip() == 'MWCX'
