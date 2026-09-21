from datetime import UTC, datetime
from uuid import uuid4

from app.domain import ShipmentEvent, ShipmentStatus, apply_shipment_event
from app.domain.events import should_advance_shipment_status


def at(hour: int, minute: int = 0) -> datetime:
  return datetime(2026, 10, 1, hour, minute, tzinfo=UTC)


def event(status: ShipmentStatus, occurred_hour: int, occurred_minute: int = 0) -> ShipmentEvent:
  return ShipmentEvent(
    shipment_id=uuid4(),
    status=status,
    occurred_at=at(occurred_hour, occurred_minute),
    received_at=at(occurred_hour, occurred_minute + 1),
  )


def test_status_progression_advances_in_order() -> None:
  assert should_advance_shipment_status(
    current_status=ShipmentStatus.PLANNED,
    current_status_occurred_at=None,
    incoming_status=ShipmentStatus.PICKED_UP,
    incoming_occurred_at=at(10),
  )
  assert should_advance_shipment_status(
    current_status=ShipmentStatus.PICKED_UP,
    current_status_occurred_at=at(10),
    incoming_status=ShipmentStatus.IN_TRANSIT,
    incoming_occurred_at=at(11),
  )
  assert should_advance_shipment_status(
    current_status=ShipmentStatus.IN_TRANSIT,
    current_status_occurred_at=at(11),
    incoming_status=ShipmentStatus.ARRIVED,
    incoming_occurred_at=at(12),
  )
  assert should_advance_shipment_status(
    current_status=ShipmentStatus.ARRIVED,
    current_status_occurred_at=at(12),
    incoming_status=ShipmentStatus.DELIVERED,
    incoming_occurred_at=at(13),
  )


def test_delivered_does_not_regress_to_arrived() -> None:
  assert not should_advance_shipment_status(
    current_status=ShipmentStatus.DELIVERED,
    current_status_occurred_at=at(14, 30),
    incoming_status=ShipmentStatus.ARRIVED,
    incoming_occurred_at=at(14, 45),
  )


def test_late_arrived_event_is_stored_conceptually_but_does_not_change_current_status() -> None:
  late_arrived = event(ShipmentStatus.ARRIVED, 13, 45)

  snapshot = apply_shipment_event(
    current_status=ShipmentStatus.DELIVERED,
    current_status_occurred_at=at(14, 30),
    event=late_arrived,
  )

  assert late_arrived.status == ShipmentStatus.ARRIVED
  assert snapshot.status == ShipmentStatus.DELIVERED
  assert snapshot.occurred_at == at(14, 30)


def test_older_event_timestamp_does_not_replace_newer_current_event() -> None:
  assert not should_advance_shipment_status(
    current_status=ShipmentStatus.IN_TRANSIT,
    current_status_occurred_at=at(12),
    incoming_status=ShipmentStatus.ARRIVED,
    incoming_occurred_at=at(11, 30),
  )


def test_equal_timestamp_uses_status_progression_deterministically() -> None:
  assert should_advance_shipment_status(
    current_status=ShipmentStatus.IN_TRANSIT,
    current_status_occurred_at=at(12),
    incoming_status=ShipmentStatus.ARRIVED,
    incoming_occurred_at=at(12),
  )
  assert not should_advance_shipment_status(
    current_status=ShipmentStatus.ARRIVED,
    current_status_occurred_at=at(12),
    incoming_status=ShipmentStatus.IN_TRANSIT,
    incoming_occurred_at=at(12),
  )
  assert not should_advance_shipment_status(
    current_status=ShipmentStatus.ARRIVED,
    current_status_occurred_at=at(12),
    incoming_status=ShipmentStatus.ARRIVED,
    incoming_occurred_at=at(12),
  )
