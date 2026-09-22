# Milestone 9 Midwest Simulator Acceptance

Milestone 9 adds an independent Midwest Carrier simulator and a temporary direct REST test harness for delivering generated X12 204 documents from FreightBridge.

Current implemented flow:

```text
Apex Simulator
  -> FreightBridge Apex ingestion
  -> CanonicalShipment
  -> Midwest 204 generator
  -> REST_TEST_HARNESS
  -> Midwest Simulator /v1/edi/inbound/204
  -> midwest_sim.loads
```

Future real transport remains SFTP. This milestone does not activate Railway/SFTPGo, does not generate 997 acknowledgments, and does not implement 990 tender decisions.

## Supabase Migration

Apply this new migration in Supabase SQL Editor:

```text
infrastructure/supabase/migrations/20260922_003_create_midwest_simulator.sql
```

It creates:

- `midwest_sim.loads`
- `midwest_sim.inbound_edi_documents`

It also relaxes the FreightBridge audit check constraint so the temporary REST/X12 test harness can record outbound X12 delivery attempts.

## Render Services

Create/deploy the new Render service from `render.yaml`:

```text
midwest-partner-sim
```

Required Midwest environment variables:

```text
APP_ENV=production
DATABASE_URL=<Supabase PostgreSQL connection string>
MIDWEST_API_BEARER_TOKEN=<shared Midwest integration token>
MIDWEST_API_READONLY_TOKEN=<optional read-only token>
```

Required FreightBridge environment variables:

```text
MIDWEST_SIM_BASE_URL=https://<midwest-render-service>.onrender.com
MIDWEST_SIM_BEARER_TOKEN=<same value as Midwest MIDWEST_API_BEARER_TOKEN>
```

Do not paste secrets into source control.

## Manual Acceptance

1. Midwest health:

```text
GET {{midwestBaseUrl}}/health
```

Expected:

```json
{
  "status": "ok",
  "service": "midwest-partner-sim"
}
```

2. Midwest readiness:

```text
GET {{midwestBaseUrl}}/readiness
```

Expected: `200`, `status = ready`.

3. Ensure `LOAD500` exists in FreightBridge by creating the Apex load and dispatching it to FreightBridge.

4. Direct test-harness dispatch from FreightBridge:

```text
POST {{freightbridgeBaseUrl}}/api/integrations/midwest/load-tenders/LOAD500/dispatch-direct
```

Expected: `202`.

Expected response:

```json
{
  "status": "DELIVERED_TO_MIDWEST_TEST_GATEWAY",
  "shipmentNumber": "LOAD500",
  "documentType": "204",
  "transport": "REST_TEST_HARNESS",
  "midwest": {
    "status": "ACCEPTED",
    "customerShipmentNumber": "LOAD500"
  }
}
```

5. Read Midwest load:

```text
GET {{midwestBaseUrl}}/v1/loads/LOAD500
Authorization: Bearer {{midwestBearerToken}}
```

Expected Midwest-owned values:

- `customerShipmentNumber = LOAD500`
- `bolReference = BOL900`
- `purchaseOrderReference = PO111`
- `grossWeightLb = 42000`
- `handlingUnits = 22`
- shipper `ABC Factory`, `200 Industrial Rd`, `Aurora IL 60505`
- consignee `XYZ Warehouse`, `900 Commerce St`, `Detroit MI 48201`
- `tenderStatus = PENDING`
- `carrierLoadNumber = null`

6. Repeat direct dispatch:

```text
POST {{freightbridgeBaseUrl}}/api/integrations/midwest/load-tenders/LOAD500/dispatch-direct
```

Expected: `409 DUPLICATE_LOAD`.

No second Midwest load should be created.

## Automated Coverage

Midwest simulator tests cover:

- health/readiness
- auth failures
- valid 204 receipt
- LOAD500 extraction
- load read shape
- malformed X12
- bad envelope counts
- control-number mismatch
- wrong ST01
- unsupported version
- missing BOL
- missing consignee
- duplicate shipment

FreightBridge tests cover:

- direct dispatch success
- duplicate propagation
- Midwest unavailable/auth failure mapping
- outbound audit success/failure state
- no handled failure leaves audit state processing

No SFTP, 990, 997, 214, or dashboard work is included.
