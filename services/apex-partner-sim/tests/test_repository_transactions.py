from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass, field
from datetime import datetime
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.api.dependencies import get_load_repository
from app.core.config import get_settings
from app.main import app
from app.models.load import ApexLoad
from app.models.status import ApexShipmentStatus
from app.models.tender import ApexTenderResponse
from app.repositories.loads import ApexLoadRepository


def load_payload(load_id: str = 'LOAD500') -> dict[str, object]:
  return {
    'loadId': load_id,
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


def tender_payload() -> dict[str, object]:
  return {
    'loadId': 'LOAD500',
    'decision': 'ACCEPTED',
    'carrierCode': 'MWCX',
    'carrierLoadNumber': 'MWC900500',
    'message': 'Tender accepted by Midwest Carrier.',
    'decidedAt': '2026-09-19T14:45:00Z',
  }


def status_payload(status_code: str = 'PICKED_UP') -> dict[str, object]:
  return {
    'loadId': 'LOAD500',
    'carrierCode': 'MWCX',
    'statusCode': status_code,
    'statusDescription': 'Shipment status update.',
    'occurredAt': '2026-10-01T14:30:00Z',
    'city': 'Aurora',
    'state': 'IL',
  }


@dataclass
class FakeApexDatabase:
  loads: dict[str, dict[str, object]] = field(default_factory=dict)
  locations: list[dict[str, object]] = field(default_factory=list)
  references: list[dict[str, object]] = field(default_factory=list)
  tender_responses: list[dict[str, object]] = field(default_factory=list)
  shipment_statuses: list[dict[str, object]] = field(default_factory=list)
  fail_on_reference_insert: bool = False


class FakeConnection:
  def __init__(self, database: FakeApexDatabase) -> None:
    self.database = database
    self.closed = False
    self._transaction_database: FakeApexDatabase | None = None

  def cursor(self) -> 'FakeCursor':
    return FakeCursor(self)

  def transaction(self) -> 'FakeTransaction':
    return FakeTransaction(self)

  def close(self) -> None:
    self.closed = True

  @property
  def active_database(self) -> FakeApexDatabase:
    return self._transaction_database or self.database


class FakeTransaction:
  def __init__(self, connection: FakeConnection) -> None:
    self.connection = connection

  def __enter__(self) -> 'FakeTransaction':
    self.connection._transaction_database = deepcopy(self.connection.database)
    return self

  def __exit__(self, exc_type, exc, traceback) -> bool:
    if exc_type is None:
      staged = self.connection._transaction_database
      assert staged is not None
      self.connection.database.loads = staged.loads
      self.connection.database.locations = staged.locations
      self.connection.database.references = staged.references
      self.connection.database.tender_responses = staged.tender_responses
      self.connection.database.shipment_statuses = staged.shipment_statuses
    self.connection._transaction_database = None
    return False


class FakeCursor:
  def __init__(self, connection: FakeConnection) -> None:
    self.connection = connection
    self._result: list[dict[str, object]] = []

  def __enter__(self) -> 'FakeCursor':
    return self

  def __exit__(self, exc_type, exc, traceback) -> bool:
    return False

  def execute(self, sql: str, params: tuple[object, ...]) -> None:
    normalized_sql = ' '.join(sql.lower().split())
    database = self.connection.active_database

    if normalized_sql.startswith('select 1 from apex_sim.loads'):
      load_id = str(params[0])
      self._result = [{'exists': 1}] if load_id in database.loads else []
      return

    if normalized_sql.startswith('insert into apex_sim.loads'):
      load_id = str(params[0])
      database.loads[load_id] = {
        'load_id': load_id,
        'bol_number': params[1],
        'purchase_order_number': params[2],
        'customer_reference': params[3],
        'equipment_type': params[4],
        'weight_lbs': params[5],
        'pieces': params[6],
        'commodity_description': params[7],
        'created_at': params[8],
        'updated_at': params[9],
        'current_tender_decision': None,
        'current_shipment_status': None,
        'current_shipment_status_occurred_at': None,
      }
      self._result = []
      return

    if normalized_sql.startswith('insert into apex_sim.load_locations'):
      database.locations.append({
        'load_id': params[0],
        'location_role': params[1],
        'facility_name': params[2],
        'address_1': params[3],
        'address_2': params[4],
        'city': params[5],
        'state': params[6],
        'postal_code': params[7],
        'scheduled_datetime': params[8],
      })
      self._result = []
      return

    if normalized_sql.startswith('insert into apex_sim.load_references'):
      if database.fail_on_reference_insert:
        raise RuntimeError('simulated reference insert failure')
      database.references.append({
        'load_id': params[0],
        'reference_type': params[1],
        'reference_value': params[2],
        'description': params[3],
        'id': uuid4(),
      })
      self._result = []
      return

    if normalized_sql.startswith('select * from apex_sim.loads'):
      load_id = str(params[0])
      row = database.loads.get(load_id)
      self._result = [row] if row else []
      return

    if 'from apex_sim.load_locations' in normalized_sql:
      load_id = str(params[0])
      self._result = [
        row
        for row in database.locations
        if row['load_id'] == load_id
      ]
      return

    if 'from apex_sim.load_references' in normalized_sql:
      load_id = str(params[0])
      self._result = [
        row
        for row in database.references
        if row['load_id'] == load_id
      ]
      return

    if normalized_sql.startswith('insert into apex_sim.tender_responses'):
      event_id = uuid4()
      database.tender_responses.append({
        'id': event_id,
        'load_id': params[0],
        'decision': params[1],
        'carrier_code': params[2],
        'carrier_load_number': params[3],
        'reason_code': params[4],
        'message': params[5],
        'decided_at': params[6],
        'received_at': params[7],
      })
      self._result = [{'id': event_id}]
      return

    if normalized_sql.startswith('update apex_sim.loads set current_tender_decision'):
      load = database.loads[str(params[2])]
      load['current_tender_decision'] = params[0]
      load['updated_at'] = max_datetime(load['updated_at'], params[1])
      self._result = []
      return

    if normalized_sql.startswith('select current_shipment_status'):
      load_id = str(params[0])
      load = database.loads.get(load_id)
      self._result = [
        {
          'current_shipment_status': load['current_shipment_status'],
          'current_shipment_status_occurred_at': load['current_shipment_status_occurred_at'],
        }
      ] if load else []
      return

    if normalized_sql.startswith('insert into apex_sim.shipment_statuses'):
      event_id = uuid4()
      database.shipment_statuses.append({
        'id': event_id,
        'load_id': params[0],
        'carrier_code': params[1],
        'status_code': params[2],
        'status_description': params[3],
        'occurred_at': params[4],
        'city': params[5],
        'state': params[6],
        'received_at': params[7],
      })
      self._result = [{'id': event_id}]
      return

    if normalized_sql.startswith('update apex_sim.loads set current_shipment_status'):
      load = database.loads[str(params[3])]
      load['current_shipment_status'] = params[0]
      load['current_shipment_status_occurred_at'] = params[1]
      load['updated_at'] = max_datetime(load['updated_at'], params[2])
      self._result = []
      return

    raise AssertionError(f'unhandled SQL: {sql}')

  def fetchone(self):
    return self._result[0] if self._result else None

  def fetchall(self) -> list[dict[str, object]]:
    return self._result


def max_datetime(left: object, right: object) -> object:
  assert isinstance(left, datetime)
  assert isinstance(right, datetime)
  return left if left >= right else right


def repository_for(database: FakeApexDatabase) -> tuple[ApexLoadRepository, FakeConnection]:
  connection = FakeConnection(database)
  return ApexLoadRepository(connection), connection


def test_create_load_persists_after_connection_scope_ends() -> None:
  database = FakeApexDatabase()
  repository, connection = repository_for(database)

  assert repository.create_load(ApexLoad.model_validate(load_payload()))
  connection.close()

  next_repository, next_connection = repository_for(database)
  persisted_load = next_repository.fetch_load('LOAD500')
  next_connection.close()

  assert connection.closed
  assert next_connection.closed
  assert persisted_load is not None
  assert persisted_load.load_id == 'LOAD500'


def test_duplicate_load_still_returns_false() -> None:
  database = FakeApexDatabase()
  repository, connection = repository_for(database)

  assert repository.create_load(ApexLoad.model_validate(load_payload()))
  assert not repository.create_load(ApexLoad.model_validate(load_payload()))
  connection.close()


def test_tender_response_persists_after_connection_scope_ends() -> None:
  database = FakeApexDatabase()
  repository, connection = repository_for(database)
  repository.create_load(ApexLoad.model_validate(load_payload()))
  connection.close()

  next_repository, next_connection = repository_for(database)
  event_id = next_repository.record_tender_response(ApexTenderResponse.model_validate(tender_payload()))
  next_connection.close()

  assert event_id is not None
  assert len(database.tender_responses) == 1
  assert database.loads['LOAD500']['current_tender_decision'] == 'ACCEPTED'


def test_shipment_status_persists_after_connection_scope_ends() -> None:
  database = FakeApexDatabase()
  repository, connection = repository_for(database)
  repository.create_load(ApexLoad.model_validate(load_payload()))
  connection.close()

  next_repository, next_connection = repository_for(database)
  event_id = next_repository.record_shipment_status(ApexShipmentStatus.model_validate(status_payload()))
  next_connection.close()

  assert event_id is not None
  assert len(database.shipment_statuses) == 1
  assert database.loads['LOAD500']['current_shipment_status'] == 'PICKED_UP'


def test_transaction_rolls_back_when_write_operation_raises() -> None:
  database = FakeApexDatabase(fail_on_reference_insert=True)
  repository, connection = repository_for(database)

  with pytest.raises(RuntimeError, match='simulated reference insert failure'):
    repository.create_load(ApexLoad.model_validate(load_payload()))
  connection.close()

  assert database.loads == {}
  assert database.locations == []
  assert database.references == []


def test_api_create_then_get_survives_request_connection_scopes(monkeypatch) -> None:
  database = FakeApexDatabase()
  connections: list[FakeConnection] = []

  def scoped_repository():
    repository, connection = repository_for(database)
    connections.append(connection)
    try:
      yield repository
    finally:
      connection.close()

  monkeypatch.setenv('APEX_API_BEARER_TOKEN', 'test-write-token')
  monkeypatch.setenv('APEX_API_READONLY_TOKEN', 'test-readonly-token')
  get_settings.cache_clear()
  app.dependency_overrides[get_load_repository] = scoped_repository

  try:
    client = TestClient(app)
    create_response = client.post(
      '/v1/load-tenders',
      headers={'Authorization': 'Bearer test-write-token'},
      json=load_payload(),
    )
    fetch_response = client.get(
      '/v1/loads/LOAD500',
      headers={'Authorization': 'Bearer test-write-token'},
    )
    duplicate_response = client.post(
      '/v1/load-tenders',
      headers={'Authorization': 'Bearer test-write-token'},
      json=load_payload(),
    )
  finally:
    app.dependency_overrides.clear()
    get_settings.cache_clear()

  assert create_response.status_code == 202
  assert fetch_response.status_code == 200
  assert fetch_response.json()['loadId'] == 'LOAD500'
  assert duplicate_response.status_code == 409
  assert len(connections) == 3
  assert all(connection.closed for connection in connections)
