from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

import httpx

from app.core.config import get_settings
from app.infrastructure.configuration_repository import IntegrationConfigurationRepository
from app.infrastructure.database import connect
from app.infrastructure.lab_repository import IntegrationLabRepository
from app.infrastructure.operations_repository import OperationsRepository
from app.integrations.common.correlation import resolve_correlation_id
from app.integrations.midwest.dispatch_service import MidwestDirectDispatchService
from app.integrations.midwest.service import Midwest204GenerationService
from app.integrations.midwest.sftp_poll_service import MidwestSftpOutboundPollService
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
}


class PartnerSimulatorClient:
  unavailable_code = 'LAB_PARTNER_UNAVAILABLE'

  def __init__(self, *, base_url: str | None, bearer_token: str | None, unavailable_code: str) -> None:
    self.base_url = base_url.rstrip('/') if base_url else None
    self.bearer_token = bearer_token
    self.unavailable_code = unavailable_code

  def request(self, method: str, path: str, *, json: dict[str, object] | None = None) -> dict[str, object]:
    if not self.base_url or not self.bearer_token:
      raise LabExecutionError(self.unavailable_code, 'Partner simulator configuration is incomplete.')
    try:
      response = httpx.request(
        method,
        self.base_url + path,
        json=json,
        headers={'Authorization': f'Bearer {self.bearer_token}'},
        timeout=20.0,
      )
    except (httpx.TimeoutException, httpx.HTTPError) as exc:
      raise LabExecutionError(self.unavailable_code, 'Partner simulator could not be reached.') from exc
    body = self._safe_json(response)
    if response.status_code in (401, 403):
      raise LabExecutionError('LAB_PARTNER_AUTHENTICATION_FAILED', 'Partner simulator authentication failed.')
    if response.status_code >= 500:
      raise LabExecutionError(self.unavailable_code, 'Partner simulator is temporarily unavailable.')
    if response.status_code >= 400:
      detail = body.get('error') if isinstance(body.get('error'), dict) else {}
      raise LabExecutionError(
        str(detail.get('code') or 'LAB_PARTNER_REJECTED_REQUEST'),
        str(detail.get('message') or 'Partner simulator rejected the request.'),
      )
    return body

  def get(self, path: str) -> dict[str, object]:
    return self.request('GET', path)

  def post(self, path: str, payload: dict[str, object] | None = None) -> dict[str, object]:
    return self.request('POST', path, json=payload)

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

  def readiness(self) -> dict[str, object]:
    dependencies = {
      'apexSimulatorConfigured': bool(get_settings().apex_sim_base_url and get_settings().apex_sim_bearer_token),
      'midwestSimulatorConfigured': bool(get_settings().midwest_sim_base_url and get_settings().midwest_sim_bearer_token),
      'sftpConfigured': bool(get_settings().mwcx_sftp_host and get_settings().mwcx_sftp_username),
    }
    return {
      'status': 'ready' if all(dependencies.values()) else 'not_ready',
      'dependencies': dependencies,
      'scenarios': [
        {
          'scenario_key': scenario.scenario_key,
          'name': scenario.name,
          'description': scenario.description,
          'step_count': len(scenario.steps),
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
    acquired = self.repository.acquire_step(run_id, step_key)
    if acquired is None:
      raise LabExecutionError('LAB_STEP_NOT_FOUND', 'Integration Lab step was not found.')
    try:
      request_summary, response_summary = self._execute(run_id, step_key)
      transaction_ids = self._related_transactions(run['business_identifier'])
      self.repository.mark_step_succeeded(
        step_id=acquired['id'],
        request_summary=request_summary,
        response_summary=response_summary,
        related_transaction_ids=transaction_ids,
      )
      latest_summary = self._result_summary(run['business_identifier'])
      self.repository.mark_run_if_complete(run_id, latest_summary)
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

    if step_key == 'CREATE_APEX_LOAD':
      payload = self._apex_payload(snapshot)
      return {'target': 'Apex load tender'}, self.apex.post('/v1/load-tenders', payload)
    if step_key == 'DISPATCH_APEX_TENDER':
      return {'loadId': load_id}, self.apex.post(f'/v1/load-tenders/{load_id}/dispatch')
    if step_key == 'DISPATCH_204_SFTP':
      return {'shipmentNumber': load_id}, self._dispatch_204(load_id, correlation_id)
    if step_key == 'MIDWEST_RECEIVE_204':
      return {'source': '/inbound'}, self.midwest.post('/v1/sftp/inbound/poll')
    if step_key == 'DISPATCH_997_SFTP':
      document_id = self._functional_ack_document_id(run)
      return {'outboundDocumentId': document_id}, self.midwest.post(f'/v1/functional-acknowledgments/{document_id}/dispatch-sftp')
    if step_key == 'FREIGHTBRIDGE_RECEIVE_997':
      return {'source': '/outbound', 'documentType': '997'}, self._poll_freightbridge_sftp(correlation_id)
    if step_key in ('CREATE_TENDER_DECISION', 'CREATE_TENDER_REJECTION'):
      decision = 'REJECTED' if step_key == 'CREATE_TENDER_REJECTION' else 'ACCEPTED'
      payload: dict[str, object] = {'decision': decision}
      if decision == 'REJECTED':
        payload['reasonCode'] = snapshot.get('rejectionReasonCode') or 'CAPACITY'
        payload['message'] = snapshot.get('rejectionMessage') or 'Synthetic carrier rejection.'
      return payload, self.midwest.post(f'/v1/loads/{load_id}/tender-decisions', payload)
    if step_key in ('DISPATCH_990_SFTP', 'DISPATCH_REJECTED_990_SFTP'):
      return {'shipmentNumber': load_id}, self.midwest.post(f'/v1/loads/{load_id}/tender-response/dispatch-sftp')
    if step_key in ('FREIGHTBRIDGE_RECEIVE_990', 'FREIGHTBRIDGE_RECEIVE_REJECTED_990'):
      return {'source': '/outbound', 'documentType': '990'}, self._poll_freightbridge_sftp(correlation_id)
    if step_key.startswith('CREATE_214_'):
      status = step_key.removeprefix('CREATE_214_')
      payload = self._event_payload(snapshot, status)
      return payload, self.midwest.post(f'/v1/loads/{load_id}/shipment-events', payload)
    if step_key.startswith('DISPATCH_214_'):
      status = step_key.removeprefix('DISPATCH_214_')
      event_id = self._event_id(run, status)
      return {'shipmentNumber': load_id, 'eventId': event_id}, self.midwest.post(
        f'/v1/loads/{load_id}/shipment-events/{event_id}/dispatch-sftp'
      )
    if step_key.startswith('FREIGHTBRIDGE_RECEIVE_214_'):
      return {'source': '/outbound', 'documentType': '214'}, self._poll_freightbridge_sftp(correlation_id)
    raise LabExecutionError('LAB_STEP_NOT_READY', 'This Lab step is not executable.')

  def _dispatch_204(self, shipment_number: str, correlation_id: str) -> dict[str, object]:
    try:
      with connect() as preview_connection:
        preview = Midwest204GenerationService(connection=preview_connection).generate_for_shipment_number(shipment_number)
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
      body['x12Preview'] = preview.response_body()
      return body
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
        'pieces': request.pieces or 24,
        'commodityDescription': request.commodity_description or 'Synthetic consumer goods',
        'pickup': {
          'facilityName': (request.pickup.facility_name if request.pickup and request.pickup.facility_name else 'Apex Aurora Distribution'),
          'addressLine1': (request.pickup.address_line_1 if request.pickup and request.pickup.address_line_1 else '1000 Logistics Way'),
          'city': (request.pickup.city if request.pickup and request.pickup.city else 'Aurora'),
          'state': (request.pickup.state if request.pickup and request.pickup.state else 'IL'),
          'postalCode': (request.pickup.postal_code if request.pickup and request.pickup.postal_code else '60502'),
          'scheduledDateTime': pickup_time.isoformat(),
        },
        'delivery': {
          'facilityName': (request.delivery.facility_name if request.delivery and request.delivery.facility_name else 'Detroit Retail Consolidation'),
          'addressLine1': (request.delivery.address_line_1 if request.delivery and request.delivery.address_line_1 else '2200 Market Street'),
          'city': (request.delivery.city if request.delivery and request.delivery.city else 'Detroit'),
          'state': (request.delivery.state if request.delivery and request.delivery.state else 'MI'),
          'postalCode': (request.delivery.postal_code if request.delivery and request.delivery.postal_code else '48226'),
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

  def _functional_ack_document_id(self, run: dict[str, object]) -> str:
    response = self._step_response(run, 'MIDWEST_RECEIVE_204')
    for item in response.get('processed') or []:
      if item.get('functionalAcknowledgmentDocumentId'):
        return str(item['functionalAcknowledgmentDocumentId'])
    load_id = str(run['business_identifier'])
    acknowledgments = self.midwest.get(f'/v1/loads/{load_id}/functional-acknowledgments')
    for item in acknowledgments.get('functionalAcknowledgments') or []:
      if item.get('outboundDocumentId'):
        return str(item['outboundDocumentId'])
    raise LabExecutionError('LAB_STEP_NOT_READY', 'Midwest has not generated a 997 for this 204 yet.')

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

  def _result_summary(self, business_identifier: str) -> dict[str, object]:
    summary: dict[str, object] = {
      'loadId': business_identifier,
      'transactionDocumentTypes': [],
      'technicalAcknowledgment': 'PENDING',
      'tenderStatus': 'PENDING',
      'shipmentStatus': 'PENDING',
      'shipmentEvents': [],
    }
    try:
      with connect() as connection:
        trace = OperationsRepository(connection).get_business_trace(business_identifier)
      summary['transactionDocumentTypes'] = sorted({tx['document_type'] for tx in trace['transactions']})
      if '997' in summary['transactionDocumentTypes']:
        summary['technicalAcknowledgment'] = 'RECEIVED'
      if any(tx['document_type'] == '990' for tx in trace['transactions']):
        summary['tenderStatus'] = 'UPDATED'
      if any(tx['document_type'] == '214' for tx in trace['transactions']):
        summary['shipmentStatus'] = 'UPDATED'
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
