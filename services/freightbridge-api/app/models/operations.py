from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class OperationsModel(BaseModel):
  model_config = ConfigDict(populate_by_name=True)


class PartnerView(OperationsModel):
  id: UUID
  partner_code: str = Field(alias='partnerCode')
  partner_name: str = Field(alias='partnerName')


class TransactionSummary(OperationsModel):
  id: UUID
  correlation_id: str = Field(alias='correlationId')
  partner_code: str = Field(alias='partnerCode')
  partner_name: str = Field(alias='partnerName')
  direction: str
  transport: str
  message_format: str = Field(alias='messageFormat')
  document_type: str = Field(alias='documentType')
  business_identifier: str | None = Field(alias='businessIdentifier')
  x12_version: str | None = Field(alias='x12Version')
  interchange_control_number: str | None = Field(alias='interchangeControlNumber')
  group_control_number: str | None = Field(alias='groupControlNumber')
  transaction_control_number: str | None = Field(alias='transactionControlNumber')
  processing_status: str = Field(alias='processingStatus')
  processing_stage: str = Field(alias='processingStage')
  retry_count: int = Field(alias='retryCount')
  parent_transaction_id: UUID | None = Field(alias='parentTransactionId')
  replay_of_transaction_id: UUID | None = Field(default=None, alias='replayOfTransactionId')
  mapping_profile_id: UUID | None = Field(default=None, alias='mappingProfileId')
  mapping_profile_version: int | None = Field(default=None, alias='mappingProfileVersion')
  mapping_key: str | None = Field(default=None, alias='mappingKey')
  received_at: datetime | None = Field(alias='receivedAt')
  processed_at: datetime | None = Field(alias='processedAt')
  created_at: datetime = Field(alias='createdAt')
  updated_at: datetime = Field(alias='updatedAt')
  error_count: int = Field(alias='errorCount')


class ProcessingLogView(OperationsModel):
  id: UUID
  transaction_id: UUID = Field(alias='transactionId')
  stage: str
  status: str
  message: str
  metadata: dict[str, object]
  created_at: datetime = Field(alias='createdAt')


class IntegrationErrorView(OperationsModel):
  id: UUID = Field(alias='errorId')
  transaction_id: UUID = Field(alias='transactionId')
  business_identifier: str | None = Field(default=None, alias='businessIdentifier')
  partner_code: str | None = Field(default=None, alias='partnerCode')
  document_type: str | None = Field(default=None, alias='documentType')
  category: str
  error_code: str = Field(alias='errorCode')
  safe_message: str = Field(alias='safeMessage')
  stage: str
  retryable: bool
  resolved: bool
  resolution_note: str | None = Field(alias='resolutionNote')
  resolved_by_transaction_id: UUID | None = Field(default=None, alias='resolvedByTransactionId')
  created_at: datetime = Field(alias='createdAt')
  resolved_at: datetime | None = Field(alias='resolvedAt')
  correlation_id: str | None = Field(default=None, alias='correlationId')


class TransactionDetail(OperationsModel):
  id: UUID
  correlation_id: str = Field(alias='correlationId')
  partner: PartnerView
  direction: str
  transport: str
  message_format: str = Field(alias='messageFormat')
  document_type: str = Field(alias='documentType')
  business_identifier: str | None = Field(alias='businessIdentifier')
  x12_version: str | None = Field(alias='x12Version')
  interchange_control_number: str | None = Field(alias='interchangeControlNumber')
  group_control_number: str | None = Field(alias='groupControlNumber')
  transaction_control_number: str | None = Field(alias='transactionControlNumber')
  payload_hash: str | None = Field(alias='payloadHash')
  raw_payload_location: str | None = Field(alias='rawPayloadLocation')
  processing_status: str = Field(alias='processingStatus')
  processing_stage: str = Field(alias='processingStage')
  retry_count: int = Field(alias='retryCount')
  parent_transaction_id: UUID | None = Field(alias='parentTransactionId')
  replay_of_transaction_id: UUID | None = Field(default=None, alias='replayOfTransactionId')
  mapping_profile_id: UUID | None = Field(default=None, alias='mappingProfileId')
  mapping_profile_version: int | None = Field(default=None, alias='mappingProfileVersion')
  mapping_key: str | None = Field(default=None, alias='mappingKey')
  received_at: datetime | None = Field(alias='receivedAt')
  processed_at: datetime | None = Field(alias='processedAt')
  created_at: datetime = Field(alias='createdAt')
  updated_at: datetime = Field(alias='updatedAt')


class RetryAttemptView(OperationsModel):
  id: UUID
  original_transaction_id: UUID = Field(alias='originalTransactionId')
  retry_transaction_id: UUID = Field(alias='retryTransactionId')
  attempt_number: int = Field(alias='attemptNumber')
  status: str
  note: str | None
  delivery_disposition: str | None = Field(alias='deliveryDisposition')
  error_code: str | None = Field(alias='errorCode')
  safe_message: str | None = Field(alias='safeMessage')
  created_at: datetime = Field(alias='createdAt')
  completed_at: datetime | None = Field(alias='completedAt')


class TransactionDetailResponse(OperationsModel):
  transaction: TransactionDetail
  parent: TransactionSummary | None
  children: list[TransactionSummary]
  retry_attempts: list[RetryAttemptView] = Field(default_factory=list, alias='retryAttempts')
  logs: list[ProcessingLogView]
  errors: list[IntegrationErrorView]


class TransactionSearchResponse(OperationsModel):
  limit: int
  offset: int
  count: int
  transactions: list[TransactionSummary]


class TraceLink(OperationsModel):
  parent_transaction_id: UUID = Field(alias='parentTransactionId')
  child_transaction_id: UUID = Field(alias='childTransactionId')


class BusinessTraceResponse(OperationsModel):
  business_identifier: str = Field(alias='businessIdentifier')
  transaction_count: int = Field(alias='transactionCount')
  failed_transaction_count: int = Field(alias='failedTransactionCount')
  unresolved_error_count: int = Field(alias='unresolvedErrorCount')
  transactions: list[TransactionSummary]
  links: list[TraceLink]


class CorrelationLookupResponse(OperationsModel):
  correlation_id: str = Field(alias='correlationId')
  transaction_count: int = Field(alias='transactionCount')
  transactions: list[TransactionSummary]


class ErrorQueueResponse(OperationsModel):
  limit: int
  offset: int
  count: int
  errors: list[IntegrationErrorView]


class ErrorDetailResponse(OperationsModel):
  error: IntegrationErrorView
  transaction: TransactionSummary
  logs: list[ProcessingLogView]


class ResolveErrorRequest(OperationsModel):
  note: str | None = Field(default=None, max_length=500)


class RetryTransactionRequest(OperationsModel):
  note: str | None = Field(default=None, max_length=500)


class RetryTransactionResponse(OperationsModel):
  status: str
  original_transaction_id: UUID = Field(alias='originalTransactionId')
  retry_transaction_id: UUID | None = Field(default=None, alias='retryTransactionId')
  attempt_number: int | None = Field(default=None, alias='attemptNumber')
  document_type: str | None = Field(default=None, alias='documentType')
  business_identifier: str | None = Field(default=None, alias='businessIdentifier')
  transport: str | None = None
  file_name: str | None = Field(default=None, alias='fileName')
  remote_path: str | None = Field(default=None, alias='remotePath')
  delivery_disposition: str | None = Field(default=None, alias='deliveryDisposition')


class OperationalSummary(OperationsModel):
  hours: int
  generated_at: datetime = Field(alias='generatedAt')
  transactions_total: int = Field(alias='transactionsTotal')
  transactions_succeeded: int = Field(alias='transactionsSucceeded')
  transactions_failed: int = Field(alias='transactionsFailed')
  transactions_processing: int = Field(alias='transactionsProcessing')
  unresolved_errors: int = Field(alias='unresolvedErrors')
  retryable_unresolved_errors: int = Field(alias='retryableUnresolvedErrors')
  by_error_category: dict[str, int] = Field(alias='byErrorCategory')
  by_document_type: dict[str, int] = Field(alias='byDocumentType')
