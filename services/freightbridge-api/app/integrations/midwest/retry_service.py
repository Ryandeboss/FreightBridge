from __future__ import annotations

from uuid import UUID

from app.infrastructure.operations_repository import OperationsRepository
from app.integrations.midwest.transport import MidwestDeliveryError, MidwestSftpTransport


MAX_MANUAL_RETRY_ATTEMPTS = 3


class RetryNotFoundError(Exception):
  pass


class RetryRejectedError(Exception):
  def __init__(self, code: str, status_code: int = 409) -> None:
    self.code = code
    self.status_code = status_code
    super().__init__(code)


class Midwest204ManualRetryService:
  def __init__(
    self,
    *,
    repository: OperationsRepository,
    transport: MidwestSftpTransport | None = None,
  ) -> None:
    self.repository = repository
    self.transport = transport or MidwestSftpTransport()

  def retry(self, transaction_id: UUID, *, note: str | None = None) -> dict[str, object]:
    attempt = self.repository.begin_retry_attempt(
      transaction_id,
      note=note,
      max_attempts=MAX_MANUAL_RETRY_ATTEMPTS,
    )
    if attempt is None:
      raise RetryNotFoundError()
    if attempt['status'] == 'ALREADY_RECOVERED':
      original = attempt['original']
      return {
        'status': 'ALREADY_RECOVERED',
        'originalTransactionId': transaction_id,
        'documentType': original.get('document_type'),
        'businessIdentifier': original.get('business_identifier'),
        'transport': original.get('transport'),
      }
    if attempt['status'] in ('TRANSACTION_NOT_RETRYABLE', 'RETRY_LIMIT_EXCEEDED', 'RETRY_IN_PROGRESS'):
      raise RetryRejectedError(str(attempt['status']))

    original = attempt['original']
    payload = attempt['payload']
    retry_transaction_id = attempt['retry_transaction_id']
    retry_attempt_id = attempt['retry_attempt_id']
    try:
      delivery = self.transport.deliver_existing_204(
        payload_text=payload['payload_text'],
        interchange_control_number=original['interchange_control_number'],
        shipment_number=original['business_identifier'],
      )
    except MidwestDeliveryError as exc:
      self.repository.complete_retry_failure(
        retry_attempt_id=retry_attempt_id,
        retry_transaction_id=retry_transaction_id,
        error_code=exc.code,
        safe_message=exc.message,
      )
      raise

    body = delivery.response_body
    self.repository.complete_retry_success(
      retry_attempt_id=retry_attempt_id,
      original_transaction_id=transaction_id,
      retry_transaction_id=retry_transaction_id,
      remote_path=body.get('remotePath') if isinstance(body.get('remotePath'), str) else None,
      delivery_disposition=str(body.get('deliveryDisposition') or 'UPLOADED'),
    )
    return {
      'status': 'SUCCEEDED',
      'originalTransactionId': transaction_id,
      'retryTransactionId': retry_transaction_id,
      'attemptNumber': attempt['attempt_number'],
      'documentType': original['document_type'],
      'businessIdentifier': original['business_identifier'],
      'transport': original['transport'],
      'fileName': body.get('fileName'),
      'remotePath': body.get('remotePath'),
      'deliveryDisposition': body.get('deliveryDisposition') or 'UPLOADED',
    }
