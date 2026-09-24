# Milestone 19 Failure Injection Acceptance

Milestone 19 adds controlled Integration Lab Failure Drills for troubleshooting education. No Milestone 19 database migration is required; run/step metadata is stored in existing Lab JSON fields.

## Supported Drills

| Drill | Layer | Expected Code | Category | Stage |
| --- | --- | --- | --- | --- |
| `APEX_BAD_AUTH` | Authentication | `AUTHENTICATION_ERROR` | `AUTHENTICATION_ERROR` | `AUTHENTICATION` |
| `APEX_INVALID_JSON` | Parsing | `INVALID_JSON` | `SYNTAX_ERROR` | `PARSING` |
| `APEX_INVALID_CONTRACT` | Validation | `INVALID_APEX_LOAD` | `BUSINESS_VALIDATION_ERROR` | `VALIDATION` |
| `APEX_DUPLICATE_SHIPMENT` | Business validation | `DUPLICATE_SHIPMENT` | `DUPLICATE_TRANSACTION` | `BUSINESS_VALIDATION` |
| `X12_214_CONTROL_MISMATCH` | X12 envelope | `CONTROL_NUMBER_MISMATCH` | `SYNTAX_ERROR` | `PARSING` |
| `X12_214_UNSUPPORTED_STATUS` | Mapping | `UNSUPPORTED_AT7_CODE` | `MAPPING_ERROR` | `MAPPING` |
| `X12_214_WRONG_VERSION` | Mapping/profile | `UNSUPPORTED_X12_VERSION` | `MAPPING_ERROR` | `MAPPING` |
| `SFTP_HOST_KEY_MISMATCH` | Transport | `SFTP_HOST_KEY_MISMATCH` | `TRANSPORT_ERROR` | `TRANSPORT_BOUNDARY` |

## Acceptance Focus

- Failure scenarios are identified as `FAILURE_DRILL`; existing scenarios remain `HAPPY_PATH`.
- The Lab step succeeds only when the expected persisted failure classification is observed.
- The underlying message-level `IntegrationTransaction` is `FAILED`.
- `Expected` and `Observed` panels show code, category, stage, retryability, transport, and document type.
- Failure Detail and Transaction Detail links open the authoritative operations pages.
- Failure Queue links use safe filters.
- `SFTP_HOST_KEY_MISMATCH` explains that no transaction exists because failure occurred before ingestion.
- X12 drills generate server-side synthetic 214 files; the browser never submits raw X12.
- Exact synthetic X12 fault artifacts are moved from `/error` to archive after observation when cleanup succeeds.

## Security Boundary

Failure Drills are allowlisted and do not provide arbitrary:

- raw JSON editor
- raw X12 editor
- HTTP header or token input
- URL or host input
- SFTP credential input
- SQL input

Valid Apex authentication for server-side drills uses configured backend settings only. Real bearer tokens, SFTP private keys, host-key fingerprints, database URLs, and Supabase secrets are never returned to the UI or stored in Lab summaries.

## Deployed Acceptance

Run locally against deployed services:

```bash
python -m pip install -r scripts/acceptance/requirements.txt
python -m playwright install chromium
python scripts/acceptance/milestone19.py
```

Required for this milestone:

- `FREIGHTBRIDGE_BASE_URL`
- `ANALYST_UI_BASE_URL`
- `OPERATIONS_API_BEARER_TOKEN`

The shared acceptance config also expects the existing partner simulator URL/token variables. No new secrets, variables, or environment settings are introduced by Milestone 19.

The deployed acceptance runs:

- `APEX_BAD_AUTH`
- `APEX_INVALID_CONTRACT`
- `X12_214_UNSUPPORTED_STATUS`

It resolves only the synthetic `IntegrationError` rows created by the acceptance run and does not delete history.
