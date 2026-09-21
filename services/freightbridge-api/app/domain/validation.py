from datetime import datetime

from pydantic import AfterValidator
from typing_extensions import Annotated


def ensure_timezone_aware(value: datetime) -> datetime:
  if value.tzinfo is None or value.utcoffset() is None:
    raise ValueError('datetime must be timezone-aware')
  return value


AwareDatetime = Annotated[datetime, AfterValidator(ensure_timezone_aware)]
