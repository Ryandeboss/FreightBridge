# FreightBridge Test Strategy

FreightBridge uses layered regression tests to protect the integration contracts that matter most: REST payloads, X12 envelopes, mapping behavior, persistence, retry/idempotency, operations visibility, analyst workflows, and deployed end-to-end behavior.

## Push And Pull Request Tests

Normal CI is isolated from deployed infrastructure. It does not call Render, Vercel, Railway, Supabase, or real SFTP.

- Unit tests: domain models, mappers, X12 parser/serializer, error classification, state progression, simulator models, and service helpers.
- Contract tests: stable FastAPI route/method surfaces, important response fields, Apex documented OpenAPI paths/schemas, simulator enum values, Midwest X12 profile identity, and Analyst Console routes.
- Integration-style tests with fakes: Apex ingestion, Midwest 204/990/997/214 processing, SFTP behavior, manual retry, idempotency, failure drills, configuration workflows, and Integration Lab.
- Ephemeral database tests: GitHub Actions starts PostgreSQL 16, applies migrations 001-011 from scratch, verifies schema/seed data, and runs real repository smoke tests with `TEST_DATABASE_URL`.
- UI tests: Vitest renders the real React app through the API client boundary with mocked HTTP.
- Coverage gates: pytest-cov for Python services and Vitest V8 coverage for the Analyst UI. The FreightBridge API unit coverage gate excludes the database repository modules because they require a real PostgreSQL schema and are exercised by the separate ephemeral database regression job in the same workflow.

## Manual Deployed Acceptance

Deployed acceptance is `workflow_dispatch` only because it mutates synthetic shared environments. Milestone 20 reuses:

- Milestone 18: full Integration Lab happy path.
- Milestone 19: representative controlled failure drills.

The Milestone 20 wrapper is a meta-runner, not a copy of those suites.

## Security Boundary

Normal CI uses only local processes and ephemeral PostgreSQL. Deployed acceptance reads existing GitHub secrets and variables, never new production secrets. Regression tests assert operational and Lab responses avoid token, database URL, private key, fingerprint, and authorization-header leakage.

## Warnings

Current FastAPI/Starlette deprecation warnings are known and benign for this milestone. Dependency modernization is intentionally outside Milestone 20.
