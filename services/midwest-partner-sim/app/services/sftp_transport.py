from dataclasses import dataclass, field
from uuid import UUID

from app.infrastructure.sftp_client import MidwestSftpClient, MidwestSftpError, MidwestSftpFileConflictError
from app.repositories.loads import MidwestLoadRepository
from app.services.inbound_204 import Midwest204ReceiveFailure, Midwest204ReceiveService


INBOUND_DIR = '/inbound'
OUTBOUND_DIR = '/outbound'
ARCHIVE_DIR = '/archive'
ERROR_DIR = '/error'


@dataclass(frozen=True)
class SftpFileResult:
  file_name: str
  source_path: str
  status: str
  destination_path: str | None = None
  error_code: str | None = None
  functional_acknowledgment_document_id: str | None = None
  functional_acknowledgment_status: str | None = None


@dataclass(frozen=True)
class SftpPollResult:
  status: str
  transport: str = 'SFTP'
  processed: list[SftpFileResult] = field(default_factory=list)
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
          'functionalAcknowledgmentDocumentId': item.functional_acknowledgment_document_id,
          'functionalAcknowledgmentStatus': item.functional_acknowledgment_status,
        }
        for item in self.processed
      ],
      'ignored': self.ignored,
    }


class MidwestSftpInboundPollService:
  def __init__(
    self,
    *,
    repository: MidwestLoadRepository,
    client_factory=MidwestSftpClient,
  ) -> None:
    self.repository = repository
    self.client_factory = client_factory

  def poll(self) -> SftpPollResult:
    processed: list[SftpFileResult] = []
    ignored: list[str] = []
    receiver = Midwest204ReceiveService(self.repository)
    with self.client_factory() as client:
      for file_name in sorted(client.listdir(INBOUND_DIR)):
        if _ignore_file(file_name):
          ignored.append(file_name)
          continue
        source_path = _join(INBOUND_DIR, file_name)
        archive_path = _join(ARCHIVE_DIR, file_name)
        error_path = _join(ERROR_DIR, file_name)
        payload = client.download_bytes(source_path)
        try:
          result = receiver.process(
            raw_body=payload,
            transport='SFTP',
            source_filename=file_name,
            source_path=source_path,
            archive_path=archive_path,
            error_path=error_path,
          )
          client.rename(source_path, archive_path)
          processed.append(
            SftpFileResult(
              file_name=file_name,
              source_path=source_path,
              status='ARCHIVED',
              destination_path=archive_path,
              functional_acknowledgment_document_id=(
                str(result.functional_acknowledgment['outbound_document_id'])
                if result.functional_acknowledgment
                else None
              ),
              functional_acknowledgment_status=(
                str(result.functional_acknowledgment['acknowledgment_status'])
                if result.functional_acknowledgment
                else None
              ),
            )
          )
        except Midwest204ReceiveFailure as exc:
          client.rename(source_path, error_path)
          processed.append(
            SftpFileResult(
              file_name=file_name,
              source_path=source_path,
              status='MOVED_TO_ERROR',
              destination_path=error_path,
              error_code=exc.code.value,
            )
          )
        except (MidwestSftpError, Exception):
          processed.append(
            SftpFileResult(
              file_name=file_name,
              source_path=source_path,
              status='LEFT_FOR_RETRY',
              error_code='TRANSIENT_FAILURE',
            )
          )
    return SftpPollResult(status='POLLED', processed=processed, ignored=ignored)


class MidwestSftpTenderResponseDispatchService:
  def __init__(
    self,
    *,
    repository: MidwestLoadRepository,
    client_factory=MidwestSftpClient,
  ) -> None:
    self.repository = repository
    self.client_factory = client_factory

  def dispatch(self, customer_shipment_number: str) -> dict[str, object] | None:
    outbound = self.repository.fetch_outbound_990(customer_shipment_number)
    if outbound is None:
      return None
    filename = sftp_990_filename(outbound['interchange_control_number'])
    self.repository.mark_outbound_delivering(outbound['id'], transport='SFTP')
    try:
      with self.client_factory() as client:
        remote_path = client.upload_bytes_atomic(
          OUTBOUND_DIR,
          filename,
          outbound['raw_x12'].encode('utf-8'),
        )
    except MidwestSftpFileConflictError:
      self.repository.mark_outbound_failed(
        outbound['id'],
        'SFTP_FILE_CONFLICT',
        'SFTP destination file already exists.',
      )
      raise
    except MidwestSftpError:
      self.repository.mark_outbound_failed(
        outbound['id'],
        'SFTP_TRANSPORT_ERROR',
        'Midwest SFTP delivery failed.',
      )
      raise
    self.repository.mark_outbound_delivered(
      outbound['id'],
      transport='SFTP',
      remote_filename=filename,
      remote_path=remote_path,
    )
    return {
      'status': 'DELIVERED_TO_SFTP',
      'transport': 'SFTP',
      'customerShipmentNumber': customer_shipment_number,
      'documentType': '990',
      'remotePath': remote_path,
      'fileName': filename,
    }


class MidwestSftpShipmentStatusDispatchService:
  def __init__(
    self,
    *,
    repository: MidwestLoadRepository,
    client_factory=MidwestSftpClient,
  ) -> None:
    self.repository = repository
    self.client_factory = client_factory

  def dispatch(self, customer_shipment_number: str, event_id: UUID) -> dict[str, object] | None:
    outbound = self.repository.fetch_shipment_event_with_outbound_214(customer_shipment_number, event_id)
    if outbound is None:
      return None
    filename = sftp_214_filename(outbound['interchange_control_number'])
    self.repository.mark_outbound_delivering(outbound['id'], transport='SFTP')
    try:
      with self.client_factory() as client:
        remote_path = client.upload_bytes_atomic(
          OUTBOUND_DIR,
          filename,
          outbound['raw_x12'].encode('utf-8'),
        )
    except MidwestSftpFileConflictError:
      self.repository.mark_outbound_failed(
        outbound['id'],
        'SFTP_FILE_CONFLICT',
        'SFTP destination file already exists.',
      )
      raise
    except MidwestSftpError:
      self.repository.mark_outbound_failed(
        outbound['id'],
        'SFTP_TRANSPORT_ERROR',
        'Midwest SFTP delivery failed.',
      )
      raise
    self.repository.mark_outbound_delivered(
      outbound['id'],
      transport='SFTP',
      remote_filename=filename,
      remote_path=remote_path,
    )
    return {
      'status': 'DELIVERED_TO_SFTP',
      'transport': 'SFTP',
      'customerShipmentNumber': customer_shipment_number,
      'eventId': str(event_id),
      'documentType': '214',
      'remotePath': remote_path,
      'fileName': filename,
    }


class MidwestSftpFunctionalAcknowledgmentDispatchService:
  def __init__(
    self,
    *,
    repository: MidwestLoadRepository,
    client_factory=MidwestSftpClient,
  ) -> None:
    self.repository = repository
    self.client_factory = client_factory

  def dispatch(self, outbound_document_id: UUID) -> dict[str, object] | None:
    outbound = self.repository.fetch_outbound_997_by_id(outbound_document_id)
    if outbound is None:
      return None
    filename = sftp_997_filename(outbound['interchange_control_number'])
    self.repository.mark_outbound_delivering(outbound['id'], transport='SFTP')
    try:
      with self.client_factory() as client:
        remote_path = client.upload_bytes_atomic(
          OUTBOUND_DIR,
          filename,
          outbound['raw_x12'].encode('utf-8'),
        )
    except MidwestSftpFileConflictError:
      self.repository.mark_outbound_failed(
        outbound['id'],
        'SFTP_FILE_CONFLICT',
        'SFTP destination file already exists.',
      )
      raise
    except MidwestSftpError:
      self.repository.mark_outbound_failed(
        outbound['id'],
        'SFTP_TRANSPORT_ERROR',
        'Midwest SFTP delivery failed.',
      )
      raise
    self.repository.mark_outbound_delivered(
      outbound['id'],
      transport='SFTP',
      remote_filename=filename,
      remote_path=remote_path,
    )
    return {
      'status': 'DELIVERED_TO_SFTP',
      'transport': 'SFTP',
      'customerShipmentNumber': outbound['customer_shipment_number'],
      'outboundDocumentId': str(outbound_document_id),
      'documentType': '997',
      'remotePath': remote_path,
      'fileName': filename,
    }


class MidwestSftpReadinessService:
  def __init__(self, *, client_factory=MidwestSftpClient) -> None:
    self.client_factory = client_factory

  def check(self) -> dict[str, object]:
    directories = {}
    with self.client_factory() as client:
      for directory in (INBOUND_DIR, OUTBOUND_DIR, ARCHIVE_DIR, ERROR_DIR):
        directories[directory.removeprefix('/')] = client.exists(directory)
    return {
      'status': 'ready' if all(directories.values()) else 'not_ready',
      'transport': 'SFTP',
      'directories': directories,
    }


def sftp_990_filename(interchange_control_number: str) -> str:
  return f'MWCX_APEX_990_{interchange_control_number}.edi'


def sftp_214_filename(interchange_control_number: str) -> str:
  return f'MWCX_APEX_214_{interchange_control_number}.edi'


def sftp_997_filename(interchange_control_number: str) -> str:
  return f'MWCX_APEX_997_{interchange_control_number}.edi'


def _ignore_file(file_name: str) -> bool:
  return file_name.startswith('.') or file_name.endswith('.part') or not file_name.endswith('.edi')


def _join(directory: str, file_name: str) -> str:
  return directory.rstrip('/') + '/' + file_name
