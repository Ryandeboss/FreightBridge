import os
from datetime import datetime, timezone
from uuid import UUID

import psycopg
import pytest

from app.domain import (
  ErrorCategory,
  IntegrationDirection,
  IntegrationTransaction,
  MessageFormat,
  ProcessingLog,
  ProcessingStage,
  ProcessingStatus,
  ShipmentEvent,
  ShipmentStatus,
  Transport,
)
from app.infrastructure.configuration_repository import IntegrationConfigurationRepository
from app.infrastructure.lab_repository import IntegrationLabRepository
from app.infrastructure.repositories import FreightBridgeRepository, IntegrationRepository
from tests.support.builders import canonical_shipment


pytestmark = pytest.mark.skipif(
  not os.environ.get('TEST_DATABASE_URL'),
  reason='TEST_DATABASE_URL is required for opt-in database regression tests.',
)


def _connect():
  return psycopg.connect(os.environ['TEST_DATABASE_URL'])


def test_migration_chain_created_expected_tables_and_seeded_partners() -> None:
  expected_tables = {
    ('public', 'trading_partners'),
    ('public', 'shipments'),
    ('public', 'shipment_stops'),
    ('public', 'shipment_references'),
    ('public', 'tender_responses'),
    ('public', 'shipment_events'),
    ('public', 'integration_transactions'),
    ('public', 'processing_logs'),
    ('public', 'integration_errors'),
    ('public', 'integration_message_payloads'),
    ('public', 'integration_retry_attempts'),
    ('public', 'mapping_profiles'),
    ('public', 'mapping_rules'),
    ('public', 'integration_lab_runs'),
    ('public', 'integration_lab_steps'),
    ('apex_sim', 'loads'),
    ('apex_sim', 'load_locations'),
    ('apex_sim', 'tender_responses'),
    ('apex_sim', 'shipment_statuses'),
    ('midwest_sim', 'loads'),
    ('midwest_sim', 'inbound_edi_documents'),
    ('midwest_sim', 'outbound_edi_documents'),
    ('midwest_sim', 'shipment_events'),
  }
  with _connect() as connection:
    with connection.cursor() as cursor:
      cursor.execute(
        """
          SELECT table_schema, table_name
          FROM information_schema.tables
          WHERE table_schema in ('public', 'apex_sim', 'midwest_sim')
        """
      )
      assert expected_tables <= set(cursor.fetchall())

      cursor.execute(
        """
          SELECT partner_code, business_role, integration_style
          FROM public.trading_partners
          WHERE partner_code in ('APEX', 'MWCX')
          ORDER BY partner_code
        """
      )
      assert cursor.fetchall() == [
        ('APEX', 'BROKER_3PL', 'REST_JSON'),
        ('MWCX', 'MOTOR_CARRIER', 'X12_SFTP'),
      ]


def test_real_repositories_persist_core_integration_state() -> None:
  with _connect() as connection:
    try:
      freightbridge = FreightBridgeRepository(connection)
      integration = IntegrationRepository(connection)
      lab = IntegrationLabRepository(connection)
      configuration = IntegrationConfigurationRepository(connection)
      apex_partner = freightbridge.fetch_trading_partner_by_code('APEX')
      assert apex_partner is not None
      shipment = canonical_shipment(shipment_number='DBREG900')
      shipment_id = freightbridge.create_shipment(shipment)
      fetched = freightbridge.fetch_shipment_by_number('DBREG900')

      assert fetched is not None
      assert fetched.shipment_number == 'DBREG900'
      assert [stop.location.city for stop in fetched.stops()] == ['Aurora', 'Detroit']
      assert {reference.reference_value for reference in fetched.references} >= {'BOL900', 'PO111'}

      transaction_id = integration.create_transaction(
        IntegrationTransaction(
          correlation_id='corr-dbreg-900',
          partner_id=apex_partner['id'],
          direction=IntegrationDirection.INBOUND,
          transport=Transport.REST,
          message_format=MessageFormat.JSON,
          document_type='APEX_LOAD_TENDER',
          business_identifier='DBREG900',
          processing_status=ProcessingStatus.FAILED,
          processing_stage=ProcessingStage.VALIDATION,
        )
      )
      log_id = integration.append_log(
        ProcessingLog(
          transaction_id=transaction_id,
          stage=ProcessingStage.VALIDATION,
          status=ProcessingStatus.FAILED,
          message='Database regression log.',
          metadata={'source': 'test'},
        )
      )
      error_id = integration.append_error(
        transaction_id=transaction_id,
        category=ErrorCategory.BUSINESS_VALIDATION_ERROR,
        error_code='INVALID_APEX_LOAD',
        safe_message='Database regression error.',
        stage=ProcessingStage.VALIDATION,
        retryable=False,
      )
      integration.store_message_payload(
        transaction_id=transaction_id,
        media_type='application/json',
        payload_sha256='sha256-dbreg',
        payload_text='{"loadId":"DBREG900"}',
      )
      run = lab.create_run(
        scenario_key='FULL_SHIPMENT_LIFECYCLE',
        business_identifier='DBREG900',
        input_snapshot={'loadId': 'DBREG900'},
        steps=[
          {
            'step_key': 'CREATE_APEX_LOAD',
            'sequence': 1,
            'display_name': 'Create Apex load',
            'sender': 'Analyst',
            'receiver': 'Apex Logistics',
            'transport': 'REST',
            'message_format': 'JSON',
            'document_type': 'APEX_LOAD_TENDER',
          }
        ],
      )
      mapping = configuration.get_active_mapping('CANONICAL_TO_MWCX_204')

      assert UUID(str(shipment_id))
      assert UUID(str(transaction_id))
      assert UUID(str(log_id))
      assert UUID(str(error_id))
      assert run['business_identifier'] == 'DBREG900'
      assert run['steps'][0]['step_key'] == 'CREATE_APEX_LOAD'
      assert mapping['mapping_key'] == 'CANONICAL_TO_MWCX_204'
      assert mapping['version_number'] == 1
    finally:
      connection.rollback()


def test_real_database_preserves_latest_business_time_for_shipment_status() -> None:
  with _connect() as connection:
    try:
      repository = FreightBridgeRepository(connection)
      shipment_id = repository.create_shipment(canonical_shipment(shipment_number='DBREG901'))
      delivered_at = datetime(2026, 10, 8, 18, 30, tzinfo=timezone.utc)
      arrived_at = datetime(2026, 10, 8, 18, 0, tzinfo=timezone.utc)

      repository.record_shipment_event(
        'DBREG901',
        ShipmentEvent(
          shipment_id=shipment_id,
          status=ShipmentStatus.DELIVERED,
          occurred_at=delivered_at,
          received_at=datetime(2026, 10, 8, 18, 31, tzinfo=timezone.utc),
          city='Detroit',
          state='MI',
        ),
      )
      repository.record_shipment_event(
        'DBREG901',
        ShipmentEvent(
          shipment_id=shipment_id,
          status=ShipmentStatus.ARRIVED,
          occurred_at=arrived_at,
          received_at=datetime(2026, 10, 8, 18, 45, tzinfo=timezone.utc),
          city='Detroit',
          state='MI',
        ),
      )

      fetched = repository.fetch_shipment_by_number('DBREG901')
      with connection.cursor() as cursor:
        cursor.execute(
          """
            SELECT status
            FROM shipment_events
            WHERE shipment_id = %s
            ORDER BY received_at
          """,
          (shipment_id,),
        )
        event_statuses = [row[0] for row in cursor.fetchall()]

      assert fetched is not None
      assert fetched.current_status == ShipmentStatus.DELIVERED
      assert fetched.current_status_occurred_at == delivered_at
      assert event_statuses == ['DELIVERED', 'ARRIVED']
    finally:
      connection.rollback()
