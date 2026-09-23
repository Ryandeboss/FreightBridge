from datetime import datetime, timezone
import hashlib
from uuid import UUID

from psycopg.errors import UniqueViolation

from app.edi.generator_214 import Midwest214Source, generate_214
from app.edi.generator_990 import ControlNumbers, Midwest990Source, generate_990
from app.edi.generator_997 import accepted_204_997_source, generate_997
from app.edi.parser import Parsed204
from app.models.load import MidwestLoad, Party
from app.models.shipment_event import (
  DEFAULT_STATUS_DESCRIPTIONS,
  STATUS_TO_AT7,
  MidwestShipmentEventRequest,
)
from app.models.tender import MidwestTenderDecisionRequest, TenderDecisionValue


class DuplicateLoadError(Exception):
  pass


class LoadNotFoundError(Exception):
  pass


class TenderAlreadyDecidedError(Exception):
  pass


class TenderDecisionNotFoundError(Exception):
  pass


class ShipmentEventNotAllowedError(Exception):
  pass


class ShipmentEventNotFoundError(Exception):
  pass


class FunctionalAcknowledgmentNotFoundError(Exception):
  pass


class MidwestLoadRepository:
  def __init__(self, connection) -> None:
    self.connection = connection

  def create_inbound_document(
    self,
    *,
    payload_hash: str,
    raw_x12: str,
    parsed: Parsed204 | None = None,
    status: str = 'RECEIVED',
    error_code: str | None = None,
    safe_error_message: str | None = None,
    transport: str = 'REST',
    source_filename: str | None = None,
    source_path: str | None = None,
  ) -> UUID:
    with self.connection.cursor() as cursor:
      cursor.execute(
        """
        insert into midwest_sim.inbound_edi_documents (
          document_type,
          x12_version,
          interchange_control_number,
          group_control_number,
          transaction_control_number,
          customer_shipment_number,
          payload_hash,
          raw_x12,
          processing_status,
          error_code,
          safe_error_message,
          transport,
          source_filename,
          source_path,
          processed_at
        )
        values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        returning id
        """,
        (
          '204',
          parsed.x12_version if parsed else None,
          parsed.interchange_control_number if parsed else None,
          parsed.group_control_number if parsed else None,
          parsed.transaction_control_number if parsed else None,
          parsed.cust_ship_no if parsed else None,
          payload_hash,
          raw_x12,
          status,
          error_code,
          safe_error_message,
          transport,
          source_filename,
          source_path,
          datetime.now(timezone.utc) if status in ('ACCEPTED', 'REJECTED') else None,
        ),
      )
      return cursor.fetchone()['id']

  def mark_document_accepted(self, document_id: UUID, parsed: Parsed204, *, archive_path: str | None = None) -> None:
    with self.connection.cursor() as cursor:
      cursor.execute(
        """
        update midwest_sim.inbound_edi_documents
        set x12_version = %s,
            interchange_control_number = %s,
            group_control_number = %s,
            transaction_control_number = %s,
            customer_shipment_number = %s,
            processing_status = 'ACCEPTED',
            archive_path = coalesce(%s, archive_path),
            processed_at = now(),
            updated_at = now()
        where id = %s
        """,
        (
          parsed.x12_version,
          parsed.interchange_control_number,
          parsed.group_control_number,
          parsed.transaction_control_number,
          parsed.cust_ship_no,
          archive_path,
          document_id,
        ),
      )

  def mark_document_rejected(
    self,
    document_id: UUID,
    *,
    error_code: str,
    safe_error_message: str,
    parsed: Parsed204 | None = None,
    error_path: str | None = None,
  ) -> None:
    with self.connection.cursor() as cursor:
      cursor.execute(
        """
        update midwest_sim.inbound_edi_documents
        set x12_version = coalesce(%s, x12_version),
            interchange_control_number = coalesce(%s, interchange_control_number),
            group_control_number = coalesce(%s, group_control_number),
            transaction_control_number = coalesce(%s, transaction_control_number),
            customer_shipment_number = coalesce(%s, customer_shipment_number),
            processing_status = 'REJECTED',
            error_code = %s,
            safe_error_message = %s,
            error_path = coalesce(%s, error_path),
            processed_at = now(),
            updated_at = now()
        where id = %s
        """,
        (
          parsed.x12_version if parsed else None,
          parsed.interchange_control_number if parsed else None,
          parsed.group_control_number if parsed else None,
          parsed.transaction_control_number if parsed else None,
          parsed.cust_ship_no if parsed else None,
          error_code,
          safe_error_message,
          error_path,
          document_id,
        ),
      )

  def create_load_from_204(self, parsed: Parsed204) -> UUID:
    try:
      with self.connection.cursor() as cursor:
        cursor.execute(
          """
          insert into midwest_sim.loads (
            cust_ship_no,
            bol_ref,
            po_ref,
            gross_weight_lb,
            handling_units,
            shipper_name,
            shipper_addr_line_1,
            shipper_city,
            shipper_state_cd,
            shipper_zip,
            cons_name,
            cons_addr_line_1,
            cons_city,
            cons_state_cd,
            cons_zip,
            pickup_appt_ts,
            delivery_appt_ts,
            tender_status
          )
          values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'PENDING')
          returning id
          """,
          (
            parsed.cust_ship_no,
            parsed.bol_ref,
            parsed.po_ref,
            parsed.gross_weight_lb,
            parsed.handling_units,
            parsed.shipper_name,
            parsed.shipper_addr_line_1,
            parsed.shipper_city,
            parsed.shipper_state_cd,
            parsed.shipper_zip,
            parsed.cons_name,
            parsed.cons_addr_line_1,
            parsed.cons_city,
            parsed.cons_state_cd,
            parsed.cons_zip,
            parsed.pickup_appt_ts,
            parsed.delivery_appt_ts,
          ),
        )
        return cursor.fetchone()['id']
    except UniqueViolation as exc:
      raise DuplicateLoadError(parsed.cust_ship_no) from exc

  def create_functional_acknowledgment_for_204(
    self,
    *,
    inbound_document_id: UUID,
    parsed: Parsed204,
    generated_at: datetime | None = None,
    control_numbers: ControlNumbers | None = None,
  ) -> dict[str, object]:
    generated_at = generated_at or datetime.now(timezone.utc)
    controls = control_numbers or self.next_control_numbers()
    source = accepted_204_997_source(
      original_group_control_number=parsed.group_control_number,
      original_transaction_control_number=parsed.transaction_control_number,
      generated_at=generated_at,
    )
    raw_x12 = generate_997(source, controls)
    with self.connection.cursor() as cursor:
      cursor.execute(
        """
        insert into midwest_sim.outbound_edi_documents (
          inbound_document_id, document_type, customer_shipment_number,
          x12_version, interchange_control_number, group_control_number,
          transaction_control_number, payload_hash, raw_x12,
          processing_status, generated_at
        )
        values (%s, '997', %s, '004010', %s, %s, %s, %s, %s, 'GENERATED', %s)
        returning id
        """,
        (
          inbound_document_id,
          parsed.cust_ship_no,
          controls.interchange_control_number,
          controls.group_control_number,
          controls.transaction_control_number,
          hashlib.sha256(raw_x12.encode('utf-8')).hexdigest(),
          raw_x12,
          generated_at,
        ),
      )
      document_id = cursor.fetchone()['id']
    return {
      'outbound_document_id': document_id,
      'inbound_document_id': inbound_document_id,
      'customer_shipment_number': parsed.cust_ship_no,
      'acknowledgment_status': 'ACCEPTED',
      'transaction_ack_code': source.transaction_ack_code,
      'group_ack_code': source.group_ack_code,
      'acknowledged_group_control_number': parsed.group_control_number,
      'acknowledged_transaction_control_number': parsed.transaction_control_number,
      'interchange_control_number': controls.interchange_control_number,
      'group_control_number': controls.group_control_number,
      'transaction_control_number': controls.transaction_control_number,
      'raw_x12': raw_x12,
      'generated_at': generated_at,
    }

  def fetch_load(self, cust_ship_no: str) -> MidwestLoad | None:
    with self.connection.cursor() as cursor:
      cursor.execute(
        """
        select *
        from midwest_sim.loads
        where cust_ship_no = %s
        """,
        (cust_ship_no,),
      )
      row = cursor.fetchone()
    if row is None:
      return None
    return MidwestLoad(
      id=row['id'],
      customerShipmentNumber=row['cust_ship_no'],
      bolReference=row['bol_ref'],
      purchaseOrderReference=row['po_ref'],
      grossWeightLb=row['gross_weight_lb'],
      handlingUnits=row['handling_units'],
      shipper=Party(
        name=row['shipper_name'],
        addressLine1=row['shipper_addr_line_1'],
        city=row['shipper_city'],
        state=row['shipper_state_cd'],
        postalCode=row['shipper_zip'],
      ),
      consignee=Party(
        name=row['cons_name'],
        addressLine1=row['cons_addr_line_1'],
        city=row['cons_city'],
        state=row['cons_state_cd'],
        postalCode=row['cons_zip'],
      ),
      pickupAppointment=row['pickup_appt_ts'],
      deliveryAppointment=row['delivery_appt_ts'],
      tenderStatus=row['tender_status'],
      carrierLoadNumber=row['carrier_load_no'],
    )

  def next_carrier_load_number(self) -> str:
    with self.connection.cursor() as cursor:
      cursor.execute("select nextval('midwest_sim.carrier_load_number_seq') as value")
      return f"MWC{cursor.fetchone()['value']}"

  def next_control_numbers(self) -> ControlNumbers:
    with self.connection.cursor() as cursor:
      cursor.execute(
        """
        select
          nextval('midwest_sim.outbound_interchange_control_seq') as interchange,
          nextval('midwest_sim.outbound_group_control_seq') as group_control
        """
      )
      row = cursor.fetchone()
    return ControlNumbers(
      interchange_control_number=str(row['interchange']).zfill(9),
      group_control_number=str(row['group_control']),
      transaction_control_number='0001',
    )

  def create_tender_decision(
    self,
    cust_ship_no: str,
    request: MidwestTenderDecisionRequest,
    *,
    decided_at: datetime | None = None,
    carrier_load_no: str | None = None,
    control_numbers: ControlNumbers | None = None,
  ) -> dict[str, object]:
    decided_at = decided_at or datetime.now(timezone.utc)
    with self.connection.transaction():
      with self.connection.cursor() as cursor:
        cursor.execute(
          "select * from midwest_sim.loads where cust_ship_no = %s for update",
          (cust_ship_no,),
        )
        load = cursor.fetchone()
        if load is None:
          raise LoadNotFoundError(cust_ship_no)
        if load['tender_status'] != 'PENDING':
          raise TenderAlreadyDecidedError(cust_ship_no)

        resolved_carrier_load_no = (
          carrier_load_no
          if request.decision == TenderDecisionValue.ACCEPTED
          else None
        )
        if request.decision == TenderDecisionValue.ACCEPTED and resolved_carrier_load_no is None:
          resolved_carrier_load_no = self.next_carrier_load_number()

        cursor.execute(
          """
          insert into midwest_sim.tender_decisions (
            load_id, decision, carrier_load_no, reason_code, message, decided_at
          )
          values (%s, %s, %s, %s, %s, %s)
          returning id
          """,
          (
            load['id'],
            request.decision.value,
            resolved_carrier_load_no,
            request.reason_code,
            request.message,
            decided_at,
          ),
        )
        decision_id = cursor.fetchone()['id']
        cursor.execute(
          """
          update midwest_sim.loads
          set tender_status = %s,
              carrier_load_no = %s,
              updated_at = now()
          where id = %s
          """,
          (request.decision.value, resolved_carrier_load_no, load['id']),
        )

        controls = control_numbers or self.next_control_numbers()
        raw_x12 = generate_990(
          Midwest990Source(
            cust_ship_no=load['cust_ship_no'],
            bol_ref=load['bol_ref'],
            po_ref=load['po_ref'],
            decision=request.decision.value,
            carrier_load_no=resolved_carrier_load_no,
            reason_code=request.reason_code,
            decided_at=decided_at,
          ),
          controls,
        )
        cursor.execute(
          """
          insert into midwest_sim.outbound_edi_documents (
            tender_decision_id, document_type, customer_shipment_number,
            x12_version, interchange_control_number, group_control_number,
            transaction_control_number, payload_hash, raw_x12,
            processing_status, generated_at
          )
          values (%s, '990', %s, '004010', %s, %s, %s, %s, %s, 'GENERATED', %s)
          returning id
          """,
          (
            decision_id,
            load['cust_ship_no'],
            controls.interchange_control_number,
            controls.group_control_number,
            controls.transaction_control_number,
            hashlib.sha256(raw_x12.encode('utf-8')).hexdigest(),
            raw_x12,
            decided_at,
          ),
        )
        document_id = cursor.fetchone()['id']

    return {
      'decision_id': decision_id,
      'outbound_document_id': document_id,
      'customer_shipment_number': cust_ship_no,
      'decision': request.decision.value,
      'carrier_load_number': resolved_carrier_load_no,
      'reason_code': request.reason_code,
      'message': request.message,
      'decided_at': decided_at,
    }

  def create_shipment_event(
    self,
    cust_ship_no: str,
    request: MidwestShipmentEventRequest,
    *,
    control_numbers: ControlNumbers | None = None,
  ) -> dict[str, object]:
    occurred_at = request.occurred_at.astimezone(timezone.utc)
    at7_code = STATUS_TO_AT7[request.status]
    status_description = request.status_description or DEFAULT_STATUS_DESCRIPTIONS[request.status]
    with self.connection.transaction():
      with self.connection.cursor() as cursor:
        cursor.execute(
          """
          select *
          from midwest_sim.loads
          where cust_ship_no = %s
          for update
          """,
          (cust_ship_no,),
        )
        load = cursor.fetchone()
        if load is None:
          raise LoadNotFoundError(cust_ship_no)
        if load['tender_status'] != 'ACCEPTED':
          raise ShipmentEventNotAllowedError(cust_ship_no)

        cursor.execute(
          """
          insert into midwest_sim.shipment_events (
            load_id, status, at7_code, status_description, occurred_at, city, state
          )
          values (%s, %s, %s, %s, %s, %s, %s)
          returning id
          """,
          (
            load['id'],
            request.status.value,
            at7_code,
            status_description,
            occurred_at,
            request.city,
            request.state,
          ),
        )
        event_id = cursor.fetchone()['id']

        controls = control_numbers or self.next_control_numbers()
        raw_x12 = generate_214(
          Midwest214Source(
            cust_ship_no=load['cust_ship_no'],
            carrier_load_no=load['carrier_load_no'],
            bol_ref=load['bol_ref'],
            po_ref=load['po_ref'],
            at7_code=at7_code,
            occurred_at=occurred_at,
            city=request.city,
            state=request.state,
          ),
          controls,
        )
        cursor.execute(
          """
          insert into midwest_sim.outbound_edi_documents (
            shipment_event_id, document_type, customer_shipment_number,
            x12_version, interchange_control_number, group_control_number,
            transaction_control_number, payload_hash, raw_x12,
            processing_status, generated_at
          )
          values (%s, '214', %s, '004010', %s, %s, %s, %s, %s, 'GENERATED', %s)
          returning id
          """,
          (
            event_id,
            load['cust_ship_no'],
            controls.interchange_control_number,
            controls.group_control_number,
            controls.transaction_control_number,
            hashlib.sha256(raw_x12.encode('utf-8')).hexdigest(),
            raw_x12,
            occurred_at,
          ),
        )
        document_id = cursor.fetchone()['id']

    return {
      'event_id': event_id,
      'outbound_document_id': document_id,
      'customer_shipment_number': cust_ship_no,
      'status': request.status.value,
      'at7_code': at7_code,
      'status_description': status_description,
      'occurred_at': occurred_at,
      'city': request.city,
      'state': request.state,
    }

  def fetch_shipment_events(self, cust_ship_no: str) -> list[dict[str, object]] | None:
    with self.connection.cursor() as cursor:
      cursor.execute(
        'select id from midwest_sim.loads where cust_ship_no = %s',
        (cust_ship_no,),
      )
      load = cursor.fetchone()
      if load is None:
        return None
      cursor.execute(
        """
        select id, status, at7_code, status_description, occurred_at, city, state, created_at
        from midwest_sim.shipment_events
        where load_id = %s
        order by occurred_at, created_at, id
        """,
        (load['id'],),
      )
      return cursor.fetchall()

  def fetch_shipment_event_with_outbound_214(self, cust_ship_no: str, event_id: UUID) -> dict[str, object] | None:
    with self.connection.cursor() as cursor:
      cursor.execute(
        """
        select oed.*
        from midwest_sim.outbound_edi_documents oed
        join midwest_sim.shipment_events se on se.id = oed.shipment_event_id
        join midwest_sim.loads l on l.id = se.load_id
        where l.cust_ship_no = %s
          and se.id = %s
          and oed.document_type = '214'
        order by oed.created_at desc
        limit 1
        """,
        (cust_ship_no, event_id),
      )
      return cursor.fetchone()

  def fetch_functional_acknowledgments(self, cust_ship_no: str) -> list[dict[str, object]] | None:
    with self.connection.cursor() as cursor:
      cursor.execute(
        'select id from midwest_sim.loads where cust_ship_no = %s',
        (cust_ship_no,),
      )
      if cursor.fetchone() is None:
        return None
      cursor.execute(
        """
        select
          oed.id as outbound_document_id,
          oed.inbound_document_id,
          oed.document_type,
          case
            when oed.raw_x12 like '%AK5*A~%AK9*A*1*1*1~%' then 'ACCEPTED'
            when oed.raw_x12 like '%AK5*R~%AK9*R*1*1*0~%' then 'REJECTED'
            else 'UNKNOWN'
          end as acknowledgment_status,
          case
            when oed.raw_x12 like '%AK5*A~%' then 'A'
            when oed.raw_x12 like '%AK5*R~%' then 'R'
            else null
          end as transaction_ack_code,
          case
            when oed.raw_x12 like '%AK9*A*%' then 'A'
            when oed.raw_x12 like '%AK9*R*%' then 'R'
            else null
          end as group_ack_code,
          ied.group_control_number as acknowledged_group_control_number,
          ied.transaction_control_number as acknowledged_transaction_control_number,
          oed.processing_status,
          oed.transport,
          oed.remote_path,
          oed.generated_at,
          oed.delivered_at
        from midwest_sim.outbound_edi_documents oed
        join midwest_sim.inbound_edi_documents ied
          on ied.id = oed.inbound_document_id
        where oed.customer_shipment_number = %s
          and oed.document_type = '997'
        order by oed.generated_at desc, oed.created_at desc
        """,
        (cust_ship_no,),
      )
      return cursor.fetchall()

  def fetch_outbound_997_by_id(self, outbound_document_id: UUID) -> dict[str, object] | None:
    with self.connection.cursor() as cursor:
      cursor.execute(
        """
        select *
        from midwest_sim.outbound_edi_documents
        where id = %s
          and document_type = '997'
        """,
        (outbound_document_id,),
      )
      return cursor.fetchone()

  def fetch_outbound_990(self, cust_ship_no: str) -> dict[str, object] | None:
    with self.connection.cursor() as cursor:
      cursor.execute(
        """
        select oed.*
        from midwest_sim.outbound_edi_documents oed
        where oed.customer_shipment_number = %s
          and oed.document_type = '990'
        order by oed.created_at desc
        limit 1
        """,
        (cust_ship_no,),
      )
      return cursor.fetchone()

  def mark_outbound_delivering(self, document_id: UUID, *, transport: str | None = None) -> None:
    with self.connection.cursor() as cursor:
      cursor.execute(
        """
        update midwest_sim.outbound_edi_documents
        set processing_status = 'DELIVERING',
            transport = coalesce(%s, transport),
            attempt_count = attempt_count + 1,
            last_attempt_at = now(),
            updated_at = now()
        where id = %s
        """,
        (transport, document_id),
      )

  def mark_outbound_delivered(
    self,
    document_id: UUID,
    *,
    transport: str | None = None,
    remote_filename: str | None = None,
    remote_path: str | None = None,
  ) -> None:
    with self.connection.cursor() as cursor:
      cursor.execute(
        """
        update midwest_sim.outbound_edi_documents
        set processing_status = 'DELIVERED',
            transport = coalesce(%s, transport),
            remote_filename = coalesce(%s, remote_filename),
            remote_path = coalesce(%s, remote_path),
            delivered_at = now(),
            updated_at = now()
        where id = %s
        """,
        (transport, remote_filename, remote_path, document_id),
      )

  def mark_outbound_failed(self, document_id: UUID, error_code: str, message: str) -> None:
    with self.connection.cursor() as cursor:
      cursor.execute(
        """
        update midwest_sim.outbound_edi_documents
        set processing_status = 'FAILED',
            error_code = %s,
            safe_error_message = %s,
            updated_at = now()
        where id = %s
        """,
        (error_code, message, document_id),
      )
