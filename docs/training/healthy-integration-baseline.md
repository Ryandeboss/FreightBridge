# Healthy Integration Baseline

Mission 1 teaches the normal Apex to FreightBridge to Midwest lifecycle from the FreightBridge employee point of view. The learner is not watching private partner systems. They are learning to interpret evidence FreightBridge can actually observe.

## What Normal Looks Like

A healthy flow produces a sequence of checkpoints:

- Apex REST/JSON request reaches FreightBridge.
- Authentication, parsing, and validation succeed.
- FreightBridge creates a canonical shipment.
- FreightBridge generates the Midwest X12 204.
- FreightBridge delivers the 204 over SFTP.
- Midwest returns a 997 technical acknowledgment.
- Midwest returns a 990 business tender decision.
- Midwest sends 214 shipment status events.
- FreightBridge verifies broker-facing tender/status evidence.
- The full lifecycle reaches a successful final state.

## Transport vs Business Outcome

Mission 1 repeatedly separates delivery evidence from business outcome:

- SFTP upload success means FreightBridge delivered a file.
- 997 means Midwest received and structurally processed the EDI.
- 990 means Midwest accepted or rejected the tender.

A new analyst should not treat SFTP success or 997 acceptance as carrier load acceptance.

## Correlation

The beginner-level correlation value is the Load ID / Business Identifier. As the flow reaches X12, the learner sees control numbers such as ISA13, GS06, ST02, and 997 acknowledgment controls. The point is not to memorize X12 syntax; it is to understand that acknowledgments must refer back to the document FreightBridge sent.

## Last Healthy Checkpoint

The Last Healthy Checkpoint is the last stage where FreightBridge has evidence that processing succeeded. Future incident missions should ask:

```text
What checkpoint is still healthy?
Where does the evidence stop?
What changed compared with Mission 1?
```

Mission 1 does not implement a failure. It creates the baseline future troubleshooting missions will compare against.
