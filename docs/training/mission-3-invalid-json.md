# Mission 3 - The Request Arrived, But FreightBridge Can't Read It

Mission 3 is backed internally by the real `APEX_INVALID_JSON` Integration Lab failure drill. The implementation key is not shown to the learner before diagnosis.

The backend authenticates the Apex request before attempting JSON parsing. The evidence sequence therefore teaches:

`RECEIVED -> AUTHENTICATION SUCCEEDED -> PARSING FAILED -> VALIDATION NOT REACHED`

The correct last healthy checkpoint is **Partner authentication succeeded**. JSON parsing is the first failed checkpoint. The safe action is to resend parseable training JSON and verify that the same incident load advances beyond parsing and completes the healthy lifecycle.

This mission distinguishes request arrival and authentication from payload readability.
