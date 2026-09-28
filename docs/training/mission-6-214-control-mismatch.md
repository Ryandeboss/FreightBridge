# Mission 6 - Midwest Sent the Status, But FreightBridge Rejected It

Mission 6 uses the real `X12_214_CONTROL_MISMATCH` Integration Lab failure drill.

The learner investigates an ambiguous Midwest/Apex status complaint by inspecting SFTP intake evidence and raw X12. The key comparison is the 214 transaction-set control number in `ST02` against the value repeated in `SE02`.

The correct diagnosis is that the 214 reached FreightBridge, but `ST02` and `SE02` did not match, so FreightBridge rejected the document during X12 parsing before 214 mapping or Apex-facing status update.
