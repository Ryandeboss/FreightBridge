# End-To-End Flow

The happy path demonstrates a shipment lifecycle across REST/JSON, canonical persistence, X12/SFTP, return acknowledgments, and analyst observability.

## 1. Apex Load Tender

Apex creates a synthetic load tender such as [valid-load-tender.json](../../sample-data/json/apex/valid-load-tender.json). FreightBridge receives the JSON through the Apex integration endpoint, authenticates the request, validates the contract, and maps it into a canonical shipment.

The canonical shipment keeps business concepts such as shipment number, equipment, origin, destination, weight, pieces, references, and appointment times independent from either partner's wire format.

## 2. Canonical To Midwest 204

FreightBridge generates an X12 004010 `204` Motor Carrier Load Tender for Midwest using the active `CANONICAL_TO_MWCX_204` mapping profile. A representative fixture is [204-valid.edi](../../sample-data/x12/midwest/204-valid.edi), and the mapping reference is [canonical-to-midwest-204.md](../mappings/canonical-to-midwest-204.md).

Important preserved values include:

- Shipment/load id.
- BOL and PO references.
- Pickup and delivery stops.
- Equipment, pieces, and weight.
- Midwest envelope controls.

## 3. SFTP Delivery

FreightBridge writes the 204 to SFTPGo using atomic upload behavior: upload to a temporary `.part` filename, then rename to the final target. This avoids Midwest reading a partial file. Delivery status, transport metadata, and payload hash are retained for audit and retry.

## 4. Midwest 997 Technical Acknowledgment

Midwest receives the 204 and returns a `997` Functional Acknowledgment. FreightBridge parses `AK1` and `AK2` to correlate the acknowledgment to the original outbound 204 group and transaction controls (`GS06` and `ST02`).

A `997` is technical evidence that the EDI document was received and structurally acknowledged. It does not accept the freight tender.

## 5. Midwest 990 Business Tender Response

Midwest separately sends a `990` Tender Response. Accepted and rejected examples are available as [990-accepted.edi](../../sample-data/x12/midwest/990-accepted.edi) and [990-rejected.edi](../../sample-data/x12/midwest/990-rejected.edi).

FreightBridge maps the 990 into a canonical tender response and forwards the business decision back to Apex over REST/JSON. An accepted 990 includes the current carrier-load behavior. A rejected 990 carries the current rejection-reason behavior.

## 6. Midwest 214 Shipment Status

Midwest sends X12 `214` status events. The current project profile maps:

| AT7 code | Canonical status |
| --- | --- |
| `AF` | `PICKED_UP` |
| `X6` | `IN_TRANSIT` |
| `X1` | `ARRIVED` |
| `D1` | `DELIVERED` |

FreightBridge appends every event to history and forwards status updates to Apex.

## 7. Out-Of-Order Status Protection

Integration systems receive messages out of order. FreightBridge determines current shipment status by latest business `occurredAt`, not by message arrival time.

Case:

1. `DELIVERED` is received first and occurred at 18:30.
2. `ARRIVED` is received later but occurred at 18:00.

Expected result:

- Both events remain in history.
- Current status stays `DELIVERED`.

## 8. Audit And Business Trace

Each major message creates or updates transaction, log, error, mapping, payload, and trace records. The Analyst Console can search by business identifier and show the cross-format lifecycle rather than forcing an analyst to manually connect REST requests, SFTP files, X12 control numbers, and partner callbacks.
