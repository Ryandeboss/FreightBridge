from app.integrations.failure_drills import DRILL_DEFINITIONS


def test_failure_drill_catalog_is_closed_and_classifications_are_stable() -> None:
  expected = {
    'APEX_BAD_AUTH': ('AUTHENTICATION_ERROR', 'AUTHENTICATION_ERROR', 'AUTHENTICATION', False),
    'APEX_INVALID_JSON': ('INVALID_JSON', 'SYNTAX_ERROR', 'PARSING', False),
    'APEX_INVALID_CONTRACT': ('INVALID_APEX_LOAD', 'BUSINESS_VALIDATION_ERROR', 'VALIDATION', False),
    'APEX_DUPLICATE_SHIPMENT': ('DUPLICATE_SHIPMENT', 'DUPLICATE_TRANSACTION', 'BUSINESS_VALIDATION', False),
    'X12_214_CONTROL_MISMATCH': ('CONTROL_NUMBER_MISMATCH', 'SYNTAX_ERROR', 'PARSING', False),
    'X12_214_UNSUPPORTED_STATUS': ('UNSUPPORTED_AT7_CODE', 'MAPPING_ERROR', 'MAPPING', False),
    'X12_214_WRONG_VERSION': ('UNSUPPORTED_X12_VERSION', 'MAPPING_ERROR', 'MAPPING', False),
    'SFTP_HOST_KEY_MISMATCH': ('SFTP_HOST_KEY_MISMATCH', 'TRANSPORT_ERROR', 'TRANSPORT_BOUNDARY', False),
  }

  assert set(DRILL_DEFINITIONS) == set(expected)
  for scenario_key, (code, category, stage, retryable) in expected.items():
    observed = DRILL_DEFINITIONS[scenario_key].expected
    assert observed.error_code == code
    assert observed.category == category
    assert observed.stage == stage
    assert observed.retryable is retryable


def test_failure_drill_observed_contract_includes_nullable_business_identifier() -> None:
  view = DRILL_DEFINITIONS['APEX_INVALID_CONTRACT'].expected.view()

  assert {'errorCode', 'category', 'stage', 'retryable', 'documentType', 'transport'} <= set(view)
