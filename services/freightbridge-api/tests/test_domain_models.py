from datetime import UTC, datetime
from decimal import Decimal
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.domain import (
  CanonicalLocation,
  CanonicalShipment,
  EquipmentType,
  IntegrationDirection,
  IntegrationError,
  IntegrationTransaction,
  MessageFormat,
  ProcessingStage,
  ReferenceType,
  ShipmentReference,
  TenderDecision,
  TenderResponse,
  Transport,
)
from app.domain.enums import ErrorCategory


def aware_at(hour: int, minute: int = 0) -> datetime:
  return datetime(2026, 10, 1, hour, minute, tzinfo=UTC)


def location(name: str = 'ABC Factory', state: str = 'IL') -> CanonicalLocation:
  return CanonicalLocation(
    facility_name=name,
    address_line_1='200 Industrial Rd',
    city='Aurora',
    state=state,
    postal_code='60505',
    scheduled_at=aware_at(14),
  )


def shipment(**overrides: object) -> CanonicalShipment:
  values = {
    'shipment_number': 'LOAD500',
    'equipment_type': EquipmentType.DRY_VAN_53,
    'weight_lbs': Decimal('42000'),
    'pieces': 22,
    'commodity_description': 'Packaged auto parts',
    'origin': location(),
    'destination': location('XYZ Warehouse', 'MI'),
    'references': [
      ShipmentReference(reference_type=ReferenceType.BOL, reference_value='BOL900'),
      ShipmentReference(reference_type=ReferenceType.PO, reference_value='PO111'),
      ShipmentReference(
        reference_type=ReferenceType.CUSTOMER_REFERENCE,
        reference_value='CUST-REF-500',
      ),
    ],
  }
  values.update(overrides)
  return CanonicalShipment(**values)


def test_valid_canonical_shipment() -> None:
  model = shipment()

  assert model.shipment_number == 'LOAD500'
  assert model.weight_lbs == Decimal('42000')
  assert [stop.stop_type.value for stop in model.stops()] == ['PICKUP', 'DELIVERY']


def test_shipment_rejects_zero_or_negative_weight() -> None:
  with pytest.raises(ValidationError):
    shipment(weight_lbs=Decimal('0'))

  with pytest.raises(ValidationError):
    shipment(weight_lbs=Decimal('-1'))


def test_shipment_rejects_invalid_piece_count() -> None:
  with pytest.raises(ValidationError):
    shipment(pieces=0)


def test_location_and_reference_validation() -> None:
  assert location(state='il').state == 'IL'

  with pytest.raises(ValidationError):
    location(state='ILL')

  with pytest.raises(ValidationError):
    ShipmentReference(reference_type=ReferenceType.BOL, reference_value='')


def test_tender_response_acceptance_and_rejection_fields() -> None:
  accepted = TenderResponse(
    shipment_id=uuid4(),
    carrier_partner_id=uuid4(),
    decision=TenderDecision.ACCEPTED,
    carrier_load_number='MWC900500',
    decided_at=aware_at(15),
    received_at=aware_at(15, 1),
  )

  assert accepted.decision == TenderDecision.ACCEPTED

  rejected = TenderResponse(
    shipment_id=uuid4(),
    carrier_partner_id=uuid4(),
    decision=TenderDecision.REJECTED,
    reason_code='CAPACITY_UNAVAILABLE',
    decided_at=aware_at(15),
    received_at=aware_at(15, 1),
  )

  assert rejected.reason_code == 'CAPACITY_UNAVAILABLE'

  with pytest.raises(ValidationError):
    TenderResponse(
      shipment_id=uuid4(),
      carrier_partner_id=uuid4(),
      decision=TenderDecision.REJECTED,
      decided_at=aware_at(15),
      received_at=aware_at(15, 1),
    )


def test_integration_transaction_models() -> None:
  partner_id = uuid4()
  json_transaction = IntegrationTransaction(
    correlation_id='corr-LOAD500-001',
    partner_id=partner_id,
    direction=IntegrationDirection.INBOUND,
    transport=Transport.REST,
    message_format=MessageFormat.JSON,
    document_type='APEX_LOAD_TENDER',
    business_identifier='LOAD500',
  )

  assert json_transaction.x12_version is None

  x12_transaction = IntegrationTransaction(
    correlation_id='corr-LOAD500-204',
    partner_id=partner_id,
    direction=IntegrationDirection.OUTBOUND,
    transport=Transport.SFTP,
    message_format=MessageFormat.X12,
    document_type='204',
    business_identifier='LOAD500',
    x12_version='004010',
    interchange_control_number='000000905',
  )

  assert x12_transaction.message_format == MessageFormat.X12

  with pytest.raises(ValidationError):
    IntegrationTransaction(
      correlation_id='bad',
      partner_id=partner_id,
      direction=IntegrationDirection.INBOUND,
      transport=Transport.REST,
      message_format=MessageFormat.X12,
      document_type='204',
    )


def test_safe_integration_error_structure() -> None:
  error = IntegrationError(
    transaction_id=uuid4(),
    category=ErrorCategory.BUSINESS_VALIDATION_ERROR,
    error_code='MISSING_DESTINATION',
    safe_message='Required destination information is missing.',
    stage=ProcessingStage.BUSINESS_VALIDATION,
  )

  assert error.safe_message == 'Required destination information is missing.'
