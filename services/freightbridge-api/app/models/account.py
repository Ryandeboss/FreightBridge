from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


TRAINING_PROGRESS_KEYS = {
  'freightbridge.learningJourneyStarted',
  'freightbridge.firstDayOrientationComplete',
  'freightbridge.ediProtocolBootcamp',
  'freightbridge.healthyLesson',
  'freightbridge.healthyWalkthrough',
  'freightbridge.trainingProgress',
  'freightbridge.replaySequencePracticeComplete',
  'freightbridge.independentInvestigationComplete',
}


class AccountModel(BaseModel):
  model_config = ConfigDict(populate_by_name=True, extra='forbid')


class AccountCredentials(AccountModel):
  email: str = Field(min_length=5, max_length=254)
  password: str = Field(min_length=8, max_length=128)

  @field_validator('email')
  @classmethod
  def normalize_email(cls, value: str) -> str:
    normalized = value.strip().lower()
    if '@' not in normalized or normalized.startswith('@') or normalized.endswith('@'):
      raise ValueError('Enter a valid email address.')
    return normalized


class RefreshAccountSessionRequest(AccountModel):
  refresh_token: str = Field(alias='refreshToken', min_length=1)


class AccountUserView(AccountModel):
  id: UUID
  email: str


class AccountSessionView(AccountModel):
  access_token: str = Field(alias='accessToken')
  refresh_token: str = Field(alias='refreshToken')
  expires_in: int = Field(alias='expiresIn', ge=1)
  expires_at: int | None = Field(default=None, alias='expiresAt')
  token_type: str = Field(default='bearer', alias='tokenType')
  user: AccountUserView


class RegisterAccountResponse(AccountModel):
  status: Literal['SIGNED_IN', 'CONFIRM_EMAIL']
  session: AccountSessionView | None = None
  email: str


class CourseProgressView(AccountModel):
  snapshot: dict[str, str] = Field(default_factory=dict)
  updated_at: str | None = Field(default=None, alias='updatedAt')


class UpdateCourseProgressRequest(AccountModel):
  snapshot: dict[str, str]

  @field_validator('snapshot')
  @classmethod
  def validate_snapshot(cls, value: dict[str, str]) -> dict[str, str]:
    unexpected = set(value) - TRAINING_PROGRESS_KEYS
    if unexpected:
      raise ValueError('Progress snapshot contains unsupported keys.')
    for key, stored_value in value.items():
      if len(stored_value) > 100_000:
        raise ValueError(f'Progress value is too large: {key}')
    return value
