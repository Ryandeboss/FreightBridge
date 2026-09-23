from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import UUID

import psycopg

from app.domain import (
  ErrorCategory,
  FunctionalAcknowledgmentStatus,
  IntegrationDirection,
  IntegrationTransaction,
  MessageFormat,
  ProcessingLog,
  ProcessingStage,
  ProcessingStatus,
  Transport,
)
from app.infrastructure.repositories import FreightBridgeRepository, IntegrationRepository
from app.integrations.common.errors import ClassifiedIntegrationFailure, IntegrationAPIError
from app.integrations.common.ingestion import payload_sha256
from app.integrations.midwest.constants import MIDWEST_PARTNER_CODE
from app.integrations.midwest.mapping_997 import Midwest997MappingError, map_midwest_997
from app.integrations.x12 import X12Error, parse_x12, validate_x12_envelopes


MIDWEST_997_DOCUMENT_TYPE = '997'


@dataclass(frozen=True)
class Midwest997IngestionResult:
  status: str
  correlation_id: str
  transaction_id: UUID
  shipment_number: str
  acknowledged_document_type: str
  acknowledgment_status: FunctionalAcknowledgmentStatus
  transaction_ack_code: str
  group_ack_code: str
  acknowledged_transaction_id: UUID

  def response_body(self) -> dict[str, object]:
    return {
      'status': self.status,
      'correlationId': self.correlation_id,
      'transactionId': str(self.transaction_id),
      'shipmentNumber': self.shipment_number,
      'acknowledgedDocumentType': self.acknowledged_document_type,
      'acknowledgmentStatus': self.acknowledgment_status.value,
      'transactionAckCode': self.transaction_ack_code,
      'groupAckCode': self.group_ack_code,
      'acknowledgedTransactionId': str(self.acknowledged_transaction_id),
    }


class Midwest997IngestionService:
  def __init__(
    self,
    *,
    audit_connection=None,
    business_connection=None,
    connection=None,
    freightbridge_repository: FreightBridgeRepository | None = None,
    integration_repository: IntegrationRepository | None = None,
  ) -> None:
    resolved_audit_connection = audit_connection or connection
    resolved_business_connection = business_connection or connection
    if resolved_audit_connection is None or resolved_business_connection is None:
      raise ValueError('audit_connection and business_connection are required')

    self.audit_connection = resolved_audit_connection
    self.business_connection = resolved_business_connection
    self.freightbridge_repository = freightbridge_repository or FreightBridgeRepository(resolved_business_connection)
    self.integration_repository = integration_repository or IntegrationRepository(resolved_audit_connection)

  def ingest(
    self,
    *,
    raw_body: bytes,
    correlation_id: str,
    transport: Transport = Transport.SFTP,
    raw_payload_location: str | None = None,
  ) -> Midwest997IngestionResult:
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
        document_type=MIDWEST_997_DOCUMENT_TYPE,
        raw_payload_location=raw_payload_location,
        payload_hash=payload_sha256(raw_body),
        processing_status=ProcessingStatus.RECEIVED,
        processing_stage=ProcessingStage.RECEIVED,
        received_at=received_at,
      )
    )
    self._log(transaction_id, ProcessingStage.RECEIVED, ProcessingStatus.RECEIVED, 'Midwest 997 received.')

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
        business_identifier='UNRESOLVED_997',
        x12_version=mapped.x12_version,
        interchange_control_number=mapped.interchange_control_number,
        group_control_number=mapped.group_control_number,
        transaction_control_number=mapped.transaction_control_number,
      )
      original = self._correlate_original_204(transaction_id, partner['id'], mapped)
      shipment_number = str(original['business_identifier'])
      self.integration_repository.update_parent_transaction(transaction_id, original['id'], shipment_number)
      self.integration_repository.create_functional_acknowledgment(
        ack_transaction_id=transaction_id,
        acknowledged_transaction_id=original['id'],
        partner_id=partner['id'],
        acknowledged_document_type='204',
        functional_identifier=mapped.functional_identifier,
        acknowledged_group_control_number=mapped.acknowledged_group_control_number,
        transaction_set_identifier=mapped.transaction_set_identifier,
        acknowledged_transaction_control_number=mapped.acknowledged_transaction_control_number,
        transaction_ack_code=mapped.transaction_ack_code,
        group_ack_code=mapped.group_ack_code,
        transaction_sets_included=mapped.transaction_sets_included,
        transaction_sets_received=mapped.transaction_sets_received,
        transaction_sets_accepted=mapped.transaction_sets_accepted,
        received_at=received_at,
      )
      self._log_original_acknowledgment(original['id'], mapped.status)
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
        message='A downstream dependency failed while processing the Midwest 997.',
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
      'Midwest 997 persisted as technical functional acknowledgment.',
      {
        'shipment_number': shipment_number,
        'acknowledgment_status': mapped.status.value,
        'acknowledged_transaction_id': str(original['id']),
      },
    )
    return Midwest997IngestionResult(
      status='ACCEPTED',
      correlation_id=correlation_id,
      transaction_id=transaction_id,
      shipment_number=shipment_number,
      acknowledged_document_type='204',
      acknowledgment_status=mapped.status,
      transaction_ack_code=mapped.transaction_ack_code,
      group_ack_code=mapped.group_ack_code,
      acknowledged_transaction_id=original['id'],
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
        message='Midwest 997 failed X12 envelope parsing or validation.',
        category=ErrorCategory.SYNTAX_ERROR,
        stage=ProcessingStage.PARSING,
      ) from exc
    self._log(transaction_id, ProcessingStage.PARSING, ProcessingStatus.SUCCEEDED, 'Midwest 997 X12 envelope parsed.')

    self.integration_repository.update_processing_state(
      transaction_id,
      ProcessingStatus.PROCESSING,
      ProcessingStage.MAPPING,
    )
    try:
      mapped = map_midwest_997(interchange)
    except Midwest997MappingError as exc:
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
      'Midwest 997 mapped to technical acknowledgment.',
      {
        'functional_identifier': mapped.functional_identifier,
        'acknowledged_group_control_number': mapped.acknowledged_group_control_number,
        'acknowledged_transaction_control_number': mapped.acknowledged_transaction_control_number,
        'acknowledgment_status': mapped.status.value,
      },
    )
    return mapped

  def _correlate_original_204(self, transaction_id: UUID, partner_id: UUID, mapped) -> dict[str, object]:
    self.integration_repository.update_processing_state(
      transaction_id,
      ProcessingStatus.PROCESSING,
      ProcessingStage.BUSINESS_VALIDATION,
    )
    matches = self.integration_repository.find_acknowledged_outbound_204(
      partner_id=partner_id,
      group_control_number=mapped.acknowledged_group_control_number,
      transaction_control_number=mapped.acknowledged_transaction_control_number,
    )
    if not matches:
      raise ClassifiedIntegrationFailure(
        status_code=422,
        code='ACKNOWLEDGED_204_NOT_FOUND',
        message='No original outbound 204 matched the Midwest 997 AK1/AK2 control numbers.',
        category=ErrorCategory.BUSINESS_VALIDATION_ERROR,
        stage=ProcessingStage.BUSINESS_VALIDATION,
      )
    if len(matches) > 1:
      raise ClassifiedIntegrationFailure(
        status_code=422,
        code='AMBIGUOUS_ACKNOWLEDGED_204',
        message='Multiple outbound 204 transactions matched the Midwest 997 AK1/AK2 control numbers.',
        category=ErrorCategory.BUSINESS_VALIDATION_ERROR,
        stage=ProcessingStage.BUSINESS_VALIDATION,
      )
    return matches[0]

  def _log_original_acknowledgment(self, transaction_id: UUID, ack_status: FunctionalAcknowledgmentStatus) -> None:
    if ack_status == FunctionalAcknowledgmentStatus.ACCEPTED:
      self._log(
        transaction_id,
        ProcessingStage.ACKNOWLEDGMENT,
        ProcessingStatus.SUCCEEDED,
        'Midwest 997 functionally acknowledged the outbound 204.',
      )
      return

    self.integration_repository.append_error(
      transaction_id=transaction_id,
      category=ErrorCategory.SYNTAX_ERROR,
      error_code='997_REJECTED',
      safe_message='Midwest 997 reported technical rejection of the outbound 204.',
      stage=ProcessingStage.ACKNOWLEDGMENT,
      retryable=False,
    )
    self._log(
      transaction_id,
      ProcessingStage.ACKNOWLEDGMENT,
      ProcessingStatus.FAILED,
      'Midwest 997 reported technical rejection of the outbound 204.',
    )

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
