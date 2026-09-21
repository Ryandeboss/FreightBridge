from dataclasses import dataclass

from app.domain import ErrorCategory, ProcessingStage


@dataclass(frozen=True)
class IntegrationAPIError(Exception):
  status_code: int
  code: str
  message: str
  correlation_id: str
  transaction_id: str | None = None


@dataclass(frozen=True)
class ClassifiedIntegrationFailure(Exception):
  status_code: int
  code: str
  message: str
  category: ErrorCategory
  stage: ProcessingStage
  retryable: bool = False
