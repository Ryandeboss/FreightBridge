from dataclasses import dataclass

import httpx

from app.core.config import get_settings
from app.domain import ErrorCategory, ProcessingStage, Transport
from app.integrations.midwest.models import Midwest204GenerationResult
from app.integrations.midwest.sftp_client import (
  MidwestSftpAuthenticationError,
  MidwestSftpClient,
  MidwestSftpConfigurationError,
  MidwestSftpError,
  MidwestSftpFileConflictError,
  MidwestSftpHostKeyError,
)


@dataclass(frozen=True)
class MidwestDeliveryResult:
  status: str
  status_code: int
  response_body: dict[str, object]


@dataclass
class MidwestDeliveryError(Exception):
  status_code: int
  code: str
  message: str
  category: ErrorCategory
  stage: ProcessingStage = ProcessingStage.DELIVERY
  retryable: bool = False
  response_body: dict[str, object] | None = None


class MidwestOutboundTransport:
  transport_name = 'REST_TEST_HARNESS'
  integration_transport = Transport.REST

  def deliver_204(
    self,
    *,
    generated: Midwest204GenerationResult,
    correlation_id: str,
  ) -> MidwestDeliveryResult:
    raise NotImplementedError


class MidwestHttpTestTransport(MidwestOutboundTransport):
  transport_name = 'REST_TEST_HARNESS'
  integration_transport = Transport.REST

  def __init__(
    self,
    *,
    base_url: str | None = None,
    bearer_token: str | None = None,
    timeout_seconds: float = 10.0,
  ) -> None:
    settings = get_settings()
    self.base_url = base_url or settings.midwest_sim_base_url
    self.bearer_token = bearer_token or settings.midwest_sim_bearer_token
    self.timeout_seconds = timeout_seconds

  def deliver_204(
    self,
    *,
    generated: Midwest204GenerationResult,
    correlation_id: str,
  ) -> MidwestDeliveryResult:
    if not self.base_url or not self.bearer_token:
      raise MidwestDeliveryError(
        status_code=503,
        code='DEPENDENCY_ERROR',
        message='Midwest simulator dispatch configuration is incomplete.',
        category=ErrorCategory.DOWNSTREAM_ERROR,
        retryable=True,
      )

    try:
      response = httpx.post(
        self.base_url.rstrip('/') + '/v1/edi/inbound/204',
        content=generated.serialized_x12.encode('utf-8'),
        headers={
          'Authorization': f'Bearer {self.bearer_token}',
          'Content-Type': 'application/edi-x12',
          'X-Correlation-ID': correlation_id,
        },
        timeout=self.timeout_seconds,
      )
    except (httpx.TimeoutException, httpx.HTTPError) as exc:
      raise MidwestDeliveryError(
        status_code=503,
        code='DEPENDENCY_ERROR',
        message='Midwest simulator could not be reached.',
        category=ErrorCategory.DOWNSTREAM_ERROR,
        retryable=True,
      ) from exc

    body = _safe_json(response)
    if response.status_code == 202:
      return MidwestDeliveryResult(
        status='ACCEPTED',
        status_code=response.status_code,
        response_body=body,
      )
    if response.status_code == 409:
      raise MidwestDeliveryError(
        status_code=409,
        code='DUPLICATE_LOAD',
        message='Midwest simulator already has this load.',
        category=ErrorCategory.DUPLICATE_TRANSACTION,
        response_body=body,
      )
    if response.status_code in (401, 403):
      raise MidwestDeliveryError(
        status_code=503,
        code='DEPENDENCY_ERROR',
        message='Midwest simulator rejected FreightBridge authentication.',
        category=ErrorCategory.AUTHENTICATION_ERROR,
        response_body=body,
      )
    if response.status_code == 422:
      raise MidwestDeliveryError(
        status_code=422,
        code='MIDWEST_REJECTED_X12',
        message='Midwest simulator rejected the generated X12 204.',
        category=ErrorCategory.BUSINESS_VALIDATION_ERROR,
        response_body=body,
      )

    raise MidwestDeliveryError(
      status_code=503,
      code='DEPENDENCY_ERROR',
      message='Midwest simulator returned an unexpected response.',
      category=ErrorCategory.DOWNSTREAM_ERROR,
      retryable=True,
      response_body=body,
    )


class MidwestSftpTransport(MidwestOutboundTransport):
  transport_name = 'SFTP'
  integration_transport = Transport.SFTP

  def __init__(
    self,
    *,
    client_factory=MidwestSftpClient,
    remote_directory: str = '/inbound',
  ) -> None:
    self.client_factory = client_factory
    self.remote_directory = remote_directory

  def deliver_204(
    self,
    *,
    generated: Midwest204GenerationResult,
    correlation_id: str,
  ) -> MidwestDeliveryResult:
    filename = sftp_204_filename(generated.interchange_control_number)
    try:
      with self.client_factory() as client:
        remote_path = client.upload_bytes_atomic(
          self.remote_directory,
          filename,
          generated.serialized_x12.encode('utf-8'),
        )
    except MidwestSftpFileConflictError as exc:
      raise MidwestDeliveryError(
        status_code=409,
        code='SFTP_FILE_CONFLICT',
        message='SFTP destination file already exists.',
        category=ErrorCategory.DUPLICATE_TRANSACTION,
      ) from exc
    except MidwestSftpHostKeyError as exc:
      raise MidwestDeliveryError(
        status_code=503,
        code='SFTP_HOST_KEY_MISMATCH',
        message='Midwest SFTP host-key verification failed.',
        category=ErrorCategory.AUTHENTICATION_ERROR,
      ) from exc
    except MidwestSftpAuthenticationError as exc:
      raise MidwestDeliveryError(
        status_code=503,
        code='SFTP_AUTHENTICATION_FAILED',
        message='Midwest SFTP authentication failed.',
        category=ErrorCategory.AUTHENTICATION_ERROR,
      ) from exc
    except MidwestSftpConfigurationError as exc:
      raise MidwestDeliveryError(
        status_code=503,
        code='DEPENDENCY_ERROR',
        message='Midwest SFTP dispatch configuration is incomplete.',
        category=ErrorCategory.DOWNSTREAM_ERROR,
        retryable=True,
      ) from exc
    except MidwestSftpError as exc:
      raise MidwestDeliveryError(
        status_code=503,
        code='DEPENDENCY_ERROR',
        message='Midwest SFTP delivery failed.',
        category=ErrorCategory.TRANSPORT_ERROR,
        retryable=True,
      ) from exc

    return MidwestDeliveryResult(
      status='DELIVERED',
      status_code=202,
      response_body={
        'status': 'DELIVERED',
        'transport': self.transport_name,
        'remotePath': remote_path,
        'fileName': filename,
        'customerShipmentNumber': generated.shipment_number,
        'documentType': generated.document_type,
      },
    )

  def deliver_existing_204(
    self,
    *,
    payload_text: str,
    interchange_control_number: str,
    shipment_number: str,
  ) -> MidwestDeliveryResult:
    filename = sftp_204_filename(interchange_control_number)
    payload = payload_text.encode('utf-8')
    try:
      with self.client_factory() as client:
        if hasattr(client, 'upload_bytes_atomic_reconcile_identical'):
          remote_path, disposition = client.upload_bytes_atomic_reconcile_identical(
            self.remote_directory,
            filename,
            payload,
          )
        else:
          remote_path = client.upload_bytes_atomic(self.remote_directory, filename, payload)
          disposition = 'UPLOADED'
    except MidwestSftpFileConflictError as exc:
      raise MidwestDeliveryError(
        status_code=409,
        code='SFTP_FILE_CONFLICT',
        message='SFTP destination file already exists.',
        category=ErrorCategory.DUPLICATE_TRANSACTION,
      ) from exc
    except MidwestSftpError as exc:
      raise MidwestDeliveryError(
        status_code=503,
        code='DEPENDENCY_ERROR',
        message='Midwest SFTP delivery failed.',
        category=ErrorCategory.TRANSPORT_ERROR,
        retryable=True,
      ) from exc

    return MidwestDeliveryResult(
      status='DELIVERED',
      status_code=202,
      response_body={
        'status': 'DELIVERED',
        'transport': self.transport_name,
        'remotePath': remote_path,
        'fileName': filename,
        'customerShipmentNumber': shipment_number,
        'documentType': '204',
        'deliveryDisposition': disposition,
      },
    )


def sftp_204_filename(interchange_control_number: str) -> str:
  return f'APEX_MWCX_204_{interchange_control_number}.edi'


def _safe_json(response: httpx.Response) -> dict[str, object]:
  try:
    body = response.json()
    return body if isinstance(body, dict) else {'body': body}
  except ValueError:
    return {'status': 'UNKNOWN'}
