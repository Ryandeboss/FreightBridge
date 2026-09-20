# Midwest Carrier Service Catalog

All entries describe synthetic FreightBridge portfolio contracts. No Midwest simulator, EDI parser, or SFTP exchange is implemented in this milestone.

| Transaction | Business purpose | Direction | Transport | Format/version | Expected acknowledgment | Implementation status |
| --- | --- | --- | --- | --- | --- | --- |
| 204 Load Tender Receipt | Midwest receives a motor carrier load tender | FreightBridge -> Midwest | Future SFTP | X12 004010 | 997 technical acknowledgment, then 990 business response | MVP |
| 990 Tender Response | Midwest accepts or rejects a tender | Midwest -> FreightBridge | Future SFTP | X12 004010 | Future FreightBridge processing acknowledgment | MVP |
| 214 Shipment Status | Midwest reports pickup, in-transit, arrival, or delivery status using AT7-01 `AF`, `X6`, `X1`, or `D1` | Midwest -> FreightBridge | Future SFTP | X12 004010 | Future FreightBridge processing acknowledgment | MVP |
| 997 Functional Acknowledgment | Technical acknowledgment of received X12 | Midwest -> FreightBridge and future reverse direction | Future SFTP | X12 004010 | None beyond transport success | MVP |
| 210 Freight Invoice | Freight invoice after delivery | Midwest -> FreightBridge | Future SFTP | X12 004010 or later profile | Future acknowledgment profile | FUTURE |
