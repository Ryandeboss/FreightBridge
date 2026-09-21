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
