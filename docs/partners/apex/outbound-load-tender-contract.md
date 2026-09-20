# Apex Outbound Load Tender Contract

This is a future outbound integration contract for the synthetic FreightBridge portfolio lab. It is not implemented in this milestone.

## Direction

- Source: Apex Logistics
- Destination: FreightBridge
- Business direction: Apex -> FreightBridge
- Future FreightBridge endpoint: `POST /api/integrations/apex/load-tenders`

The future endpoint belongs to FreightBridge, not Apex. Apex will create or tender a load inside the Apex simulator and then send the Apex-owned `ApexLoad` JSON payload outward to FreightBridge.

## Transport and Format

- Transport: HTTPS
- Format: JSON
- Payload: `ApexLoad`
- Authentication: future bearer-token integration credential

## Response Concept

FreightBridge should conceptually return:

- `202 Accepted` when the load tender is accepted for asynchronous processing.
- A safe JSON error envelope for authentication, authorization, validation, duplicate, or dependency failures.

No FreightBridge inbound integration endpoint, simulator behavior, persistence, canonical model, or mapping code is implemented in this checkpoint.

## Example Flow

```text
Apex Logistics
  POST ApexLoad JSON
  /api/integrations/apex/load-tenders
        |
        v
FreightBridge
  future canonical transform
        |
        v
Midwest Carrier
  future X12 204 over SFTP
```
