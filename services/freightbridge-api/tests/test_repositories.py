from datetime import UTC, datetime
from uuid import uuid4

from app.domain import ShipmentEvent, ShipmentStatus
from app.infrastructure.repositories import FreightBridgeRepository


class FakeCursor:
  def __init__(self, rows: list[dict[str, object]]):
    self.rows = rows
    self.executed: list[tuple[str, tuple[object, ...]]] = []

  def __enter__(self) -> 'FakeCursor':
    return self

  def __exit__(self, *args: object) -> None:
    return None

  def execute(self, query: str, parameters: tuple[object, ...]) -> None:
    self.executed.append((query, parameters))

  def fetchone(self) -> dict[str, object] | None:
    if not self.rows:
      return None
    return self.rows.pop(0)


class FakeConnection:
  def __init__(self, rows: list[dict[str, object]]):
    self.cursor_instance = FakeCursor(rows)

  def cursor(self, *args: object, **kwargs: object) -> FakeCursor:
    return self.cursor_instance


def at(hour: int) -> datetime:
  return datetime(2026, 10, 1, hour, tzinfo=UTC)


def test_repository_updates_current_status_when_event_advances() -> None:
  shipment_id = uuid4()
  connection = FakeConnection(
    [{'current_status': 'PICKED_UP', 'current_status_occurred_at': at(10)}]
  )
  repository = FreightBridgeRepository(connection)  # type: ignore[arg-type]
  event = ShipmentEvent(
    shipment_id=shipment_id,
    status=ShipmentStatus.IN_TRANSIT,
    occurred_at=at(11),
    received_at=at(12),
  )

  updated = repository.update_shipment_current_status_if_advanced(event)

  assert updated is True
  assert len(connection.cursor_instance.executed) == 2
  assert connection.cursor_instance.executed[1][1] == (
    'IN_TRANSIT',
    at(11),
    shipment_id,
  )


def test_repository_does_not_update_current_status_when_event_regresses() -> None:
  connection = FakeConnection(
    [{'current_status': 'DELIVERED', 'current_status_occurred_at': at(14)}]
  )
  repository = FreightBridgeRepository(connection)  # type: ignore[arg-type]
  event = ShipmentEvent(
    shipment_id=uuid4(),
    status=ShipmentStatus.ARRIVED,
    occurred_at=at(13),
    received_at=at(15),
  )

  updated = repository.update_shipment_current_status_if_advanced(event)

  assert updated is False
  assert len(connection.cursor_instance.executed) == 1
