# Apex Logistics Service Catalog

All services are synthetic FreightBridge portfolio contracts. MVP Apex-owned REST/JSON services are implemented by `services/apex-partner-sim`.

| Service | Purpose | Direction | Transport | Format | Authentication | Operation / endpoint | Expected response | Error behavior | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Apex Load Creation / Tender Action | Apex simulator or Apex-side business workflow creates and tenders a load inside Apex | Apex internal / simulator action | HTTPS | JSON | Bearer token | `POST /v1/load-tenders` | `202 Accepted` with load ID and accepted timestamp | Standard REST error envelope | MVP |
| Outbound Load Tender Delivery | Apex sends an ApexLoad JSON tender outward to FreightBridge | Apex -> FreightBridge | HTTPS | JSON | Bearer-token integration credential | FreightBridge endpoint `POST /api/integrations/apex/load-tenders` | `202 Accepted` for processing | FreightBridge error envelope | MVP |
| Tender Response Receipt | FreightBridge posts a carrier tender decision to Apex | FreightBridge -> Apex | HTTPS | JSON | Bearer token | `POST /v1/tender-responses` | `202 Accepted` with response ID | `404` for unknown load; `422` for invalid decision | MVP |
| Shipment Status Receipt | FreightBridge posts shipment status updates to Apex | FreightBridge -> Apex | HTTPS | JSON | Bearer token | `POST /v1/shipment-statuses` | `202 Accepted` with status event ID | `404` for unknown load; `422` for invalid status | MVP |
| Shipment Status History Readback | FreightBridge or test tooling retrieves current shipment status and append-only event history | FreightBridge -> Apex | HTTPS | JSON | Bearer token | `GET /v1/loads/{loadId}/shipment-statuses` | `200 OK` with current status and ordered events | `404` when not found | MVP |
| Load Lookup | FreightBridge or test tooling retrieves an Apex load by ID | FreightBridge -> Apex | HTTPS | JSON | Bearer token | `GET /v1/loads/{loadId}` | `200 OK` with ApexLoad | `404` when not found | MVP |
| Load Dispatch to FreightBridge | Explicit simulator action sends an Apex load tender to FreightBridge | Apex -> FreightBridge | HTTPS | JSON | Apex API bearer for caller; separate FreightBridge integration bearer for outbound call | `POST /v1/load-tenders/{loadId}/dispatch` | `202 Accepted` with safe FreightBridge result | `404` for unknown Apex load; safe dependency/conflict responses for FreightBridge failures | MVP |
| Load Cancellation | Future cancellation contract | FreightBridge -> Apex | HTTPS | JSON | Bearer token | Future `/v1/load-cancellations` | Future contract | Future contract | FUTURE |

Every Apex-owned MVP operation listed here exists in `openapi.yaml` or the current simulator service. The outbound FreightBridge endpoint is documented in `outbound-load-tender-contract.md`.
