from collections.abc import Callable
from datetime import datetime, timezone

from psycopg import Error as PsycopgError

from app.infrastructure.repositories import FreightBridgeRepository
from app.integrations.midwest.control_numbers import ControlNumberProvider, TimestampControlNumberProvider
from app.integrations.midwest.errors import (
  Midwest204ErrorCode,
  Midwest204MappingError,
  MidwestShipmentNotFoundError,
)
from app.integrations.midwest.mapping_204 import generate_midwest_204
from app.integrations.midwest.models import Midwest204GenerationResult
from app.integrations.x12 import parse_x12, validate_x12_envelopes


class Midwest204GenerationService:
  def __init__(
    self,
    *,
    connection=None,
    repository: FreightBridgeRepository | None = None,
    control_number_provider: ControlNumberProvider | None = None,
    clock: Callable[[], datetime] | None = None,
  ) -> None:
    if repository is None and connection is None:
      raise ValueError('connection or repository is required')
    self.repository = repository or FreightBridgeRepository(connection)
    self.control_number_provider = control_number_provider or TimestampControlNumberProvider()
    self.clock = clock or (lambda: datetime.now(timezone.utc))

  def generate_for_shipment_number(self, shipment_number: str) -> Midwest204GenerationResult:
    shipment = self.repository.fetch_shipment_by_number(shipment_number)
    if shipment is None:
      raise MidwestShipmentNotFoundError(shipment_number)

    generated_at = self.clock()
    control_numbers = self.control_number_provider.next_control_numbers(
      shipment_number=shipment.shipment_number,
      generated_at=generated_at,
    )
    try:
      result = generate_midwest_204(
        shipment,
        generated_at=generated_at,
        control_numbers=control_numbers,
      )
      validate_x12_envelopes(parse_x12(result.serialized_x12))
    except Midwest204MappingError:
      raise
    except Exception as exc:
      raise Midwest204MappingError(
        Midwest204ErrorCode.MIDWEST_204_ENVELOPE_VALIDATION_FAILED,
        'Generated Midwest 204 failed structural X12 validation.',
      ) from exc

    return result


class Midwest204DependencyError(RuntimeError):
  @classmethod
  def from_database_error(cls, exc: PsycopgError) -> 'Midwest204DependencyError':
    return cls('A downstream dependency failed while generating the Midwest 204.')
