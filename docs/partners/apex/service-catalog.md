# Apex Logistics Service Catalog

All services are synthetic FreightBridge portfolio contracts. No Apex service is implemented in this milestone.

| Service | Purpose | Direction | Transport | Format | Authentication | Operation / endpoint | Expected response | Error behavior | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Load Tender Submission | FreightBridge sends a broker load tender to Apex when Apex is the REST-side source/target in tests | FreightBridge -> Apex | HTTPS | JSON | Bearer token | `POST /v1/load-tenders` | `202 Accepted` with load ID and accepted timestamp | Standard REST error envelope | MVP |
| Tender Response Receipt | FreightBridge posts a carrier tender decision to Apex | FreightBridge -> Apex | HTTPS | JSON | Bearer token | `POST /v1/tender-responses` | `202 Accepted` with response ID | `404` for unknown load; `422` for invalid decision | MVP |
| Shipment Status Receipt | FreightBridge posts shipment status updates to Apex | FreightBridge -> Apex | HTTPS | JSON | Bearer token | `POST /v1/shipment-statuses` | `202 Accepted` with status event ID | `404` for unknown load; `422` for invalid status | MVP |
| Load Lookup | FreightBridge or test tooling retrieves an Apex load by ID | FreightBridge -> Apex | HTTPS | JSON | Bearer token | `GET /v1/loads/{loadId}` | `200 OK` with ApexLoad | `404` when not found | MVP |
| Load Cancellation | Future cancellation contract | FreightBridge -> Apex | HTTPS | JSON | Bearer token | Future `/v1/load-cancellations` | Future contract | Future contract | FUTURE |

Every MVP operation listed here exists in `openapi.yaml`.
