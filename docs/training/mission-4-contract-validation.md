# Mission 4 - The JSON Looks Fine - Why Was It Rejected?

Mission 4 uses the real `APEX_INVALID_CONTRACT` Integration Lab failure drill.

The learner investigates a request whose JSON parses successfully but fails the Apex load tender contract. FreightBridge evidence shows `INVALID_APEX_LOAD` at the `VALIDATION` stage because the safe payload preview removes `pickup.postalCode`.

The correct last healthy checkpoint is JSON parsing. The safe action is to ask Apex to resend a contract-valid payload, then verify the corrected request through a clean `FULL_SHIPMENT_LIFECYCLE` retry.
