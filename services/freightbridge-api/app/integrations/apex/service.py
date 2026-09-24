from dataclasses import dataclass
from datetime import datetime, timezone
import json
import logging
from uuid import UUID

import psycopg
from pydantic import ValidationError

from app.domain import (
  ErrorCategory,
  IntegrationDirection,
  IntegrationTransaction,
  MessageFormat,
  ProcessingLog,
  ProcessingStage,
  ProcessingStatus,
  Transport,
)
from app.infrastructure.configuration_repository import IntegrationConfigurationRepository
from app.infrastructure.repositories import FreightBridgeRepository, IntegrationRepository
from app.integrations.configuration import ensure_partner_capability_enabled, load_active_mapping_profile
from app.integrations.apex.mapper import ApexMappingError, map_apex_load_to_canonical
from app.integrations.apex.models import ApexInboundLoad
from app.integrations.apex.security import apex_inbound_token_is_valid
from app.integrations.common.errors import ClassifiedIntegrationFailure, IntegrationAPIError
from app.integrations.common.idempotency import IdempotencyKeyError, normalize_idempotency_key, semantic_fingerprint
from app.integrations.common.ingestion import payload_sha256
from app.models.configuration import ApexLoadMappingConfig


APEX_PARTNER_CODE = 'APEX'
APEX_DOCUMENT_TYPE = 'APEX_LOAD_TENDER'
logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ApexIngestionResult:
  status: str
  correlation_id: str
  transaction_id: UUID
  shipment_id: UUID
  shipment_number: str
  idempotent_replay: bool = False
  original_transaction_id: UUID | None = None

  def response_body(self) -> dict[str, object]:
    body = {
      'status': self.status,
      'correlationId': self.correlation_id,
      'transactionId': str(self.transaction_id),
      'shipmentId': str(self.shipment_id),
      'shipmentNumber': self.shipment_number,
      'idempotentReplay': self.idempotent_replay,
    }
    if self.original_transaction_id is not None:
      body['originalTransactionId'] = str(self.original_transaction_id)
    return body


class ApexLoadTenderIngestionService:
  def __init__(
    self,
    *,
    audit_connection=None,
    business_connection=None,
    connection=None,
    freightbridge_repository: FreightBridgeRepository | None = None,
    integration_repository: IntegrationRepository | None = None,
    configuration_repository: IntegrationConfigurationRepository | None = None,
  ) -> None:
    resolved_audit_connection = audit_connection or connection
    resolved_business_connection = business_connection or connection
    if resolved_audit_connection is None or resolved_business_connection is None:
      raise ValueError('audit_connection and business_connection are required')

    self.audit_connection = resolved_audit_connection
    self.business_connection = resolved_business_connection
    self.freightbridge_repository = freightbridge_repository or FreightBridgeRepository(
      resolved_business_connection
    )
    self.integration_repository = integration_repository or IntegrationRepository(
      resolved_audit_connection
    )
    self.configuration_repository = configuration_repository

  def ingest(
    self,
    *,
    raw_body: bytes,
    authorization_header: str | None,
    correlation_id: str,
    idempotency_key: str | None = None,
  ) -> ApexIngestionResult:
    received_at = datetime.now(timezone.utc)
    partner = self.freightbridge_repository.fetch_trading_partner_by_code(APEX_PARTNER_CODE)
    if partner is None or not partner['active']:
      raise IntegrationAPIError(
        status_code=503,
        code='DEPENDENCY_ERROR',
        message='Apex trading partner is not available.',
        correlation_id=correlation_id,
      )

    transaction_id = self.integration_repository.create_transaction(
      IntegrationTransaction(
        correlation_id=correlation_id,
        partner_id=partner['id'],
        direction=IntegrationDirection.INBOUND,
        transport=Transport.REST,
        message_format=MessageFormat.JSON,
        document_type=APEX_DOCUMENT_TYPE,
        payload_hash=payload_sha256(raw_body),
        processing_status=ProcessingStatus.RECEIVED,
        processing_stage=ProcessingStage.RECEIVED,
        received_at=received_at,
      )
    )
    self._log(
      transaction_id,
      ProcessingStage.RECEIVED,
      ProcessingStatus.RECEIVED,
      'Apex load tender received.',
      {'partner_code': APEX_PARTNER_CODE},
    )

    idempotency_record_id = None
    try:
      normalized_idempotency_key = normalize_idempotency_key(idempotency_key)
      self._authenticate(transaction_id, authorization_header)
      self._ensure_capability_enabled()
      parsed_payload = self._parse(transaction_id, raw_body)
      apex_load = self._validate(transaction_id, parsed_payload)
      self.integration_repository.update_business_identifier(transaction_id, apex_load.load_id)
      if normalized_idempotency_key is not None:
        idempotency_record_id, replay_result = self._handle_idempotency(
          transaction_id=transaction_id,
          partner_id=partner['id'],
          idempotency_key=normalized_idempotency_key,
          apex_load=apex_load,
          correlation_id=correlation_id,
        )
        if replay_result is not None:
          return replay_result
      mapping_result = self._map(transaction_id, apex_load, partner['id'])
      shipment_id = self._persist(transaction_id, mapping_result.shipment, apex_load.load_id)
    except ClassifiedIntegrationFailure as exc:
      self._record_failure(transaction_id, exc)
      self._mark_idempotency_failed_if_present(idempotency_record_id, transaction_id)
      raise IntegrationAPIError(
        status_code=exc.status_code,
        code=exc.code,
        message=exc.message,
        correlation_id=correlation_id,
        transaction_id=str(transaction_id),
      ) from exc
    except IdempotencyKeyError as exc:
      failure = ClassifiedIntegrationFailure(
        status_code=400,
        code='INVALID_IDEMPOTENCY_KEY',
        message=str(exc),
        category=ErrorCategory.BUSINESS_VALIDATION_ERROR,
        stage=ProcessingStage.VALIDATION,
      )
      self._record_failure(transaction_id, failure)
      raise IntegrationAPIError(
        status_code=failure.status_code,
        code=failure.code,
        message=failure.message,
        correlation_id=correlation_id,
        transaction_id=str(transaction_id),
      ) from exc
    except psycopg.Error as exc:
      failure = ClassifiedIntegrationFailure(
        status_code=503,
        code='DEPENDENCY_ERROR',
        message='A downstream dependency failed while processing the Apex load tender.',
        category=ErrorCategory.DOWNSTREAM_ERROR,
        stage=ProcessingStage.BUSINESS_VALIDATION,
        retryable=True,
      )
      self._record_failure(transaction_id, failure)
      self._mark_idempotency_failed_if_present(idempotency_record_id, transaction_id)
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
      'Canonical shipment persisted successfully.',
      {'shipment_number': mapping_result.shipment.shipment_number},
    )
    result = ApexIngestionResult(
      status='ACCEPTED',
      correlation_id=correlation_id,
      transaction_id=transaction_id,
      shipment_id=shipment_id,
      shipment_number=mapping_result.shipment.shipment_number,
    )
    if normalized_idempotency_key is not None:
      self.integration_repository.mark_idempotency_succeeded(
        idempotency_record_id,
        original_transaction_id=transaction_id,
        business_identifier=apex_load.load_id,
        response_snapshot=result.response_body(),
      )
    return result

  def _handle_idempotency(
    self,
    *,
    transaction_id: UUID,
    partner_id: UUID,
    idempotency_key: str,
    apex_load: ApexInboundLoad,
    correlation_id: str,
  ) -> tuple[UUID, ApexIngestionResult | None]:
    request_fingerprint = semantic_fingerprint(apex_load.model_dump(mode='json', by_alias=True))
    record = self.integration_repository.acquire_idempotency_record(
      partner_id=partner_id,
      direction=IntegrationDirection.INBOUND,
      document_type=APEX_DOCUMENT_TYPE,
      operation='RECEIVE_LOAD_TENDER',
      idempotency_key=idempotency_key,
      request_fingerprint=request_fingerprint,
      business_identifier=apex_load.load_id,
    )
    if record.get('acquired'):
      return record['id'], None
    if record['request_fingerprint'] != request_fingerprint:
      raise ClassifiedIntegrationFailure(
        status_code=409,
        code='IDEMPOTENCY_KEY_REUSE',
        message='Idempotency-Key was already used for a different Apex load tender.',
        category=ErrorCategory.DUPLICATE_TRANSACTION,
        stage=ProcessingStage.BUSINESS_VALIDATION,
      )
    if record['status'] == 'PROCESSING':
      raise ClassifiedIntegrationFailure(
        status_code=409,
        code='IDEMPOTENCY_IN_PROGRESS',
        message='An operation with this Idempotency-Key is still processing.',
        category=ErrorCategory.DUPLICATE_TRANSACTION,
        stage=ProcessingStage.BUSINESS_VALIDATION,
      )
    if record['status'] == 'FAILED':
      raise ClassifiedIntegrationFailure(
        status_code=409,
        code='IDEMPOTENCY_PREVIOUS_FAILURE',
        message='An operation with this Idempotency-Key previously failed.',
        category=ErrorCategory.DUPLICATE_TRANSACTION,
        stage=ProcessingStage.BUSINESS_VALIDATION,
      )
    snapshot = record.get('response_snapshot') or {}
    original_transaction_id = record.get('original_transaction_id')
    original_shipment_id = snapshot.get('shipmentId')
    if original_transaction_id is None or original_shipment_id is None:
      raise ClassifiedIntegrationFailure(
        status_code=409,
        code='IDEMPOTENCY_PREVIOUS_FAILURE',
        message='The previous idempotent operation does not have a replayable response.',
        category=ErrorCategory.DUPLICATE_TRANSACTION,
        stage=ProcessingStage.BUSINESS_VALIDATION,
      )
    self.integration_repository.record_idempotent_replay(record['id'])
    self.integration_repository.mark_replay(
      transaction_id,
      original_transaction_id=original_transaction_id,
      business_identifier=apex_load.load_id,
    )
    self.integration_repository.mark_succeeded(transaction_id)
    self._log(
      transaction_id,
      ProcessingStage.COMPLETED,
      ProcessingStatus.SUCCEEDED,
      'Idempotent Apex request replay returned the original successful result.',
      {'original_transaction_id': str(original_transaction_id)},
    )
    return record['id'], ApexIngestionResult(
      status='ACCEPTED',
      correlation_id=correlation_id,
      transaction_id=transaction_id,
      shipment_id=UUID(str(original_shipment_id)),
      shipment_number=str(snapshot.get('shipmentNumber', apex_load.load_id)),
      idempotent_replay=True,
      original_transaction_id=original_transaction_id,
    )

  def _mark_idempotency_failed_if_present(self, record_id: UUID | None, transaction_id: UUID) -> None:
    if record_id is not None and hasattr(self.integration_repository, 'mark_idempotency_failed'):
      self.integration_repository.mark_idempotency_failed(record_id, original_transaction_id=transaction_id)

  def _ensure_capability_enabled(self) -> None:
    if self.configuration_repository is None:
      return
    ensure_partner_capability_enabled(
      self.configuration_repository,
      partner_code=APEX_PARTNER_CODE,
      direction=IntegrationDirection.INBOUND.value,
      document_type=APEX_DOCUMENT_TYPE,
      transport=Transport.REST.value,
      message_format=MessageFormat.JSON.value,
      protocol_version='v1',
    )

  def _authenticate(self, transaction_id: UUID, authorization_header: str | None) -> None:
    self.integration_repository.update_processing_state(
      transaction_id,
      ProcessingStatus.PROCESSING,
      ProcessingStage.AUTHENTICATION,
    )
    if not apex_inbound_token_is_valid(authorization_header):
      raise ClassifiedIntegrationFailure(
        status_code=401,
        code='AUTHENTICATION_ERROR',
        message='Missing or invalid Apex partner bearer token.',
        category=ErrorCategory.AUTHENTICATION_ERROR,
        stage=ProcessingStage.AUTHENTICATION,
      )
    self._log(
      transaction_id,
      ProcessingStage.AUTHENTICATION,
      ProcessingStatus.SUCCEEDED,
      'Apex partner authentication succeeded.',
      {'partner_code': APEX_PARTNER_CODE},
    )

  def _parse(self, transaction_id: UUID, raw_body: bytes) -> object:
    self.integration_repository.update_processing_state(
      transaction_id,
      ProcessingStatus.PROCESSING,
      ProcessingStage.PARSING,
    )
    try:
      parsed_payload = json.loads(raw_body.decode('utf-8'))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
      raise ClassifiedIntegrationFailure(
        status_code=400,
        code='INVALID_JSON',
        message='Request body is not valid JSON.',
        category=ErrorCategory.SYNTAX_ERROR,
        stage=ProcessingStage.PARSING,
      ) from exc
    self._log(
      transaction_id,
      ProcessingStage.PARSING,
      ProcessingStatus.SUCCEEDED,
      'JSON payload parsed.',
    )
    return parsed_payload

  def _validate(self, transaction_id: UUID, parsed_payload: object) -> ApexInboundLoad:
    self.integration_repository.update_processing_state(
      transaction_id,
      ProcessingStatus.PROCESSING,
      ProcessingStage.VALIDATION,
    )
    try:
      apex_load = ApexInboundLoad.model_validate(parsed_payload)
    except ValidationError as exc:
      raise ClassifiedIntegrationFailure(
        status_code=422,
        code='INVALID_APEX_LOAD',
        message='Apex load tender failed contract validation.',
        category=ErrorCategory.BUSINESS_VALIDATION_ERROR,
        stage=ProcessingStage.VALIDATION,
      ) from exc
    self._log(
      transaction_id,
      ProcessingStage.VALIDATION,
      ProcessingStatus.SUCCEEDED,
      'Apex load tender passed contract validation.',
      {'loadId': apex_load.load_id},
    )
    return apex_load

  def _map(self, transaction_id: UUID, apex_load: ApexInboundLoad, partner_id: UUID):
    self.integration_repository.update_processing_state(
      transaction_id,
      ProcessingStatus.PROCESSING,
      ProcessingStage.MAPPING,
    )
    try:
      active_mapping = None
      if self.configuration_repository is not None:
        active_mapping = load_active_mapping_profile(
          self.configuration_repository,
          'APEX_LOAD_TO_CANONICAL',
          ApexLoadMappingConfig,
        )
        self.integration_repository.update_mapping_audit(
          transaction_id,
          mapping_profile_id=active_mapping.id,
          mapping_profile_version=active_mapping.version_number,
          mapping_key=active_mapping.mapping_key,
        )
      mapping_result = map_apex_load_to_canonical(
        apex_load,
        partner_id,
        config=active_mapping.config if active_mapping is not None else None,
      )
    except ApexMappingError as exc:
      raise ClassifiedIntegrationFailure(
        status_code=422,
        code='MAPPING_FAILED',
        message='Apex load tender could not be mapped to a canonical shipment.',
        category=ErrorCategory.MAPPING_ERROR,
        stage=ProcessingStage.MAPPING,
      ) from exc
    self._log(
      transaction_id,
      ProcessingStage.MAPPING,
      ProcessingStatus.SUCCEEDED,
      'Apex load tender mapped to canonical shipment.',
      {
        **mapping_result.metadata,
        **(active_mapping.audit_metadata() if active_mapping is not None else {}),
      },
    )
    return mapping_result

  def _persist(self, transaction_id: UUID, shipment, load_id: str) -> UUID:
    self.integration_repository.update_processing_state(
      transaction_id,
      ProcessingStatus.PROCESSING,
      ProcessingStage.BUSINESS_VALIDATION,
    )
    with self.business_connection.transaction():
      if self.freightbridge_repository.shipment_exists(shipment.shipment_number):
        raise ClassifiedIntegrationFailure(
          status_code=409,
          code='DUPLICATE_SHIPMENT',
          message='A canonical shipment already exists for this Apex load.',
          category=ErrorCategory.DUPLICATE_TRANSACTION,
          stage=ProcessingStage.BUSINESS_VALIDATION,
        )
      self._log(
        transaction_id,
        ProcessingStage.BUSINESS_VALIDATION,
        ProcessingStatus.SUCCEEDED,
        'Canonical shipment passed persistence validation.',
        {'loadId': load_id, 'shipment_number': shipment.shipment_number},
      )
      return self.freightbridge_repository.create_shipment(shipment)

  def _record_failure(self, transaction_id: UUID, failure: ClassifiedIntegrationFailure) -> None:
    self._attempt_failure_audit_write(
      'mark transaction failed',
      lambda: self.integration_repository.mark_failed(transaction_id, failure.stage),
    )
    self._attempt_failure_audit_write(
      'append integration error',
      lambda: self.integration_repository.append_error(
        transaction_id=transaction_id,
        category=failure.category,
        error_code=failure.code,
        safe_message=failure.message,
        stage=failure.stage,
        retryable=failure.retryable,
      ),
    )
    self._attempt_failure_audit_write(
      'append failure processing log',
      lambda: self._log(
        transaction_id,
        failure.stage,
        ProcessingStatus.FAILED,
        failure.message,
        {'error_code': failure.code},
      ),
    )

  def _attempt_failure_audit_write(self, operation: str, action) -> None:
    try:
      action()
    except psycopg.Error as exc:
      logger.warning(
        'Apex ingestion failure audit write failed during %s: %s',
        operation,
        exc.__class__.__name__,
      )
    except Exception as exc:
      logger.warning(
        'Apex ingestion failure audit write failed during %s: %s',
        operation,
        exc.__class__.__name__,
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
