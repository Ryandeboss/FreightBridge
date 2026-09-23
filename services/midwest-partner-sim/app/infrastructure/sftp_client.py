from __future__ import annotations

import base64
from dataclasses import dataclass
import hashlib
from io import StringIO
import socket
from typing import Self

import paramiko

from app.core.config import get_settings


class MidwestSftpError(Exception):
  safe_message = 'SFTP transport failed.'


class MidwestSftpConfigurationError(MidwestSftpError):
  safe_message = 'SFTP configuration is incomplete.'


class MidwestSftpAuthenticationError(MidwestSftpError):
  safe_message = 'SFTP authentication failed.'


class MidwestSftpHostKeyError(MidwestSftpError):
  safe_message = 'SFTP host-key verification failed.'


class MidwestSftpConnectionError(MidwestSftpError):
  safe_message = 'SFTP connection failed.'


class MidwestSftpFileConflictError(MidwestSftpError):
  safe_message = 'SFTP destination file already exists.'


class MidwestSftpOperationError(MidwestSftpError):
  safe_message = 'SFTP file operation failed.'


@dataclass(frozen=True)
class MidwestSftpConfig:
  host: str
  port: int
  username: str
  private_key_b64: str
  host_key_sha256: str
  timeout_seconds: float = 10.0

  @classmethod
  def from_settings(cls) -> 'MidwestSftpConfig':
    settings = get_settings()
    if (
      not settings.mwcx_sftp_host
      or not settings.mwcx_sftp_username
      or not settings.mwcx_sftp_private_key_b64
      or not settings.mwcx_sftp_host_key_sha256
    ):
      raise MidwestSftpConfigurationError()
    return cls(
      host=settings.mwcx_sftp_host,
      port=settings.mwcx_sftp_port,
      username=settings.mwcx_sftp_username,
      private_key_b64=settings.mwcx_sftp_private_key_b64,
      host_key_sha256=settings.mwcx_sftp_host_key_sha256,
    )


class FingerprintPolicy(paramiko.client.MissingHostKeyPolicy):
  def __init__(self, expected_sha256: str) -> None:
    self.expected_sha256 = _normalize_fingerprint(expected_sha256)

  def missing_host_key(self, client: paramiko.SSHClient, hostname: str, key: paramiko.PKey) -> None:
    actual = _fingerprint_sha256(key)
    if actual != self.expected_sha256:
      raise MidwestSftpHostKeyError()
    client.get_host_keys().add(hostname, key.get_name(), key)


class MidwestSftpClient:
  def __init__(self, config: MidwestSftpConfig | None = None) -> None:
    self.config = config or MidwestSftpConfig.from_settings()
    self._ssh: paramiko.SSHClient | None = None
    self._sftp: paramiko.SFTPClient | None = None

  def __enter__(self) -> Self:
    self.connect()
    return self

  def __exit__(self, exc_type, exc, traceback) -> None:
    self.close()

  def connect(self) -> None:
    private_key = _load_private_key(self.config.private_key_b64)
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(FingerprintPolicy(self.config.host_key_sha256))
    try:
      ssh.connect(
        hostname=self.config.host,
        port=self.config.port,
        username=self.config.username,
        pkey=private_key,
        look_for_keys=False,
        allow_agent=False,
        timeout=self.config.timeout_seconds,
        banner_timeout=self.config.timeout_seconds,
        auth_timeout=self.config.timeout_seconds,
      )
      self._sftp = ssh.open_sftp()
      self._ssh = ssh
    except MidwestSftpHostKeyError:
      ssh.close()
      raise
    except paramiko.AuthenticationException as exc:
      ssh.close()
      raise MidwestSftpAuthenticationError() from exc
    except (paramiko.SSHException, socket.timeout, OSError) as exc:
      ssh.close()
      raise MidwestSftpConnectionError() from exc

  def listdir(self, path: str) -> list[str]:
    try:
      return list(self._require_sftp().listdir(path))
    except OSError as exc:
      raise MidwestSftpOperationError() from exc

  def exists(self, path: str) -> bool:
    try:
      self._require_sftp().stat(path)
      return True
    except FileNotFoundError:
      return False
    except OSError as exc:
      if getattr(exc, 'errno', None) == 2:
        return False
      raise MidwestSftpOperationError() from exc

  def upload_bytes_atomic(self, remote_directory: str, final_filename: str, payload: bytes) -> str:
    final_path = _join_remote(remote_directory, final_filename)
    temp_path = final_path + '.part'
    if self.exists(final_path) or self.exists(temp_path):
      raise MidwestSftpFileConflictError()
    try:
      with self._require_sftp().open(temp_path, 'wb') as remote_file:
        remote_file.write(payload)
      if self.exists(final_path):
        raise MidwestSftpFileConflictError()
      self._require_sftp().rename(temp_path, final_path)
      return final_path
    except MidwestSftpFileConflictError:
      raise
    except OSError as exc:
      raise MidwestSftpOperationError() from exc

  def upload_bytes_atomic_reconcile_identical(self, remote_directory: str, final_filename: str, payload: bytes) -> tuple[str, str]:
    final_path = _join_remote(remote_directory, final_filename)
    if self.exists(final_path):
      if self.download_bytes(final_path) == payload:
        return final_path, 'ALREADY_PRESENT_IDENTICAL'
      raise MidwestSftpFileConflictError()
    remote_path = self.upload_bytes_atomic(remote_directory, final_filename, payload)
    return remote_path, 'UPLOADED'

  def download_bytes(self, remote_path: str) -> bytes:
    try:
      with self._require_sftp().open(remote_path, 'rb') as remote_file:
        return remote_file.read()
    except OSError as exc:
      raise MidwestSftpOperationError() from exc

  def rename(self, source_path: str, destination_path: str) -> None:
    if self.exists(destination_path):
      raise MidwestSftpFileConflictError()
    try:
      self._require_sftp().rename(source_path, destination_path)
    except OSError as exc:
      raise MidwestSftpOperationError() from exc

  def rename_to_unique_archive(self, source_path: str, destination_path: str, payload: bytes | None = None) -> str:
    resolved = destination_path
    if self.exists(resolved):
      suffix = hashlib.sha256(payload if payload is not None else source_path.encode('utf-8')).hexdigest()[:10]
      if '.' in destination_path.rsplit('/', 1)[-1]:
        directory, filename = destination_path.rsplit('/', 1)
        stem, extension = filename.rsplit('.', 1)
        resolved = f'{directory}/{stem}__replay_{suffix}.{extension}'
      else:
        resolved = f'{destination_path}__replay_{suffix}'
      attempt = 1
      while self.exists(resolved):
        resolved = f'{destination_path}__replay_{suffix}_{attempt}'
        attempt += 1
    self.rename(source_path, resolved)
    return resolved

  def close(self) -> None:
    if self._sftp is not None:
      self._sftp.close()
      self._sftp = None
    if self._ssh is not None:
      self._ssh.close()
      self._ssh = None

  def _require_sftp(self) -> paramiko.SFTPClient:
    if self._sftp is None:
      raise MidwestSftpConnectionError()
    return self._sftp


def _load_private_key(private_key_b64: str) -> paramiko.PKey:
  try:
    key_text = base64.b64decode(private_key_b64).decode('utf-8')
  except Exception as exc:
    raise MidwestSftpConfigurationError() from exc
  for key_type in (paramiko.Ed25519Key, paramiko.RSAKey, paramiko.ECDSAKey):
    try:
      return key_type.from_private_key(StringIO(key_text))
    except paramiko.SSHException:
      continue
  raise MidwestSftpConfigurationError()


def _fingerprint_sha256(key: paramiko.PKey) -> str:
  return base64.b64encode(hashlib.sha256(key.asbytes()).digest()).decode('ascii').rstrip('=')


def _normalize_fingerprint(value: str) -> str:
  return value.removeprefix('SHA256:').strip()


def _join_remote(directory: str, filename: str) -> str:
  return directory.rstrip('/') + '/' + filename
