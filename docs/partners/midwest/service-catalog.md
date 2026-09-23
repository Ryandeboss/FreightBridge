# Midwest Carrier Service Catalog

All entries describe synthetic FreightBridge portfolio contracts. FreightBridge can generate and deliver a Midwest 204 over Railway/SFTPGo SFTP, and Midwest can return a 990 tender decision through the same SFTP account. Temporary REST test-harness endpoints remain available for regression testing.

| Transaction | Business purpose | Direction | Transport | Format/version | Expected acknowledgment | Implementation status |
| --- | --- | --- | --- | --- | --- | --- |
| 204 Load Tender Receipt | Midwest receives a motor carrier load tender | FreightBridge -> Midwest | SFTP `/inbound`; temporary REST test harness | X12 004010 | Future 997 technical acknowledgment, then 990 business response | SFTP and direct simulator receipt implemented |
| 990 Tender Response | Midwest accepts or rejects a tender | Midwest -> FreightBridge | SFTP `/outbound`; temporary REST test harness | X12 004010 | FreightBridge persists the tender response and forwards it to Apex | SFTP and direct simulator return implemented |
| 214 Shipment Status | Midwest reports pickup, in-transit, arrival, or delivery status using AT7-01 `AF`, `X6`, `X1`, or `D1` | Midwest -> FreightBridge | SFTP `/outbound` | X12 004010 | FreightBridge persists event history and forwards status to Apex | SFTP dispatch and FreightBridge/Apex processing implemented |
| 997 Functional Acknowledgment | Technical acknowledgment of received X12 | Midwest -> FreightBridge and future reverse direction | Future SFTP | X12 004010 | None beyond transport success | MVP |
| 210 Freight Invoice | Freight invoice after delivery | Midwest -> FreightBridge | Future SFTP | X12 004010 or later profile | Future acknowledgment profile | FUTURE |
