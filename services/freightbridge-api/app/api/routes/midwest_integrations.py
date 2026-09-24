from collections.abc import Iterator
from contextlib import ExitStack

import psycopg
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse

from app.infrastructure.configuration_repository import IntegrationConfigurationRepository
from app.infrastructure.database import DatabaseConnectivityError, connect
from app.infrastructure.repositories import IntegrationRepository
from app.integrations.configuration import load_active_mapping_profile
from app.integrations.common.correlation import CORRELATION_HEADER, resolve_correlation_id
from app.integrations.common.errors import ClassifiedIntegrationFailure, IntegrationAPIError
from app.integrations.midwest.dispatch_service import MidwestDirectDispatchService
from app.integrations.midwest.errors import Midwest204MappingError, MidwestShipmentNotFoundError
from app.integrations.midwest.inbound_990_service import Midwest990IngestionService
from app.integrations.midwest.service import Midwest204DependencyError, Midwest204GenerationService
from app.integrations.midwest.sftp_poll_service import MidwestSftpOutboundPollService, MidwestSftpReadinessService
from app.integrations.midwest.transport import MidwestDeliveryError, MidwestHttpTestTransport, MidwestSftpTransport
from app.models.configuration import Midwest204MappingConfig

router = APIRouter(prefix='/api/integrations/midwest', tags=['midwest integrations'])


def get_midwest_204_generation_service() -> Iterator[Midwest204GenerationService]:
  try:
    with connect() as connection:
      yield Midwest204GenerationService(connection=connection)
  except DatabaseConnectivityError as exc:
    raise HTTPException(
      status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
      detail={
        'error': {
          'code': 'DEPENDENCY_ERROR',
          'message': 'A downstream dependency failed while generating the Midwest 204.',
        }
      },
    ) from exc


def get_midwest_direct_dispatch_service() -> Iterator[MidwestDirectDispatchService]:
  try:
    with ExitStack() as stack:
      audit_connection = stack.enter_context(connect())
      business_connection = stack.enter_context(connect())
      yield MidwestDirectDispatchService(
        audit_connection=audit_connection,
        business_connection=business_connection,
        transport=MidwestHttpTestTransport(),
        configuration_repository=IntegrationConfigurationRepository(audit_connection),
      )
  except DatabaseConnectivityError as exc:
    raise HTTPException(
      status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
      detail={
        'error': {
          'code': 'DEPENDENCY_ERROR',
          'message': 'A downstream dependency failed while dispatching the Midwest 204.',
        }
      },
    ) from exc


def get_midwest_sftp_dispatch_service() -> Iterator[MidwestDirectDispatchService]:
  try:
    with ExitStack() as stack:
      audit_connection = stack.enter_context(connect())
      business_connection = stack.enter_context(connect())
      yield MidwestDirectDispatchService(
        audit_connection=audit_connection,
        business_connection=business_connection,
        transport=MidwestSftpTransport(),
        configuration_repository=IntegrationConfigurationRepository(audit_connection),
      )
  except DatabaseConnectivityError as exc:
    raise HTTPException(
      status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
      detail={
        'error': {
          'code': 'DEPENDENCY_ERROR',
          'message': 'A downstream dependency failed while dispatching the Midwest 204 via SFTP.',
        }
      },
    ) from exc


def get_midwest_990_ingestion_service() -> Iterator[Midwest990IngestionService]:
  try:
    with ExitStack() as stack:
      audit_connection = stack.enter_context(connect())
      business_connection = stack.enter_context(connect())
      yield Midwest990IngestionService(
        audit_connection=audit_connection,
        business_connection=business_connection,
        configuration_repository=IntegrationConfigurationRepository(audit_connection),
      )
  except DatabaseConnectivityError as exc:
    raise HTTPException(
      status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
      detail={
        'error': {
          'code': 'DEPENDENCY_ERROR',
          'message': 'A downstream dependency failed while ingesting the Midwest 990.',
        }
      },
    ) from exc


def get_midwest_sftp_outbound_poll_service() -> Iterator[MidwestSftpOutboundPollService]:
  try:
    with ExitStack() as stack:
      audit_connection = stack.enter_context(connect())
      business_connection = stack.enter_context(connect())
      yield MidwestSftpOutboundPollService(
        audit_connection=audit_connection,
        business_connection=business_connection,
        configuration_repository=IntegrationConfigurationRepository(audit_connection),
      )
  except DatabaseConnectivityError as exc:
    raise HTTPException(
      status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
      detail={
        'error': {
          'code': 'DEPENDENCY_ERROR',
          'message': 'A downstream dependency failed while polling Midwest SFTP outbound.',
        }
      },
    ) from exc


def get_midwest_sftp_readiness_service() -> MidwestSftpReadinessService:
  return MidwestSftpReadinessService()


def get_integration_repository() -> Iterator:
  try:
    with connect() as connection:
      yield IntegrationRepository(connection)
  except DatabaseConnectivityError as exc:
    raise HTTPException(
      status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
      detail={
        'error': {
          'code': 'DEPENDENCY_ERROR',
          'message': 'A downstream dependency failed while reading Midwest acknowledgments.',
        }
      },
    ) from exc


def get_configuration_repository() -> Iterator:
  try:
    with connect() as connection:
      yield IntegrationConfigurationRepository(connection)
  except DatabaseConnectivityError as exc:
    raise HTTPException(
      status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
      detail={
        'error': {
          'code': 'DEPENDENCY_ERROR',
          'message': 'A downstream dependency failed while reading configuration.',
        }
      },
    ) from exc


@router.post('/load-tenders/{shipment_number}/generate', status_code=status.HTTP_200_OK)
def generate_midwest_load_tender_preview(
  shipment_number: str,
  service: Midwest204GenerationService = Depends(get_midwest_204_generation_service),
  configuration_repository: IntegrationConfigurationRepository = Depends(get_configuration_repository),
) -> JSONResponse:
  try:
    active_mapping = load_active_mapping_profile(
      configuration_repository,
      'CANONICAL_TO_MWCX_204',
      Midwest204MappingConfig,
    )
    result = service.generate_for_shipment_number(
      shipment_number,
      config=active_mapping.config,
    )
  except MidwestShipmentNotFoundError:
    return JSONResponse(
      status_code=status.HTTP_404_NOT_FOUND,
      content={
        'error': {
          'code': 'SHIPMENT_NOT_FOUND',
          'message': 'Canonical shipment was not found.',
        }
      },
    )
  except Midwest204MappingError as exc:
    return JSONResponse(
      status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
      content={
        'error': {
          'code': 'MIDWEST_204_MAPPING_ERROR',
          'message': exc.message,
          'detailCode': exc.code.value,
          'field': exc.field,
        }
      },
    )
  except ClassifiedIntegrationFailure as exc:
    return JSONResponse(
      status_code=exc.status_code,
      content={
        'error': {
          'code': exc.code,
          'message': exc.message,
        }
      },
    )
  except (DatabaseConnectivityError, Midwest204DependencyError, psycopg.Error):
    return JSONResponse(
      status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
      content={
        'error': {
          'code': 'DEPENDENCY_ERROR',
          'message': 'A downstream dependency failed while generating the Midwest 204.',
        }
      },
    )

  return JSONResponse(
    status_code=status.HTTP_200_OK,
    content=result.response_body(),
  )


@router.post('/load-tenders/{shipment_number}/dispatch-direct', status_code=status.HTTP_202_ACCEPTED)
def dispatch_midwest_load_tender_direct(
  shipment_number: str,
  request: Request,
  service: MidwestDirectDispatchService = Depends(get_midwest_direct_dispatch_service),
) -> JSONResponse:
  correlation_id = resolve_correlation_id(request.headers.get(CORRELATION_HEADER))
  try:
    result = service.dispatch(
      shipment_number=shipment_number,
      correlation_id=correlation_id,
      idempotency_key=request.headers.get('Idempotency-Key'),
    )
  except MidwestShipmentNotFoundError:
    return JSONResponse(
      status_code=status.HTTP_404_NOT_FOUND,
      content={
        'error': {
          'code': 'SHIPMENT_NOT_FOUND',
          'message': 'Canonical shipment was not found.',
        }
      },
      headers={CORRELATION_HEADER: correlation_id},
    )
  except Midwest204MappingError as exc:
    return JSONResponse(
      status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
      content={
        'error': {
          'code': 'MIDWEST_204_MAPPING_ERROR',
          'message': exc.message,
          'detailCode': exc.code.value,
          'field': exc.field,
        }
      },
      headers={CORRELATION_HEADER: correlation_id},
    )
  except MidwestDeliveryError as exc:
    return JSONResponse(
      status_code=exc.status_code,
      content={
        'error': {
          'code': exc.code,
          'message': exc.message,
          'midwest': exc.response_body or {},
        }
      },
      headers={CORRELATION_HEADER: correlation_id},
    )
  except (DatabaseConnectivityError, Midwest204DependencyError, psycopg.Error):
    return JSONResponse(
      status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
      content={
        'error': {
          'code': 'DEPENDENCY_ERROR',
          'message': 'A downstream dependency failed while dispatching the Midwest 204.',
        }
      },
      headers={CORRELATION_HEADER: correlation_id},
    )

  return JSONResponse(
    status_code=status.HTTP_202_ACCEPTED,
    content=result.response_body(),
    headers={CORRELATION_HEADER: correlation_id},
  )


@router.post('/load-tenders/{shipment_number}/dispatch-sftp', status_code=status.HTTP_202_ACCEPTED)
def dispatch_midwest_load_tender_sftp(
  shipment_number: str,
  request: Request,
  service: MidwestDirectDispatchService = Depends(get_midwest_sftp_dispatch_service),
) -> JSONResponse:
  correlation_id = resolve_correlation_id(request.headers.get(CORRELATION_HEADER))
  try:
    result = service.dispatch(
      shipment_number=shipment_number,
      correlation_id=correlation_id,
      idempotency_key=request.headers.get('Idempotency-Key'),
    )
  except MidwestShipmentNotFoundError:
    return JSONResponse(
      status_code=status.HTTP_404_NOT_FOUND,
      content={'error': {'code': 'SHIPMENT_NOT_FOUND', 'message': 'Canonical shipment was not found.'}},
      headers={CORRELATION_HEADER: correlation_id},
    )
  except Midwest204MappingError as exc:
    return JSONResponse(
      status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
      content={
        'error': {
          'code': 'MIDWEST_204_MAPPING_ERROR',
          'message': exc.message,
          'detailCode': exc.code.value,
          'field': exc.field,
        }
      },
      headers={CORRELATION_HEADER: correlation_id},
    )
  except MidwestDeliveryError as exc:
    return JSONResponse(
      status_code=exc.status_code,
      content={'error': {'code': exc.code, 'message': exc.message}},
      headers={CORRELATION_HEADER: correlation_id},
    )
  except (DatabaseConnectivityError, Midwest204DependencyError, psycopg.Error):
    return JSONResponse(
      status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
      content={
        'error': {
          'code': 'DEPENDENCY_ERROR',
          'message': 'A downstream dependency failed while dispatching the Midwest 204 via SFTP.',
        }
      },
      headers={CORRELATION_HEADER: correlation_id},
    )

  return JSONResponse(
    status_code=status.HTTP_202_ACCEPTED,
    content=result.response_body(),
    headers={CORRELATION_HEADER: correlation_id},
  )


@router.post('/tender-responses', status_code=status.HTTP_202_ACCEPTED)
async def receive_midwest_tender_response(
  request: Request,
  service: Midwest990IngestionService = Depends(get_midwest_990_ingestion_service),
) -> JSONResponse:
  correlation_id = resolve_correlation_id(request.headers.get(CORRELATION_HEADER))
  raw_body = await request.body()

  try:
    result = service.ingest(
      raw_body=raw_body,
      authorization_header=request.headers.get('Authorization'),
      correlation_id=correlation_id,
    )
  except IntegrationAPIError as exc:
    return JSONResponse(
      status_code=exc.status_code,
      content={
        'error': {
          'code': exc.code,
          'message': exc.message,
          'correlationId': exc.correlation_id,
        }
      },
      headers={CORRELATION_HEADER: exc.correlation_id},
    )

  return JSONResponse(
    status_code=status.HTTP_202_ACCEPTED,
    content=result.response_body(),
    headers={CORRELATION_HEADER: result.correlation_id},
  )


@router.post('/sftp/outbound/poll', status_code=status.HTTP_202_ACCEPTED)
def poll_midwest_sftp_outbound(
  request: Request,
  service: MidwestSftpOutboundPollService = Depends(get_midwest_sftp_outbound_poll_service),
) -> JSONResponse:
  correlation_id = resolve_correlation_id(request.headers.get(CORRELATION_HEADER))
  result = service.poll(correlation_id=correlation_id)
  return JSONResponse(
    status_code=status.HTTP_202_ACCEPTED,
    content=result.response_body(),
    headers={CORRELATION_HEADER: correlation_id},
  )


@router.get('/load-tenders/{shipment_number}/functional-acknowledgment', status_code=status.HTTP_200_OK)
def get_midwest_functional_acknowledgment(
  shipment_number: str,
  repository = Depends(get_integration_repository),
) -> JSONResponse:
  acknowledgment = repository.fetch_latest_functional_acknowledgment_for_shipment(shipment_number)
  if acknowledgment is None:
    return JSONResponse(
      status_code=status.HTTP_404_NOT_FOUND,
      content={
        'error': {
          'code': 'FUNCTIONAL_ACKNOWLEDGMENT_NOT_FOUND',
          'message': 'No Midwest 997 functional acknowledgment was found for this shipment.',
        }
      },
    )
  return JSONResponse(
    status_code=status.HTTP_200_OK,
    content={
      'shipmentNumber': shipment_number,
      'acknowledgedDocumentType': acknowledgment['acknowledged_document_type'],
      'status': acknowledgment['status'],
      'transactionAckCode': acknowledgment['transaction_ack_code'],
      'groupAckCode': acknowledgment['group_ack_code'],
      'functionalIdentifier': acknowledgment['functional_identifier'],
      'acknowledgedGroupControlNumber': acknowledgment['acknowledged_group_control_number'],
      'acknowledgedTransactionControlNumber': acknowledgment['acknowledged_transaction_control_number'],
      'acknowledgedTransactionId': str(acknowledgment['acknowledged_transaction_id']),
      'ackTransactionId': str(acknowledgment['ack_transaction_id']),
      'receivedAt': acknowledgment['received_at'].isoformat(),
    },
  )


@router.get('/sftp/readiness', status_code=status.HTTP_200_OK)
def midwest_sftp_readiness(
  service: MidwestSftpReadinessService = Depends(get_midwest_sftp_readiness_service),
) -> JSONResponse:
  try:
    result = service.check()
  except Exception:
    result = {
      'status': 'not_ready',
      'transport': 'SFTP',
      'directories': {'inbound': False, 'outbound': False, 'archive': False, 'error': False},
    }
  return JSONResponse(status_code=status.HTTP_200_OK, content=result)
