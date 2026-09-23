import hashlib
from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import UUID

from app.edi import X12ReceiveError, parse_midwest_204
from app.edi.parser import Parsed204
from app.models.errors import ErrorCode
from app.repositories.loads import DuplicateLoadError, MidwestLoadRepository


@dataclass(frozen=True)
class Midwest204ReceiveResult:
  document_id: UUID
  midwest_load_id: UUID
  parsed: Parsed204
  functional_acknowledgment: dict[str, object] | None = None

  def response_body(self) -> dict[str, object]:
    body: dict[str, object] = {
      'status': 'ACCEPTED',
      'documentType': '204',
      'customerShipmentNumber': self.parsed.cust_ship_no,
      'interchangeControlNumber': self.parsed.interchange_control_number,
      'transactionControlNumber': self.parsed.transaction_control_number,
      'midwestLoadId': str(self.midwest_load_id),
      'receivedAt': datetime.now(timezone.utc).isoformat(),
    }
    if self.functional_acknowledgment:
      body['functionalAcknowledgment'] = {
        'outboundDocumentId': str(self.functional_acknowledgment['outbound_document_id']),
        'status': self.functional_acknowledgment['acknowledgment_status'],
        'transactionAckCode': self.functional_acknowledgment['transaction_ack_code'],
        'groupAckCode': self.functional_acknowledgment['group_ack_code'],
      }
    return body


@dataclass(frozen=True)
class Midwest204ReplayResult(Midwest204ReceiveResult):
  def response_body(self) -> dict[str, object]:
    body = super().response_body()
    body['status'] = 'REPLAY_ACCEPTED'
    body['functionalAcknowledgment'] = None
    return body


class Midwest204ReceiveFailure(Exception):
  def __init__(self, *, status_code: int, code: ErrorCode, message: str, deterministic: bool = True) -> None:
    self.status_code = status_code
    self.code = code
    self.message = message
    self.deterministic = deterministic
    super().__init__(message)


class Midwest204ReceiveService:
  def __init__(self, repository: MidwestLoadRepository) -> None:
    self.repository = repository

  def process(
    self,
    *,
    raw_body: bytes,
    transport: str = 'REST',
    source_filename: str | None = None,
    source_path: str | None = None,
    archive_path: str | None = None,
    error_path: str | None = None,
  ) -> Midwest204ReceiveResult:
    raw_text = _safe_text(raw_body)
    document_id = self.repository.create_inbound_document(
      payload_hash=hashlib.sha256(raw_body).hexdigest(),
      raw_x12=raw_text,
      status='RECEIVED',
      transport=transport,
      source_filename=source_filename,
      source_path=source_path,
    )

    parsed = None
    try:
      parsed = parse_midwest_204(raw_body)
      replay = self.repository.find_accepted_inbound_204_by_controls(parsed)
      if replay is not None:
        if replay['payload_hash'] != hashlib.sha256(raw_body).hexdigest():
          self.repository.mark_document_rejected(
            document_id,
            error_code='X12_CONTROL_NUMBER_REUSE',
            safe_error_message='X12 controls were reused with different payload content.',
            parsed=parsed,
            error_path=error_path,
          )
          raise Midwest204ReceiveFailure(
            status_code=409,
            code=ErrorCode.X12_CONTROL_NUMBER_REUSE,
            message='X12 controls were reused with different payload content.',
          )
        self.repository.mark_document_replay(
          document_id,
          parsed,
          replay_of_document_id=replay['id'],
          archive_path=archive_path,
        )
        return Midwest204ReplayResult(
          document_id=document_id,
          midwest_load_id=replay['load_id'],
          parsed=parsed,
          functional_acknowledgment=None,
        )
      midwest_load_id = self.repository.create_load_from_204(parsed)
      self.repository.mark_document_accepted(document_id, parsed, archive_path=archive_path)
      functional_acknowledgment = self.repository.create_functional_acknowledgment_for_204(
        inbound_document_id=document_id,
        parsed=parsed,
      )
    except X12ReceiveError as exc:
      self.repository.mark_document_rejected(
        document_id,
        error_code=exc.code.value,
        safe_error_message=exc.message,
        parsed=parsed,
        error_path=error_path,
      )
      raise Midwest204ReceiveFailure(
        status_code=_status_for_receive_error(exc),
        code=exc.code,
        message=exc.message,
      ) from exc
    except DuplicateLoadError as exc:
      if parsed is not None:
        self.repository.mark_document_rejected(
          document_id,
          error_code=ErrorCode.DUPLICATE_LOAD.value,
          safe_error_message='Midwest already has a load for this customer shipment number.',
          parsed=parsed,
          error_path=error_path,
        )
      raise Midwest204ReceiveFailure(
        status_code=409,
        code=ErrorCode.DUPLICATE_LOAD,
        message='Midwest already has a load for this customer shipment number.',
      ) from exc

    return Midwest204ReceiveResult(
      document_id=document_id,
      midwest_load_id=midwest_load_id,
      parsed=parsed,
      functional_acknowledgment=functional_acknowledgment,
    )


def _status_for_receive_error(exc: X12ReceiveError) -> int:
  if exc.code in (
    ErrorCode.INVALID_X12,
    ErrorCode.UNSUPPORTED_X12_VERSION,
    ErrorCode.BUSINESS_VALIDATION_ERROR,
  ):
    return 422
  return 400


def _safe_text(raw_body: bytes) -> str:
  try:
    return raw_body.decode('utf-8')
  except UnicodeDecodeError:
    return ''
