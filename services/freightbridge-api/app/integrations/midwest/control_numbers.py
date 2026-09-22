from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Protocol


@dataclass(frozen=True)
class X12ControlNumbers:
  interchange_control_number: str
  group_control_number: str
  transaction_control_number: str


class ControlNumberProvider(Protocol):
  def next_control_numbers(
    self,
    *,
    shipment_number: str,
    generated_at: datetime,
  ) -> X12ControlNumbers:
    pass


@dataclass(frozen=True)
class FixedControlNumberProvider:
  interchange_control_number: str
  group_control_number: str
  transaction_control_number: str

  def next_control_numbers(
    self,
    *,
    shipment_number: str,
    generated_at: datetime,
  ) -> X12ControlNumbers:
    return X12ControlNumbers(
      interchange_control_number=self.interchange_control_number.zfill(9),
      group_control_number=self.group_control_number,
      transaction_control_number=self.transaction_control_number.zfill(4),
    )


class TimestampControlNumberProvider:
  def next_control_numbers(
    self,
    *,
    shipment_number: str,
    generated_at: datetime,
  ) -> X12ControlNumbers:
    utc_generated_at = generated_at.astimezone(timezone.utc)
    epoch_seconds = int(utc_generated_at.timestamp())
    return X12ControlNumbers(
      interchange_control_number=str(epoch_seconds % 1_000_000_000).zfill(9),
      group_control_number=str(epoch_seconds % 1_000_000 or 1),
      transaction_control_number='0001',
    )
