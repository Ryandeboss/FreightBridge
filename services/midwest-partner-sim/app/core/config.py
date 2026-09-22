from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
  app_env: str = Field(default='development', alias='APP_ENV')
  database_url: str | None = Field(default=None, alias='DATABASE_URL')
  midwest_api_bearer_token: str | None = Field(default=None, alias='MIDWEST_API_BEARER_TOKEN')
  midwest_api_readonly_token: str | None = Field(
    default=None,
    alias='MIDWEST_API_READONLY_TOKEN',
  )
  freightbridge_api_base_url: str | None = Field(default=None, alias='FREIGHTBRIDGE_API_BASE_URL')
  freightbridge_midwest_bearer_token: str | None = Field(
    default=None,
    alias='FREIGHTBRIDGE_MIDWEST_BEARER_TOKEN',
  )
  mwcx_sftp_host: str | None = Field(default=None, alias='MWCX_SFTP_HOST')
  mwcx_sftp_port: int = Field(default=2022, alias='MWCX_SFTP_PORT')
  mwcx_sftp_username: str | None = Field(default=None, alias='MWCX_SFTP_USERNAME')
  mwcx_sftp_private_key_b64: str | None = Field(default=None, alias='MWCX_SFTP_PRIVATE_KEY_B64')
  mwcx_sftp_host_key_sha256: str | None = Field(default=None, alias='MWCX_SFTP_HOST_KEY_SHA256')

  model_config = SettingsConfigDict(
    env_file='.env',
    env_file_encoding='utf-8',
    extra='ignore',
    populate_by_name=True,
  )


@lru_cache
def get_settings() -> Settings:
  return Settings()
