# Five-Minute Demo Script

Do not show credentials. Enter the operations token privately before the walkthrough. For the cleanest portfolio demo, use a browser profile where the Training Mode path is already completed so the Ops Desk opens in the polished 10/10 review state.

## 0:00-0:45 — Training Desk And Product Framing

Click: open FreightBridge at `#/learn`.

Say: "FreightBridge is a synthetic logistics integration platform and analyst-training environment. Apex sends REST/JSON, Midwest exchanges X12 over SFTP, and FreightBridge translates through a canonical shipment model while preserving operational evidence."

Show:

- 10 / 10 Training Complete state.
- Apex → FreightBridge → Midwest relationship.
- zero pending training incidents.
- compact analyst tools and Advanced Console link.

Proves: the project is both an integration system and a support/learning workflow, not just a collection of APIs.

## 0:45-1:30 — Healthy Flow

Click: review the guided healthy flow, preferably Part 4.

Say: "The guided path starts with an Apex JSON tender, creates canonical state, generates the Midwest 204, distinguishes the 997 technical acknowledgment from the 990 business decision, then normalizes 214 shipment events and forwards status to Apex."

Call out:

- `204` load tender.
- `997` technical acknowledgment.
- `990` business tender response.
- `214` shipment status.
- `AF → PICKED_UP`, `X6 → IN_TRANSIT`, `X1 → ARRIVED`, `D1 → DELIVERED`.

Proves: the training is grounded in the real end-to-end implementation.

## 1:30-2:30 — Final Shift Incident

Click: Mission 10 — Production Incident.

Say: "The final shift removes most of the earlier hand-holding. This 214 reaches FreightBridge with valid transport, X12 controls, 004010 profile, and AF status, but the B10 shipment reference is wrong."

Show:

- Case Correlation.
- Raw 214 evidence.
- persisted `SHIPMENT_NOT_FOUND` / `BUSINESS_VALIDATION` classification.
- corrected recovery with the intended shipment reference.
- Apex-facing `PICKED_UP` evidence.

Proves: the learner can distinguish technical validity from business correlation and verify recovery from observable evidence.

## 2:30-3:15 — Compact Analyst Tools

Click: Transaction Search → Business Trace → Processing Log or Error Detail.

Say: "Training Mode keeps investigation inside the same workstation. I can search a load, follow its transaction chain, inspect processing logs, mapping metadata, partner profiles, and safe payload evidence without exposing secrets."

Proves: analyst usability and observability are first-class parts of the application.

## 3:15-4:00 — Replay And Event Sequencing

Click: Replay & Sequence Clinic.

Say: "FreightBridge treats three things differently: a duplicate business submission, an exact X12 replay, and a late event. Exact replay is auditable but skips duplicate side effects. A late ARRIVED event is retained in history but does not regress a DELIVERED shipment when its occurred time is older."

Proves: idempotency, replay, and event chronology are modeled deliberately.

## 4:00-4:35 — Advanced Console

Click: Open Advanced Console.

Show one or two of:

- Business Trace.
- Transaction Detail processing timeline.
- Failure Detail.
- Mapping profile/version.
- Partner profile.
- Integration Lab.

Say: "The same APIs support a full technical console for deeper operations and configuration work. Training Mode is a guided layer over real system behavior, not a separate mock application."

## 4:35-5:00 — Testing And Boundaries

Click: GitHub Actions.

Say: "CI covers frontend quality, API suites, partner simulators, documentation, the migration chain, and acceptance-harness tests. The deployed services are synthetic portfolio infrastructure; I am not claiming real customer traffic or full X12-standard coverage."

Proves: the project has explicit quality gates and honest product boundaries.

## Fallback

If a hosted free-tier service is cold-starting, continue with:

- the Training Desk / completed roadmap;
- README architecture and lifecycle diagrams;
- [evidence index](evidence.md);
- [screenshot plan](screenshots/README.md);
- green GitHub Actions evidence.

Do not disable security or expose credentials to keep a demo moving.
