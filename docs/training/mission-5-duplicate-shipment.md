# Mission 5 - Why Is This Shipment Showing Up Twice?

Mission 5 uses the real `APEX_DUPLICATE_SHIPMENT` Integration Lab failure drill.

The learner investigates an Apex retry claim by correlating the original successful request with a later repeated request using the same load identifier. The required evidence sources are transaction evidence and replay/idempotency evidence.

The correct diagnosis is that the same shipment was resent without an idempotency key, so FreightBridge correctly treated the second request as a duplicate and prevented duplicate downstream processing. Recovery verifies the same incident load, the established original shipment, and the absence of duplicate business creation.
