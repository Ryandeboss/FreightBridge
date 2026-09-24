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
)
from app.infrastructure.configuration_repository import IntegrationConfigurationRepository
from app.infrastructure.repositories import FreightBridgeRepository, IntegrationRepository
from app.integrations.configuration import ensure_partner_capability_enabled, load_active_mapping_profile
from app.integrations.common.errors import ClassifiedIntegrationFailure
from app.integrations.common.ingestion import payload_sha256
from app.integrations.common.idempotency import IdempotencyKeyError, normalize_idempotency_key, semantic_fingerprint
from app.integrations.midwest.constants import MIDWEST_PARTNER_CODE
from app.integrations.midwest.service import Midwest204GenerationService
from app.integrations.midwest.transport import (
  MidwestDeliveryError,
  MidwestOutboundTransport,
)
from app.models.configuration import Midwest204MappingConfig


@dataclass(frozen=True)
class MidwestDirectDispatchResult:
  status: str
  shipment_number: str
  document_type: str
  transport: str
  transaction_id: UUID
  midwest: dict[str, object]
  idempotent_replay: bool = False
  original_transaction_id: UUID | None = None

  def response_body(self) -> dict[str, object]:
    body: dict[str, object] = {
      'status': self.status,
      'shipmentNumber': self.shipment_number,
      'documentType': self.document_type,
      'transport': self.transport,
      'transactionId': str(self.transaction_id),
      'midwest': self.midwest,
      'idempotentReplay': self.idempotent_replay,
    }
    if self.original_transaction_id is not None:
      body['originalTransactionId'] = str(self.original_transaction_id)
    if isinstance(self.midwest.get('remotePath'), str):
      body['remotePath'] = self.midwest['remotePath']
    if isinstance(self.midwest.get('fileName'), str):
      body['fileName'] = self.midwest['fileName']
    return body


class MidwestDirectDispatchService:
  def __init__(
    self,
    *,
    audit_connection,
    business_connection,
    transport: MidwestOutboundTransport,
    freightbridge_repository: FreightBridgeRepository | None = None,
    integration_repository: IntegrationRepository | None = None,
    configuration_repository: IntegrationConfigurationRepository | None = None,
    generation_service: Midwest204GenerationService | None = None,
  ) -> None:
    self.audit_connection = audit_connection
    self.business_connection = business_connection
    self.transport = transport
    self.freightbridge_repository = freightbridge_repository or FreightBridgeRepository(
      business_connection
    )
    self.integration_repository = integration_repository or IntegrationRepository(
      audit_connection
    )
    self.configuration_repository = configuration_repository
    self.generation_service = generation_service or Midwest204GenerationService(
      repository=self.freightbridge_repository
    )

  def dispatch(
    self,
    *,
    shipment_number: str,
    correlation_id: str,
    idempotency_key: str | None = None,
  ) -> MidwestDirectDispatchResult:
    partner = self.freightbridge_repository.fetch_trading_partner_by_code(MIDWEST_PARTNER_CODE)
    if partner is None or not partner['active']:
      raise MidwestDeliveryError(
        status_code=503,
        code='DEPENDENCY_ERROR',
        message='Midwest trading partner is not available.',
        category=ErrorCategory.DOWNSTREAM_ERROR,
        retryable=True,
      )

    normalized_idempotency_key = self._normalize_key_or_raise(idempotency_key)
    idempotency_record_id = None
    if normalized_idempotency_key is not None:
      idempotency_record_id, replay_result = self._handle_idempotency(
        partner_id=partner['id'],
        shipment_number=shipment_number,
        idempotency_key=normalized_idempotency_key,
      )
      if replay_result is not None:
        return replay_result

    active_mapping = None
    if self.configuration_repository is not None:
      try:
        ensure_partner_capability_enabled(
          self.configuration_repository,
          partner_code=MIDWEST_PARTNER_CODE,
          direction=IntegrationDirection.OUTBOUND.value,
          document_type='204',
          transport=self.transport.integration_transport.value,
          message_format=MessageFormat.X12.value,
          protocol_version='004010',
        )
        active_mapping = load_active_mapping_profile(
          self.configuration_repository,
          'CANONICAL_TO_MWCX_204',
          Midwest204MappingConfig,
        )
      except ClassifiedIntegrationFailure as exc:
        raise MidwestDeliveryError(
          status_code=exc.status_code,
          code=exc.code,
          message=exc.message,
          category=exc.category,
          stage=exc.stage,
          retryable=exc.retryable,
        ) from exc

    generated = self.generation_service.generate_for_shipment_number(
      shipment_number,
      config=active_mapping.config if active_mapping is not None else None,
    )
    transaction_id = self.integration_repository.create_transaction(
      IntegrationTransaction(
        correlation_id=correlation_id,
        partner_id=partner['id'],
        direction=IntegrationDirection.OUTBOUND,
        transport=self.transport.integration_transport,
        message_format=MessageFormat.X12,
        document_type=generated.document_type,
        business_identifier=generated.shipment_number,
        x12_version=generated.x12_version,
        interchange_control_number=generated.interchange_control_number,
        group_control_number=generated.group_control_number,
        transaction_control_number=generated.transaction_control_number,
        payload_hash=payload_sha256(generated.serialized_x12.encode('utf-8')),
        processing_status=ProcessingStatus.PROCESSING,
        processing_stage=ProcessingStage.MAPPING,
        mapping_profile_id=active_mapping.id if active_mapping is not None else None,
        mapping_profile_version=active_mapping.version_number if active_mapping is not None else None,
        mapping_key=active_mapping.mapping_key if active_mapping is not None else None,
        received_at=datetime.now(timezone.utc),
      )
    )
    self._log(
      transaction_id,
      ProcessingStage.MAPPING,
      ProcessingStatus.SUCCEEDED,
      'Midwest 204 generated.',
      active_mapping.audit_metadata() if active_mapping is not None else {},
    )
    self.integration_repository.store_message_payload(
      transaction_id=transaction_id,
      media_type='application/edi-x12',
      payload_sha256=payload_sha256(generated.serialized_x12.encode('utf-8')),
      payload_text=generated.serialized_x12,
    )
    self._log(
      transaction_id,
      ProcessingStage.ROUTING,
      ProcessingStatus.SUCCEEDED,
      f'Midwest {self.transport.transport_name} transport selected.',
    )

    try:
      self.integration_repository.update_processing_state(
        transaction_id,
        ProcessingStatus.PROCESSING,
        ProcessingStage.DELIVERY,
      )
      delivery = self.transport.deliver_204(
        generated=generated,
        correlation_id=correlation_id,
      )
      remote_path = delivery.response_body.get('remotePath')
      if isinstance(remote_path, str):
        self.integration_repository.update_raw_payload_location(transaction_id, remote_path)
    except MidwestDeliveryError as exc:
      self._record_failure(transaction_id, exc)
      self._mark_idempotency_failed_if_present(idempotency_record_id, transaction_id)
      raise
    except psycopg.Error as exc:
      failure = MidwestDeliveryError(
        status_code=503,
        code='DEPENDENCY_ERROR',
        message='A downstream dependency failed during Midwest dispatch.',
        category=ErrorCategory.DOWNSTREAM_ERROR,
        retryable=True,
      )
      self._record_failure(transaction_id, failure)
      self._mark_idempotency_failed_if_present(idempotency_record_id, transaction_id)
      raise failure from exc

    self.integration_repository.mark_succeeded(transaction_id)
    self._log(
      transaction_id,
      ProcessingStage.COMPLETED,
      ProcessingStatus.SUCCEEDED,
      'Midwest X12 204 delivered.',
      {'transport': self.transport.transport_name},
    )
    result = MidwestDirectDispatchResult(
      status='DELIVERED_TO_MIDWEST_TEST_GATEWAY' if self.transport.transport_name == 'REST_TEST_HARNESS' else 'DELIVERED_TO_MIDWEST_SFTP',
      shipment_number=generated.shipment_number,
      document_type=generated.document_type,
      transport=self.transport.transport_name,
      transaction_id=transaction_id,
      midwest=delivery.response_body,
    )
    if idempotency_record_id is not None:
      self.integration_repository.mark_idempotency_succeeded(
        idempotency_record_id,
        original_transaction_id=transaction_id,
        business_identifier=generated.shipment_number,
        response_snapshot=result.response_body(),
      )
    return result

  def _normalize_key_or_raise(self, idempotency_key: str | None) -> str | None:
    try:
      return normalize_idempotency_key(idempotency_key)
    except IdempotencyKeyError as exc:
      raise MidwestDeliveryError(
        status_code=400,
        code='INVALID_IDEMPOTENCY_KEY',
        message=str(exc),
        category=ErrorCategory.BUSINESS_VALIDATION_ERROR,
      ) from exc

  def _handle_idempotency(
    self,
    *,
    partner_id: UUID,
    shipment_number: str,
    idempotency_key: str,
  ) -> tuple[UUID, MidwestDirectDispatchResult | None]:
    request_fingerprint = semantic_fingerprint(
      {
        'operation': 'DISPATCH_204_SFTP',
        'shipmentNumber': shipment_number,
        'partnerCode': MIDWEST_PARTNER_CODE,
        'transport': self.transport.transport_name,
        'mappingProfile': 'midwest-204',
      }
    )
    record = self.integration_repository.acquire_idempotency_record(
      partner_id=partner_id,
      direction=IntegrationDirection.OUTBOUND,
      document_type='204',
      operation='DISPATCH_204_SFTP',
      idempotency_key=idempotency_key,
      request_fingerprint=request_fingerprint,
      business_identifier=shipment_number,
    )
    if record.get('acquired'):
      return record['id'], None
    if record['request_fingerprint'] != request_fingerprint:
      raise MidwestDeliveryError(
        status_code=409,
        code='IDEMPOTENCY_KEY_REUSE',
        message='Idempotency-Key was already used for a different Midwest 204 dispatch.',
        category=ErrorCategory.DUPLICATE_TRANSACTION,
      )
    if record['status'] == 'PROCESSING':
      raise MidwestDeliveryError(
        status_code=409,
        code='IDEMPOTENCY_IN_PROGRESS',
        message='An operation with this Idempotency-Key is still processing.',
        category=ErrorCategory.DUPLICATE_TRANSACTION,
      )
    if record['status'] == 'FAILED':
      raise MidwestDeliveryError(
        status_code=409,
        code='IDEMPOTENCY_PREVIOUS_FAILURE',
        message='An operation with this Idempotency-Key previously failed.',
        category=ErrorCategory.DUPLICATE_TRANSACTION,
      )
    snapshot = record.get('response_snapshot') or {}
    original_transaction_id = record.get('original_transaction_id')
    if original_transaction_id is None:
      raise MidwestDeliveryError(
        status_code=409,
        code='IDEMPOTENCY_PREVIOUS_FAILURE',
        message='The previous idempotent operation does not have a replayable response.',
        category=ErrorCategory.DUPLICATE_TRANSACTION,
      )
    self.integration_repository.record_idempotent_replay(record['id'])
    return record['id'], MidwestDirectDispatchResult(
      status=str(snapshot.get('status', 'DELIVERED_TO_MIDWEST_SFTP')),
      shipment_number=str(snapshot.get('shipmentNumber', shipment_number)),
      document_type=str(snapshot.get('documentType', '204')),
      transport=str(snapshot.get('transport', self.transport.transport_name)),
      transaction_id=original_transaction_id,
      midwest=dict(snapshot.get('midwest') or {}),
      idempotent_replay=True,
      original_transaction_id=original_transaction_id,
    )

  def _mark_idempotency_failed_if_present(self, record_id: UUID | None, transaction_id: UUID) -> None:
    if record_id is not None and hasattr(self.integration_repository, 'mark_idempotency_failed'):
      self.integration_repository.mark_idempotency_failed(record_id, original_transaction_id=transaction_id)

  def _record_failure(self, transaction_id: UUID, failure: MidwestDeliveryError) -> None:
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
