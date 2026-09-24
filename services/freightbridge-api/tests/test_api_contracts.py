from app.main import app
from app.models.lab import LabRunView, LabStepView
from app.models.operations import (
  IntegrationErrorView,
  TransactionDetail,
  TransactionSummary,
)


def test_protected_public_routes_keep_expected_methods() -> None:
  routes = {
    (path, method.upper())
    for path, operations in app.openapi()['paths'].items()
    for method in operations
  }

  expected = {
    ('/health', 'GET'),
    ('/readiness', 'GET'),
    ('/api/integrations/apex/load-tenders', 'POST'),
    ('/api/integrations/midwest/load-tenders/{shipment_number}/generate', 'POST'),
    ('/api/integrations/midwest/load-tenders/{shipment_number}/dispatch-direct', 'POST'),
    ('/api/integrations/midwest/load-tenders/{shipment_number}/dispatch-sftp', 'POST'),
    ('/api/integrations/midwest/tender-responses', 'POST'),
    ('/api/integrations/midwest/sftp/outbound/poll', 'POST'),
    ('/api/integrations/midwest/load-tenders/{shipment_number}/functional-acknowledgment', 'GET'),
    ('/api/integrations/midwest/sftp/readiness', 'GET'),
    ('/api/operations/transactions', 'GET'),
    ('/api/operations/transactions/{transaction_id}', 'GET'),
    ('/api/operations/transactions/{transaction_id}/retry', 'POST'),
    ('/api/operations/business/{business_identifier}/trace', 'GET'),
    ('/api/operations/errors', 'GET'),
    ('/api/operations/errors/{error_id}', 'GET'),
    ('/api/configuration/partners', 'GET'),
    ('/api/configuration/partners/{partner_code}', 'GET'),
    ('/api/configuration/partners/{partner_code}', 'PATCH'),
    ('/api/configuration/mappings', 'GET'),
    ('/api/configuration/mappings/{mapping_id}', 'GET'),
    ('/api/lab/readiness', 'GET'),
    ('/api/lab/runs', 'GET'),
    ('/api/lab/runs', 'POST'),
    ('/api/lab/runs/{run_id}', 'GET'),
    ('/api/lab/runs/{run_id}/steps/{step_key}/execute', 'POST'),
    ('/api/lab/runs/{run_id}/run-next', 'POST'),
  }

  assert expected <= routes


def test_operations_response_contract_fields_are_stable() -> None:
  summary_fields = TransactionSummary.model_json_schema(by_alias=True)['properties']
  detail_fields = TransactionDetail.model_json_schema(by_alias=True)['properties']
  error_fields = IntegrationErrorView.model_json_schema(by_alias=True)['properties']

  assert {
    'id',
    'correlationId',
    'businessIdentifier',
    'documentType',
    'transport',
    'processingStatus',
    'processingStage',
    'mappingProfileId',
    'mappingProfileVersion',
    'mappingKey',
  } <= set(summary_fields)
  assert {
    'payloadHash',
    'rawPayloadLocation',
    'retryCount',
    'replayOfTransactionId',
  } <= set(detail_fields)
  assert {
    'errorId',
    'transactionId',
    'businessIdentifier',
    'errorCode',
    'category',
    'stage',
    'retryable',
    'safeMessage',
  } <= set(error_fields)


def test_lab_response_contract_fields_are_stable() -> None:
  run_fields = LabRunView.model_json_schema(by_alias=True)['properties']
  step_fields = LabStepView.model_json_schema(by_alias=True)['properties']

  assert {
    'scenarioKey',
    'businessIdentifier',
    'status',
    'inputSnapshot',
    'resultSummary',
    'steps',
  } <= set(run_fields)
  assert {
    'stepKey',
    'requestSummary',
    'responseSummary',
    'relatedTransactionIds',
    'errorCode',
    'safeMessage',
  } <= set(step_fields)
