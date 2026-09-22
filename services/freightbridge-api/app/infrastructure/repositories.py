from decimal import Decimal
from uuid import UUID

from psycopg import Connection
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from app.domain import (
  CanonicalLocation,
  CanonicalShipment,
  ErrorCategory,
  EquipmentType,
  IntegrationDirection,
  IntegrationTransaction,
  MessageFormat,
  ProcessingLog,
  ProcessingStage,
  ProcessingStatus,
  ReferenceType,
  ShipmentEvent,
  ShipmentReference,
  ShipmentStatus,
  TenderResponse,
  TenderStatus,
  Transport,
  apply_shipment_event,
)


class ShipmentNotFoundForTenderError(Exception):
  pass


class TenderAlreadyDecidedError(Exception):
  pass


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

  def shipment_exists(self, shipment_number: str) -> bool:
    with self.connection.cursor(row_factory=dict_row) as cursor:
      cursor.execute(
        'SELECT 1 FROM shipments WHERE shipment_number = %s',
        (shipment_number,),
      )
      return cursor.fetchone() is not None

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

  def record_tender_response(self, response: TenderResponse, shipment_number: str) -> dict[str, UUID]:
    with self.connection.cursor(row_factory=dict_row) as cursor:
      cursor.execute(
        """
          SELECT id, tender_status
          FROM shipments
          WHERE shipment_number = %s
          FOR UPDATE
        """,
        (shipment_number,),
      )
      shipment = cursor.fetchone()
      if shipment is None:
        raise ShipmentNotFoundForTenderError(shipment_number)
      if shipment['tender_status'] != TenderStatus.PENDING.value:
        raise TenderAlreadyDecidedError(shipment_number)

      cursor.execute(
        """
          INSERT INTO tender_responses (
            shipment_id,
            carrier_partner_id,
            decision,
            carrier_load_number,
            reason_code,
            message,
            decided_at,
            received_at,
            source_transaction_id
          )
          VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
          RETURNING id
        """,
        (
          shipment['id'],
          response.carrier_partner_id,
          response.decision.value,
          response.carrier_load_number,
          response.reason_code,
          response.message,
          response.decided_at,
          response.received_at,
          response.source_transaction_id,
        ),
      )
      tender_response_id = cursor.fetchone()['id']

      cursor.execute(
        """
          UPDATE shipments
          SET tender_status = %s,
              updated_at = now()
          WHERE id = %s
        """,
        (response.decision.value, shipment['id']),
      )
      return {
        'id': tender_response_id,
        'shipment_id': shipment['id'],
      }

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


class IntegrationRepository:
  def __init__(self, connection: Connection):
    self.connection = connection

  def create_transaction(self, transaction: IntegrationTransaction) -> UUID:
    with self.connection.cursor(row_factory=dict_row) as cursor:
      cursor.execute(
        """
          INSERT INTO integration_transactions (
            correlation_id,
            partner_id,
            direction,
            transport,
            message_format,
            document_type,
            business_identifier,
            x12_version,
            interchange_control_number,
            group_control_number,
            transaction_control_number,
            payload_hash,
            raw_payload_location,
            processing_status,
            processing_stage,
            retry_count,
            parent_transaction_id,
            received_at,
            processed_at
          )
          VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
          RETURNING id
        """,
        (
          transaction.correlation_id,
          transaction.partner_id,
          transaction.direction.value,
          transaction.transport.value,
          transaction.message_format.value,
          transaction.document_type,
          transaction.business_identifier,
          transaction.x12_version,
          transaction.interchange_control_number,
          transaction.group_control_number,
          transaction.transaction_control_number,
          transaction.payload_hash,
          transaction.raw_payload_location,
          transaction.processing_status.value,
          transaction.processing_stage.value,
          transaction.retry_count,
          transaction.parent_transaction_id,
          transaction.received_at,
          transaction.processed_at,
        ),
      )
      return cursor.fetchone()['id']

  def update_business_identifier(self, transaction_id: UUID, business_identifier: str) -> None:
    with self.connection.cursor() as cursor:
      cursor.execute(
        """
          UPDATE integration_transactions
          SET business_identifier = %s,
              updated_at = now()
          WHERE id = %s
        """,
        (business_identifier, transaction_id),
      )

  def update_x12_metadata(
    self,
    transaction_id: UUID,
    *,
    business_identifier: str,
    x12_version: str,
    interchange_control_number: str,
    group_control_number: str,
    transaction_control_number: str,
  ) -> None:
    with self.connection.cursor() as cursor:
      cursor.execute(
        """
          UPDATE integration_transactions
          SET business_identifier = %s,
              x12_version = %s,
              interchange_control_number = %s,
              group_control_number = %s,
              transaction_control_number = %s,
              updated_at = now()
          WHERE id = %s
        """,
        (
          business_identifier,
          x12_version,
          interchange_control_number,
          group_control_number,
          transaction_control_number,
          transaction_id,
        ),
      )

  def update_processing_state(
    self,
    transaction_id: UUID,
    status: ProcessingStatus,
    stage: ProcessingStage,
    *,
    processed: bool = False,
  ) -> None:
    with self.connection.cursor() as cursor:
      cursor.execute(
        """
          UPDATE integration_transactions
          SET processing_status = %s,
              processing_stage = %s,
              processed_at = CASE WHEN %s THEN now() ELSE processed_at END,
              updated_at = now()
          WHERE id = %s
        """,
        (status.value, stage.value, processed, transaction_id),
      )

  def mark_succeeded(self, transaction_id: UUID) -> None:
    self.update_processing_state(
      transaction_id,
      ProcessingStatus.SUCCEEDED,
      ProcessingStage.COMPLETED,
      processed=True,
    )

  def mark_failed(self, transaction_id: UUID, stage: ProcessingStage) -> None:
    self.update_processing_state(
      transaction_id,
      ProcessingStatus.FAILED,
      stage,
      processed=True,
    )

  def append_log(self, log: ProcessingLog) -> UUID:
    with self.connection.cursor(row_factory=dict_row) as cursor:
      cursor.execute(
        """
          INSERT INTO processing_logs (
            transaction_id,
            stage,
            status,
            message,
            metadata
          )
          VALUES (%s, %s, %s, %s, %s)
          RETURNING id
        """,
        (
          log.transaction_id,
          log.stage.value,
          log.status.value,
          log.message,
          Jsonb(log.metadata),
        ),
      )
      return cursor.fetchone()['id']

  def append_error(
    self,
    *,
    transaction_id: UUID,
    category: ErrorCategory,
    error_code: str,
    safe_message: str,
    stage: ProcessingStage,
    retryable: bool = False,
  ) -> UUID:
    with self.connection.cursor(row_factory=dict_row) as cursor:
      cursor.execute(
        """
          INSERT INTO integration_errors (
            transaction_id,
            category,
            error_code,
            safe_message,
            stage,
            retryable
          )
          VALUES (%s, %s, %s, %s, %s, %s)
          RETURNING id
        """,
        (
          transaction_id,
          category.value,
          error_code,
          safe_message,
          stage.value,
          retryable,
        ),
      )
      return cursor.fetchone()['id']
