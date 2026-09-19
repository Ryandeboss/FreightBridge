from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
  app_env: str = Field(default='development', alias='APP_ENV')
  allowed_origins_raw: str = Field(default='http://localhost:5173', alias='ALLOWED_ORIGINS')
  supabase_url: str | None = Field(default=None, alias='SUPABASE_URL')
  supabase_anon_key: str | None = Field(default=None, alias='SUPABASE_ANON_KEY')
  supabase_service_role_key: str | None = Field(
    default=None,
    alias='SUPABASE_SERVICE_ROLE_KEY',
  )
  database_url: str | None = Field(default=None, alias='DATABASE_URL')

  model_config = SettingsConfigDict(
    env_file='.env',
    env_file_encoding='utf-8',
    extra='ignore',
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
