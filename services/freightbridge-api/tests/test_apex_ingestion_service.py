from __future__ import annotations

from contextlib import AbstractContextManager
from dataclasses import dataclass, field
import json
from uuid import uuid4

import psycopg
import pytest

from app.domain import ErrorCategory, ProcessingStage, ProcessingStatus
from app.integrations.apex.mapper import ApexMappingError
from app.integrations.apex.service import ApexLoadTenderIngestionService
from app.integrations.common.errors import IntegrationAPIError
from app.integrations.common.ingestion import payload_sha256


def apex_payload(**overrides) -> dict[str, object]:
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
      {'type': 'CUSTOMER_REF', 'value': 'CUST-REF-500'},
    ],
    'createdAt': '2026-09-19T14:00:00Z',
    'updatedAt': '2026-09-19T14:05:00Z',
  }
  payload.update(overrides)
  return payload


def raw_payload(payload: dict[str, object] | None = None) -> bytes:
  return json.dumps(payload or apex_payload()).encode('utf-8')


@dataclass
class FakeState:
  partner_id: object = field(default_factory=uuid4)
  shipments: dict[str, object] = field(default_factory=dict)
  transactions: dict[object, object] = field(default_factory=dict)
  logs: list[object] = field(default_factory=list)
  errors: list[dict[str, object]] = field(default_factory=list)


class FakeTransaction(AbstractContextManager):
  def __enter__(self):
    return self

  def __exit__(self, exc_type, exc, traceback) -> bool:
    return False


class FakeConnection:
  def transaction(self) -> FakeTransaction:
    return FakeTransaction()


class FakeFreightBridgeRepository:
  def __init__(self, state: FakeState, *, fail_create: bool = False) -> None:
    self.state = state
    self.fail_create = fail_create

  def fetch_trading_partner_by_code(self, partner_code: str) -> dict[str, object] | None:
    return {
      'id': self.state.partner_id,
      'partner_code': partner_code,
      'active': True,
    }

  def shipment_exists(self, shipment_number: str) -> bool:
    return shipment_number in self.state.shipments

  def create_shipment(self, shipment) -> object:
    if self.fail_create:
      raise psycopg.OperationalError('database unavailable')
    shipment_id = uuid4()
    self.state.shipments[shipment.shipment_number] = {
      'id': shipment_id,
      'shipment': shipment,
    }
    return shipment_id


class FakeIntegrationRepository:
  def __init__(self, state: FakeState) -> None:
    self.state = state

  def create_transaction(self, transaction) -> object:
    transaction_id = uuid4()
    self.state.transactions[transaction_id] = {
      'transaction': transaction,
      'status': transaction.processing_status,
      'stage': transaction.processing_stage,
      'business_identifier': transaction.business_identifier,
      'processed': False,
    }
    return transaction_id

  def update_business_identifier(self, transaction_id, business_identifier: str) -> None:
    self.state.transactions[transaction_id]['business_identifier'] = business_identifier

  def update_processing_state(self, transaction_id, status, stage, *, processed: bool = False) -> None:
    self.state.transactions[transaction_id]['status'] = status
    self.state.transactions[transaction_id]['stage'] = stage
    self.state.transactions[transaction_id]['processed'] = processed

  def mark_succeeded(self, transaction_id) -> None:
    self.update_processing_state(
      transaction_id,
      ProcessingStatus.SUCCEEDED,
      ProcessingStage.COMPLETED,
      processed=True,
    )

  def mark_failed(self, transaction_id, stage) -> None:
    self.update_processing_state(
      transaction_id,
      ProcessingStatus.FAILED,
      stage,
      processed=True,
    )

  def append_log(self, log) -> object:
    self.state.logs.append(log)
    return uuid4()

  def append_error(self, **kwargs) -> object:
    self.state.errors.append(kwargs)
    return uuid4()


@pytest.fixture(autouse=True)
def configure_token(monkeypatch) -> None:
  monkeypatch.setenv('APEX_INBOUND_BEARER_TOKEN', 'inbound-test-token')
  from app.core.config import get_settings

  get_settings.cache_clear()
  yield
  get_settings.cache_clear()


def build_service(state: FakeState, *, fail_create: bool = False) -> ApexLoadTenderIngestionService:
  return ApexLoadTenderIngestionService(
    connection=FakeConnection(),
    freightbridge_repository=FakeFreightBridgeRepository(state, fail_create=fail_create),
    integration_repository=FakeIntegrationRepository(state),
  )


def auth_header() -> str:
  return 'Bearer inbound-test-token'


def test_successful_ingestion_creates_audit_logs_and_canonical_shipment() -> None:
  state = FakeState()
  body = raw_payload()

  result = build_service(state).ingest(
    raw_body=body,
    authorization_header=auth_header(),
    correlation_id='corr-load-500',
  )

  transaction = state.transactions[result.transaction_id]
  assert result.shipment_number == 'LOAD500'
  assert transaction['status'] == ProcessingStatus.SUCCEEDED
  assert transaction['stage'] == ProcessingStage.COMPLETED
  assert transaction['business_identifier'] == 'LOAD500'
  assert transaction['transaction'].correlation_id == 'corr-load-500'
  assert transaction['transaction'].payload_hash == payload_sha256(body)
  assert state.shipments['LOAD500']['shipment'].equipment_type.value == 'DRY_VAN_53'
  assert [
    log.stage
    for log in state.logs
  ] == [
    ProcessingStage.RECEIVED,
    ProcessingStage.AUTHENTICATION,
    ProcessingStage.PARSING,
    ProcessingStage.VALIDATION,
    ProcessingStage.MAPPING,
    ProcessingStage.BUSINESS_VALIDATION,
    ProcessingStage.COMPLETED,
  ]
  assert state.errors == []


@pytest.mark.parametrize('authorization_header', [None, 'Bearer wrong-token'])
def test_missing_or_invalid_token_fails_with_audit(authorization_header: str | None) -> None:
  state = FakeState()

  with pytest.raises(IntegrationAPIError) as exc_info:
    build_service(state).ingest(
      raw_body=raw_payload(),
      authorization_header=authorization_header,
      correlation_id='corr-auth',
    )

  assert exc_info.value.status_code == 401
  assert exc_info.value.code == 'AUTHENTICATION_ERROR'
  assert state.errors[0]['category'] == ErrorCategory.AUTHENTICATION_ERROR
  assert state.errors[0]['stage'] == ProcessingStage.AUTHENTICATION
  assert next(iter(state.transactions.values()))['status'] == ProcessingStatus.FAILED


def test_malformed_json_fails_at_parsing() -> None:
  state = FakeState()

  with pytest.raises(IntegrationAPIError) as exc_info:
    build_service(state).ingest(
      raw_body=b'{bad-json',
      authorization_header=auth_header(),
      correlation_id='corr-json',
    )

  assert exc_info.value.status_code == 400
  assert state.errors[0]['category'] == ErrorCategory.SYNTAX_ERROR
  assert state.errors[0]['stage'] == ProcessingStage.PARSING


def test_schema_validation_failure_preserves_audit() -> None:
  state = FakeState()
  payload = apex_payload()
  payload.pop('delivery')

  with pytest.raises(IntegrationAPIError) as exc_info:
    build_service(state).ingest(
      raw_body=raw_payload(payload),
      authorization_header=auth_header(),
      correlation_id='corr-validation',
    )

  assert exc_info.value.status_code == 422
  assert state.errors[0]['category'] == ErrorCategory.BUSINESS_VALIDATION_ERROR
  assert state.errors[0]['stage'] == ProcessingStage.VALIDATION
  assert state.shipments == {}


def test_mapping_failure_preserves_audit(monkeypatch) -> None:
  state = FakeState()

  def fail_mapping(*args, **kwargs):
    raise ApexMappingError('forced mapping failure')

  monkeypatch.setattr('app.integrations.apex.service.map_apex_load_to_canonical', fail_mapping)

  with pytest.raises(IntegrationAPIError) as exc_info:
    build_service(state).ingest(
      raw_body=raw_payload(),
      authorization_header=auth_header(),
      correlation_id='corr-mapping',
    )

  assert exc_info.value.status_code == 422
  assert state.errors[0]['category'] == ErrorCategory.MAPPING_ERROR
  assert state.errors[0]['stage'] == ProcessingStage.MAPPING


def test_duplicate_shipment_returns_409_and_preserves_audit() -> None:
  state = FakeState()
  state.shipments['LOAD500'] = {'id': uuid4(), 'shipment': object()}

  with pytest.raises(IntegrationAPIError) as exc_info:
    build_service(state).ingest(
      raw_body=raw_payload(),
      authorization_header=auth_header(),
      correlation_id='corr-duplicate',
    )

  assert exc_info.value.status_code == 409
  assert exc_info.value.code == 'DUPLICATE_SHIPMENT'
  assert state.errors[0]['category'] == ErrorCategory.DUPLICATE_TRANSACTION
  assert state.errors[0]['stage'] == ProcessingStage.BUSINESS_VALIDATION


def test_database_failure_returns_safe_dependency_error() -> None:
  state = FakeState()

  with pytest.raises(IntegrationAPIError) as exc_info:
    build_service(state, fail_create=True).ingest(
      raw_body=raw_payload(),
      authorization_header=auth_header(),
      correlation_id='corr-db',
    )

  assert exc_info.value.status_code == 503
  assert exc_info.value.code == 'DEPENDENCY_ERROR'
  assert state.errors[0]['category'] == ErrorCategory.DOWNSTREAM_ERROR
  assert state.errors[0]['retryable'] is True
  assert 'database unavailable' not in exc_info.value.message


def test_persistence_survives_new_repository_scope() -> None:
  state = FakeState()
  first_scope = build_service(state)
  result = first_scope.ingest(
    raw_body=raw_payload(),
    authorization_header=auth_header(),
    correlation_id='corr-scope',
  )

  second_scope_repository = FakeFreightBridgeRepository(state)

  assert result.shipment_number == 'LOAD500'
  assert second_scope_repository.shipment_exists('LOAD500')
  assert len(state.transactions) == 1
