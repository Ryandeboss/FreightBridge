from __future__ import annotations

from uuid import UUID

from app.integrations.failure_drills import ControlledFailureDrillService, ControlledX12FaultFactory
from app.integrations.x12 import parse_x12, validate_x12_envelopes
from app.integrations.midwest.mapping_214 import map_midwest_214


RUN_ID = UUID('90000000-0000-4000-8000-000000000027')


def test_milestone27_control_recovery_214_has_matching_transaction_controls() -> None:
  _, payload, metadata = ControlledX12FaultFactory().build_recovery_214(
    scenario_key='X12_214_CONTROL_MISMATCH',
    load_id='LABRECOVER27',
    run_id=RUN_ID,
  )

  interchange = parse_x12(payload)
  validate_x12_envelopes(interchange)
  mapped = map_midwest_214(interchange)

  assert metadata['st02'] == metadata['se02']
  assert metadata['statusCode'] == 'AF'
  assert mapped.shipment_number == 'LABRECOVER27'


def test_milestone27_status_recovery_214_uses_supported_status() -> None:
  _, payload, metadata = ControlledX12FaultFactory().build_recovery_214(
    scenario_key='X12_214_UNSUPPORTED_STATUS',
    load_id='LABRECOVER28',
    run_id=RUN_ID,
  )

  interchange = parse_x12(payload)
  validate_x12_envelopes(interchange)
  mapped = map_midwest_214(interchange)

  assert metadata['statusCode'] == 'AF'
  assert mapped.status.value == 'PICKED_UP'


class FakeReplayResult:
  idempotent_replay = True
  original_transaction_id = UUID('11111111-1111-4111-8111-111111111111')
  transaction_id = UUID('22222222-2222-4222-8222-222222222222')
  shipment_id = UUID('33333333-3333-4333-8333-333333333333')
  shipment_number = 'LABDUPRECOVER'

  def response_body(self) -> dict[str, object]:
    return {
      'idempotentReplay': True,
      'originalTransactionId': str(self.original_transaction_id),
      'transactionId': str(self.transaction_id),
      'shipmentId': str(self.shipment_id),
      'shipmentNumber': self.shipment_number,
    }


class DuplicateRecoveryService(ControlledFailureDrillService):
  def __init__(self) -> None:
    super().__init__()
    self.seen_idempotency_key: str | None = None

  def _valid_apex_authorization(self) -> str:
    return 'Bearer test'

  def _ingest_apex(
    self,
    *,
    raw_body: bytes,
    authorization_header: str,
    correlation_id: str,
    idempotency_key: str | None = None,
  ):
    self.seen_idempotency_key = idempotency_key
    return FakeReplayResult()

  def _document_count(self, business_identifier: str, document_type: str) -> int:
    assert business_identifier == 'LABDUPRECOVER'
    assert document_type == '204'
    return 0


def test_milestone27_duplicate_recovery_is_real_idempotent_replay() -> None:
  service = DuplicateRecoveryService()
  run = {
    'id': RUN_ID,
    'scenario_key': 'APEX_DUPLICATE_SHIPMENT',
    'business_identifier': 'LABDUPRECOVER',
    'input_snapshot': {
      'loadId': 'LABDUPRECOVER',
      'bolNumber': 'BOLRECOVER',
      'purchaseOrderNumber': 'PORECOVER',
      'customerReference': 'CUSTRECOVER',
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
        'scheduledDateTime': '2026-09-29T15:00:00+00:00',
      },
      'delivery': {
        'facilityName': 'XYZ Warehouse',
        'address1': '900 Commerce St',
        'city': 'Detroit',
        'state': 'MI',
        'postalCode': '48201',
        'scheduledDateTime': '2026-09-30T15:00:00+00:00',
      },
      'createdAt': '2026-09-28T15:00:00+00:00',
      'updatedAt': '2026-09-28T15:00:00+00:00',
    },
  }

  recovery = service.recover(run)

  assert service.seen_idempotency_key == f'lab-{RUN_ID}-duplicate-replay'
  assert recovery['status'] == 'SUCCEEDED'
  assert recovery['recoveryKind'] == 'IDEMPOTENT_REPLAY'
  assert recovery['sameBusinessIdentifier'] is True
  assert recovery['idempotentReplay'] is True
  assert recovery['originalShipmentReused'] is True
  assert recovery['duplicate204Created'] is False
