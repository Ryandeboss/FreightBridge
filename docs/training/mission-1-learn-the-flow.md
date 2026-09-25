# Mission 1 - Learn the Flow

Mission 1 teaches the successful shipment lifecycle before the learner is asked to troubleshoot failures.

It uses the real Integration Lab `FULL_SHIPMENT_LIFECYCLE` scenario. The frontend does not simulate success locally; it creates a real lab run and advances it through the existing lab run/step API.

## Learning Objectives

- Identify Apex Logistics as the broker / 3PL.
- Identify FreightBridge as integration middleware.
- Identify Midwest Carrier as the motor carrier.
- Understand that Apex sends REST/JSON to FreightBridge.
- Understand that FreightBridge maps Apex JSON into a canonical shipment model.
- Understand that FreightBridge generates the Midwest X12 204.
- Understand SFTP as the secure file exchange path to Midwest.
- Distinguish a 997 technical acknowledgment from a 990 business tender response.
- Understand 214 shipment status updates.
- Understand why business event time matters when status messages arrive out of order.

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

Mission 1 uses the successful accepted lifecycle.

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

## Completion Rules

Mission 1 is marked complete only when:

- the real `FULL_SHIPMENT_LIFECYCLE` lab run succeeds
- the 997 knowledge check is answered correctly
- the 990 knowledge check is answered correctly
- the final quiz is answered correctly

After completion, `LEARN_THE_FLOW` is saved to local training progress. Mission 2 becomes visible as coming soon, but it is not implemented in Milestone 23.
