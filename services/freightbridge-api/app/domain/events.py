from dataclasses import dataclass
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.domain.enums import ShipmentStatus
from app.domain.validation import AwareDatetime


STATUS_PROGRESSION: dict[ShipmentStatus, int] = {
  ShipmentStatus.PLANNED: 0,
  ShipmentStatus.PICKED_UP: 1,
  ShipmentStatus.IN_TRANSIT: 2,
  ShipmentStatus.ARRIVED: 3,
  ShipmentStatus.DELIVERED: 4,
}


class ShipmentEvent(BaseModel):
  model_config = ConfigDict(str_strip_whitespace=True)

  id: UUID | None = None
  shipment_id: UUID
  status: ShipmentStatus
  occurred_at: AwareDatetime
  received_at: AwareDatetime
  city: str | None = Field(default=None, max_length=80)
  state: str | None = Field(default=None, min_length=2, max_length=2)
  source_partner_id: UUID | None = None
  source_transaction_id: UUID | None = None
  created_at: AwareDatetime | None = None

  @field_validator('state')
  @classmethod
  def normalize_state(cls, value: str | None) -> str | None:
    if value is None:
      return None
    if not value.isalpha() or len(value) != 2:
      raise ValueError('state must be a two-character code')
    return value.upper()


def should_advance_shipment_status(
  *,
  current_status: ShipmentStatus,
  current_status_occurred_at: AwareDatetime | None,
  incoming_status: ShipmentStatus,
  incoming_occurred_at: AwareDatetime,
) -> bool:
  """Return whether an incoming event should update shipment current status.

  Ordering is deterministic:
  - Older business-event timestamps never replace newer current status.
  - Newer timestamps advance only when the incoming status is the same or later in
    the canonical progression.
  - Equal timestamps advance only when the incoming status is later in the
    canonical progression; exact ties do not rewrite state.
  """

  current_rank = STATUS_PROGRESSION[current_status]
  incoming_rank = STATUS_PROGRESSION[incoming_status]

  if current_status_occurred_at is None:
    return incoming_rank >= current_rank

  if incoming_occurred_at < current_status_occurred_at:
    return False

  if incoming_occurred_at == current_status_occurred_at:
    return incoming_rank > current_rank

  return incoming_rank >= current_rank


@dataclass(frozen=True)
class ShipmentStatusSnapshot:
  status: ShipmentStatus
  occurred_at: AwareDatetime | None


def apply_shipment_event(
  *,
  current_status: ShipmentStatus,
  current_status_occurred_at: AwareDatetime | None,
  event: ShipmentEvent,
) -> ShipmentStatusSnapshot:
  if should_advance_shipment_status(
    current_status=current_status,
    current_status_occurred_at=current_status_occurred_at,
    incoming_status=event.status,
    incoming_occurred_at=event.occurred_at,
  ):
    return ShipmentStatusSnapshot(status=event.status, occurred_at=event.occurred_at)

  return ShipmentStatusSnapshot(
    status=current_status,
    occurred_at=current_status_occurred_at,
  )
