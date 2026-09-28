# Mission 7 - Midwest Sent the Status. Why Didn't Apex Get It?

Mission 7 uses the real `X12_214_UNSUPPORTED_STATUS` Integration Lab failure drill.

The learner investigates a case where Midwest file delivery and X12 parsing can both be true while Apex still receives no update. The required evidence sources are raw 214 status evidence and active Midwest 214 mapping evidence.

The correct diagnosis is that the 214 passed X12 parsing, but `AT7-01 = ZZ` is not supported by the active mapping, so FreightBridge could not create a normalized shipment event or Apex-facing status update. Recovery verifies a corrected supported status for the same load.
