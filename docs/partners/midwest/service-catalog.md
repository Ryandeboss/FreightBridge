# Midwest Carrier Service Catalog

All entries describe synthetic FreightBridge portfolio contracts. FreightBridge can generate and deliver a Midwest 204 over the temporary REST test harness, and Midwest can return a 990 tender decision through the same temporary style. SFTP remains future work.

| Transaction | Business purpose | Direction | Transport | Format/version | Expected acknowledgment | Implementation status |
| --- | --- | --- | --- | --- | --- | --- |
| 204 Load Tender Receipt | Midwest receives a motor carrier load tender | FreightBridge -> Midwest | Temporary REST test harness; future SFTP | X12 004010 | Future 997 technical acknowledgment, then 990 business response | Direct simulator receipt implemented; SFTP future |
| 990 Tender Response | Midwest accepts or rejects a tender | Midwest -> FreightBridge | Temporary REST test harness; future SFTP | X12 004010 | FreightBridge persists the tender response and forwards it to Apex | Direct simulator return implemented; SFTP future |
| 214 Shipment Status | Midwest reports pickup, in-transit, arrival, or delivery status using AT7-01 `AF`, `X6`, `X1`, or `D1` | Midwest -> FreightBridge | Future SFTP | X12 004010 | Future FreightBridge processing acknowledgment | MVP |
| 997 Functional Acknowledgment | Technical acknowledgment of received X12 | Midwest -> FreightBridge and future reverse direction | Future SFTP | X12 004010 | None beyond transport success | MVP |
| 210 Freight Invoice | Freight invoice after delivery | Midwest -> FreightBridge | Future SFTP | X12 004010 or later profile | Future acknowledgment profile | FUTURE |
