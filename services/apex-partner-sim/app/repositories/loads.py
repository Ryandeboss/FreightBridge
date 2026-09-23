from datetime import datetime, timezone
from uuid import UUID

from app.models.load import ApexLoad, ApexLocation, LocationRole
from app.models.status import ApexShipmentStatus, ShipmentStatusCode, should_advance_current_status
from app.models.tender import ApexTenderResponse


class ApexLoadRepository:
  def __init__(self, connection) -> None:
    self.connection = connection

  def load_exists(self, load_id: str) -> bool:
    with self.connection.cursor() as cursor:
      cursor.execute('select 1 from apex_sim.loads where load_id = %s', (load_id,))
      return cursor.fetchone() is not None

  def create_load(self, load: ApexLoad) -> bool:
    if self.load_exists(load.load_id):
      return False

    with self.connection.transaction():
      with self.connection.cursor() as cursor:
        cursor.execute(
          """
          insert into apex_sim.loads (
            load_id,
            bol_number,
            purchase_order_number,
            customer_reference,
            equipment_type,
            weight_lbs,
            pieces,
            commodity_description,
            created_at,
            updated_at
          )
          values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
          """,
          (
            load.load_id,
            load.bol_number,
            load.purchase_order_number,
            load.customer_reference,
            load.equipment_type.value,
            load.weight_lbs,
            load.pieces,
            load.commodity_description,
            load.created_at,
            load.updated_at,
          ),
        )
        self._insert_location(cursor, load.load_id, LocationRole.PICKUP, load.pickup)
        self._insert_location(cursor, load.load_id, LocationRole.DELIVERY, load.delivery)
        for reference in load.references:
          cursor.execute(
            """
            insert into apex_sim.load_references (
              load_id,
              reference_type,
              reference_value,
              description
            )
            values (%s, %s, %s, %s)
            """,
            (
              load.load_id,
              reference.type.value,
              reference.value,
              reference.description,
            ),
          )

    return True

  def fetch_load(self, load_id: str) -> ApexLoad | None:
    with self.connection.cursor() as cursor:
      cursor.execute('select * from apex_sim.loads where load_id = %s', (load_id,))
      load_row = cursor.fetchone()
      if load_row is None:
        return None

      cursor.execute(
        """
        select *
        from apex_sim.load_locations
        where load_id = %s
        order by case location_role when 'PICKUP' then 1 else 2 end
        """,
        (load_id,),
      )
      location_rows = cursor.fetchall()

      cursor.execute(
        """
        select reference_type, reference_value, description
        from apex_sim.load_references
        where load_id = %s
        order by id
        """,
        (load_id,),
      )
      reference_rows = cursor.fetchall()

    locations = {
      row['location_role']: ApexLocation(
        facility_name=row['facility_name'],
        address_1=row['address_1'],
        address_2=row['address_2'],
        city=row['city'],
        state=row['state'],
        postal_code=row['postal_code'],
        scheduled_datetime=row['scheduled_datetime'],
      )
      for row in location_rows
    }

    return ApexLoad(
      load_id=load_row['load_id'],
      bol_number=load_row['bol_number'],
      purchase_order_number=load_row['purchase_order_number'],
      customer_reference=load_row['customer_reference'],
      equipment_type=load_row['equipment_type'],
      weight_lbs=float(load_row['weight_lbs']),
      pieces=load_row['pieces'],
      commodity_description=load_row['commodity_description'],
      pickup=locations[LocationRole.PICKUP.value],
      delivery=locations[LocationRole.DELIVERY.value],
      references=[
        {
          'type': row['reference_type'],
          'value': row['reference_value'],
          'description': row['description'],
        }
        for row in reference_rows
      ],
      created_at=load_row['created_at'],
      updated_at=load_row['updated_at'],
    )

  def record_tender_response(self, response: ApexTenderResponse) -> UUID | None:
    if not self.load_exists(response.load_id):
      return None

    received_at = datetime.now(timezone.utc)
    with self.connection.transaction():
      with self.connection.cursor() as cursor:
        cursor.execute(
          """
          insert into apex_sim.tender_responses (
            load_id,
            decision,
            carrier_code,
            carrier_load_number,
            reason_code,
            message,
            decided_at,
            received_at
          )
          values (%s, %s, %s, %s, %s, %s, %s, %s)
          returning id
          """,
          (
            response.load_id,
            response.decision.value,
            response.carrier_code,
            response.carrier_load_number,
            response.reason_code,
            response.message,
            response.decided_at,
            received_at,
          ),
        )
        event_id = cursor.fetchone()['id']
        cursor.execute(
          """
          update apex_sim.loads
          set current_tender_decision = %s,
              updated_at = greatest(updated_at, %s)
          where load_id = %s
          """,
          (response.decision.value, response.decided_at, response.load_id),
        )
    return event_id

  def fetch_tender_status(self, load_id: str) -> dict[str, object] | None:
    with self.connection.cursor() as cursor:
      cursor.execute(
        """
        select load_id, current_tender_decision, updated_at
        from apex_sim.loads
        where load_id = %s
        """,
        (load_id,),
      )
      load_row = cursor.fetchone()
      if load_row is None:
        return None

      cursor.execute(
        """
        select
          id,
          decision,
          carrier_code,
          carrier_load_number,
          reason_code,
          message,
          decided_at,
          received_at
        from apex_sim.tender_responses
        where load_id = %s
        order by received_at desc, id desc
        limit 1
        """,
        (load_id,),
      )
      response_row = cursor.fetchone()

    latest_response = None
    if response_row is not None:
      latest_response = {
        'eventId': str(response_row['id']),
        'decision': response_row['decision'],
        'carrierCode': response_row['carrier_code'],
        'carrierLoadNumber': response_row['carrier_load_number'],
        'reasonCode': response_row['reason_code'],
        'message': response_row['message'],
        'decidedAt': response_row['decided_at'].isoformat(),
        'receivedAt': response_row['received_at'].isoformat(),
      }

    return {
      'loadId': load_row['load_id'],
      'currentTenderDecision': load_row['current_tender_decision'],
      'updatedAt': load_row['updated_at'].isoformat(),
      'latestResponse': latest_response,
    }

  def record_shipment_status(self, shipment_status: ApexShipmentStatus) -> UUID | None:
    received_at = datetime.now(timezone.utc)
    with self.connection.transaction():
      with self.connection.cursor() as cursor:
        cursor.execute(
          """
          select current_shipment_status, current_shipment_status_occurred_at
          from apex_sim.loads
          where load_id = %s
          for update
          """,
          (shipment_status.load_id,),
        )
        load_row = cursor.fetchone()
        if load_row is None:
          return None

        cursor.execute(
          """
          insert into apex_sim.shipment_statuses (
            load_id,
            carrier_code,
            status_code,
            status_description,
            occurred_at,
            city,
            state,
            received_at
          )
          values (%s, %s, %s, %s, %s, %s, %s, %s)
          returning id
          """,
          (
            shipment_status.load_id,
            shipment_status.carrier_code,
            shipment_status.status_code.value,
            shipment_status.status_description,
            shipment_status.occurred_at,
            shipment_status.city,
            shipment_status.state,
            received_at,
          ),
        )
        event_id = cursor.fetchone()['id']

        current_status = (
          ShipmentStatusCode(load_row['current_shipment_status'])
          if load_row['current_shipment_status']
          else None
        )
        if should_advance_current_status(
          current_status,
          load_row['current_shipment_status_occurred_at'],
          shipment_status.status_code,
          shipment_status.occurred_at,
        ):
          cursor.execute(
            """
            update apex_sim.loads
            set current_shipment_status = %s,
                current_shipment_status_occurred_at = %s,
                updated_at = greatest(updated_at, %s)
            where load_id = %s
            """,
            (
              shipment_status.status_code.value,
              shipment_status.occurred_at,
              shipment_status.occurred_at,
              shipment_status.load_id,
            ),
          )

    return event_id

  def fetch_shipment_status_history(self, load_id: str) -> dict[str, object] | None:
    with self.connection.cursor() as cursor:
      cursor.execute(
        """
        select load_id, current_shipment_status, current_shipment_status_occurred_at
        from apex_sim.loads
        where load_id = %s
        """,
        (load_id,),
      )
      load_row = cursor.fetchone()
      if load_row is None:
        return None

      cursor.execute(
        """
        select
          id,
          carrier_code,
          status_code,
          status_description,
          occurred_at,
          received_at,
          city,
          state
        from apex_sim.shipment_statuses
        where load_id = %s
        order by occurred_at, received_at, id
        """,
        (load_id,),
      )
      event_rows = cursor.fetchall()

    return {
      'loadId': load_row['load_id'],
      'currentStatus': load_row['current_shipment_status'],
      'currentStatusOccurredAt': (
        load_row['current_shipment_status_occurred_at'].isoformat()
        if load_row['current_shipment_status_occurred_at']
        else None
      ),
      'events': [
        {
          'eventId': str(row['id']),
          'statusCode': row['status_code'],
          'carrierCode': row['carrier_code'],
          'statusDescription': row['status_description'],
          'occurredAt': row['occurred_at'].isoformat(),
          'receivedAt': row['received_at'].isoformat(),
          'city': row['city'],
          'state': row['state'],
        }
        for row in event_rows
      ],
    }

  def _insert_location(self, cursor, load_id: str, role: LocationRole, location: ApexLocation) -> None:
    cursor.execute(
      """
      insert into apex_sim.load_locations (
        load_id,
        location_role,
        facility_name,
        address_1,
        address_2,
        city,
        state,
        postal_code,
        scheduled_datetime
      )
      values (%s, %s, %s, %s, %s, %s, %s, %s, %s)
      """,
      (
        load_id,
        role.value,
        location.facility_name,
        location.address_1,
        location.address_2,
        location.city,
        location.state,
        location.postal_code,
        location.scheduled_datetime,
      ),
    )
