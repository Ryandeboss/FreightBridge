# Mission 2 - Apex Can't Get a Load Through

Mission 2 uses the real `APEX_BAD_AUTH` Integration Lab failure drill.

The learner investigates an Apex complaint that a load tender did not enter FreightBridge processing. FreightBridge evidence shows the request reached the API boundary but failed at the `AUTHENTICATION` stage with `AUTHENTICATION_ERROR`, before JSON parsing, validation, canonical shipment creation, X12 generation, or Midwest delivery.

The correct last healthy checkpoint is request arrival at the FreightBridge boundary with no trusted processing checkpoint afterward. The safe action is to ask Apex to retry with valid training authentication, then verify recovery by running a clean `FULL_SHIPMENT_LIFECYCLE` retry.
