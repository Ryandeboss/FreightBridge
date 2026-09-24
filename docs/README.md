# FreightBridge Documentation

This is the documentation hub for FreightBridge. Start with the portfolio overview for the current system, then use the technical reference sections for implementation details.

## Portfolio Overview

- [Portfolio guide](portfolio/README.md)
- [Architecture](portfolio/architecture.md)
- [End-to-end flow](portfolio/end-to-end-flow.md)
- [Troubleshooting case study](portfolio/troubleshooting-case-study.md)
- [Technical decisions](portfolio/technical-decisions.md)
- [Evidence index](portfolio/evidence.md)
- [Demo script](portfolio/demo-script.md)
- [Interview guide](portfolio/interview-guide.md)
- [Resume bullets](portfolio/resume-bullets.md)
- [Screenshot plan](portfolio/screenshots/README.md)

## Architecture

- [Initial architecture](architecture/initial-architecture.md)
- [Canonical data model](architecture/canonical-data-model.md)
- [Database schema](architecture/database-schema.md)
- [Interface control document](architecture/interface-control-document.md)
- [Generic X12 foundation](architecture/x12-foundation.md)
- [Midwest 204 generation](architecture/midwest-204-generation.md)
- [Contract decisions](architecture/contract-decisions.md)

Historical architecture files may describe earlier milestone state. The current portfolio summary is [portfolio architecture](portfolio/architecture.md).

## Partner Contracts

- [Partner documentation index](partners/README.md)
- [Apex OpenAPI contract](partners/apex/openapi.yaml)
- [Midwest EDI implementation guide](partners/midwest/edi-implementation-guide.md)
- [Trading partner matrix](partners/trading-partner-matrix.md)
- [Error contract](partners/error-contract.md)

## Mappings

- [Mapping documentation index](mappings/README.md)
- [Apex load tender to canonical shipment](mappings/apex-load-tender-to-canonical.md)
- [Canonical shipment to Midwest 204](mappings/canonical-to-midwest-204.md)
- [Midwest 214 to canonical event](mappings/midwest-214-to-canonical-event.md)
- [Midwest 997 functional acknowledgment](mappings/midwest-997-functional-acknowledgment.md)

## Operations

- [Operations index](operations/README.md)
- [Deployment](operations/deployment.md)
- [SFTPGo Railway runbook](operations/sftpgo-railway-runbook.md)
- [Operational observability and failure queue](operations/observability-and-failure-queue.md)
- [Idempotency, replay, and manual retry](operations/idempotency-and-retry.md)
- [Analyst Console](operations/analyst-console.md)
- [Integration Lab](operations/integration-lab.md)
- [Trading partner configuration](operations/trading-partner-configuration.md)
- [Mapping change control](operations/mapping-change-control.md)

## Testing

- [Testing index](testing/README.md)
- [Test strategy](testing/test-strategy.md)
- [Regression traceability](testing/regression-traceability.md)
- [Milestone 20 regression hardening](testing/milestone-20-regression-hardening.md)
- [Deployed acceptance harness](testing/deployed-acceptance-harness.md)

## Historical Milestone Acceptance

Milestone acceptance documents under [testing](testing/README.md) remain useful evidence of the project evolution. They should be read as historical validation records when they describe capabilities as future work.
