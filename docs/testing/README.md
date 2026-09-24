# Testing Documentation

FreightBridge's current testing story is the Milestone 22 final acceptance system plus the Milestone 20 deployed regression pack. Multiple test boundaries protect different classes of integration risk.

## Current Regression Structure

- Unit tests: domain models, mappers, X12 parser/serializer, service helpers, failure classification, and simulator behavior.
- API contract tests: protected route/method surfaces and important response fields.
- Partner contract tests: Apex documented OpenAPI paths, schema fields, and enums.
- X12 regression tests: deterministic 204 generation, 997 technical acknowledgment, 990 business response, 214 status events, envelope controls, and parser behavior.
- Integration-state tests with fakes: idempotency, retry, SFTP behavior, mapping audit, Integration Lab, and failure drills.
- Real database tests: GitHub Actions starts PostgreSQL 16, applies migrations `001` through `011`, verifies schema/seed data, and runs repository smoke tests.
- Frontend tests: Analyst Console route and workflow regression with mocked HTTP at the API boundary.
- Documentation tests: local Markdown links are validated by `scripts/ci/validate_docs.py`.
- Deployed acceptance: manual black-box workflows against synthetic hosted environments, including final MVP preflight/postflight checks.

See [test strategy](test-strategy.md), [regression traceability](regression-traceability.md), [Milestone 20 regression hardening](milestone-20-regression-hardening.md), and [Milestone 22 final acceptance](milestone-22-final-acceptance.md).

## Deployed Acceptance

The deployed acceptance harness remains manual because it mutates shared synthetic test data. See [deployed acceptance harness](deployed-acceptance-harness.md).

Key current flows:

- [Milestone 18 Integration Lab happy path](milestone-18-integration-lab.md)
- [Milestone 19 controlled failure injection](milestone-19-failure-injection.md)
- [Milestone 20 regression pack](milestone-20-regression-hardening.md)
- [Milestone 22 final deployed acceptance](milestone-22-final-acceptance.md)
- [Final acceptance checklist](final-acceptance-checklist.md)

## Historical Milestone Records

Earlier milestone documents remain linked as implementation history and acceptance evidence:

- [Milestone 4 database acceptance](milestone-4-database-acceptance.md)
- [Milestone 5 Apex acceptance](milestone-5-apex-acceptance.md)
- [Milestone 6 Apex -> FreightBridge integration](milestone-6-apex-freightbridge-integration.md)
- [Milestone 7 X12 foundation](milestone-7-x12-foundation.md)
- [Milestone 8 Midwest 204 generation](milestone-8-midwest-204-generation.md)
- [Milestone 9 Midwest simulator](milestone-9-midwest-simulator.md)
- [Milestone 10 Midwest 990 return flow](milestone-10-midwest-990-return-flow.md)
- [Milestone 11 SFTP transport](milestone-11-sftp-transport.md)
- [Milestone 12 Midwest 214 status flow](milestone-12-midwest-214-status-flow.md)
- [Milestone 13 997 functional acknowledgment](milestone-13-997-functional-acknowledgment.md)
- [Milestone 14 operational observability](milestone-14-operational-observability.md)
- [Milestone 15 idempotency and retry](milestone-15-idempotency-retry.md)
- [Milestone 16 Analyst Console](milestone-16-analyst-console.md)
- [Milestone 17 partner mapping configuration](milestone-17-partner-mapping-configuration.md)
- [Milestone 18 Integration Lab](milestone-18-integration-lab.md)
- [Milestone 19 failure injection](milestone-19-failure-injection.md)
- [Milestone 20 regression hardening](milestone-20-regression-hardening.md)

These files may describe features as future work relative to their milestone. The current system status is summarized in the repository [README](../../README.md) and [portfolio docs](../portfolio/README.md).
