from uuid import UUID

from fastapi import APIRouter, Depends, status
from psycopg import Error as PsycopgError

from app.api.dependencies import get_load_repository
from app.core.security import require_read_access, require_write_access
from app.models.errors import ErrorCode, MidwestAPIError
from app.repositories.loads import MidwestLoadRepository
from app.services.sftp_transport import MidwestSftpFunctionalAcknowledgmentDispatchService

router = APIRouter(prefix='/v1', tags=['functional acknowledgments'])


@router.get(
  '/loads/{customer_shipment_number}/functional-acknowledgments',
  dependencies=[Depends(require_read_access)],
)
def list_functional_acknowledgments(
  customer_shipment_number: str,
  repository: MidwestLoadRepository = Depends(get_load_repository),
) -> dict[str, object]:
  try:
    acknowledgments = repository.fetch_functional_acknowledgments(customer_shipment_number)
  except PsycopgError as exc:
    raise MidwestAPIError(
      status.HTTP_503_SERVICE_UNAVAILABLE,
      ErrorCode.DEPENDENCY_ERROR,
      'Midwest functional acknowledgment readback is temporarily unavailable.',
    ) from exc
  if acknowledgments is None:
    raise MidwestAPIError(
      status.HTTP_404_NOT_FOUND,
      ErrorCode.LOAD_NOT_FOUND,
      f'Load {customer_shipment_number} was not found.',
    )
  return {
    'customerShipmentNumber': customer_shipment_number,
    'functionalAcknowledgments': [
      {
        'outboundDocumentId': str(row['outbound_document_id']),
        'inboundDocumentId': str(row['inbound_document_id']),
        'documentType': row['document_type'],
        'acknowledgmentStatus': row['acknowledgment_status'],
        'transactionAckCode': row['transaction_ack_code'],
        'groupAckCode': row['group_ack_code'],
        'acknowledgedGroupControlNumber': row['acknowledged_group_control_number'],
        'acknowledgedTransactionControlNumber': row['acknowledged_transaction_control_number'],
        'processingStatus': row['processing_status'],
        'transport': row['transport'],
        'remotePath': row['remote_path'],
        'generatedAt': row['generated_at'].isoformat() if row['generated_at'] else None,
        'deliveredAt': row['delivered_at'].isoformat() if row['delivered_at'] else None,
      }
      for row in acknowledgments
    ],
  }


@router.post(
  '/functional-acknowledgments/{outbound_document_id}/dispatch-sftp',
  status_code=status.HTTP_202_ACCEPTED,
  dependencies=[Depends(require_write_access)],
)
def dispatch_functional_acknowledgment_sftp(
  outbound_document_id: UUID,
  repository: MidwestLoadRepository = Depends(get_load_repository),
) -> dict[str, object]:
  try:
    result = MidwestSftpFunctionalAcknowledgmentDispatchService(repository=repository).dispatch(outbound_document_id)
  except Exception as exc:
    raise MidwestAPIError(
      status.HTTP_503_SERVICE_UNAVAILABLE,
      ErrorCode.DEPENDENCY_ERROR,
      'Midwest 997 SFTP dispatch failed.',
    ) from exc
  if result is None:
    raise MidwestAPIError(
      status.HTTP_404_NOT_FOUND,
      ErrorCode.DOCUMENT_NOT_FOUND,
      f'No Midwest 997 is available for outbound document {outbound_document_id}.',
    )
  return result
