from decimal import Decimal
from uuid import UUID

from psycopg import Connection
from psycopg.rows import dict_row

from app.domain import (
  CanonicalLocation,
  CanonicalShipment,
  EquipmentType,
  ReferenceType,
  ShipmentEvent,
  ShipmentReference,
  ShipmentStatus,
  TenderStatus,
  apply_shipment_event,
)


class FreightBridgeRepository:
  def __init__(self, connection: Connection):
    self.connection = connection

  def fetch_trading_partner_by_code(self, partner_code: str) -> dict[str, object] | None:
    with self.connection.cursor(row_factory=dict_row) as cursor:
      cursor.execute(
        """
          SELECT id, partner_code, name, business_role, integration_style, active
          FROM trading_partners
          WHERE partner_code = %s
        """,
        (partner_code,),
      )
      return cursor.fetchone()

  def fetch_shipment_by_number(self, shipment_number: str) -> CanonicalShipment | None:
    with self.connection.cursor(row_factory=dict_row) as cursor:
      cursor.execute(
        """
          SELECT
            id,
            shipment_number,
            equipment_type,
            weight_lbs,
            pieces,
            commodity_description,
            tender_status,
            current_status,
            current_status_occurred_at,
            created_at,
            updated_at
          FROM shipments
          WHERE shipment_number = %s
        """,
        (shipment_number,),
      )
      shipment = cursor.fetchone()

      if shipment is None:
        return None

      cursor.execute(
        """
          SELECT stop_sequence, stop_type, facility_name, address_line_1,
                 address_line_2, city, state, postal_code, scheduled_at
          FROM shipment_stops
          WHERE shipment_id = %s
          ORDER BY stop_sequence
        """,
        (shipment['id'],),
      )
      stops = cursor.fetchall()

      cursor.execute(
        """
          SELECT reference_type, reference_value, source_partner_id, created_at
          FROM shipment_references
          WHERE shipment_id = %s
          ORDER BY reference_type, reference_value
        """,
        (shipment['id'],),
      )
      references = cursor.fetchall()

    stop_by_type = {stop['stop_type']: stop for stop in stops}
    origin = self._location_from_stop(stop_by_type['PICKUP'])
    destination = self._location_from_stop(stop_by_type['DELIVERY'])

    return CanonicalShipment(
      shipment_id=shipment['id'],
      shipment_number=shipment['shipment_number'],
      equipment_type=EquipmentType(shipment['equipment_type']),
      weight_lbs=Decimal(shipment['weight_lbs']),
      pieces=shipment['pieces'],
      commodity_description=shipment['commodity_description'],
      origin=origin,
      destination=destination,
      references=[
        ShipmentReference(
          reference_type=ReferenceType(reference['reference_type']),
          reference_value=reference['reference_value'],
          source_partner_id=reference['source_partner_id'],
          created_at=reference['created_at'],
        )
        for reference in references
      ],
      tender_status=TenderStatus(shipment['tender_status']),
      current_status=ShipmentStatus(shipment['current_status']),
      current_status_occurred_at=shipment['current_status_occurred_at'],
      created_at=shipment['created_at'],
      updated_at=shipment['updated_at'],
    )

  def create_shipment(self, shipment: CanonicalShipment) -> UUID:
    with self.connection.cursor(row_factory=dict_row) as cursor:
      cursor.execute(
        """
          INSERT INTO shipments (
            shipment_number,
            equipment_type,
            weight_lbs,
            pieces,
            commodity_description,
            tender_status,
            current_status,
            current_status_occurred_at
          )
          VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
          RETURNING id
        """,
        (
          shipment.shipment_number,
          shipment.equipment_type.value,
          shipment.weight_lbs,
          shipment.pieces,
          shipment.commodity_description,
          shipment.tender_status.value,
          shipment.current_status.value,
          shipment.current_status_occurred_at,
        ),
      )
      shipment_id = cursor.fetchone()['id']

      for stop in shipment.stops():
        cursor.execute(
          """
            INSERT INTO shipment_stops (
              shipment_id,
              stop_sequence,
              stop_type,
              facility_name,
              address_line_1,
              address_line_2,
              city,
              state,
              postal_code,
              scheduled_at
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
          """,
          (
            shipment_id,
            stop.stop_sequence,
            stop.stop_type.value,
            stop.location.facility_name,
            stop.location.address_line_1,
            stop.location.address_line_2,
            stop.location.city,
            stop.location.state,
            stop.location.postal_code,
            stop.location.scheduled_at,
          ),
        )

      for reference in shipment.references:
        cursor.execute(
          """
            INSERT INTO shipment_references (
              shipment_id,
              reference_type,
              reference_value,
              source_partner_id
            )
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (shipment_id, reference_type, reference_value) DO NOTHING
          """,
          (
            shipment_id,
            reference.reference_type.value,
            reference.reference_value,
            reference.source_partner_id,
          ),
        )

    return shipment_id

  def append_shipment_event(self, event: ShipmentEvent) -> UUID:
    with self.connection.cursor(row_factory=dict_row) as cursor:
      cursor.execute(
        """
          INSERT INTO shipment_events (
            shipment_id,
            status,
            occurred_at,
            received_at,
            city,
            state,
            source_partner_id,
            source_transaction_id
          )
          VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
          RETURNING id
        """,
        (
          event.shipment_id,
          event.status.value,
          event.occurred_at,
          event.received_at,
          event.city,
          event.state,
          event.source_partner_id,
          event.source_transaction_id,
        ),
      )
      return cursor.fetchone()['id']

  def update_shipment_current_status_if_advanced(self, event: ShipmentEvent) -> bool:
    with self.connection.cursor(row_factory=dict_row) as cursor:
      cursor.execute(
        """
          SELECT current_status, current_status_occurred_at
          FROM shipments
          WHERE id = %s
          FOR UPDATE
        """,
        (event.shipment_id,),
      )
      shipment = cursor.fetchone()

      if shipment is None:
        raise ValueError('shipment was not found')

      next_snapshot = apply_shipment_event(
        current_status=ShipmentStatus(shipment['current_status']),
        current_status_occurred_at=shipment['current_status_occurred_at'],
        event=event,
      )

      if next_snapshot.status == ShipmentStatus(shipment['current_status']) and (
        next_snapshot.occurred_at == shipment['current_status_occurred_at']
      ):
        return False

      cursor.execute(
        """
          UPDATE shipments
          SET current_status = %s,
              current_status_occurred_at = %s,
              updated_at = now()
          WHERE id = %s
        """,
        (next_snapshot.status.value, next_snapshot.occurred_at, event.shipment_id),
      )
      return True

  @staticmethod
  def _location_from_stop(stop: dict[str, object]) -> CanonicalLocation:
    return CanonicalLocation(
      facility_name=stop['facility_name'],
      address_line_1=stop['address_line_1'],
      address_line_2=stop['address_line_2'],
      city=stop['city'],
      state=stop['state'],
      postal_code=stop['postal_code'],
      scheduled_at=stop['scheduled_at'],
    )
