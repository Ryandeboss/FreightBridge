from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


class ErrorCode(str, Enum):
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR'
  AUTHORIZATION_ERROR = 'AUTHORIZATION_ERROR'
  LOAD_NOT_FOUND = 'LOAD_NOT_FOUND'
  DUPLICATE_LOAD = 'DUPLICATE_LOAD'
  TENDER_ALREADY_DECIDED = 'TENDER_ALREADY_DECIDED'
  TENDER_DECISION_NOT_FOUND = 'TENDER_DECISION_NOT_FOUND'
  INVALID_X12 = 'INVALID_X12'
  UNSUPPORTED_X12_VERSION = 'UNSUPPORTED_X12_VERSION'
  BUSINESS_VALIDATION_ERROR = 'BUSINESS_VALIDATION_ERROR'
  DEPENDENCY_ERROR = 'DEPENDENCY_ERROR'


class MidwestAPIError(Exception):
  def __init__(self, status_code: int, code: ErrorCode, message: str) -> None:
    self.status_code = status_code
    self.code = code
    self.message = message
    super().__init__(message)


class ErrorDetail(BaseModel):
  model_config = ConfigDict(populate_by_name=True)

  code: ErrorCode
  message: str
  correlation_id: str = Field(alias='correlationId')


class ErrorEnvelope(BaseModel):
  error: ErrorDetail
