from datetime import datetime, timezone
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.api.dependencies import get_load_repository
from app.core.config import get_settings
from app.main import app
from app.models.load import ApexLoad
from app.models.status import ApexShipmentStatus, ShipmentStatusCode, should_advance_current_status
from app.models.tender import ApexTenderResponse


WRITE_TOKEN = 'test-write-token'
READONLY_TOKEN = 'test-readonly-token'


class FakeApexRepository:
  def __init__(self) -> None:
    self.loads: dict[str, ApexLoad] = {}
    self.tender_history: list[ApexTenderResponse] = []
    self.status_history: list[ApexShipmentStatus] = []
    self.current_status: dict[str, tuple[ShipmentStatusCode, datetime]] = {}

  def create_load(self, load: ApexLoad) -> bool:
    if load.load_id in self.loads:
      return False
    self.loads[load.load_id] = load
    return True

  def fetch_load(self, load_id: str) -> ApexLoad | None:
    return self.loads.get(load_id)

  def record_tender_response(self, response: ApexTenderResponse):
    if response.load_id not in self.loads:
      return None
    self.tender_history.append(response)
    return uuid4()

  def fetch_tender_status(self, load_id: str):
    if load_id not in self.loads:
      return None
    latest = self.tender_history[-1] if self.tender_history else None
    return {
      'loadId': load_id,
      'currentTenderDecision': latest.decision.value if latest else None,
      'updatedAt': self.loads[load_id].updated_at.isoformat(),
      'latestResponse': {
        'eventId': str(uuid4()),
        'decision': latest.decision.value,
        'carrierCode': latest.carrier_code,
        'carrierLoadNumber': latest.carrier_load_number,
        'reasonCode': latest.reason_code,
        'message': latest.message,
        'decidedAt': latest.decided_at.isoformat(),
        'receivedAt': datetime.now(timezone.utc).isoformat(),
      } if latest else None,
    }

  def record_shipment_status(self, shipment_status: ApexShipmentStatus):
    if shipment_status.load_id not in self.loads:
      return None
    self.status_history.append(shipment_status)
    current = self.current_status.get(shipment_status.load_id)
    current_status = current[0] if current else None
    current_occurred_at = current[1] if current else None
    if should_advance_current_status(
      current_status,
      current_occurred_at,
      shipment_status.status_code,
      shipment_status.occurred_at,
    ):
      self.current_status[shipment_status.load_id] = (
        shipment_status.status_code,
        shipment_status.occurred_at,
      )
    return uuid4()


@pytest.fixture(autouse=True)
def clear_app_state(monkeypatch):
  monkeypatch.setenv('APP_ENV', 'test')
  monkeypatch.setenv('APEX_API_BEARER_TOKEN', WRITE_TOKEN)
  monkeypatch.setenv('APEX_API_READONLY_TOKEN', READONLY_TOKEN)
  get_settings.cache_clear()
  app.dependency_overrides.clear()
  yield
  app.dependency_overrides.clear()
  get_settings.cache_clear()


@pytest.fixture
def fake_repository() -> FakeApexRepository:
  repository = FakeApexRepository()
  app.dependency_overrides[get_load_repository] = lambda: repository
  return repository


@pytest.fixture
def client(fake_repository: FakeApexRepository) -> TestClient:
  return TestClient(app)


def auth_headers(token: str = WRITE_TOKEN, correlation_id: str = 'corr-test-001') -> dict[str, str]:
  return {
    'Authorization': f'Bearer {token}',
    'X-Correlation-ID': correlation_id,
  }


def load_payload() -> dict[str, object]:
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


def tender_payload(decision: str = 'ACCEPTED') -> dict[str, object]:
  payload: dict[str, object] = {
    'loadId': 'LOAD500',
    'decision': decision,
    'carrierCode': 'MWCX',
    'message': 'Tender accepted by Midwest Carrier.',
    'decidedAt': '2026-09-19T14:45:00Z',
  }
  if decision == 'ACCEPTED':
    payload['carrierLoadNumber'] = 'MWC900500'
  else:
    payload['reasonCode'] = 'CAPACITY_UNAVAILABLE'
  return payload


def status_payload(status_code: str = 'PICKED_UP', occurred_at: str = '2026-10-01T14:30:00Z') -> dict[str, object]:
  return {
    'loadId': 'LOAD500',
    'carrierCode': 'MWCX',
    'statusCode': status_code,
    'statusDescription': 'Shipment status update.',
    'occurredAt': occurred_at,
    'city': 'Aurora',
    'state': 'IL',
  }


def seed_load(repository: FakeApexRepository) -> None:
  repository.create_load(ApexLoad.model_validate(load_payload()))


def test_health_is_public() -> None:
  response = TestClient(app).get('/health')

  assert response.status_code == 200
  assert response.json() == {'status': 'ok', 'service': 'apex-partner-sim'}


def test_auth_missing_token_returns_401(client: TestClient) -> None:
  response = client.post('/v1/load-tenders', json=load_payload())

  assert response.status_code == 401
  assert response.json()['error']['code'] == 'AUTHENTICATION_ERROR'
  assert 'correlationId' in response.json()['error']


def test_auth_invalid_token_returns_401(client: TestClient) -> None:
  response = client.get('/v1/loads/LOAD500', headers=auth_headers('bad-token'))

  assert response.status_code == 401
  assert response.json()['error']['code'] == 'AUTHENTICATION_ERROR'


def test_readonly_token_can_call_get(client: TestClient, fake_repository: FakeApexRepository) -> None:
  seed_load(fake_repository)

  response = client.get('/v1/loads/LOAD500', headers=auth_headers(READONLY_TOKEN))

  assert response.status_code == 200
  assert response.json()['loadId'] == 'LOAD500'


def test_readonly_token_cannot_call_post(client: TestClient) -> None:
  response = client.post('/v1/load-tenders', headers=auth_headers(READONLY_TOKEN), json=load_payload())

  assert response.status_code == 403
  assert response.json()['error']['code'] == 'AUTHORIZATION_ERROR'


def test_create_and_fetch_load_round_trip(client: TestClient) -> None:
  create_response = client.post('/v1/load-tenders', headers=auth_headers(), json=load_payload())
  fetch_response = client.get('/v1/loads/LOAD500', headers=auth_headers())

  assert create_response.status_code == 202
  assert create_response.json()['status'] == 'ACCEPTED_FOR_PROCESSING'
  assert fetch_response.status_code == 200
  assert fetch_response.json()['bolNumber'] == 'BOL900'
  assert fetch_response.json()['pickup']['facilityName'] == 'ABC Factory'


def test_dispatch_load_posts_to_freightbridge_and_propagates_correlation(
  client: TestClient,
  fake_repository: FakeApexRepository,
  monkeypatch,
) -> None:
  seed_load(fake_repository)
  monkeypatch.setenv('FREIGHTBRIDGE_API_BASE_URL', 'https://freightbridge.example.test')
  monkeypatch.setenv('FREIGHTBRIDGE_APEX_BEARER_TOKEN', 'outbound-secret-token')
  get_settings.cache_clear()
  captured: dict[str, object] = {}

  def fake_post(url: str, **kwargs):
    captured['url'] = url
    captured.update(kwargs)
    return httpx.Response(
      202,
      json={
        'status': 'ACCEPTED',
        'correlationId': 'corr-dispatch-001',
        'transactionId': str(uuid4()),
        'shipmentId': str(uuid4()),
        'shipmentNumber': 'LOAD500',
      },
    )

  import httpx

  monkeypatch.setattr('app.api.routes.loads.httpx.post', fake_post)

  response = client.post(
    '/v1/load-tenders/LOAD500/dispatch',
    headers=auth_headers(correlation_id='corr-dispatch-001'),
  )

  assert response.status_code == 202
  assert response.json()['status'] == 'DISPATCHED'
  assert response.json()['correlationId'] == 'corr-dispatch-001'
  assert captured['url'] == 'https://freightbridge.example.test/api/integrations/apex/load-tenders'
  assert captured['headers']['Authorization'] == 'Bearer outbound-secret-token'
  assert captured['headers']['X-Correlation-ID'] == 'corr-dispatch-001'
  assert captured['json']['loadId'] == 'LOAD500'
  assert 'outbound-secret-token' not in response.text


def test_dispatch_unknown_load_returns_404(client: TestClient, monkeypatch) -> None:
  monkeypatch.setenv('FREIGHTBRIDGE_API_BASE_URL', 'https://freightbridge.example.test')
  monkeypatch.setenv('FREIGHTBRIDGE_APEX_BEARER_TOKEN', 'outbound-secret-token')
  get_settings.cache_clear()

  response = client.post('/v1/load-tenders/LOAD404/dispatch', headers=auth_headers())

  assert response.status_code == 404
  assert response.json()['error']['code'] == 'LOAD_NOT_FOUND'


def test_dispatch_freightbridge_auth_failure_returns_safe_dependency_error(
  client: TestClient,
  fake_repository: FakeApexRepository,
  monkeypatch,
) -> None:
  seed_load(fake_repository)
  monkeypatch.setenv('FREIGHTBRIDGE_API_BASE_URL', 'https://freightbridge.example.test')
  monkeypatch.setenv('FREIGHTBRIDGE_APEX_BEARER_TOKEN', 'outbound-secret-token')
  get_settings.cache_clear()

  import httpx

  monkeypatch.setattr('app.api.routes.loads.httpx.post', lambda *args, **kwargs: httpx.Response(401, json={}))

  response = client.post('/v1/load-tenders/LOAD500/dispatch', headers=auth_headers())

  assert response.status_code == 503
  assert response.json()['error']['code'] == 'DEPENDENCY_ERROR'
  assert 'outbound-secret-token' not in response.text


def test_dispatch_freightbridge_duplicate_returns_conflict(
  client: TestClient,
  fake_repository: FakeApexRepository,
  monkeypatch,
) -> None:
  seed_load(fake_repository)
  monkeypatch.setenv('FREIGHTBRIDGE_API_BASE_URL', 'https://freightbridge.example.test')
  monkeypatch.setenv('FREIGHTBRIDGE_APEX_BEARER_TOKEN', 'outbound-secret-token')
  get_settings.cache_clear()

  import httpx

  monkeypatch.setattr('app.api.routes.loads.httpx.post', lambda *args, **kwargs: httpx.Response(409, json={}))

  response = client.post('/v1/load-tenders/LOAD500/dispatch', headers=auth_headers())

  assert response.status_code == 409
  assert response.json()['error']['code'] == 'DUPLICATE_LOAD'


def test_dispatch_freightbridge_timeout_returns_dependency_error(
  client: TestClient,
  fake_repository: FakeApexRepository,
  monkeypatch,
) -> None:
  seed_load(fake_repository)
  monkeypatch.setenv('FREIGHTBRIDGE_API_BASE_URL', 'https://freightbridge.example.test')
  monkeypatch.setenv('FREIGHTBRIDGE_APEX_BEARER_TOKEN', 'outbound-secret-token')
  get_settings.cache_clear()

  import httpx

  def timeout(*args, **kwargs):
    raise httpx.TimeoutException('timed out')

  monkeypatch.setattr('app.api.routes.loads.httpx.post', timeout)

  response = client.post('/v1/load-tenders/LOAD500/dispatch', headers=auth_headers())

  assert response.status_code == 503
  assert response.json()['error']['code'] == 'DEPENDENCY_ERROR'
  assert 'timed out' not in response.text


def test_unknown_load_returns_404(client: TestClient) -> None:
  response = client.get('/v1/loads/LOAD999', headers=auth_headers())

  assert response.status_code == 404
  assert response.json()['error']['code'] == 'LOAD_NOT_FOUND'


def test_duplicate_load_returns_409(client: TestClient) -> None:
  client.post('/v1/load-tenders', headers=auth_headers(), json=load_payload())
  response = client.post('/v1/load-tenders', headers=auth_headers(), json=load_payload())

  assert response.status_code == 409
  assert response.json()['error']['code'] == 'DUPLICATE_LOAD'


def test_tender_response_accepts_accepted_and_rejected(
  client: TestClient,
  fake_repository: FakeApexRepository,
) -> None:
  seed_load(fake_repository)

  accepted = client.post('/v1/tender-responses', headers=auth_headers(), json=tender_payload('ACCEPTED'))
  rejected = client.post('/v1/tender-responses', headers=auth_headers(), json=tender_payload('REJECTED'))

  assert accepted.status_code == 202
  assert rejected.status_code == 202
  assert len(fake_repository.tender_history) == 2


def test_rejected_tender_without_reason_returns_422(
  client: TestClient,
  fake_repository: FakeApexRepository,
) -> None:
  seed_load(fake_repository)
  payload = tender_payload('REJECTED')
  payload.pop('reasonCode')

  response = client.post('/v1/tender-responses', headers=auth_headers(), json=payload)

  assert response.status_code == 422
  assert response.json()['error']['code'] == 'BUSINESS_VALIDATION_ERROR'


def test_tender_response_unknown_load_returns_404(client: TestClient) -> None:
  response = client.post('/v1/tender-responses', headers=auth_headers(), json=tender_payload('ACCEPTED'))

  assert response.status_code == 404
  assert response.json()['error']['code'] == 'LOAD_NOT_FOUND'


def test_get_tender_status_returns_latest_tender_response(
  client: TestClient,
  fake_repository: FakeApexRepository,
) -> None:
  seed_load(fake_repository)
  client.post('/v1/tender-responses', headers=auth_headers(), json=tender_payload('ACCEPTED'))

  response = client.get('/v1/loads/LOAD500/tender-status', headers=auth_headers(READONLY_TOKEN))

  assert response.status_code == 200
  body = response.json()
  assert body['loadId'] == 'LOAD500'
  assert body['currentTenderDecision'] == 'ACCEPTED'
  assert body['latestResponse']['carrierLoadNumber'] == 'MWC900500'


@pytest.mark.parametrize('status_code', ['PICKED_UP', 'IN_TRANSIT', 'ARRIVED', 'DELIVERED'])
def test_shipment_status_values_are_accepted(
  client: TestClient,
  fake_repository: FakeApexRepository,
  status_code: str,
) -> None:
  seed_load(fake_repository)

  response = client.post('/v1/shipment-statuses', headers=auth_headers(), json=status_payload(status_code))

  assert response.status_code == 202


def test_unknown_shipment_status_is_rejected(
  client: TestClient,
  fake_repository: FakeApexRepository,
) -> None:
  seed_load(fake_repository)

  response = client.post('/v1/shipment-statuses', headers=auth_headers(), json=status_payload('X6'))

  assert response.status_code == 422
  assert response.json()['error']['code'] == 'BUSINESS_VALIDATION_ERROR'


def test_shipment_status_unknown_load_returns_404(client: TestClient) -> None:
  response = client.post('/v1/shipment-statuses', headers=auth_headers(), json=status_payload())

  assert response.status_code == 404


def test_late_historical_status_does_not_regress_current_apex_status(
  client: TestClient,
  fake_repository: FakeApexRepository,
) -> None:
  seed_load(fake_repository)

  delivered = status_payload('DELIVERED', '2026-10-02T18:15:00Z')
  late_arrived = status_payload('ARRIVED', '2026-10-02T17:45:00Z')

  assert client.post('/v1/shipment-statuses', headers=auth_headers(), json=delivered).status_code == 202
  assert client.post('/v1/shipment-statuses', headers=auth_headers(), json=late_arrived).status_code == 202

  assert len(fake_repository.status_history) == 2
  assert fake_repository.current_status['LOAD500'][0] == ShipmentStatusCode.DELIVERED


def test_error_response_preserves_safe_correlation_id(client: TestClient) -> None:
  response = client.get('/v1/loads/LOAD404', headers=auth_headers(correlation_id='corr-safe-123'))

  body = response.json()
  assert body['error']['correlationId'] == 'corr-safe-123'
  assert response.headers['x-correlation-id'] == 'corr-safe-123'
  assert WRITE_TOKEN not in response.text


def test_malformed_json_returns_invalid_request(client: TestClient) -> None:
  response = client.post(
    '/v1/load-tenders',
    headers={
      **auth_headers(),
      'Content-Type': 'application/json',
    },
    content='{bad-json',
  )

  assert response.status_code == 400
  assert response.json()['error']['code'] == 'INVALID_REQUEST'
