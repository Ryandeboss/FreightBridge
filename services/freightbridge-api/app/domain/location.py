from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.domain.validation import AwareDatetime


class CanonicalLocation(BaseModel):
  model_config = ConfigDict(str_strip_whitespace=True)

  facility_name: str = Field(min_length=1, max_length=120)
  address_line_1: str = Field(min_length=1, max_length=160)
  address_line_2: str | None = Field(default=None, max_length=160)
  city: str = Field(min_length=1, max_length=80)
  state: str = Field(min_length=2, max_length=2)
  postal_code: str = Field(min_length=3, max_length=20)
  scheduled_at: AwareDatetime

  @field_validator('state')
  @classmethod
  def normalize_state(cls, value: str) -> str:
    if not value.isalpha() or len(value) != 2:
      raise ValueError('state must be a two-character code')
    return value.upper()
