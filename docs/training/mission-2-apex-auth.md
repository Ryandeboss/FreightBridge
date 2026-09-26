# Mission 2 - Apex Can't Get a Load Through

Mission 2 is backed internally by the real `APEX_BAD_AUTH` Integration Lab failure drill. The implementation key is not shown to the learner before diagnosis.

The backend records the inbound Apex request before authentication. The evidence sequence therefore teaches:

`RECEIVED -> AUTHENTICATION FAILED -> PARSING NOT REACHED -> CANONICAL NOT REACHED`

The correct last healthy checkpoint is **Inbound request received by FreightBridge**. Partner authentication is the first failed checkpoint. The safe action is to have the partner retry through the valid training-auth path and verify that the same incident load proceeds through a healthy lifecycle.

The learner should understand that `NOT REACHED` is different from `FAILED`: JSON parsing did not fail in this incident because FreightBridge never attempted it.
