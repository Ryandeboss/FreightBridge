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
  TenderResponse,
  Transport,
)
from app.infrastructure.repositories import (
  FreightBridgeRepository,
  IntegrationRepository,
  ShipmentNotFoundForTenderError,
  TenderAlreadyDecidedError,
)
from app.integrations.apex.tender_response_client import (
  ApexTenderResponseClient,
  ApexTenderResponseDeliveryError,
  serialized_apex_tender_response_payload,
)
from app.integrations.common.errors import ClassifiedIntegrationFailure, IntegrationAPIError
from app.integrations.common.ingestion import payload_sha256
from app.integrations.midwest.constants import MIDWEST_PARTNER_CODE
from app.integrations.midwest.mapping_990 import Midwest990MappingError, map_midwest_990
from app.integrations.midwest.security import midwest_inbound_token_is_valid
from app.integrations.x12 import X12Error, parse_x12, validate_x12_envelopes


MIDWEST_990_DOCUMENT_TYPE = '990'
APEX_TENDER_RESPONSE_DOCUMENT_TYPE = 'APEX_TENDER_RESPONSE'
APEX_PARTNER_CODE = 'APEX'


@dataclass(frozen=True)
class Midwest990IngestionResult:
  status: str
  correlation_id: str
  transaction_id: UUID
  shipment_number: str
  decision: str
  apex_delivery_status: str

  def response_body(self) -> dict[str, object]:
    return {
      'status': self.status,
      'correlationId': self.correlation_id,
      'transactionId': str(self.transaction_id),
      'shipmentNumber': self.shipment_number,
      'decision': self.decision,
      'apexDelivery': {
        'status': self.apex_delivery_status,
      },
    }


class Midwest990IngestionService:
  def __init__(
    self,
    *,
    audit_connection=None,
    business_connection=None,
    connection=None,
    freightbridge_repository: FreightBridgeRepository | None = None,
    integration_repository: IntegrationRepository | None = None,
    apex_client: ApexTenderResponseClient | None = None,
  ) -> None:
    resolved_audit_connection = audit_connection or connection
    resolved_business_connection = business_connection or connection
    if resolved_audit_connection is None or resolved_business_connection is None:
      raise ValueError('audit_connection and business_connection are required')

    self.audit_connection = resolved_audit_connection
    self.business_connection = resolved_business_connection
    self.freightbridge_repository = freightbridge_repository or FreightBridgeRepository(resolved_business_connection)
    self.integration_repository = integration_repository or IntegrationRepository(resolved_audit_connection)
    self.apex_client = apex_client or ApexTenderResponseClient()

  def ingest(
    self,
    *,
    raw_body: bytes,
    authorization_header: str | None,
    correlation_id: str,
  ) -> Midwest990IngestionResult:
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
        transport=Transport.REST,
        message_format=MessageFormat.X12,
        document_type=MIDWEST_990_DOCUMENT_TYPE,
        payload_hash=payload_sha256(raw_body),
        processing_status=ProcessingStatus.RECEIVED,
        processing_stage=ProcessingStage.RECEIVED,
        received_at=received_at,
      )
    )
    self._log(transaction_id, ProcessingStage.RECEIVED, ProcessingStatus.RECEIVED, 'Midwest 990 received.')

    try:
      self._authenticate(transaction_id, authorization_header)
      mapped = self._parse_validate_and_map(transaction_id, raw_body)
      self.integration_repository.update_x12_metadata(
        transaction_id,
        business_identifier=mapped.shipment_number,
        x12_version=mapped.x12_version,
        interchange_control_number=mapped.interchange_control_number,
        group_control_number=mapped.group_control_number,
        transaction_control_number=mapped.transaction_control_number,
      )
      tender_response = self._persist(transaction_id, mapped, partner['id'], received_at)
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
        message='A downstream dependency failed while processing the Midwest 990.',
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
      'Midwest 990 persisted as canonical tender response.',
      {'shipment_number': mapped.shipment_number, 'decision': mapped.decision.value},
    )
    apex_delivery_status = self._forward_to_apex(
      parent_transaction_id=transaction_id,
      correlation_id=correlation_id,
      shipment_number=mapped.shipment_number,
      tender_response=tender_response,
    )
    return Midwest990IngestionResult(
      status='ACCEPTED',
      correlation_id=correlation_id,
      transaction_id=transaction_id,
      shipment_number=mapped.shipment_number,
      decision=mapped.decision.value,
      apex_delivery_status=apex_delivery_status,
    )

  def _authenticate(self, transaction_id: UUID, authorization_header: str | None) -> None:
    self.integration_repository.update_processing_state(
      transaction_id,
      ProcessingStatus.PROCESSING,
      ProcessingStage.AUTHENTICATION,
    )
    if not midwest_inbound_token_is_valid(authorization_header):
      raise ClassifiedIntegrationFailure(
        status_code=401,
        code='AUTHENTICATION_ERROR',
        message='Missing or invalid Midwest partner bearer token.',
        category=ErrorCategory.AUTHENTICATION_ERROR,
        stage=ProcessingStage.AUTHENTICATION,
      )
    self._log(
      transaction_id,
      ProcessingStage.AUTHENTICATION,
      ProcessingStatus.SUCCEEDED,
      'Midwest partner authentication succeeded.',
      {'partner_code': MIDWEST_PARTNER_CODE},
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
        message='Midwest 990 failed X12 envelope parsing or validation.',
        category=ErrorCategory.SYNTAX_ERROR,
        stage=ProcessingStage.PARSING,
      ) from exc
    self._log(transaction_id, ProcessingStage.PARSING, ProcessingStatus.SUCCEEDED, 'Midwest 990 X12 envelope parsed.')

    self.integration_repository.update_processing_state(
      transaction_id,
      ProcessingStatus.PROCESSING,
      ProcessingStage.MAPPING,
    )
    try:
      mapped = map_midwest_990(interchange)
    except Midwest990MappingError as exc:
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
      'Midwest 990 mapped to canonical tender response.',
      {'shipment_number': mapped.shipment_number, 'decision': mapped.decision.value},
    )
    return mapped

  def _persist(self, transaction_id: UUID, mapped, carrier_partner_id: UUID, received_at: datetime) -> TenderResponse:
    self.integration_repository.update_processing_state(
      transaction_id,
      ProcessingStatus.PROCESSING,
      ProcessingStage.BUSINESS_VALIDATION,
    )
    tender_response = TenderResponse(
      shipment_id=UUID(int=0),
      carrier_partner_id=carrier_partner_id,
      decision=mapped.decision,
      carrier_load_number=mapped.carrier_load_number,
      reason_code=mapped.reason_code,
      message=None,
      decided_at=mapped.decided_at,
      received_at=received_at,
      source_transaction_id=transaction_id,
    )
    with self.business_connection.transaction():
      try:
        persisted = self.freightbridge_repository.record_tender_response(
          tender_response,
          mapped.shipment_number,
        )
      except ShipmentNotFoundForTenderError as exc:
        raise ClassifiedIntegrationFailure(
          status_code=404,
          code='SHIPMENT_NOT_FOUND',
          message='Canonical shipment was not found.',
          category=ErrorCategory.BUSINESS_VALIDATION_ERROR,
          stage=ProcessingStage.BUSINESS_VALIDATION,
        ) from exc
      except TenderAlreadyDecidedError as exc:
        raise ClassifiedIntegrationFailure(
          status_code=409,
          code='TENDER_ALREADY_DECIDED',
          message='Canonical shipment already has a final tender decision.',
          category=ErrorCategory.DUPLICATE_TRANSACTION,
          stage=ProcessingStage.BUSINESS_VALIDATION,
        ) from exc

    return tender_response.model_copy(update={'id': persisted['id'], 'shipment_id': persisted['shipment_id']})

  def _forward_to_apex(
    self,
    *,
    parent_transaction_id: UUID,
    correlation_id: str,
    shipment_number: str,
    tender_response: TenderResponse,
  ) -> str:
    partner = self.freightbridge_repository.fetch_trading_partner_by_code(APEX_PARTNER_CODE)
    if partner is None or not partner['active']:
      return 'FAILED'

    payload = serialized_apex_tender_response_payload(
      shipment_number=shipment_number,
      response=tender_response,
    )
    transaction_id = self.integration_repository.create_transaction(
      IntegrationTransaction(
        correlation_id=correlation_id,
        partner_id=partner['id'],
        direction=IntegrationDirection.OUTBOUND,
        transport=Transport.REST,
        message_format=MessageFormat.JSON,
        document_type=APEX_TENDER_RESPONSE_DOCUMENT_TYPE,
        business_identifier=shipment_number,
        payload_hash=payload_sha256(payload),
        processing_status=ProcessingStatus.PROCESSING,
        processing_stage=ProcessingStage.ROUTING,
        parent_transaction_id=parent_transaction_id,
        received_at=datetime.now(timezone.utc),
      )
    )
    self._log(transaction_id, ProcessingStage.ROUTING, ProcessingStatus.SUCCEEDED, 'Apex tender-response route selected.')

    try:
      self.integration_repository.update_processing_state(
        transaction_id,
        ProcessingStatus.PROCESSING,
        ProcessingStage.DELIVERY,
      )
      delivery = self.apex_client.deliver_tender_response(
        shipment_number=shipment_number,
        response=tender_response,
      )
    except ApexTenderResponseDeliveryError as exc:
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
      'Apex simulator accepted the tender response.',
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
