from dataclasses import dataclass, field

from app.domain import Transport
from app.infrastructure.repositories import FreightBridgeRepository, IntegrationRepository
from app.integrations.common.errors import IntegrationAPIError
from app.integrations.midwest.inbound_214_service import Midwest214IngestionService
from app.integrations.midwest.inbound_990_service import Midwest990IngestionService
from app.integrations.midwest.sftp_client import (
  MidwestSftpClient,
  MidwestSftpError,
  MidwestSftpFileConflictError,
)
from app.integrations.x12 import X12Error, parse_x12, validate_x12_envelopes


OUTBOUND_DIR = '/outbound'
ARCHIVE_DIR = '/archive'
ERROR_DIR = '/error'


@dataclass(frozen=True)
class SftpPollFileResult:
  file_name: str
  source_path: str
  status: str
  destination_path: str | None = None
  error_code: str | None = None


@dataclass(frozen=True)
class SftpPollResult:
  status: str
  transport: str = 'SFTP'
  processed: list[SftpPollFileResult] = field(default_factory=list)
  ignored: list[str] = field(default_factory=list)

  def response_body(self) -> dict[str, object]:
    return {
      'status': self.status,
      'transport': self.transport,
      'processed': [
        {
          'fileName': item.file_name,
          'sourcePath': item.source_path,
          'status': item.status,
          'destinationPath': item.destination_path,
          'errorCode': item.error_code,
        }
        for item in self.processed
      ],
      'ignored': self.ignored,
    }


class MidwestSftpOutboundPollService:
  def __init__(
    self,
    *,
    audit_connection,
    business_connection,
    client_factory=MidwestSftpClient,
    freightbridge_repository: FreightBridgeRepository | None = None,
    integration_repository: IntegrationRepository | None = None,
    ingestion_service: Midwest990IngestionService | None = None,
    shipment_status_ingestion_service: Midwest214IngestionService | None = None,
  ) -> None:
    self.client_factory = client_factory
    self.tender_response_ingestion_service = ingestion_service or Midwest990IngestionService(
      audit_connection=audit_connection,
      business_connection=business_connection,
      freightbridge_repository=freightbridge_repository,
      integration_repository=integration_repository,
    )
    self.shipment_status_ingestion_service = shipment_status_ingestion_service or Midwest214IngestionService(
      audit_connection=audit_connection,
      business_connection=business_connection,
      freightbridge_repository=freightbridge_repository,
      integration_repository=integration_repository,
    )

  def poll(self, *, correlation_id: str) -> SftpPollResult:
    processed: list[SftpPollFileResult] = []
    ignored: list[str] = []
    with self.client_factory() as client:
      for file_name in sorted(client.listdir(OUTBOUND_DIR)):
        if _ignore_file(file_name):
          ignored.append(file_name)
          continue
        source_path = _join(OUTBOUND_DIR, file_name)
        try:
          payload = client.download_bytes(source_path)
          transaction_type = _detect_transaction_type(payload, correlation_id=f'{correlation_id}:{file_name}')
          ingestion_service = self._ingestion_service_for(transaction_type, correlation_id=f'{correlation_id}:{file_name}')
          ingestion_service.ingest(
            raw_body=payload,
            correlation_id=f'{correlation_id}:{file_name}',
            transport=Transport.SFTP,
            raw_payload_location=source_path,
          )
          destination_path = _join(ARCHIVE_DIR, file_name)
          client.rename(source_path, destination_path)
          processed.append(
            SftpPollFileResult(
              file_name=file_name,
              source_path=source_path,
              status='ARCHIVED',
              destination_path=destination_path,
            )
          )
        except IntegrationAPIError as exc:
          if exc.status_code >= 500:
            processed.append(
              SftpPollFileResult(
                file_name=file_name,
                source_path=source_path,
                status='LEFT_FOR_RETRY',
                error_code=exc.code,
              )
            )
            continue
          destination_path = _join(ERROR_DIR, file_name)
          client.rename(source_path, destination_path)
          processed.append(
            SftpPollFileResult(
              file_name=file_name,
              source_path=source_path,
              status='MOVED_TO_ERROR',
              destination_path=destination_path,
              error_code=exc.code,
            )
          )
        except MidwestSftpFileConflictError:
          processed.append(
            SftpPollFileResult(
              file_name=file_name,
              source_path=source_path,
              status='LEFT_FOR_RETRY',
              error_code='SFTP_FILE_CONFLICT',
            )
          )
        except MidwestSftpError:
          processed.append(
            SftpPollFileResult(
              file_name=file_name,
              source_path=source_path,
              status='LEFT_FOR_RETRY',
              error_code='SFTP_TRANSPORT_ERROR',
            )
          )
    return SftpPollResult(status='POLLED', processed=processed, ignored=ignored)

  def _ingestion_service_for(self, transaction_type: str, *, correlation_id: str):
    if transaction_type == '990':
      return self.tender_response_ingestion_service
    if transaction_type == '214':
      return self.shipment_status_ingestion_service
    raise IntegrationAPIError(
      status_code=422,
      code='UNSUPPORTED_TRANSACTION_SET',
      message='Unsupported Midwest outbound X12 transaction set.',
      correlation_id=correlation_id,
    )


class MidwestSftpReadinessService:
  def __init__(self, *, client_factory=MidwestSftpClient) -> None:
    self.client_factory = client_factory

  def check(self) -> dict[str, object]:
    directories = {}
    with self.client_factory() as client:
      for directory in ("/inbound", OUTBOUND_DIR, ARCHIVE_DIR, ERROR_DIR):
        directories[directory.removeprefix('/')] = client.exists(directory)
    return {
      'status': 'ready' if all(directories.values()) else 'not_ready',
      'transport': 'SFTP',
      'directories': directories,
    }


def _ignore_file(file_name: str) -> bool:
  return file_name.startswith('.') or file_name.endswith('.part') or not file_name.endswith('.edi')


def _join(directory: str, file_name: str) -> str:
  return directory.rstrip('/') + '/' + file_name


def _detect_transaction_type(payload: bytes, *, correlation_id: str) -> str:
  try:
    interchange = parse_x12(payload)
    validate_x12_envelopes(interchange)
  except X12Error as exc:
    raise IntegrationAPIError(
      status_code=400,
      code=exc.code.value,
      message='Midwest outbound SFTP file failed X12 envelope parsing or validation.',
      correlation_id=correlation_id,
    ) from exc
  try:
    return interchange.functional_groups[0].transaction_sets[0].transaction_set_identifier or ''
  except IndexError as exc:
    raise IntegrationAPIError(
      status_code=400,
      code='MISSING_TRANSACTION_SET',
      message='Midwest outbound SFTP file does not contain a transaction set.',
      correlation_id=correlation_id,
    ) from exc
