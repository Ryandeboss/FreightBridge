# Testing Notes

Current test coverage:

- Frontend lint and production build.
- Backend `/health` endpoint test with pytest.
- FreightBridge domain model, repository, and readiness tests.
- Apex simulator model, auth, business endpoint, status progression, error envelope, and readiness tests.
- Apex -> FreightBridge ingestion, mapping, audit, dispatch, and transaction-persistence regression tests.
- Generic X12 parsing, envelope validation, serializer, and structural fixture tests.
- Midwest 204 generation tests, including LOAD500 fixture reproduction and business validation failures.
- Midwest simulator receipt/extraction tests and FreightBridge direct-delivery audit tests.
- Midwest 990 tender-response generation, FreightBridge inbound persistence/audit, Apex forwarding, and Apex tender-status readback tests.
- GitHub Actions workflow for frontend and backend checks.

Future milestones should add API contract tests, simulator tests, database tests, and integration pipeline tests.
