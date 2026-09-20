# Trading Partner Matrix

All partners and examples are synthetic and created for the FreightBridge portfolio lab.

## Partner Comparison

| Dimension | Apex Logistics | Midwest Carrier |
| --- | --- | --- |
| Business Role | Freight broker / 3PL | Motor carrier |
| Backend Style | Modern TMS with REST API | Legacy-style dispatch TMS with EDI gateway |
| Primary Transport | HTTPS | Future SFTP |
| Message Format | JSON | X12 EDI |
| Authentication | Bearer token for MVP | Future SSH key authentication |
| Versioning | REST `/v1` API | X12 004010 / 4010 profile |
| Load Tender | ApexLoad JSON outbound to future FreightBridge endpoint | 204 Motor Carrier Load Tender |
| Tender Response | ApexTenderResponse JSON contract | 990 Response to Load Tender |
| Shipment Status | ApexShipmentStatus JSON contract | 214 Shipment Status |
| Acknowledgment | HTTP status and JSON error envelope | 997 Functional Acknowledgment |
| Future Invoice | Not in MVP | 210 Freight Invoice, FUTURE only |

## Transaction Flow Matrix

| Business Event | Direction | Apex Side | FreightBridge | Midwest Side |
| --- | --- | --- | --- | --- |
| Create Load / Tender | Apex -> FreightBridge -> Midwest | Apex sends JSON ApexLoad, `LOAD500`, to future FreightBridge endpoint | Future transform through canonical model | X12 204 to Midwest `/inbound` |
| Technical Ack | Midwest -> FreightBridge | N/A | Future EDI receipt processing | X12 997 for 204 receipt |
| Accept Tender | Midwest -> FreightBridge -> Apex | JSON ApexTenderResponse | Future transform through canonical model | X12 990 with accepted decision |
| Reject Tender | Midwest -> FreightBridge -> Apex | JSON ApexTenderResponse | Future transform through canonical model | X12 990 with rejected decision |
| Shipment Pickup | Midwest -> FreightBridge -> Apex | JSON ApexShipmentStatus `PICKED_UP` | Future transform through canonical model | X12 214 with `AF` |
| Shipment In Transit | Midwest -> FreightBridge -> Apex | JSON ApexShipmentStatus `IN_TRANSIT` | Future transform through canonical model | X12 214 with `X6` |
| Shipment Arrived | Midwest -> FreightBridge -> Apex | JSON ApexShipmentStatus `ARRIVED` | Future transform through canonical model | X12 214 with `X1` |
| Shipment Delivered | Midwest -> FreightBridge -> Apex | JSON ApexShipmentStatus `DELIVERED` | Future transform through canonical model | X12 214 with `D1` |
| Freight Invoice | Future | Future contract | Future transform | Future 210 only |

## Shared Example Identifiers

The sample fixtures intentionally reuse these synthetic values:

- Load / shipment: `LOAD500`
- BOL: `BOL900`
- PO: `PO111`
- Origin: ABC Factory, Aurora, IL
- Destination: XYZ Warehouse, Detroit, MI
- Midwest carrier code: `MWCX`
