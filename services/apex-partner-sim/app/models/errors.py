from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field


class ErrorCode(StrEnum):
  INVALID_REQUEST = 'INVALID_REQUEST'
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR'
  AUTHORIZATION_ERROR = 'AUTHORIZATION_ERROR'
  LOAD_NOT_FOUND = 'LOAD_NOT_FOUND'
  DUPLICATE_LOAD = 'DUPLICATE_LOAD'
  BUSINESS_VALIDATION_ERROR = 'BUSINESS_VALIDATION_ERROR'
  DEPENDENCY_ERROR = 'DEPENDENCY_ERROR'
  INTERNAL_ERROR = 'INTERNAL_ERROR'


class ErrorDetail(BaseModel):
  code: ErrorCode
  message: str
  correlation_id: str = Field(alias='correlationId')

  model_config = ConfigDict(populate_by_name=True)


class ErrorEnvelope(BaseModel):
  error: ErrorDetail


class ApexAPIError(Exception):
  def __init__(self, status_code: int, code: ErrorCode, message: str) -> None:
    self.status_code = status_code
    self.code = code
    self.message = message
