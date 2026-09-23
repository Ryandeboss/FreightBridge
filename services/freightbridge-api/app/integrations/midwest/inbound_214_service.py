from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import UUID

import psycopg

from app.domain import (
  ErrorCategory,
  IntegrationDirection,
  IntegrationTransaction,
  MessageFormat,
  ProcessingLog,
  ProcessingStage,
  ProcessingStatus,
  ShipmentEvent,
  ShipmentStatus,
  Transport,
)
from app.infrastructure.repositories import (
  FreightBridgeRepository,
  IntegrationRepository,
  ShipmentNotFoundForEventError,
)
from app.integrations.apex.shipment_status_client import (
  ApexShipmentStatusClient,
  ApexShipmentStatusDeliveryError,
  serialized_apex_shipment_status_payload,
)
from app.integrations.common.errors import ClassifiedIntegrationFailure, IntegrationAPIError
from app.integrations.common.ingestion import payload_sha256
from app.integrations.midwest.constants import MIDWEST_PARTNER_CODE
from app.integrations.midwest.mapping_214 import Midwest214MappingError, map_midwest_214
from app.integrations.x12 import X12Error, parse_x12, validate_x12_envelopes


MIDWEST_214_DOCUMENT_TYPE = '214'
APEX_SHIPMENT_STATUS_DOCUMENT_TYPE = 'APEX_SHIPMENT_STATUS'
APEX_PARTNER_CODE = 'APEX'

STATUS_DESCRIPTIONS: dict[ShipmentStatus, str] = {
  ShipmentStatus.PICKED_UP: 'Shipment departed pickup facility.',
  ShipmentStatus.IN_TRANSIT: 'Shipment is in transit.',
  ShipmentStatus.ARRIVED: 'Shipment arrived at delivery location.',
  ShipmentStatus.DELIVERED: 'Shipment delivery completed.',
}


@dataclass(frozen=True)
class Midwest214IngestionResult:
  status: str
  correlation_id: str
  transaction_id: UUID
  shipment_number: str
  shipment_status: str
  current_status: str
  current_status_advanced: bool
  apex_delivery_status: str

  def response_body(self) -> dict[str, object]:
    return {
      'status': self.status,
      'correlationId': self.correlation_id,
      'transactionId': str(self.transaction_id),
      'shipmentNumber': self.shipment_number,
      'shipmentStatus': self.shipment_status,
      'currentStatus': self.current_status,
      'currentStatusAdvanced': self.current_status_advanced,
      'apexDelivery': {'status': self.apex_delivery_status},
    }


class Midwest214IngestionService:
  def __init__(
    self,
    *,
    audit_connection=None,
    business_connection=None,
    connection=None,
    freightbridge_repository: FreightBridgeRepository | None = None,
    integration_repository: IntegrationRepository | None = None,
    apex_client: ApexShipmentStatusClient | None = None,
  ) -> None:
    resolved_audit_connection = audit_connection or connection
    resolved_business_connection = business_connection or connection
    if resolved_audit_connection is None or resolved_business_connection is None:
      raise ValueError('audit_connection and business_connection are required')

    self.audit_connection = resolved_audit_connection
    self.business_connection = resolved_business_connection
    self.freightbridge_repository = freightbridge_repository or FreightBridgeRepository(resolved_business_connection)
    self.integration_repository = integration_repository or IntegrationRepository(resolved_audit_connection)
    self.apex_client = apex_client or ApexShipmentStatusClient()

  def ingest(
    self,
    *,
    raw_body: bytes,
    correlation_id: str,
    transport: Transport = Transport.SFTP,
    raw_payload_location: str | None = None,
  ) -> Midwest214IngestionResult:
    received_at = datetime.now(timezone.utc)
    partner = self.freightbridge_repository.fetch_trading_partner_by_code(MIDWEST_PARTNER_CODE)
    if partner is None or not partner['active']:
      raise IntegrationAPIError(
        status_code=503,
        code='DEPENDENCY_ERROR',
        message='Midwest trading partner is not available.',
        correlation_id=correlation_id,
      )

    transaction_id = self.integration_repository.create_transaction(
      IntegrationTransaction(
        correlation_id=correlation_id,
        partner_id=partner['id'],
        direction=IntegrationDirection.INBOUND,
        transport=transport,
        message_format=MessageFormat.X12,
        document_type=MIDWEST_214_DOCUMENT_TYPE,
        raw_payload_location=raw_payload_location,
        payload_hash=payload_sha256(raw_body),
        processing_status=ProcessingStatus.RECEIVED,
        processing_stage=ProcessingStage.RECEIVED,
        received_at=received_at,
      )
    )
    self._log(transaction_id, ProcessingStage.RECEIVED, ProcessingStatus.RECEIVED, 'Midwest 214 received.')

    try:
      self._log(
        transaction_id,
        ProcessingStage.AUTHENTICATION,
        ProcessingStatus.SUCCEEDED,
        'Midwest SFTP authentication completed by SSH transport boundary.',
        {'transport': transport.value},
      )
      mapped = self._parse_validate_and_map(transaction_id, raw_body)
      self.integration_repository.update_x12_metadata(
        transaction_id,
        business_identifier=mapped.shipment_number,
        x12_version=mapped.x12_version,
        interchange_control_number=mapped.interchange_control_number,
        group_control_number=mapped.group_control_number,
        transaction_control_number=mapped.transaction_control_number,
      )
      replay_result = self._detect_replay(transaction_id, partner['id'], mapped, raw_body, correlation_id)
      if replay_result is not None:
        return replay_result
      event, persisted = self._persist(transaction_id, mapped, partner['id'], received_at)
    except ClassifiedIntegrationFailure as exc:
      self._record_failure(transaction_id, exc)
      raise IntegrationAPIError(
        status_code=exc.status_code,
        code=exc.code,
        message=exc.message,
        correlation_id=correlation_id,
        transaction_id=str(transaction_id),
      ) from exc
    except psycopg.Error as exc:
      failure = ClassifiedIntegrationFailure(
        status_code=503,
        code='DEPENDENCY_ERROR',
        message='A downstream dependency failed while processing the Midwest 214.',
        category=ErrorCategory.DOWNSTREAM_ERROR,
        stage=ProcessingStage.BUSINESS_VALIDATION,
        retryable=True,
      )
      self._record_failure(transaction_id, failure)
      raise IntegrationAPIError(
        status_code=failure.status_code,
        code=failure.code,
        message=failure.message,
        correlation_id=correlation_id,
        transaction_id=str(transaction_id),
      ) from exc

    self.integration_repository.mark_succeeded(transaction_id)
    self._log(
      transaction_id,
      ProcessingStage.COMPLETED,
      ProcessingStatus.SUCCEEDED,
      'Midwest 214 persisted as canonical shipment event.',
      {
        'shipment_number': mapped.shipment_number,
        'status': mapped.status.value,
        'advanced': persisted['advanced'],
      },
    )
    apex_delivery_status = self._forward_to_apex(
      parent_transaction_id=transaction_id,
      correlation_id=correlation_id,
      shipment_number=mapped.shipment_number,
      event=event,
      status_description=STATUS_DESCRIPTIONS[mapped.status],
    )
    return Midwest214IngestionResult(
      status='ACCEPTED',
      correlation_id=correlation_id,
      transaction_id=transaction_id,
      shipment_number=mapped.shipment_number,
      shipment_status=mapped.status.value,
      current_status=persisted['current_status'].value,
      current_status_advanced=persisted['advanced'],
      apex_delivery_status=apex_delivery_status,
    )

  def _detect_replay(self, transaction_id: UUID, partner_id: UUID, mapped, raw_body: bytes, correlation_id: str) -> Midwest214IngestionResult | None:
    existing = self.integration_repository.find_x12_control_replay(
      partner_id=partner_id,
      direction=IntegrationDirection.INBOUND,
      document_type=MIDWEST_214_DOCUMENT_TYPE,
      interchange_control_number=mapped.interchange_control_number,
      group_control_number=mapped.group_control_number,
      transaction_control_number=mapped.transaction_control_number,
      exclude_transaction_id=transaction_id,
    )
    if existing is None:
      return None
    if existing['payload_hash'] != payload_sha256(raw_body):
      raise ClassifiedIntegrationFailure(
        status_code=409,
        code='X12_CONTROL_NUMBER_REUSE',
        message='Midwest reused X12 control numbers with different payload content.',
        category=ErrorCategory.DUPLICATE_TRANSACTION,
        stage=ProcessingStage.BUSINESS_VALIDATION,
      )
    if existing['processing_status'] != ProcessingStatus.SUCCEEDED.value:
      return None
    self.integration_repository.mark_replay(
      transaction_id,
      original_transaction_id=existing['id'],
      business_identifier=str(existing.get('business_identifier') or mapped.shipment_number),
    )
    self.integration_repository.mark_succeeded(transaction_id)
    self._log(
      transaction_id,
      ProcessingStage.COMPLETED,
      ProcessingStatus.SUCCEEDED,
      'Exact X12 replay detected; business side effects were skipped.',
      {'original_transaction_id': str(existing['id'])},
    )
    return Midwest214IngestionResult(
      status='REPLAY_ACCEPTED',
      correlation_id=correlation_id,
      transaction_id=transaction_id,
      shipment_number=mapped.shipment_number,
      shipment_status=mapped.status.value,
      current_status=mapped.status.value,
      current_status_advanced=False,
      apex_delivery_status='SKIPPED_REPLAY',
    )

  def _parse_validate_and_map(self, transaction_id: UUID, raw_body: bytes):
    self.integration_repository.update_processing_state(
      transaction_id,
      ProcessingStatus.PROCESSING,
      ProcessingStage.PARSING,
    )
    try:
      interchange = parse_x12(raw_body)
      validate_x12_envelopes(interchange)
    except X12Error as exc:
      raise ClassifiedIntegrationFailure(
        status_code=400,
        code=exc.code.value,
        message='Midwest 214 failed X12 envelope parsing or validation.',
        category=ErrorCategory.SYNTAX_ERROR,
        stage=ProcessingStage.PARSING,
      ) from exc
    self._log(transaction_id, ProcessingStage.PARSING, ProcessingStatus.SUCCEEDED, 'Midwest 214 X12 envelope parsed.')

    self.integration_repository.update_processing_state(
      transaction_id,
      ProcessingStatus.PROCESSING,
      ProcessingStage.MAPPING,
    )
    try:
      mapped = map_midwest_214(interchange)
    except Midwest214MappingError as exc:
      raise ClassifiedIntegrationFailure(
        status_code=422,
        code=exc.code,
        message=exc.message,
        category=ErrorCategory.MAPPING_ERROR,
        stage=ProcessingStage.MAPPING,
      ) from exc
    self._log(
      transaction_id,
      ProcessingStage.MAPPING,
      ProcessingStatus.SUCCEEDED,
      'Midwest 214 mapped to canonical shipment event.',
      {'shipment_number': mapped.shipment_number, 'status': mapped.status.value},
    )
    return mapped

  def _persist(self, transaction_id: UUID, mapped, partner_id: UUID, received_at: datetime):
    self.integration_repository.update_processing_state(
      transaction_id,
      ProcessingStatus.PROCESSING,
      ProcessingStage.BUSINESS_VALIDATION,
    )
    event = ShipmentEvent(
      shipment_id=UUID(int=0),
      status=mapped.status,
      occurred_at=mapped.occurred_at,
      received_at=received_at,
      city=mapped.city,
      state=mapped.state,
      source_partner_id=partner_id,
      source_transaction_id=transaction_id,
    )
    with self.business_connection.transaction():
      try:
        persisted = self.freightbridge_repository.record_shipment_event(mapped.shipment_number, event)
      except ShipmentNotFoundForEventError as exc:
        raise ClassifiedIntegrationFailure(
          status_code=404,
          code='SHIPMENT_NOT_FOUND',
          message='Canonical shipment was not found.',
          category=ErrorCategory.BUSINESS_VALIDATION_ERROR,
          stage=ProcessingStage.BUSINESS_VALIDATION,
        ) from exc
    return event.model_copy(update={'id': persisted['event_id'], 'shipment_id': persisted['shipment_id']}), persisted

  def _forward_to_apex(
    self,
    *,
    parent_transaction_id: UUID,
    correlation_id: str,
    shipment_number: str,
    event: ShipmentEvent,
    status_description: str,
  ) -> str:
    partner = self.freightbridge_repository.fetch_trading_partner_by_code(APEX_PARTNER_CODE)
    if partner is None or not partner['active']:
      return 'FAILED'

    payload = serialized_apex_shipment_status_payload(
      shipment_number=shipment_number,
      event=event,
      status_description=status_description,
    )
    transaction_id = self.integration_repository.create_transaction(
      IntegrationTransaction(
        correlation_id=correlation_id,
        partner_id=partner['id'],
        direction=IntegrationDirection.OUTBOUND,
        transport=Transport.REST,
        message_format=MessageFormat.JSON,
        document_type=APEX_SHIPMENT_STATUS_DOCUMENT_TYPE,
        business_identifier=shipment_number,
        payload_hash=payload_sha256(payload),
        processing_status=ProcessingStatus.PROCESSING,
        processing_stage=ProcessingStage.ROUTING,
        parent_transaction_id=parent_transaction_id,
        received_at=datetime.now(timezone.utc),
      )
    )
    self._log(transaction_id, ProcessingStage.ROUTING, ProcessingStatus.SUCCEEDED, 'Apex shipment-status route selected.')

    try:
      self.integration_repository.update_processing_state(
        transaction_id,
        ProcessingStatus.PROCESSING,
        ProcessingStage.DELIVERY,
      )
      delivery = self.apex_client.deliver_shipment_status(
        shipment_number=shipment_number,
        event=event,
        status_description=status_description,
      )
    except ApexShipmentStatusDeliveryError as exc:
      self.integration_repository.mark_failed(transaction_id, ProcessingStage.DELIVERY)
      self.integration_repository.append_error(
        transaction_id=transaction_id,
        category=ErrorCategory.DOWNSTREAM_ERROR,
        error_code=exc.code,
        safe_message=exc.message,
        stage=ProcessingStage.DELIVERY,
        retryable=exc.status_code >= 500,
      )
      self._log(
        transaction_id,
        ProcessingStage.DELIVERY,
        ProcessingStatus.FAILED,
        exc.message,
        {'error_code': exc.code, 'response': exc.response_body},
      )
      return 'FAILED'

    self.integration_repository.mark_succeeded(transaction_id)
    self._log(
      transaction_id,
      ProcessingStage.COMPLETED,
      ProcessingStatus.SUCCEEDED,
      'Apex simulator accepted the shipment status.',
      delivery.response_body,
    )
    return delivery.status

  def _record_failure(self, transaction_id: UUID, failure: ClassifiedIntegrationFailure) -> None:
    self.integration_repository.mark_failed(transaction_id, failure.stage)
    self.integration_repository.append_error(
      transaction_id=transaction_id,
      category=failure.category,
      error_code=failure.code,
      safe_message=failure.message,
      stage=failure.stage,
      retryable=failure.retryable,
    )
    self._log(
      transaction_id,
      failure.stage,
      ProcessingStatus.FAILED,
      failure.message,
      {'error_code': failure.code},
    )

  def _log(
    self,
    transaction_id: UUID,
    stage: ProcessingStage,
    status: ProcessingStatus,
    message: str,
    metadata: dict[str, object] | None = None,
  ) -> UUID:
    return self.integration_repository.append_log(
      ProcessingLog(
        transaction_id=transaction_id,
        stage=stage,
        status=status,
        message=message,
        metadata=metadata or {},
      )
    )
