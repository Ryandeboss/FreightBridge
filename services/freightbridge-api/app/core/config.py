from functools import lru_cache

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
  app_env: str = Field(default='development', alias='APP_ENV')
  allowed_origins_raw: str = Field(default='http://localhost:5173', alias='ALLOWED_ORIGINS')
  supabase_url: str | None = Field(default=None, alias='SUPABASE_URL')
  supabase_publishable_key: str | None = Field(
    default=None,
    validation_alias=AliasChoices('SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_ANON_KEY'),
  )
  supabase_secret_key: str | None = Field(
    default=None,
    validation_alias=AliasChoices('SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY'),
  )
  database_url: str | None = Field(default=None, alias='DATABASE_URL')
  apex_inbound_bearer_token: str | None = Field(default=None, alias='APEX_INBOUND_BEARER_TOKEN')
  operations_api_bearer_token: str | None = Field(default=None, alias='OPERATIONS_API_BEARER_TOKEN')
  midwest_sim_base_url: str | None = Field(default=None, alias='MIDWEST_SIM_BASE_URL')
  midwest_sim_bearer_token: str | None = Field(default=None, alias='MIDWEST_SIM_BEARER_TOKEN')
  midwest_inbound_bearer_token: str | None = Field(default=None, alias='MIDWEST_INBOUND_BEARER_TOKEN')
  apex_sim_base_url: str | None = Field(default=None, alias='APEX_SIM_BASE_URL')
  apex_sim_bearer_token: str | None = Field(default=None, alias='APEX_SIM_BEARER_TOKEN')
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

  @property
  def allowed_origins(self) -> list[str]:
    return [
      origin.strip()
      for origin in self.allowed_origins_raw.split(',')
      if origin.strip()
    ]


@lru_cache
def get_settings() -> Settings:
  return Settings()
