from datetime import datetime, timezone
from uuid import UUID

from psycopg.errors import UniqueViolation

from app.edi.parser import Parsed204
from app.models.load import MidwestLoad, Party


class DuplicateLoadError(Exception):
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
          processed_at
        )
        values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
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
          datetime.now(timezone.utc) if status in ('ACCEPTED', 'REJECTED') else None,
        ),
      )
      return cursor.fetchone()['id']

  def mark_document_accepted(self, document_id: UUID, parsed: Parsed204) -> None:
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
