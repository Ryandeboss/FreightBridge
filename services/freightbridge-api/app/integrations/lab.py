from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID, uuid4

import httpx

from app.core.config import get_settings
from app.domain import IntegrationDirection, MessageFormat
from app.infrastructure.configuration_repository import IntegrationConfigurationRepository
from app.infrastructure.database import connect
from app.infrastructure.lab_repository import IntegrationLabRepository, LabStepInProgressError
from app.infrastructure.operations_repository import OperationsRepository
from app.infrastructure.repositories import FreightBridgeRepository, IntegrationRepository
from app.integrations.common.correlation import resolve_correlation_id
from app.integrations.failure_drills import (
  DRILL_DEFINITIONS,
  DRILL_KIND,
  HAPPY_PATH_KIND,
  ControlledFailureDrillService,
  LabDrillMismatch,
)
from app.integrations.midwest.dispatch_service import MidwestDirectDispatchService
from app.integrations.midwest.sftp_poll_service import MidwestSftpOutboundPollService, MidwestSftpReadinessService
from app.integrations.midwest.transport import MidwestSftpTransport
from app.models.lab import CreateLabRunRequest


class LabExecutionError(RuntimeError):
  def __init__(self, code: str, message: str) -> None:
    super().__init__(message)
    self.code = code
    self.message = message


@dataclass(frozen=True)
class LabStepDefinition:
  step_key: str
  display_name: str
  sender: str
  receiver: str
  transport: str
  message_format: str
  document_type: str


@dataclass(frozen=True)
class LabScenarioDefinition:
  scenario_key: str
  name: str
  description: str
  steps: tuple[LabStepDefinition, ...]
  kind: str = HAPPY_PATH_KIND
  expected_failure: dict[str, object] | None = None
  guidance: str | None = None
  injected_fault: str | None = None
  layer: str | None = None


EVENTS = (
  ('PICKED_UP', 'AF', 'Aurora', 'IL', 'Shipment departed pickup facility.'),
  ('IN_TRANSIT', 'X6', 'South Bend', 'IN', 'Shipment is in transit.'),
  ('ARRIVED', 'X1', 'Detroit', 'MI', 'Shipment arrived at delivery location.'),
  ('DELIVERED', 'D1', 'Detroit', 'MI', 'Shipment delivery completed.'),
)


def _step(
  key: str,
  label: str,
  sender: str,
  receiver: str,
  transport: str,
  fmt: str,
  doc: str,
) -> LabStepDefinition:
  return LabStepDefinition(key, label, sender, receiver, transport, fmt, doc)


def _failure_drill_step(step_key: str, label: str, doc: str, transport: str, fmt: str) -> LabStepDefinition:
  if transport == 'REST':
    return _step(step_key, label, 'Analyst', 'FreightBridge', transport, fmt, doc)
  if doc == 'TRANSPORT_PROBE':
    return _step(step_key, label, 'Analyst', 'Midwest SFTP', transport, fmt, doc)
  return _step(step_key, label, 'Midwest Carrier', 'FreightBridge', transport, fmt, doc)


TECHNICAL_STEPS = (
  _step('CREATE_APEX_LOAD', 'Create Apex load', 'Analyst', 'Apex Logistics', 'REST', 'JSON', 'APEX_LOAD_TENDER'),
  _step('DISPATCH_APEX_TENDER', 'Dispatch Apex tender', 'Apex Logistics', 'FreightBridge', 'REST', 'JSON', 'APEX_LOAD_TENDER'),
  _step('DISPATCH_204_SFTP', 'Dispatch Midwest 204', 'FreightBridge', 'Midwest Carrier', 'SFTP', 'X12', '204'),
  _step('MIDWEST_RECEIVE_204', 'Midwest receives 204', 'FreightBridge', 'Midwest Carrier', 'SFTP', 'X12', '204'),
  _step('DISPATCH_997_SFTP', 'Dispatch Midwest 997', 'Midwest Carrier', 'FreightBridge', 'SFTP', 'X12', '997'),
  _step('FREIGHTBRIDGE_RECEIVE_997', 'FreightBridge receives 997', 'Midwest Carrier', 'FreightBridge', 'SFTP', 'X12', '997'),
)

ACCEPTED_STEPS = TECHNICAL_STEPS + (
  _step('CREATE_TENDER_DECISION', 'Create accepted tender decision', 'Analyst', 'Midwest Carrier', 'REST', 'JSON', '990'),
  _step('DISPATCH_990_SFTP', 'Dispatch Midwest 990', 'Midwest Carrier', 'FreightBridge', 'SFTP', 'X12', '990'),
  _step('FREIGHTBRIDGE_RECEIVE_990', 'FreightBridge receives 990', 'Midwest Carrier', 'FreightBridge', 'SFTP', 'X12', '990'),
)

REJECTED_STEPS = TECHNICAL_STEPS + (
  _step('CREATE_TENDER_REJECTION', 'Create rejected tender decision', 'Analyst', 'Midwest Carrier', 'REST', 'JSON', '990'),
  _step('DISPATCH_REJECTED_990_SFTP', 'Dispatch rejected Midwest 990', 'Midwest Carrier', 'FreightBridge', 'SFTP', 'X12', '990'),
  _step('FREIGHTBRIDGE_RECEIVE_REJECTED_990', 'FreightBridge receives rejected 990', 'Midwest Carrier', 'FreightBridge', 'SFTP', 'X12', '990'),
)


def lifecycle_steps() -> tuple[LabStepDefinition, ...]:
  steps = list(ACCEPTED_STEPS)
  for status, at7, _, _, _ in EVENTS:
    steps.extend(
      (
        _step(f'CREATE_214_{status}', f'Create {status} 214 event', 'Analyst', 'Midwest Carrier', 'REST', 'JSON', '214'),
        _step(f'DISPATCH_214_{status}', f'Dispatch {status} 214', 'Midwest Carrier', 'FreightBridge', 'SFTP', 'X12', '214'),
        _step(f'FREIGHTBRIDGE_RECEIVE_214_{status}', f'FreightBridge receives {status} 214', 'Midwest Carrier', 'FreightBridge', 'SFTP', 'X12', '214'),
      )
    )
  return tuple(steps)


SCENARIOS: dict[str, LabScenarioDefinition] = {
  'TECHNICAL_ACK_ONLY': LabScenarioDefinition(
    'TECHNICAL_ACK_ONLY',
    'Technical acknowledgment only',
    'Apex tender through Midwest 204 and 997 technical acknowledgment.',
    TECHNICAL_STEPS,
  ),
  'TENDER_ACCEPTED': LabScenarioDefinition(
    'TENDER_ACCEPTED',
    'Tender accepted',
    'Full tender acceptance flow through 204, 997, and 990.',
    ACCEPTED_STEPS,
  ),
  'TENDER_REJECTED': LabScenarioDefinition(
    'TENDER_REJECTED',
    'Tender rejected',
    'Tender rejection flow through 204, 997, and rejected 990.',
    REJECTED_STEPS,
  ),
  'FULL_SHIPMENT_LIFECYCLE': LabScenarioDefinition(
    'FULL_SHIPMENT_LIFECYCLE',
    'Full shipment lifecycle',
    'Accepted tender plus picked up, in transit, arrived, and delivered 214 updates.',
    lifecycle_steps(),
  ),
  **{
    definition.scenario_key: LabScenarioDefinition(
      definition.scenario_key,
      definition.name,
      definition.description,
      tuple(
        _failure_drill_step(
          step.step_key,
          step.display_name,
          step.document_type,
          step.transport,
          step.message_format,
        )
        for step in definition.steps
      ),
      kind=DRILL_KIND,
      expected_failure=definition.expected.view(),
      guidance=definition.guidance,
      injected_fault=definition.injected_fault,
      layer=definition.layer,
    )
    for definition in DRILL_DEFINITIONS.values()
  },
}


class PartnerSimulatorClient:
  unavailable_code = 'LAB_PARTNER_UNAVAILABLE'

  def __init__(self, *, base_url: str | None, bearer_token: str | None, unavailable_code: str) -> None:
    self.base_url = base_url.rstrip('/') if base_url else None
    self.bearer_token = bearer_token
    self.unavailable_code = unavailable_code

  def request(
    self,
    method: str,
    path: str,
    *,
    json: dict[str, object] | None = None,
    headers: dict[str, str] | None = None,
    expected_statuses: tuple[int, ...] = (200, 202),
  ) -> dict[str, object]:
    if not self.base_url or not self.bearer_token:
      raise LabExecutionError(self.unavailable_code, 'Partner simulator configuration is incomplete.')
    try:
      response = httpx.request(
        method,
        self.base_url + path,
        json=json,
        headers={'Authorization': f'Bearer {self.bearer_token}', **(headers or {})},
        timeout=20.0,
      )
    except (httpx.TimeoutException, httpx.HTTPError) as exc:
      raise LabExecutionError(self.unavailable_code, 'Partner simulator could not be reached.') from exc
    body = self._safe_json(response)
    if response.status_code in (401, 403):
      raise LabExecutionError('LAB_PARTNER_AUTHENTICATION_FAILED', 'Partner simulator authentication failed.')
    if response.status_code >= 500:
      raise LabExecutionError(self.unavailable_code, 'Partner simulator is temporarily unavailable.')
    if response.status_code not in expected_statuses:
      detail = body.get('error') if isinstance(body.get('error'), dict) else {}
      raise LabExecutionError(
        str(detail.get('code') or 'LAB_PARTNER_REJECTED_REQUEST'),
        str(detail.get('message') or 'Partner simulator rejected the request.'),
      )
    return body

  def get(self, path: str) -> dict[str, object]:
    return self.request('GET', path)

  def post(
    self,
    path: str,
    payload: dict[str, object] | None = None,
    *,
    headers: dict[str, str] | None = None,
  ) -> dict[str, object]:
    return self.request('POST', path, json=payload, headers=headers)

  def _safe_json(self, response: httpx.Response) -> dict[str, object]:
    try:
      body = response.json()
      return body if isinstance(body, dict) else {'body': body}
    except ValueError:
      return {'status': 'UNKNOWN'}


class ApexSimulatorClient(PartnerSimulatorClient):
  def __init__(self) -> None:
    settings = get_settings()
    super().__init__(
      base_url=settings.apex_sim_base_url,
      bearer_token=settings.apex_sim_bearer_token,
      unavailable_code='LAB_APEX_UNAVAILABLE',
    )


class MidwestSimulatorClient(PartnerSimulatorClient):
  def __init__(self) -> None:
    settings = get_settings()
    super().__init__(
      base_url=settings.midwest_sim_base_url,
      bearer_token=settings.midwest_sim_bearer_token,
      unavailable_code='LAB_MIDWEST_UNAVAILABLE',
    )


class IntegrationLabService:
  def __init__(self, repository: IntegrationLabRepository):
    self.repository = repository
    self.apex = ApexSimulatorClient()
    self.midwest = MidwestSimulatorClient()
    self.failure_drills = ControlledFailureDrillService()

  def readiness(self) -> dict[str, object]:
    settings = get_settings()
    apex = self._safe_partner_readiness(
      self.apex,
      configured=bool(settings.apex_sim_base_url and settings.apex_sim_bearer_token),
    )
    midwest = self._safe_partner_readiness(
      self.midwest,
      configured=bool(settings.midwest_sim_base_url and settings.midwest_sim_bearer_token),
    )
    sftp = self._safe_sftp_readiness(
      configured=bool(settings.mwcx_sftp_host and settings.mwcx_sftp_username and settings.mwcx_sftp_private_key_b64),
    )
    dependencies = {
      'freightBridge': self._safe_freightbridge_readiness(),
      'apexSimulator': apex,
      'midwestSimulator': midwest,
      'midwestSftp': sftp,
      'apexSimulatorConfigured': apex['configured'],
      'midwestSimulatorConfigured': midwest['configured'],
      'sftpConfigured': sftp['configured'],
    }
    return {
      'status': 'ready' if apex['status'] == 'ready' and midwest['status'] == 'ready' and sftp['status'] == 'ready' else 'not_ready',
      'dependencies': dependencies,
      'scenarios': [
        {
          'scenario_key': scenario.scenario_key,
          'name': scenario.name,
          'description': scenario.description,
          'step_count': len(scenario.steps),
          'kind': scenario.kind,
          'expected_failure': scenario.expected_failure,
          'guidance': scenario.guidance,
          'injected_fault': scenario.injected_fault,
          'layer': scenario.layer,
        }
        for scenario in SCENARIOS.values()
      ],
    }

  def create_run(self, request: CreateLabRunRequest) -> dict[str, object]:
    scenario = self._scenario(request.scenario_key)
    snapshot = self._input_snapshot(request)
    steps = [
      {
        'step_key': step.step_key,
        'sequence': index,
        'display_name': step.display_name,
        'sender': step.sender,
        'receiver': step.receiver,
        'transport': step.transport,
        'message_format': step.message_format,
        'document_type': step.document_type,
      }
      for index, step in enumerate(scenario.steps, start=1)
    ]
    return self.repository.create_run(
      scenario_key=scenario.scenario_key,
      business_identifier=str(snapshot['loadId']),
      input_snapshot=snapshot,
      steps=steps,
    )

  def execute_step(self, run_id: UUID, step_key: str) -> tuple[dict[str, object], dict[str, object] | None, bool]:
    run = self.repository.get_run(run_id)
    if run is None:
      raise LabExecutionError('LAB_RUN_NOT_FOUND', 'Integration Lab run was not found.')
    self._scenario(run['scenario_key'])
    step = self.repository.get_step(run_id, step_key)
    if step is None:
      raise LabExecutionError('LAB_STEP_NOT_FOUND', 'Integration Lab step was not found.')
    if step['status'] == 'SUCCEEDED':
      return self.repository.get_run(run_id), step, True
    self._ensure_prerequisites(run, step)
    try:
      acquired = self.repository.acquire_step(run_id, step_key)
    except LabStepInProgressError as exc:
      raise LabExecutionError('LAB_STEP_IN_PROGRESS', 'This Lab step is already running.') from exc
    if acquired is None:
      raise LabExecutionError('LAB_STEP_NOT_FOUND', 'Integration Lab step was not found.')
    if acquired['status'] == 'SUCCEEDED':
      return self.repository.get_run(run_id), acquired, True
    try:
      request_summary, response_summary = self._execute(run_id, step_key)
      related_override = response_summary.pop('_relatedTransactionIds', None)
      result_summary_override = response_summary.pop('_resultSummary', None)
      transaction_ids = (
        [str(transaction_id) for transaction_id in related_override]
        if isinstance(related_override, list)
        else self._related_transactions(run['business_identifier'])
      )
      self.repository.mark_step_succeeded(
        step_id=acquired['id'],
        request_summary=request_summary,
        response_summary=response_summary,
        related_transaction_ids=transaction_ids,
      )
      latest_summary = result_summary_override if isinstance(result_summary_override, dict) else self._result_summary(run['business_identifier'])
      self.repository.mark_run_if_complete(run_id, latest_summary)
    except LabDrillMismatch as exc:
      self.repository.mark_step_failed(step_id=acquired['id'], error_code=exc.code, safe_message=exc.message)
      raise LabExecutionError(exc.code, exc.message) from exc
    except LabExecutionError as exc:
      self.repository.mark_step_failed(step_id=acquired['id'], error_code=exc.code, safe_message=exc.message)
      raise
    refreshed = self.repository.get_run(run_id)
    return refreshed, self.repository.get_step(run_id, step_key), False

  def run_next(self, run_id: UUID) -> tuple[dict[str, object], dict[str, object] | None, bool]:
    step = self.repository.next_executable_step(run_id)
    if step is None:
      run = self.repository.get_run(run_id)
      if run is None:
        raise LabExecutionError('LAB_RUN_NOT_FOUND', 'Integration Lab run was not found.')
      return run, None, False
    return self.execute_step(run_id, step['step_key'])

  def _execute(self, run_id: UUID, step_key: str) -> tuple[dict[str, object], dict[str, object]]:
    run = self.repository.get_run(run_id)
    if run is None:
      raise LabExecutionError('LAB_RUN_NOT_FOUND', 'Integration Lab run was not found.')
    snapshot = dict(run['input_snapshot'])
    load_id = str(snapshot['loadId'])
    correlation_id = resolve_correlation_id(f'lab-{run_id}-{step_key}')

    if str(run['scenario_key']) in DRILL_DEFINITIONS:
      return self.failure_drills.execute(run, step_key)

    if step_key == 'CREATE_APEX_LOAD':
      payload = self._apex_payload(snapshot)
      return {'target': 'Apex load tender', 'apexLoadTenderJson': payload}, self._create_apex_load(load_id, payload)
    if step_key == 'DISPATCH_APEX_TENDER':
      return {'loadId': load_id, 'idempotencyKey': f'lab-{run_id}-apex-tender'}, self.apex.post(
        f'/v1/load-tenders/{load_id}/dispatch',
        headers={'Idempotency-Key': f'lab-{run_id}-apex-tender'},
      )
    if step_key == 'DISPATCH_204_SFTP':
      return {'shipmentNumber': load_id}, self._dispatch_204(load_id, correlation_id)
    if step_key == 'MIDWEST_RECEIVE_204':
      response = self.midwest.post('/v1/sftp/inbound/poll')
      return {'source': '/inbound', 'expectedFileName': self._expected_file(run, 'DISPATCH_204_SFTP')}, self._verified_midwest_receive_204(run, response)
    if step_key == 'DISPATCH_997_SFTP':
      document_id = self._functional_ack_document_id(run)
      return {'outboundDocumentId': document_id}, self.midwest.post(f'/v1/functional-acknowledgments/{document_id}/dispatch-sftp')
    if step_key == 'FREIGHTBRIDGE_RECEIVE_997':
      expected = self._expected_file(run, 'DISPATCH_997_SFTP')
      return {'source': '/outbound', 'documentType': '997', 'expectedFileName': expected}, self._verified_freightbridge_poll(
        run,
        correlation_id,
        expected_file_name=expected,
        document_type='997',
        business_identifier=load_id,
      )
    if step_key in ('CREATE_TENDER_DECISION', 'CREATE_TENDER_REJECTION'):
      decision = 'REJECTED' if step_key == 'CREATE_TENDER_REJECTION' else 'ACCEPTED'
      payload: dict[str, object] = {'decision': decision}
      if decision == 'REJECTED':
        payload['reasonCode'] = snapshot.get('rejectionReasonCode') or 'CAPACITY'
        payload['message'] = snapshot.get('rejectionMessage') or 'Synthetic carrier rejection.'
      return payload, self._create_tender_decision(load_id, decision, payload)
    if step_key in ('DISPATCH_990_SFTP', 'DISPATCH_REJECTED_990_SFTP'):
      return {'shipmentNumber': load_id}, self.midwest.post(f'/v1/loads/{load_id}/tender-response/dispatch-sftp')
    if step_key in ('FREIGHTBRIDGE_RECEIVE_990', 'FREIGHTBRIDGE_RECEIVE_REJECTED_990'):
      dispatch_step = 'DISPATCH_REJECTED_990_SFTP' if step_key == 'FREIGHTBRIDGE_RECEIVE_REJECTED_990' else 'DISPATCH_990_SFTP'
      expected = self._expected_file(run, dispatch_step)
      return {'source': '/outbound', 'documentType': '990', 'expectedFileName': expected}, self._verified_freightbridge_poll(
        run,
        correlation_id,
        expected_file_name=expected,
        document_type='990',
        business_identifier=load_id,
      )
    if step_key.startswith('CREATE_214_'):
      status = step_key.removeprefix('CREATE_214_')
      payload = self._event_payload(snapshot, status)
      return payload, self._create_shipment_event(load_id, payload)
    if step_key.startswith('DISPATCH_214_'):
      status = step_key.removeprefix('DISPATCH_214_')
      event_id = self._event_id(run, status)
      return {'shipmentNumber': load_id, 'eventId': event_id}, self.midwest.post(
        f'/v1/loads/{load_id}/shipment-events/{event_id}/dispatch-sftp'
      )
    if step_key.startswith('FREIGHTBRIDGE_RECEIVE_214_'):
      status = step_key.removeprefix('FREIGHTBRIDGE_RECEIVE_214_')
      expected = self._expected_file(run, f'DISPATCH_214_{status}')
      return {'source': '/outbound', 'documentType': '214', 'expectedFileName': expected}, self._verified_freightbridge_poll(
        run,
        correlation_id,
        expected_file_name=expected,
        document_type='214',
        business_identifier=load_id,
        shipment_status=status,
      )
    raise LabExecutionError('LAB_STEP_NOT_READY', 'This Lab step is not executable.')

  def _dispatch_204(self, shipment_number: str, correlation_id: str) -> dict[str, object]:
    try:
      with connect() as audit_connection:
        with connect() as business_connection:
          result = MidwestDirectDispatchService(
            audit_connection=audit_connection,
            business_connection=business_connection,
            transport=MidwestSftpTransport(),
            configuration_repository=IntegrationConfigurationRepository(audit_connection),
          ).dispatch(
            shipment_number=shipment_number,
            correlation_id=correlation_id,
            idempotency_key=f'lab-{shipment_number}-204',
          )
      body = result.response_body()
      transaction_id = UUID(str(body['transactionId']))
      with connect() as audit_connection:
        payload = IntegrationRepository(audit_connection).fetch_lab_message_payload(
          transaction_id=transaction_id,
          business_identifier=shipment_number,
          document_type='204',
          direction=IntegrationDirection.OUTBOUND,
          message_format=MessageFormat.X12,
        )
      if payload is None:
        raise LabExecutionError('LAB_STORED_PAYLOAD_NOT_FOUND', 'Stored Midwest 204 payload was not found for this Lab dispatch.')
      body['x12Preview'] = self._x12_preview_from_payload(payload, body)
      body['canonicalShipment'] = self._canonical_shipment_summary(shipment_number)
      return body
    except LabExecutionError:
      raise
    except Exception as exc:
      raise LabExecutionError('LAB_SFTP_STEP_FAILED', 'FreightBridge could not dispatch the Midwest 204 over SFTP.') from exc

  def _poll_freightbridge_sftp(self, correlation_id: str) -> dict[str, object]:
    try:
      with connect() as audit_connection:
        with connect() as business_connection:
          result = MidwestSftpOutboundPollService(
            audit_connection=audit_connection,
            business_connection=business_connection,
            configuration_repository=IntegrationConfigurationRepository(audit_connection),
          ).poll(correlation_id=correlation_id)
      return result.response_body()
    except Exception as exc:
      raise LabExecutionError('LAB_SFTP_STEP_FAILED', 'FreightBridge could not poll Midwest outbound SFTP.') from exc

  def _safe_partner_readiness(self, client: PartnerSimulatorClient, *, configured: bool) -> dict[str, object]:
    if not configured:
      return {'configured': False, 'status': 'not_ready'}
    try:
      body = client.get('/readiness')
      return {'configured': True, 'status': 'ready' if body.get('status') == 'ready' else 'not_ready'}
    except LabExecutionError:
      return {'configured': True, 'status': 'not_ready'}

  def _safe_sftp_readiness(self, *, configured: bool) -> dict[str, object]:
    if not configured:
      return {'configured': False, 'status': 'not_ready'}
    try:
      status = MidwestSftpReadinessService().check()
      return {'configured': True, 'status': status.get('status', 'not_ready'), 'directories': status.get('directories', {})}
    except Exception:
      return {'configured': True, 'status': 'not_ready'}

  def _safe_freightbridge_readiness(self) -> dict[str, object]:
    try:
      with connect() as connection:
        with connection.cursor() as cursor:
          cursor.execute('select 1')
          cursor.fetchone()
      return {'status': 'ready'}
    except Exception:
      return {'status': 'not_ready'}

  def _get_or_none(self, client: PartnerSimulatorClient, path: str) -> dict[str, object] | None:
    try:
      return client.get(path)
    except LabExecutionError as exc:
      if exc.code == 'LOAD_NOT_FOUND':
        return None
      raise

  def _create_apex_load(self, load_id: str, payload: dict[str, object]) -> dict[str, object]:
    existing = self._get_or_none(self.apex, f'/v1/loads/{load_id}')
    if existing is not None:
      if self._apex_payload_matches(existing, payload):
        return {
          'loadId': load_id,
          'status': 'RECONCILED_EXISTING',
          'apexLoadTenderJson': payload,
        }
      raise LabExecutionError('LAB_APEX_LOAD_CONFLICT', 'Apex already has a different load with this load ID.')
    body = self.apex.post('/v1/load-tenders', payload)
    body['apexLoadTenderJson'] = payload
    return body

  def _apex_payload_matches(self, existing: dict[str, object], expected: dict[str, object]) -> bool:
    scalar_keys = (
      'loadId',
      'bolNumber',
      'purchaseOrderNumber',
      'customerReference',
      'equipmentType',
      'pieces',
      'commodityDescription',
    )
    for key in scalar_keys:
      if existing.get(key) != expected.get(key):
        return False
    if Decimal(str(existing.get('weightLbs'))) != Decimal(str(expected.get('weightLbs'))):
      return False
    for stop_key in ('pickup', 'delivery'):
      existing_stop = dict(existing.get(stop_key) or {})
      expected_stop = dict(expected.get(stop_key) or {})
      for key in ('facilityName', 'address1', 'city', 'state', 'postalCode', 'scheduledDateTime'):
        if existing_stop.get(key) != expected_stop.get(key):
          return False
    return True

  def _create_tender_decision(self, load_id: str, decision: str, payload: dict[str, object]) -> dict[str, object]:
    load = self._get_or_none(self.midwest, f'/v1/loads/{load_id}')
    if load is None:
      raise LabExecutionError('LAB_STEP_NOT_READY', 'Midwest has not received the 204 for this load yet.')
    current = str(load.get('tenderStatus') or 'PENDING')
    if current == decision:
      return {'customerShipmentNumber': load_id, 'decision': decision, 'status': 'RECONCILED_EXISTING'}
    if current != 'PENDING':
      raise LabExecutionError('LAB_MIDWEST_TENDER_CONFLICT', 'Midwest already has a different final tender decision for this load.')
    return self.midwest.post(f'/v1/loads/{load_id}/tender-decisions', payload)

  def _create_shipment_event(self, load_id: str, payload: dict[str, object]) -> dict[str, object]:
    existing = self._get_or_none(self.midwest, f'/v1/loads/{load_id}/shipment-events')
    if existing is not None:
      for event in existing.get('events') or []:
        if isinstance(event, dict) and self._shipment_event_matches(event, payload):
          return {
            'eventId': event.get('eventId'),
            'customerShipmentNumber': load_id,
            'status': event.get('status'),
            'occurredAt': event.get('occurredAt'),
            'city': event.get('city'),
            'state': event.get('state'),
            'reconciled': True,
          }
    return self.midwest.post(f'/v1/loads/{load_id}/shipment-events', payload)

  def _verified_midwest_receive_204(self, run: dict[str, object], response: dict[str, object]) -> dict[str, object]:
    expected = self._expected_file(run, 'DISPATCH_204_SFTP')
    item = self._processed_file(response, expected)
    if item is None:
      reconciled = self._reconcile_midwest_204_receive(run)
      if reconciled is not None:
        return reconciled
      raise LabExecutionError('LAB_SFTP_TARGET_FILE_NOT_FOUND', f'Midwest SFTP poll did not process expected file {expected}.')
    self._ensure_archived(item, file_name=expected)
    if item.get('functionalAcknowledgmentDocumentId') is None:
      raise LabExecutionError('LAB_FUNCTIONAL_ACK_NOT_CREATED', 'Midwest processed the 204 but did not create a 997 acknowledgment document.')
    return {
      **response,
      'targetFileName': expected,
      'targetProcessed': item,
      'functionalAcknowledgmentDocumentId': item.get('functionalAcknowledgmentDocumentId'),
      'functionalAcknowledgmentStatus': item.get('functionalAcknowledgmentStatus'),
    }

  def _verified_freightbridge_poll(
    self,
    run: dict[str, object],
    correlation_id: str,
    *,
    expected_file_name: str,
    document_type: str,
    business_identifier: str,
    shipment_status: str | None = None,
  ) -> dict[str, object]:
    response = self._poll_freightbridge_sftp(correlation_id)
    item = self._processed_file(response, expected_file_name)
    if item is not None:
      self._ensure_archived(item, file_name=expected_file_name)
      return {**response, 'targetFileName': expected_file_name, 'targetProcessed': item}
    if self._reconcile_freightbridge_receive(run, document_type=document_type, shipment_status=shipment_status):
      return {
        'status': 'RECONCILED_ALREADY_PROCESSED',
        'transport': 'SFTP',
        'targetFileName': expected_file_name,
        'documentType': document_type,
      }
    raise LabExecutionError('LAB_SFTP_TARGET_FILE_NOT_FOUND', f'FreightBridge SFTP poll did not process expected file {expected_file_name}.')

  def _processed_file(self, response: dict[str, object], expected_file_name: str) -> dict[str, object] | None:
    for item in response.get('processed') or []:
      if isinstance(item, dict) and item.get('fileName') == expected_file_name:
        return item
    return None

  def _ensure_archived(self, item: dict[str, object], *, file_name: str) -> None:
    status = item.get('status')
    if status == 'ARCHIVED':
      return
    if status == 'LEFT_FOR_RETRY':
      raise LabExecutionError('LAB_SFTP_TARGET_RETRY_PENDING', f'SFTP target file {file_name} was left for retry.')
    raise LabExecutionError('LAB_SFTP_TARGET_PROCESSING_FAILED', f'SFTP target file {file_name} was not processed successfully.')

  def _reconcile_freightbridge_receive(
    self,
    run: dict[str, object],
    *,
    document_type: str,
    shipment_status: str | None = None,
  ) -> bool:
    if document_type == '997':
      return self._has_matching_functional_ack(run)
    if document_type == '990':
      return self._has_expected_tender_outcome(run)
    if document_type == '214' and shipment_status:
      return self._has_matching_shipment_status(run, shipment_status)
    return False

  def _reconcile_midwest_204_receive(self, run: dict[str, object]) -> dict[str, object] | None:
    load_id = str(run['business_identifier'])
    if self._get_or_none(self.midwest, f'/v1/loads/{load_id}') is None:
      return None
    document_id = self._functional_ack_document_id_from_readback(run)
    if document_id is None:
      return None
    return {
      'status': 'RECONCILED_ALREADY_RECEIVED',
      'transport': 'SFTP',
      'targetFileName': self._expected_file(run, 'DISPATCH_204_SFTP'),
      'functionalAcknowledgmentDocumentId': document_id,
    }

  def _has_matching_functional_ack(self, run: dict[str, object]) -> bool:
    load_id = str(run['business_identifier'])
    preview = self._step_response(run, 'DISPATCH_204_SFTP').get('x12Preview')
    if not isinstance(preview, dict):
      return False
    group_control = preview.get('groupControlNumber')
    transaction_control = preview.get('transactionControlNumber')
    if not group_control or not transaction_control:
      return False
    try:
      with connect() as connection:
        acknowledgment = IntegrationRepository(connection).fetch_latest_functional_acknowledgment_for_shipment(load_id)
    except Exception:
      return False
    if acknowledgment is None:
      return False
    return (
      acknowledgment['acknowledged_group_control_number'] == group_control
      and acknowledgment['acknowledged_transaction_control_number'] == transaction_control
      and acknowledgment['status'] in ('ACCEPTED', 'REJECTED')
    )

  def _has_expected_tender_outcome(self, run: dict[str, object]) -> bool:
    expected = 'REJECTED' if run['scenario_key'] == 'TENDER_REJECTED' else 'ACCEPTED'
    load_id = str(run['business_identifier'])
    try:
      tender = self.apex.get(f'/v1/loads/{load_id}/tender-status')
    except LabExecutionError:
      return False
    return tender.get('currentTenderDecision') == expected

  def _has_matching_shipment_status(self, run: dict[str, object], status: str) -> bool:
    expected = self._step_response(run, f'CREATE_214_{status}')
    if not expected:
      return False
    load_id = str(run['business_identifier'])
    try:
      statuses = self.apex.get(f'/v1/loads/{load_id}/shipment-statuses')
    except LabExecutionError:
      return False
    for event in statuses.get('events') or []:
      if isinstance(event, dict) and self._shipment_event_matches(event, expected):
        return True
    return False

  def _x12_preview_from_payload(self, payload: dict[str, object], dispatch_body: dict[str, object]) -> dict[str, object]:
    return {
      'x12': payload['payload_text'],
      'interchangeControlNumber': payload['interchange_control_number'],
      'groupControlNumber': payload['group_control_number'],
      'transactionControlNumber': payload['transaction_control_number'],
      'mappingKey': payload['mapping_key'],
      'mappingProfileId': str(payload['mapping_profile_id']) if payload.get('mapping_profile_id') is not None else None,
      'mappingProfileVersion': payload['mapping_profile_version'],
      'fileName': dispatch_body.get('fileName'),
      'remotePath': dispatch_body.get('remotePath'),
      'payloadSha256': payload['payload_sha256'],
    }

  def _canonical_shipment_summary(self, shipment_number: str) -> dict[str, object]:
    try:
      with connect() as connection:
        shipment = FreightBridgeRepository(connection).fetch_shipment_by_number(shipment_number)
      if shipment is None:
        return {}
      return {
        'shipmentNumber': shipment.shipment_number,
        'equipmentType': shipment.equipment_type.value,
        'weightLbs': float(shipment.weight_lbs),
        'pieces': shipment.pieces,
        'commodityDescription': shipment.commodity_description,
        'pickup': self._location_summary(shipment.origin),
        'delivery': self._location_summary(shipment.destination),
        'references': [
          {'type': reference.reference_type.value, 'value': reference.reference_value}
          for reference in shipment.references
        ],
        'tenderStatus': shipment.tender_status.value,
        'currentStatus': shipment.current_status.value,
      }
    except Exception:
      return {}

  def _location_summary(self, location) -> dict[str, object]:
    return {
      'facilityName': location.facility_name,
      'address1': location.address_line_1,
      'address2': location.address_line_2,
      'city': location.city,
      'state': location.state,
      'postalCode': location.postal_code,
      'scheduledAt': location.scheduled_at.isoformat(),
    }

  def _scenario(self, scenario_key: str) -> LabScenarioDefinition:
    scenario = SCENARIOS.get(scenario_key)
    if scenario is None:
      raise LabExecutionError('LAB_SCENARIO_NOT_FOUND', 'Integration Lab scenario was not found.')
    return scenario

  def _ensure_prerequisites(self, run: dict[str, object], step: dict[str, object]) -> None:
    for candidate in run['steps']:
      if candidate['sequence'] >= step['sequence']:
        continue
      if candidate['status'] != 'SUCCEEDED':
        raise LabExecutionError('LAB_STEP_NOT_READY', 'Earlier Lab steps must succeed before this step can run.')

  def _input_snapshot(self, request: CreateLabRunRequest) -> dict[str, object]:
    now = datetime.now(timezone.utc).replace(microsecond=0)
    load_id = request.load_id or f'LAB{now.strftime("%m%d%H%M%S")}{str(uuid4())[:4].upper()}'
    pickup_time = request.pickup.scheduled_date_time if request.pickup and request.pickup.scheduled_date_time else now + timedelta(days=1)
    delivery_time = request.delivery.scheduled_date_time if request.delivery and request.delivery.scheduled_date_time else pickup_time + timedelta(days=1)
    snapshot = request.model_dump(mode='json', by_alias=True, exclude_none=True)
    snapshot.update(
      {
        'scenarioKey': request.scenario_key,
        'loadId': load_id,
        'bolNumber': request.bol_number or f'BOL{load_id[-10:]}',
        'purchaseOrderNumber': request.purchase_order_number or f'PO{load_id[-10:]}',
        'customerReference': request.customer_reference or f'CUST{load_id[-8:]}',
        'equipmentType': request.equipment_type or 'VAN_53',
        'weightLbs': request.weight_lbs or 42000,
        'pieces': request.pieces or 22,
        'commodityDescription': request.commodity_description or 'Industrial Components',
        'createdAt': now.isoformat(),
        'updatedAt': now.isoformat(),
        'pickup': {
          'facilityName': (request.pickup.facility_name if request.pickup and request.pickup.facility_name else 'ABC Factory'),
          'address1': (request.pickup.address_1 if request.pickup and request.pickup.address_1 else '200 Industrial Rd'),
          'address2': (request.pickup.address_2 if request.pickup and request.pickup.address_2 else None),
          'city': (request.pickup.city if request.pickup and request.pickup.city else 'Aurora'),
          'state': (request.pickup.state if request.pickup and request.pickup.state else 'IL'),
          'postalCode': (request.pickup.postal_code if request.pickup and request.pickup.postal_code else '60505'),
          'scheduledDateTime': pickup_time.isoformat(),
        },
        'delivery': {
          'facilityName': (request.delivery.facility_name if request.delivery and request.delivery.facility_name else 'XYZ Warehouse'),
          'address1': (request.delivery.address_1 if request.delivery and request.delivery.address_1 else '900 Commerce St'),
          'address2': (request.delivery.address_2 if request.delivery and request.delivery.address_2 else None),
          'city': (request.delivery.city if request.delivery and request.delivery.city else 'Detroit'),
          'state': (request.delivery.state if request.delivery and request.delivery.state else 'MI'),
          'postalCode': (request.delivery.postal_code if request.delivery and request.delivery.postal_code else '48201'),
          'scheduledDateTime': delivery_time.isoformat(),
        },
        'eventSchedule': self._event_schedule(pickup_time),
      }
    )
    return snapshot

  def _event_schedule(self, pickup_time: datetime) -> list[dict[str, object]]:
    schedule = []
    for index, (status, at7, city, state, description) in enumerate(EVENTS):
      occurred = pickup_time + timedelta(hours=index * 8)
      schedule.append(
        {
          'status': status,
          'at7Code': at7,
          'city': city,
          'state': state,
          'statusDescription': description,
          'occurredAt': occurred.isoformat(),
        }
      )
    return schedule

  def _apex_payload(self, snapshot: dict[str, object]) -> dict[str, object]:
    return {
      'loadId': snapshot['loadId'],
      'bolNumber': snapshot['bolNumber'],
      'purchaseOrderNumber': snapshot['purchaseOrderNumber'],
      'customerReference': snapshot['customerReference'],
      'equipmentType': snapshot['equipmentType'],
      'weightLbs': snapshot['weightLbs'],
      'pieces': snapshot['pieces'],
      'commodityDescription': snapshot['commodityDescription'],
      'pickup': snapshot['pickup'],
      'delivery': snapshot['delivery'],
      'references': [
        {'type': 'BOL', 'value': snapshot['bolNumber']},
        {'type': 'PO', 'value': snapshot['purchaseOrderNumber']},
        {'type': 'CUSTOMER_REF', 'value': snapshot['customerReference']},
      ],
      'createdAt': snapshot['createdAt'],
      'updatedAt': snapshot['updatedAt'],
    }

  def _event_payload(self, snapshot: dict[str, object], status: str) -> dict[str, object]:
    for event in snapshot.get('eventSchedule') or []:
      if event.get('status') == status:
        return {
          'status': event['status'],
          'occurredAt': event['occurredAt'],
          'city': event['city'],
          'state': event['state'],
          'statusDescription': event['statusDescription'],
        }
    raise LabExecutionError('LAB_STEP_NOT_READY', f'No shipment event schedule exists for {status}.')

  def _expected_file(self, run: dict[str, object], step_key: str) -> str:
    response = self._step_response(run, step_key)
    file_name = response.get('fileName')
    if not isinstance(file_name, str) or not file_name:
      raise LabExecutionError('LAB_STEP_NOT_READY', f'{step_key} has not produced an SFTP filename yet.')
    return file_name

  def _shipment_event_matches(self, existing: dict[str, object], expected: dict[str, object]) -> bool:
    return (
      existing.get('status') == expected.get('status')
      and existing.get('city') == expected.get('city')
      and existing.get('state') == expected.get('state')
      and self._same_timestamp(existing.get('occurredAt'), expected.get('occurredAt'))
    )

  def _same_timestamp(self, left: object, right: object) -> bool:
    if not isinstance(left, str) or not isinstance(right, str):
      return False
    try:
      left_dt = datetime.fromisoformat(left.replace('Z', '+00:00'))
      right_dt = datetime.fromisoformat(right.replace('Z', '+00:00'))
    except ValueError:
      return left == right
    return left_dt == right_dt

  def _functional_ack_document_id(self, run: dict[str, object]) -> str:
    response = self._step_response(run, 'MIDWEST_RECEIVE_204')
    if response.get('functionalAcknowledgmentDocumentId'):
      return str(response['functionalAcknowledgmentDocumentId'])
    target = response.get('targetProcessed')
    if isinstance(target, dict) and target.get('functionalAcknowledgmentDocumentId'):
      return str(target['functionalAcknowledgmentDocumentId'])
    document_id = self._functional_ack_document_id_from_readback(run)
    if document_id is not None:
      return document_id
    raise LabExecutionError('LAB_STEP_NOT_READY', 'Midwest has not generated a 997 for this 204 yet.')

  def _functional_ack_document_id_from_readback(self, run: dict[str, object]) -> str | None:
    load_id = str(run['business_identifier'])
    preview = self._step_response(run, 'DISPATCH_204_SFTP').get('x12Preview')
    group_control = preview.get('groupControlNumber') if isinstance(preview, dict) else None
    transaction_control = preview.get('transactionControlNumber') if isinstance(preview, dict) else None
    try:
      acknowledgments = self.midwest.get(f'/v1/loads/{load_id}/functional-acknowledgments')
    except LabExecutionError:
      return None
    for item in acknowledgments.get('functionalAcknowledgments') or []:
      if group_control and item.get('acknowledgedGroupControlNumber') != group_control:
        continue
      if transaction_control and item.get('acknowledgedTransactionControlNumber') != transaction_control:
        continue
      if item.get('outboundDocumentId'):
        return str(item['outboundDocumentId'])
    return None

  def _event_id(self, run: dict[str, object], status: str) -> str:
    response = self._step_response(run, f'CREATE_214_{status}')
    if response.get('eventId'):
      return str(response['eventId'])
    raise LabExecutionError('LAB_STEP_NOT_READY', f'Midwest shipment event {status} has not been created.')

  def _step_response(self, run: dict[str, object], step_key: str) -> dict[str, object]:
    for step in run['steps']:
      if step['step_key'] == step_key:
        return dict(step['response_summary'] or {})
    return {}

  def _related_transactions(self, business_identifier: str) -> list[str]:
    try:
      with connect() as connection:
        search = OperationsRepository(connection).search_transactions(
          business_identifier=business_identifier,
          limit=100,
          offset=0,
        )
      return [str(tx['id']) for tx in search['transactions']]
    except Exception:
      return []

  def _transaction_document_types(self, business_identifier: str) -> set[str]:
    try:
      with connect() as connection:
        trace = OperationsRepository(connection).get_business_trace(business_identifier)
      return {str(tx['document_type']) for tx in trace['transactions']}
    except Exception:
      return set()

  def _result_summary(self, business_identifier: str) -> dict[str, object]:
    summary: dict[str, object] = {
      'loadId': business_identifier,
      'transactionDocumentTypes': [],
      'technicalAcknowledgment': 'NOT_RECEIVED',
      'tenderStatus': 'PENDING',
      'shipmentStatus': 'PLANNED',
      'shipmentEvents': [],
      'canonicalShipment': self._canonical_shipment_summary(business_identifier),
    }
    try:
      with connect() as connection:
        trace = OperationsRepository(connection).get_business_trace(business_identifier)
      summary['transactionDocumentTypes'] = sorted({tx['document_type'] for tx in trace['transactions']})
    except Exception:
      pass
    try:
      with connect() as connection:
        acknowledgment = IntegrationRepository(connection).fetch_latest_functional_acknowledgment_for_shipment(business_identifier)
      if acknowledgment is not None:
        summary['technicalAcknowledgment'] = acknowledgment['status']
        summary['technicalAcknowledgmentDetail'] = {
          'ak5': acknowledgment['transaction_ack_code'],
          'ak9': acknowledgment['group_ack_code'],
          'acknowledgedGroupControlNumber': acknowledgment['acknowledged_group_control_number'],
          'acknowledgedTransactionControlNumber': acknowledgment['acknowledged_transaction_control_number'],
        }
    except Exception:
      pass
    try:
      tender = self.apex.get(f'/v1/loads/{business_identifier}/tender-status')
      summary['tenderStatus'] = tender.get('currentTenderDecision') or summary['tenderStatus']
    except LabExecutionError:
      pass
    try:
      statuses = self.apex.get(f'/v1/loads/{business_identifier}/shipment-statuses')
      summary['shipmentEvents'] = statuses.get('events') or []
      summary['shipmentStatus'] = statuses.get('currentStatus') or summary['shipmentStatus']
    except LabExecutionError:
      pass
    return summary
