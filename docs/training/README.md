# FreightBridge Training Mode

Training Mode turns FreightBridge from an analyst-only console into a guided integration learning simulator.

The default authenticated experience is now `#/learn`. The existing Analyst Console is still available as the Advanced Console for free exploration of dashboards, transactions, failures, trace, partners, mappings, and the Integration Lab.

## Purpose

Training Mode teaches EDI and API integration concepts by letting the learner operate the existing synthetic Apex -> FreightBridge -> Midwest workflow.

Milestone 23 implements only:

- Training Home
- Mission 1 - Learn the Flow
- browser-local mission completion progress
- locked or coming-soon roadmap placeholders for future missions

No future troubleshooting mission is implemented yet.

## The Three Entities

### Apex Logistics

Apex is the broker / 3PL. Apex has freight that needs to be moved and sends shipment information to FreightBridge as REST/JSON.

Apex does not create the Midwest X12 204 directly.

### FreightBridge

FreightBridge is integration middleware. It receives JSON, validates it, maps it to the canonical shipment model, creates X12, exchanges files, translates responses, and records transactions, logs, and errors.

FreightBridge is not framed as a VAN in Training Mode.

### Midwest Carrier

Midwest is the motor carrier / trucking company. In this project, Midwest primarily communicates through X12 004010 over SFTP.

## Training Progress

Training progress is stored in browser `localStorage` under:

```text
freightbridge.trainingProgress
```

The value is versioned and contains only non-sensitive mission completion IDs. Operations bearer tokens continue to use the existing `sessionStorage` model and are not stored in training progress.

## Roadmap

- Tutorial: Mission 1 - Learn the Flow - implemented
- Beginner: Mission 2 - Authentication Trouble - coming soon after Mission 1 completion
- Beginner: Mission 3 - Broken JSON - locked placeholder
- Intermediate: Mission 4 - Contract Validation - locked placeholder
- Intermediate: Mission 5 - Duplicate Shipment - locked placeholder
- Advanced: Mission 6 - X12 Control Numbers - locked placeholder
- Advanced: Mission 7 - Mapping Failure - locked placeholder
- Advanced: Mission 8 - Wrong X12 Version - locked placeholder
- Advanced: Mission 9 - SFTP Trust Failure - locked placeholder

Only Mission 1 is playable in Milestone 23.
