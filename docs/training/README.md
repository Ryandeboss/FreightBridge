# FreightBridge Training Mode

Training Mode turns FreightBridge into a guided workplace simulation for a new FreightBridge Integration Support Analyst. The public front door is `#/learn`: a deliberately minimal three-company entry screen with no console navigation or technical clutter. After access, the learner works inside a collapsible curriculum shell organized by course modules rather than analyst tools. The persistent sidebar shows course/module progress; Transaction Search, Business Trace, Errors, Mappings, Partner Profile, and similar investigation capabilities are intentionally absent from permanent learner navigation and are reserved for contextual labs. The original technical workspace remains available as the Advanced Console.

## What The Learner Does

The learner works inside the FreightBridge Ops Desk and follows an evidence-first support workflow:

```text
BRIEFING → INVESTIGATE → DIAGNOSE → PLAN → ACT → VERIFY → REPORT → DEBRIEF
```

Apex Logistics and Midwest Carrier are external synthetic trading partners. FreightBridge is the learner's workplace. Training only exposes evidence FreightBridge could realistically observe: REST requests, X12 metadata and safe previews, SFTP movement, canonical state, transactions, logs, errors, partner profiles, mapping profiles, and customer-facing outcomes.

The core desk rule is:

```text
Business meaning first → technical evidence → raw data
```

## Completed Training Path

Training Mode now includes the complete 10-mission path plus guided and advanced practice:

1. **Mission 1 — Your First Shift:** learn the healthy end-to-end flow.
2. **Mission 2 — Apex Can't Get a Load Through:** authentication failure.
3. **Mission 3 — The Request Arrived, But FreightBridge Can't Read It:** invalid JSON / parsing failure.
4. **Mission 4 — The JSON Looks Fine — Why Was It Rejected?:** inbound contract validation.
5. **Mission 5 — Why Is This Shipment Showing Up Twice?:** duplicate business transaction vs idempotent replay.
6. **Mission 6 — Midwest Sent the Status, But FreightBridge Rejected It:** X12 control-number mismatch.
7. **Mission 7 — Midwest Sent the Status. Why Didn't Apex Get It?:** supported X12 structure with unsupported AT7 mapping.
8. **Mission 8 — This Partner Is Sending the Wrong X12 Version:** structurally valid X12 with incompatible 00501/005010 profile.
9. **Mission 9 — Midwest SFTP Suddenly Stops Working:** host-key trust failure before an integration transaction exists.
10. **Mission 10 — Production Incident:** final independent shift; valid 214 reaches business validation but carries the wrong B10 shipment reference.

Before the incident queue, the learner also completes:

- **First-Day Orientation** — a six-scene story wizard that introduces the three companies, the shipment lifecycle, 204/997/990, 214 status progression, REST/JSON versus X12, and the analyst's Network / Messages / Mapping mental model before any workstation tools appear.
- **EDI & Protocol Basics** — a seven-lesson bootcamp separating exchange method from message format, then teaching REST/JSON, SFTP/X12, X12 envelope basics, 204/997/990/214 roles, canonical correlation, and the Midwest 214 status mapping before troubleshooting begins.
- **Guided Healthy Flow Parts 1–4** — Apex REST/JSON → canonical shipment → Midwest 204 → 997 → 990 → 214 → Apex-facing updates.
- **Replay & Sequence Clinic** — duplicate business attempts, exact X12 replay suppression, and late/out-of-order event chronology.

Mission 10 stays locked until the Replay & Sequence Clinic is complete.

## Curriculum Shell And Contextual Tools

The persistent learner shell is course-oriented rather than tool-oriented. It contains a collapsible module outline with progress for Orientation, EDI & Protocol Basics, Healthy Integration, Guided Troubleshooting, Advanced Incidents, and the Final Shift. Mike's former persistent right-side coach panel has been removed.

Investigation capabilities still reuse the same FreightBridge operations/configuration APIs, but learner-facing tool links are no longer exposed in the permanent sidebar or Training Home. Transaction evidence, raw payloads, processing logs, errors, partner rules, and mapping information are intended to appear only when a lesson or lab gives the learner a reason to use them. The Advanced Console continues to expose the full technical workspace.

## Failure Drills

The training incidents use real server-backed Integration Lab drills. Important scenario keys include:

- `APEX_BAD_AUTH`
- `APEX_INVALID_JSON`
- `APEX_INVALID_CONTRACT`
- `APEX_DUPLICATE_SHIPMENT`
- `X12_214_CONTROL_MISMATCH`
- `X12_214_UNSUPPORTED_STATUS`
- `X12_214_WRONG_VERSION`
- `SFTP_HOST_KEY_MISMATCH`
- `X12_214_UNKNOWN_SHIPMENT`

The learner-facing copy does not reveal these keys before diagnosis.

## Recovery Truthfulness

Advanced incidents use server-backed recovery evidence. Examples include:

- safe idempotent replay without duplicate business effects;
- corrected X12 controls;
- corrected AT7 status;
- corrected 00401 / 004010 version/profile;
- verified SFTP trust and directory readiness without replaying business traffic;
- corrected B10 shipment reference with verified Apex-facing `PICKED_UP` evidence.

The UI does not claim partner-side facts FreightBridge cannot observe.

## Training Progress

The M41 journey-start state is browser-local as well; this milestone does not introduce learner accounts yet.

Mission progress is stored in browser `localStorage` under:

```text
freightbridge.trainingProgress
```

Orientation, guided healthy-flow progress, and advanced-practice completion are also browser-local. The operations bearer token remains session-only and is not stored in training progress.

After Mission 10, the Training Desk switches to a **10 / 10 Training Complete** state with zero pending training incidents, review links, and a direct path to the Advanced Console.

## Manual Acceptance

1. Open the deployed app and confirm the first screen is the clean `#/learn` three-company entry with no token field, mission board, or Ops Desk navigation.
2. Confirm Apex Logistics, FreightBridge, and Midwest Carrier are the only three company cards and **Begin Your Journey** is the primary action.
3. Choose **Begin Your Journey**, enter the access key on the second-step access screen, and confirm the app opens First-Day Orientation.
4. Complete/review First-Day Orientation inside the minimal curriculum shell and confirm the sidebar updates the Orientation module from Scene 1 through Scene 6 while the lesson remains low-clutter: companies → tender begins → 204/997/990 → 214 shipment movement → translation → your job.
5. Confirm Orientation hands off to EDI & Protocol Basics, the sidebar shows Lesson 1 through Lesson 7, and the learner must correctly distinguish SFTP/X12, ST/SE, 997/990, and shipment correlation before continuing.
6. Complete the bootcamp and verify the Healthy Integration module unlocks only afterward for new progress, while older downstream progress remains recognized.
7. Complete the four-part guided healthy flow and verify 997 is technical acknowledgment while 990 is the business tender decision.
8. Complete Missions 1–9 using the real controlled failure drills.
9. Complete the Replay & Sequence Clinic and verify exact replay side effects are skipped while late event history does not regress `DELIVERED`.
10. Confirm Mission 10 unlocks only after advanced practice.
11. Complete Mission 10 by diagnosing `SHIPMENT_NOT_FOUND` at business validation and correcting the B10 shipment reference.
12. Return to the Training Desk and confirm the completed state shows **10 / 10**, inbox count **0**, and **No training incidents waiting**.
13. Confirm the curriculum sidebar can collapse, Mike's persistent right panel is gone, and Transactions / Business Trace / Errors / Mappings / Partners do not appear as permanent learner navigation.
14. Open the Advanced Console and confirm the full operations/configuration workspace remains available.

See [FreightBridge employee POV](freightbridge-employee-pov.md), [Healthy integration baseline](healthy-integration-baseline.md), and [Incident game loop](incident-game-loop.md) for the underlying training model.
