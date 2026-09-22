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
from app.infrastructure.repositories import FreightBridgeRepository, IntegrationRepository
from app.integrations.common.ingestion import payload_sha256
from app.integrations.midwest.constants import MIDWEST_PARTNER_CODE
from app.integrations.midwest.service import Midwest204GenerationService
from app.integrations.midwest.transport import (
  MidwestDeliveryError,
  MidwestOutboundTransport,
)


@dataclass(frozen=True)
class MidwestDirectDispatchResult:
  status: str
  shipment_number: str
  document_type: str
  transport: str
  transaction_id: UUID
  midwest: dict[str, object]

  def response_body(self) -> dict[str, object]:
    body: dict[str, object] = {
      'status': self.status,
      'shipmentNumber': self.shipment_number,
      'documentType': self.document_type,
      'transport': self.transport,
      'transactionId': str(self.transaction_id),
      'midwest': self.midwest,
    }
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
    self.generation_service = generation_service or Midwest204GenerationService(
      repository=self.freightbridge_repository
    )

  def dispatch(self, *, shipment_number: str, correlation_id: str) -> MidwestDirectDispatchResult:
    partner = self.freightbridge_repository.fetch_trading_partner_by_code(MIDWEST_PARTNER_CODE)
    if partner is None or not partner['active']:
      raise MidwestDeliveryError(
        status_code=503,
        code='DEPENDENCY_ERROR',
        message='Midwest trading partner is not available.',
        category=ErrorCategory.DOWNSTREAM_ERROR,
        retryable=True,
      )

    generated = self.generation_service.generate_for_shipment_number(shipment_number)
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
        received_at=datetime.now(timezone.utc),
      )
    )
    self._log(transaction_id, ProcessingStage.MAPPING, ProcessingStatus.SUCCEEDED, 'Midwest 204 generated.')
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
      raise failure from exc

    self.integration_repository.mark_succeeded(transaction_id)
    self._log(
      transaction_id,
      ProcessingStage.COMPLETED,
      ProcessingStatus.SUCCEEDED,
      'Midwest X12 204 delivered.',
      {'transport': self.transport.transport_name},
    )
    return MidwestDirectDispatchResult(
      status='DELIVERED_TO_MIDWEST_TEST_GATEWAY' if self.transport.transport_name == 'REST_TEST_HARNESS' else 'DELIVERED_TO_MIDWEST_SFTP',
      shipment_number=generated.shipment_number,
      document_type=generated.document_type,
      transport=self.transport.transport_name,
      transaction_id=transaction_id,
      midwest=delivery.response_body,
    )

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
