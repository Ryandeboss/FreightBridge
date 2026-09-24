# Five-Minute Demo Script

Do not include credentials in the demo. Enter the operations token privately before the walkthrough.

## 0:00-0:30 - Problem And Architecture

Click: open the repository README and show the architecture diagram.

Say: "FreightBridge is a synthetic integration layer between Apex REST/JSON and Midwest X12/SFTP. The goal is to show how modern API traffic, legacy EDI files, canonical mapping, acknowledgments, observability, and testing fit together."

Proves: the project has a clear integration problem and a current architecture.

## 0:30-1:15 - Integration Lab Happy Path

Click: Analyst Console -> Integration Lab -> Happy Paths -> Full Shipment Lifecycle.

Say: "The lab creates a safe synthetic run so I can demonstrate the full lifecycle without hand-building every request."

Proves: the demo is repeatable and uses the real deployed workflow.

## 1:15-2:00 - 204 / 997 / 990 / 214 Path

Click: open the Lab run detail and inspect step summaries, especially the Midwest 204 preview and return documents.

Say: "The 204 is the load tender. The 997 is only a technical acknowledgment. The 990 is the business tender decision. The 214 events move the shipment through pickup, in transit, arrived, and delivered."

Proves: real EDI semantics, not just file passing.

## 2:00-2:45 - Business Trace And Timeline

Click: Business Trace for the generated load id. Open a related Transaction Detail.

Say: "A support analyst can follow one business shipment across JSON requests, X12 files, SFTP movement, mappings, logs, and errors."

Proves: operations observability and correlation.

## 2:45-3:30 - Unsupported 214 Status Failure Drill

Click: Integration Lab -> Failure Drills -> unsupported 214 status.

Say: "This creates an expected mapping failure: X12 parsing succeeds, envelope validation succeeds, but the Midwest business profile rejects the unsupported AT7 code."

Proves: layer-specific diagnosis.

## 3:30-4:15 - Failure Detail

Click: Failure Queue -> open the new failure.

Say: "The failure captures code, category, stage, retryability, correlation, and related transaction context. Parsing failure, contract validation, mapping failure, and auth failure are intentionally classified differently."

Proves: safe troubleshooting workflow.

## 4:15-4:45 - Partners And Mappings

Click: Partners -> MWCX, then Mappings -> `CANONICAL_TO_MWCX_204`.

Say: "Trading partner identity and mapping versions are explicit. Runtime transactions store mapping audit metadata so later changes are traceable."

Proves: versioned configuration and audit.

## 4:45-5:00 - Testing Story

Click: GitHub Actions CI run.

Say: "Normal CI runs contract tests, X12 regression, coverage gates, frontend tests, docs validation, and an ephemeral PostgreSQL migration chain. Deployed regression is manual because it mutates shared synthetic data."

Proves: correctness is defended at multiple boundaries.

## Fallback

If a free hosted service is cold-starting or unavailable, continue with:

- README architecture and sequence diagrams.
- Sample payloads under [sample-data](../../sample-data/).
- Evidence index links in [evidence.md](evidence.md).
- GitHub Actions CI evidence.
- Real screenshots if previously captured safely.

Do not disable security or expose credentials to keep the demo moving.
