# Integration Lab

The Integration Lab is an analyst-facing workbench for exercising implemented FreightBridge paths against the deployed partner simulators. It creates controlled synthetic runs, executes one integration step at a time, and records durable run/step state in `integration_lab_runs` and `integration_lab_steps`.

Supported happy-path scenarios:

- `TECHNICAL_ACK_ONLY`: Apex load tender, Midwest 204 over SFTP, Midwest 997 technical acknowledgment.
- `TENDER_ACCEPTED`: technical acknowledgment plus accepted Midwest 990 business response.
- `TENDER_REJECTED`: technical acknowledgment plus rejected Midwest 990 business response.
- `FULL_SHIPMENT_LIFECYCLE`: accepted tender plus 214 events for `PICKED_UP`, `IN_TRANSIT`, `ARRIVED`, and `DELIVERED`.

Supported failure drills:

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

The browser only calls `/api/lab` with `OPERATIONS_API_BEARER_TOKEN`. Partner simulator bearer tokens, inbound tokens, SFTP credentials, database URLs, and Supabase secrets remain server-side configuration.

Failure drills are allowlisted server-side scenarios. The browser can choose the scenario and optionally provide a safe load ID, but it cannot submit raw JSON, raw X12, arbitrary headers, tokens, URLs, SFTP endpoints, credentials, SQL, or custom fault mutations.

Operational behavior:

- Creating a run is side-effect free. Steps are created as `PENDING`.
- `Run Step` executes exactly that eligible step.
- `Run Next Step` executes exactly one next eligible step.
- `Run All Remaining` loops through the same one-step API until completion or failure.
- Completed steps are idempotent readbacks and do not repeat side effects.
- Failed steps can be retried and preserve safe error codes/messages.
- For failure drills, the Lab run succeeds only when the expected persisted failure classification is observed. The underlying `IntegrationTransaction` is expected to be `FAILED` for message-level drills.
- `SFTP_HOST_KEY_MISMATCH` is a pre-ingestion transport probe. It intentionally creates no `IntegrationTransaction` or fabricated `IntegrationError`; the absence of a transaction is part of the lesson.
- X12 failure drills generate a synthetic 214 server-side, upload the exact file to SFTP `/outbound`, process it with the real FreightBridge outbound poller, verify the file moved to `/error`, then archive only that exact Lab-owned file.

The run detail links back to Business Trace, Transactions, Failure Detail, and the Failure Queue so analysts can inspect the real audit trail produced by the scenario. Failure Detail remains authoritative for safe message, category, stage, retryability, processing logs, transaction link, and resolve/reopen controls.
