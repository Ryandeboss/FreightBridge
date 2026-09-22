import hashlib
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request, status

from app.api.dependencies import get_load_repository
from app.core.security import require_write_access
from app.edi import X12ReceiveError, parse_midwest_204
from app.models.errors import ErrorCode, MidwestAPIError
from app.repositories.loads import DuplicateLoadError, MidwestLoadRepository

router = APIRouter(prefix='/v1/edi', tags=['edi'])


@router.post(
  '/inbound/204',
  status_code=status.HTTP_202_ACCEPTED,
  dependencies=[Depends(require_write_access)],
)
async def receive_204(
  request: Request,
  repository: MidwestLoadRepository = Depends(get_load_repository),
) -> dict[str, object]:
  raw_body = await request.body()
  raw_text = _safe_text(raw_body)
  payload_hash = hashlib.sha256(raw_body).hexdigest()
  document_id = repository.create_inbound_document(
    payload_hash=payload_hash,
    raw_x12=raw_text,
    status='RECEIVED',
  )

  parsed = None
  try:
    parsed = parse_midwest_204(raw_body)
    midwest_load_id = repository.create_load_from_204(parsed)
    repository.mark_document_accepted(document_id, parsed)
  except X12ReceiveError as exc:
    repository.mark_document_rejected(
      document_id,
      error_code=exc.code.value,
      safe_error_message=exc.message,
      parsed=parsed,
    )
    raise MidwestAPIError(_status_for_receive_error(exc), exc.code, exc.message) from exc
  except DuplicateLoadError as exc:
    if parsed is not None:
      repository.mark_document_rejected(
        document_id,
        error_code=ErrorCode.DUPLICATE_LOAD.value,
        safe_error_message='Midwest already has a load for this customer shipment number.',
        parsed=parsed,
      )
    raise MidwestAPIError(
      status.HTTP_409_CONFLICT,
      ErrorCode.DUPLICATE_LOAD,
      'Midwest already has a load for this customer shipment number.',
    ) from exc

  return {
    'status': 'ACCEPTED',
    'documentType': '204',
    'customerShipmentNumber': parsed.cust_ship_no,
    'interchangeControlNumber': parsed.interchange_control_number,
    'transactionControlNumber': parsed.transaction_control_number,
    'midwestLoadId': str(midwest_load_id),
    'receivedAt': datetime.now(timezone.utc).isoformat(),
  }


def _status_for_receive_error(exc: X12ReceiveError) -> int:
  if exc.code in (
    ErrorCode.INVALID_X12,
    ErrorCode.UNSUPPORTED_X12_VERSION,
    ErrorCode.BUSINESS_VALIDATION_ERROR,
  ):
    return status.HTTP_422_UNPROCESSABLE_ENTITY
  return status.HTTP_400_BAD_REQUEST


def _safe_text(raw_body: bytes) -> str:
  try:
    return raw_body.decode('utf-8')
  except UnicodeDecodeError:
    return ''
