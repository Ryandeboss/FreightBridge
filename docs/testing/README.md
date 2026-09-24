# Testing Notes

Current test coverage:

- Frontend lint, Vitest console-flow tests, and production build.
- Backend `/health` endpoint test with pytest.
- FreightBridge domain model, repository, and readiness tests.
- Apex simulator model, auth, business endpoint, status progression, error envelope, and readiness tests.
- Apex -> FreightBridge ingestion, mapping, audit, dispatch, and transaction-persistence regression tests.
- Generic X12 parsing, envelope validation, serializer, and structural fixture tests.
- Midwest 204 generation tests, including LOAD500 fixture reproduction and business validation failures.
- Midwest simulator receipt/extraction tests and FreightBridge direct-delivery audit tests.
- Midwest 990 tender-response generation, FreightBridge inbound persistence/audit, Apex forwarding, and Apex tender-status readback tests.
- Midwest SFTP 204/990 dispatch and poll tests for atomic upload, archive/error moves, remote audit metadata, host-key/auth/config/file-conflict error mapping, and REST-harness compatibility.
- Midwest 214 shipment-status generation, SFTP dispatch/poll routing, canonical event persistence, out-of-order current-status protection, Apex forwarding, and Apex status-history readback tests.
- Midwest 997 functional-acknowledgment generation, SFTP dispatch/poll routing, AK1/AK2 correlation to outbound 204, technical acknowledgment persistence, and 997-vs-990 regression tests.
- Operations API authentication, transaction search/detail, business trace, correlation lookup, error queue, resolve/reopen, summary, and safe redaction tests.
- Milestone 15 idempotency, replay, SFTP archive collision, identical-file reconciliation, and manual retry architecture tests.
- Milestone 16 Analyst Console token-gate, dashboard, transaction, failure, business-trace, lock, and deployed browser acceptance tests.
- Milestone 17 partner configuration, mapping profile/version workflow, runtime mapping audit, Analyst Console Partners/Mappings, and deployed browser acceptance tests.
- Milestone 18 Integration Lab run/step APIs, Analyst Console scenario workflow, 204/997/990/214 inspection, and deployed browser acceptance tests.
- Offline unit tests for the deployed acceptance harness helpers.
- GitHub Actions workflow for frontend and backend checks.
- Manual-only GitHub Actions workflow for deployed acceptance.

For full deployed milestone acceptance, prefer the Python harness documented in [deployed-acceptance-harness.md](deployed-acceptance-harness.md). Milestone-specific guides include [Milestone 12](milestone-12-midwest-214-status-flow.md), [Milestone 13](milestone-13-997-functional-acknowledgment.md), [Milestone 14](milestone-14-operational-observability.md), [Milestone 15](milestone-15-idempotency-retry.md), [Milestone 16](milestone-16-analyst-console.md), [Milestone 17](milestone-17-partner-mapping-configuration.md), and [Milestone 18](milestone-18-integration-lab.md). The Postman collections remain useful for debugging individual routes.

Future milestones should add API contract tests, simulator tests, database tests, integration pipeline tests, and deployed acceptance scripts that reuse `scripts/acceptance/common.py`.
