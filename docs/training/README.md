# FreightBridge Training Mode

Training Mode turns FreightBridge from an analyst-only console into a guided workplace simulation for a new FreightBridge Integration Support Analyst.

The default authenticated experience is now `#/learn`. The existing Analyst Console is still available as the Advanced Console for free exploration of dashboards, transactions, failures, trace, partners, mappings, and the Integration Lab.

## Purpose

Training Mode teaches EDI and API integration concepts from inside FreightBridge. The learner investigates evidence that FreightBridge could realistically observe: inbound requests, generated X12, SFTP activity, received EDI, transaction records, logs, errors, mapping metadata, and partner/manager messages.

Training Mode currently implements:

- Training Desk
- FreightBridge Training Desk / mission board
- learner role: FreightBridge Integration Support Analyst
- Mission 1 - Your First Shift: Watch a Healthy Integration
- FreightBridge workstation shell with progressive healthy-flow checkpoints
- Follow This Load panel for the active training load
- checkpoint questions, hints, Analyst Notes, replay, and debrief
- browser-local mission completion progress
- locked or coming-soon roadmap placeholders for future missions

No future troubleshooting mission is implemented yet.

See [FreightBridge employee POV](freightbridge-employee-pov.md) for the observation rules and role framing.
See [Healthy integration baseline](healthy-integration-baseline.md) for the Mission 1 checkpoint model.

## The Three Entities

### Apex Logistics

Apex is an external trading partner: broker / 3PL. Apex has freight that needs to be moved and sends shipment information to FreightBridge as REST/JSON.

Apex does not create the Midwest X12 204 directly.

### FreightBridge

FreightBridge is the learner's workplace and the integration platform. It receives JSON, authenticates, validates, maps to the canonical shipment model, creates X12, exchanges files, translates responses, and records transactions, logs, and errors.

FreightBridge is not framed as a VAN in Training Mode.

### Midwest Carrier

Midwest is an external trading partner: motor carrier / trucking company. In this project, Midwest primarily communicates through X12 004010 over SFTP.

## Training Progress

Training progress is stored in browser `localStorage` under:

```text
freightbridge.trainingProgress
```

The value is versioned and contains only non-sensitive mission completion IDs. Operations bearer tokens continue to use the existing `sessionStorage` model and are not stored in training progress.

## Roadmap

- Orientation: Mission 1 - Your First Shift - implemented
- Beginner: Mission 2 - Apex Can't Get a Load Through - coming soon after Mission 1 completion
- Beginner: Mission 3 - The Request Arrived, But It Can't Be Read - locked placeholder
- Intermediate: Mission 4 - The Payload Looks Fine, So Why Was It Rejected? - locked placeholder
- Intermediate: Mission 5 - Why Is This Shipment Showing Up Twice? - locked placeholder
- Advanced: Mission 6 - The EDI Envelope Doesn't Match - locked placeholder
- Advanced: Mission 7 - Midwest Sent the Status, Apex Never Got It - locked placeholder
- Advanced: Mission 8 - This Partner Is Sending the Wrong X12 Version - locked placeholder
- Advanced: Mission 9 - Midwest SFTP Suddenly Stops Working - locked placeholder
- Final Shift: Mission 10 - Production Incident - locked placeholder

Only Mission 1 is playable. Mission 2 remains coming soon and is not implemented yet.

## Manual Acceptance

1. Open deployed FreightBridge.
2. Unlock with the operations token.
3. Confirm the default landing page is Training Desk.
4. Confirm the role says FreightBridge Integration Support Analyst.
5. Read Mike's orientation message.
6. Confirm Apex and Midwest are labeled external trading partners.
7. Start Mission 1.
8. Start a real `FULL_SHIPMENT_LIFECYCLE` run.
9. Confirm future evidence is pending until the run produces it.
10. Follow the load through inbound, validation, canonical, 204, SFTP, 997, 990, 214, and healthy-confirmed checkpoints.
11. Answer checkpoint questions about transport vs business outcome.
12. Inspect safe raw JSON/X12/SFTP evidence as needed.
13. Open an example hint.
14. Type an Analyst Note and confirm it remains local.
15. Complete the final healthy-flow review.
16. Complete/review or replay Mission 1.
17. Open Advanced Console.
18. Use Back to Training to return to Training Desk.
