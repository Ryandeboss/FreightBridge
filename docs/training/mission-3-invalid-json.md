# Mission 3 - The Request Arrived, But FreightBridge Can't Read It

Mission 3 uses the real `APEX_INVALID_JSON` Integration Lab failure drill.

The learner investigates a request that reached FreightBridge but could not become structured load data. FreightBridge evidence shows `INVALID_JSON` at the `PARSING` stage, so business validation, canonical shipment creation, Midwest 204 generation, and downstream carrier evidence were not reached.

The correct last healthy checkpoint is inbound request arrival. The safe action is to ask Apex to resend parseable JSON, then verify the corrected request through a clean `FULL_SHIPMENT_LIFECYCLE` retry.
