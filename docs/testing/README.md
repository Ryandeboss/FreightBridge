# Testing Notes

Current test coverage:

- Frontend lint and production build.
- Backend `/health` endpoint test with pytest.
- FreightBridge domain model, repository, and readiness tests.
- Apex simulator model, auth, business endpoint, status progression, error envelope, and readiness tests.
- Apex -> FreightBridge ingestion, mapping, audit, dispatch, and transaction-persistence regression tests.
- GitHub Actions workflow for frontend and backend checks.

Future milestones should add API contract tests, simulator tests, database tests, and integration pipeline tests.
