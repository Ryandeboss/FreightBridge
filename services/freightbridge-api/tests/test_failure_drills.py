from uuid import UUID

import pytest

from app.integrations.common.errors import IntegrationAPIError
from app.integrations.failure_drills import (
  EXPECTED_OUTCOME,
  ControlledFailureDrillService,
  ControlledX12FaultFactory,
  LabDrillMismatch,
  ObservedFailure,
)
from app.integrations.midwest.mapping_214 import Midwest214MappingError, map_midwest_214
from app.integrations.midwest.sftp_client import MidwestSftpConfig, MidwestSftpHostKeyError
from app.integrations.x12 import X12Error, parse_x12, validate_x12_envelopes


RUN_ID = UUID('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
TRANSACTION_ID = '11111111-1111-4111-8111-111111111111'
ERROR_ID = '22222222-2222-4222-8222-222222222222'


def test_failure_drill_apex_bad_auth_succeeds_when_expected_persisted_failure_is_observed() -> None:
  service = DrillTestService(
    observed=ObservedFailure(
      error_id=ERROR_ID,
      transaction_id=TRANSACTION_ID,
      correlation_id='corr-auth',
      error_code='AUTHENTICATION_ERROR',
      category='AUTHENTICATION_ERROR',
      stage='AUTHENTICATION',
      retryable=False,
      safe_message='Missing or invalid Apex inbound bearer token.',
      processing_status='FAILED',
      document_type='APEX_LOAD_TENDER',
      transport='REST',
    )
  )

  request, response = service.execute(_run('APEX_BAD_AUTH'), 'INJECT_APEX_BAD_AUTH')

  assert request['expectedFailure']['errorCode'] == 'AUTHENTICATION_ERROR'
  assert response['drillOutcome'] == EXPECTED_OUTCOME
  assert response['_relatedTransactionIds'] == [TRANSACTION_ID]
  assert response['_resultSummary']['failureDrill']['observed']['processingStatus'] == 'FAILED'
  assert 'freightbridge-fault-lab-invalid' not in str(request)
  assert 'Bearer' not in str(request)


def test_failure_drill_invalid_json_expected_failure_not_observed_when_request_succeeds() -> None:
  service = DrillTestService(observed=None, ingest_succeeds=True)

  with pytest.raises(LabDrillMismatch) as exc:
    service.execute(_run('APEX_INVALID_JSON'), 'INJECT_APEX_INVALID_JSON')

  assert exc.value.code == 'LAB_EXPECTED_FAILURE_NOT_OBSERVED'


def test_failure_drill_unexpected_classification_fails_lab_step() -> None:
  service = DrillTestService(
    observed=ObservedFailure(
      error_id=ERROR_ID,
      transaction_id=TRANSACTION_ID,
      correlation_id='corr-contract',
      error_code='INVALID_JSON',
      category='SYNTAX_ERROR',
      stage='PARSING',
      retryable=False,
      safe_message='Malformed JSON.',
      processing_status='FAILED',
      document_type='APEX_LOAD_TENDER',
      transport='REST',
    )
  )

  with pytest.raises(LabDrillMismatch) as exc:
    service.execute(_run('APEX_INVALID_CONTRACT'), 'INJECT_APEX_INVALID_CONTRACT')

  assert exc.value.code == 'LAB_UNEXPECTED_FAILURE'


def test_invalid_contract_drill_uses_valid_json_with_pickup_postal_code_removed() -> None:
  service = DrillTestService(
    observed=ObservedFailure(
      error_id=ERROR_ID,
      transaction_id=TRANSACTION_ID,
      correlation_id='corr-contract',
      error_code='INVALID_APEX_LOAD',
      category='BUSINESS_VALIDATION_ERROR',
      stage='VALIDATION',
      retryable=False,
      safe_message='Contract validation failed.',
      processing_status='FAILED',
      document_type='APEX_LOAD_TENDER',
      transport='REST',
    )
  )

  request, response = service.execute(_run('APEX_INVALID_CONTRACT'), 'INJECT_APEX_INVALID_CONTRACT')

  preview = request['payloadPreview']
  assert isinstance(preview, dict)
  assert 'postalCode' not in preview['pickup']
  assert response['observedFailure']['errorCode'] == 'INVALID_APEX_LOAD'


def test_x12_control_mismatch_factory_produces_targeted_envelope_failure() -> None:
  payload = _fault_payload('X12_214_CONTROL_MISMATCH')
  interchange = parse_x12(payload)

  with pytest.raises(X12Error) as exc:
    validate_x12_envelopes(interchange)

  assert exc.value.code.value == 'CONTROL_NUMBER_MISMATCH'


def test_x12_unsupported_status_factory_parses_and_fails_mapping_only() -> None:
  payload = _fault_payload('X12_214_UNSUPPORTED_STATUS')
  interchange = parse_x12(payload)
  validate_x12_envelopes(interchange)

  with pytest.raises(Midwest214MappingError) as exc:
    map_midwest_214(interchange)

  assert exc.value.code == 'UNSUPPORTED_AT7_CODE'


def test_x12_wrong_version_factory_preserves_parseable_isa_and_fails_profile_validation() -> None:
  payload = _fault_payload('X12_214_WRONG_VERSION')
  interchange = parse_x12(payload)
  validate_x12_envelopes(interchange)

  with pytest.raises(Midwest214MappingError) as exc:
    map_midwest_214(interchange)

  assert exc.value.code == 'UNSUPPORTED_X12_VERSION'


def test_sftp_host_key_drill_records_pre_ingestion_observation_without_transaction(monkeypatch) -> None:
  monkeypatch.setattr(
    'app.integrations.failure_drills.MidwestSftpConfig.from_settings',
    lambda: MidwestSftpConfig(
      host='sftp.example.test',
      port=22,
      username='freightbridge',
      private_key_b64='not-used-by-fake-client',
      host_key_sha256='real-fingerprint',
    ),
  )
  service = ControlledFailureDrillService(sftp_client_factory=HostKeyFailureClient)

  request, response = service.execute(_run('SFTP_HOST_KEY_MISMATCH'), 'INJECT_SFTP_HOST_KEY_MISMATCH')

  assert request['expectedFailure']['errorCode'] == 'SFTP_HOST_KEY_MISMATCH'
  assert response['drillOutcome'] == EXPECTED_OUTCOME
  assert response['observedFailure']['transactionId'] is None
  assert response['_relatedTransactionIds'] == []


def _run(scenario_key: str) -> dict[str, object]:
  return {
    'id': RUN_ID,
    'scenario_key': scenario_key,
    'business_identifier': 'LABFAIL900',
    'input_snapshot': {
      'loadId': 'LABFAIL900',
      'bolNumber': 'BOLFAIL900',
      'purchaseOrderNumber': 'POFAIL900',
      'customerReference': 'CUSTFAIL',
      'equipmentType': 'VAN_53',
      'weightLbs': 42000,
      'pieces': 22,
      'commodityDescription': 'Industrial Components',
      'pickup': {
        'facilityName': 'ABC Factory',
        'address1': '200 Industrial Rd',
        'city': 'Aurora',
        'state': 'IL',
        'postalCode': '60505',
        'scheduledDateTime': '2026-09-25T15:00:00+00:00',
      },
      'delivery': {
        'facilityName': 'XYZ Warehouse',
        'address1': '900 Commerce St',
        'city': 'Detroit',
        'state': 'MI',
        'postalCode': '48201',
        'scheduledDateTime': '2026-09-26T15:00:00+00:00',
      },
      'createdAt': '2026-09-24T15:00:00+00:00',
      'updatedAt': '2026-09-24T15:00:00+00:00',
    },
  }


def _fault_payload(scenario_key: str) -> bytes:
  _, payload, _ = ControlledX12FaultFactory().build_214(
    fault_key=scenario_key,
    load_id='LABFAIL900',
    run_id=RUN_ID,
  )
  return payload


class DrillTestService(ControlledFailureDrillService):
  def __init__(self, *, observed: ObservedFailure | None, ingest_succeeds: bool = False) -> None:
    super().__init__()
    self.observed = observed
    self.ingest_succeeds = ingest_succeeds

  def _valid_apex_authorization(self) -> str:
    return 'Bearer test-token'

  def _ingest_apex(self, *, raw_body: bytes, authorization_header: str, correlation_id: str):
    if self.ingest_succeeds:
      return type('Result', (), {'transaction_id': TRANSACTION_ID})()
    raise IntegrationAPIError(
      status_code=400,
      code='EXPECTED_TEST_ERROR',
      message='Expected test failure.',
      correlation_id=correlation_id,
      transaction_id=TRANSACTION_ID,
    )

  def _observed_from_transaction(self, transaction_id: str) -> ObservedFailure:
    assert transaction_id == TRANSACTION_ID
    assert self.observed is not None
    return self.observed


class HostKeyFailureClient:
  def __init__(self, config) -> None:
    self.config = config

  def __enter__(self):
    assert self.config.host_key_sha256 == 'freightbridge-lab-invalid-host-key'
    raise MidwestSftpHostKeyError()

  def __exit__(self, exc_type, exc, tb):
    return None
