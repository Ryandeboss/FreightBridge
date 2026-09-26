# Mission 1 - Your First Shift

Mission 1 reframes the original Learn the Flow mission as the learner's first FreightBridge shift. The learner watches a healthy partner integration from the evidence available at a FreightBridge workstation and learns what normal looks like before any failure mission begins.

It uses the real Integration Lab `FULL_SHIPMENT_LIFECYCLE` scenario. The frontend does not simulate success locally; it creates a real lab run and advances it through the existing lab run/step API.

## Learning Objectives

- Identify Apex Logistics as the broker / 3PL.
- Identify Apex and Midwest as external trading partners.
- Identify FreightBridge as the learner's workplace and integration platform.
- Understand that Apex sends REST/JSON to FreightBridge, but the learner cannot inspect Apex internal systems.
- Understand that FreightBridge maps Apex JSON into a canonical shipment model.
- Understand that FreightBridge generates the Midwest X12 204.
- Understand SFTP activity as evidence visible to FreightBridge.
- Distinguish a 997 technical acknowledgment from a 990 business tender response.
- Understand 214 shipment status updates received by FreightBridge.
- Understand why business event time matters when status messages arrive out of order.
- Separate observed facts from explanatory interpretation.
- Learn the "Last Healthy Checkpoint" method for future troubleshooting.

## Guided Checkpoints

Mission 1 is structured as progressive checkpoints. Evidence appears only when the real Integration Lab run has produced it.

1. Apex Reaches FreightBridge
2. FreightBridge Accepts the Message
3. FreightBridge Normalizes the Shipment
4. FreightBridge Builds the 204
5. The 204 Leaves FreightBridge
6. Midwest Technically Acknowledges It
7. Midwest Makes the Business Decision
8. Shipment Status Starts Moving
9. FreightBridge Updates Apex
10. Healthy Flow Confirmed

Each checkpoint teaches:

- observed by FreightBridge
- why it matters
- what an analyst should check
- healthy signal
- correlation identifiers

## Message Lessons

### 204

The X12 204 is the Motor Carrier Load Tender.

Plain meaning:

```text
Will you haul this load?
```

In FreightBridge, Apex does not create the 204. FreightBridge generates it from Apex JSON and the canonical shipment model.

### 997

The 997 is a technical acknowledgment.

Plain meaning:

```text
I received your EDI document and could process its structure.
```

The 997 does not mean Midwest accepted the load.

The learner must answer that FreightBridge cannot tell Apex the load is accepted from a 997 alone.

### 990

The 990 is the tender response.

Plain meaning:

```text
Yes, I will haul it.
```

or:

```text
No, I will not haul it.
```

Mission 1 uses the successful accepted lifecycle and presents the 990 as a message FreightBridge received from Midwest.

Once both 997 and 990 are available, the mission compares them directly:

- `997`: technical acknowledgment that the EDI document was received/processed.
- `990`: business tender response that accepts or rejects the load.

### 214

The 214 is the shipment status message.

Plain meaning:

```text
Here is what is happening to the shipment.
```

The current FreightBridge mappings are:

- `AF` -> `PICKED_UP`
- `X6` -> `IN_TRANSIT`
- `X1` -> `ARRIVED`
- `D1` -> `DELIVERED`

Mission 1 also teaches that a late `ARRIVED` message may be received after `DELIVERED`, while FreightBridge keeps the current shipment status as `DELIVERED` because business event time matters more than arrival order.

## Workstation Foundations

Mission 1 introduces reusable Training Mode foundations:

- mission phases: briefing, investigate, debrief
- manager message from Mike
- external partner message pattern
- checkpoint cards with "Observed by FreightBridge", "Why it matters", "What I should check", and "Healthy signal"
- Follow This Load panel with the current training load ID, carrier, stage, result, and lab run ID
- inspectable raw evidence
- a compact transport-vs-business comparison
- a healthy integration checklist
- Last Healthy Checkpoint debrief
- hints
- local Analyst Notes
- replay without deleting completion progress

## Correlation

Mission 1 teaches that an integration analyst constantly asks whether evidence belongs to the same shipment. The primary beginner-friendly value is the load/business identifier. X12 control numbers are introduced when the 204 and 997 appear:

- `ISA13`: interchange control number
- `GS06`: functional group control number
- `ST02`: transaction set control number
- `AK1` / `AK2`: acknowledgment references back to the 204

This prepares learners for future control-number mismatch troubleshooting without turning Mission 1 into an X12 syntax lesson.

## Last Healthy Checkpoint

The Last Healthy Checkpoint is the last stage where FreightBridge has evidence that processing succeeded. Future incident missions should compare a broken flow against Mission 1 and ask where the evidence stops.

## Completion Rules

Mission 1 is marked complete only when:

- the real `FULL_SHIPMENT_LIFECYCLE` lab run succeeds
- the required checkpoint knowledge checks are answered correctly
- the final healthy-flow review is completed correctly

After completion, `LEARN_THE_FLOW` is saved to local training progress. The mission ID remains unchanged for compatibility with users who completed earlier Training Mode milestones. Mission 2 becomes visible as coming soon, but it is not implemented.

Replay starts a new real `FULL_SHIPMENT_LIFECYCLE` run and resets current mission answers while preserving historical completion progress.
