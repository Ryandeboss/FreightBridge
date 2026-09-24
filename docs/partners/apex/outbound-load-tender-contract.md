# Apex Outbound Load Tender Contract

This is the outbound integration contract for the synthetic FreightBridge portfolio lab. Apex dispatches an existing Apex load tender to FreightBridge through an explicit simulator action.

## Direction

- Source: Apex Logistics
- Destination: FreightBridge
- Business direction: Apex -> FreightBridge
- FreightBridge endpoint: `POST /api/integrations/apex/load-tenders`
- Apex dispatch endpoint: `POST /v1/load-tenders/{loadId}/dispatch`

The FreightBridge endpoint belongs to FreightBridge, not Apex. Apex creates or tenders a load inside the Apex simulator and then sends the Apex-owned `ApexLoad` JSON payload outward to FreightBridge only when the explicit dispatch endpoint is called.

## Transport and Format

- Transport: HTTPS
- Format: JSON
- Payload: `ApexLoad`
- Authentication: bearer-token integration credential

## Credentials

The credential protecting Apex's own API is separate from the credential Apex uses when calling FreightBridge.

```text
Apex caller -> Apex
APEX_API_BEARER_TOKEN

Apex -> FreightBridge
FREIGHTBRIDGE_APEX_BEARER_TOKEN
must match FreightBridge APEX_INBOUND_BEARER_TOKEN
```

Do not reuse `APEX_API_BEARER_TOKEN` for the FreightBridge inbound integration unless intentionally violating the recommended separation.

## Response Concept

FreightBridge returns:

- `202 Accepted` when the load tender is accepted for asynchronous processing.
- A safe JSON error envelope for authentication, authorization, validation, duplicate, or dependency failures.

FreightBridge creates an integration transaction, processing logs, and a canonical shipment when the request is accepted.

## Example Flow

```text
Apex Logistics
  POST ApexLoad JSON
  /api/integrations/apex/load-tenders
        |
        v
FreightBridge
  canonical transform and persistence
        |
        v
Midwest Carrier
  X12 204 over SFTP
```
