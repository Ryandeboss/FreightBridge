# Mission 4 - The JSON Looks Fine - Why Was It Rejected?

Mission 4 is backed internally by the real `APEX_INVALID_CONTRACT` Integration Lab failure drill. The implementation key is not shown to the learner before diagnosis.

The evidence sequence teaches:

`RECEIVED -> AUTHENTICATION SUCCEEDED -> PARSING SUCCEEDED -> VALIDATION FAILED`

The safe payload preview removes `pickup.postalCode`, so the JSON is syntactically readable but does not satisfy the Apex load contract. The correct last healthy checkpoint remains **JSON parsing succeeded**.

The safe action is to resend a contract-valid training payload and verify that the same incident load advances beyond validation and completes the healthy lifecycle.
