# Milestone 6 Apex to FreightBridge Integration Acceptance

This checklist validates the first real partner integration:

```text
Apex Partner Simulator
  HTTPS / JSON / Bearer
FreightBridge REST Ingestion
  IntegrationTransaction + ProcessingLogs + IntegrationErrors
Apex Mapper
CanonicalShipment
Supabase PostgreSQL
```

Midwest, X12, and SFTP are not part of this milestone.

## Transaction Design

FreightBridge Apex ingestion uses two independent PostgreSQL connections for each request:

- Audit connection: writes `integration_transactions`, `processing_logs`, and `integration_errors`.
- Business connection: checks `shipments` and atomically writes canonical `shipments`, `shipment_stops`, and `shipment_references`.

The business connection uses an explicit transaction around canonical persistence. Audit writes intentionally stay outside that business transaction so duplicate detection, mapping failures, or canonical persistence rollbacks do not erase the failure evidence needed for troubleshooting.

## Environment

Create one new strong random integration token and configure it in both Render services.

FreightBridge Render:

```text
APEX_INBOUND_BEARER_TOKEN=<new shared Apex-to-FreightBridge integration token>
```

Apex Render:

```text
FREIGHTBRIDGE_API_BASE_URL=https://<freightbridge-render-service>.onrender.com
FREIGHTBRIDGE_APEX_BEARER_TOKEN=<same token as FreightBridge APEX_INBOUND_BEARER_TOKEN>
```

Do not put these values in Vercel or GitHub.

## Happy Path

Before dispatch:

```sql
select count(*) as load500_shipments
from public.shipments
where shipment_number = 'LOAD500';
```

Expected: `0`.

1. Create the Apex load:

```text
POST {{apexBaseUrl}}/v1/load-tenders
Authorization: Bearer {{apexBearerToken}}
Body: sample-data/json/apex/valid-load-tender.json
```

Expected: `202`.

2. Confirm Apex persistence:

```text
GET {{apexBaseUrl}}/v1/loads/LOAD500
Authorization: Bearer {{apexBearerToken}}
```

Expected: `200`.

3. Dispatch from Apex to FreightBridge:

```text
POST {{apexBaseUrl}}/v1/load-tenders/LOAD500/dispatch
Authorization: Bearer {{apexBearerToken}}
X-Correlation-ID: acceptance-load500-001
```

Expected: `202`, with a FreightBridge `transactionId`, `shipmentId`, and `shipmentNumber = LOAD500`.

## SQL Acceptance Queries

Shipment:

```sql
select shipment_number, equipment_type, weight_lbs, pieces, commodity_description,
       tender_status, current_status
from public.shipments
where shipment_number = 'LOAD500';
```

Expected:

- `equipment_type = DRY_VAN_53`
- `weight_lbs = 42000`
- `pieces = 22`
- `tender_status = PENDING`
- `current_status = PLANNED`

Stops:

```sql
select ss.stop_sequence, ss.stop_type, ss.facility_name, ss.address_line_1,
       ss.city, ss.state, ss.postal_code
from public.shipment_stops ss
join public.shipments s on s.id = ss.shipment_id
where s.shipment_number = 'LOAD500'
order by ss.stop_sequence;
```

Expected:

- `1 PICKUP ABC Factory / Aurora IL 60505`
- `2 DELIVERY XYZ Warehouse / Detroit MI 48201`

References:

```sql
select sr.reference_type, sr.reference_value
from public.shipment_references sr
join public.shipments s on s.id = sr.shipment_id
where s.shipment_number = 'LOAD500'
order by sr.reference_type, sr.reference_value;
```

Expected:

- `BOL / BOL900`
- `CUSTOMER_REFERENCE / CUST-REF-500`
- `PO / PO111`

Integration transaction:

```sql
select id, correlation_id, direction, transport, message_format, document_type,
       business_identifier, payload_hash, processing_status, processing_stage,
       received_at, processed_at
from public.integration_transactions
where business_identifier = 'LOAD500'
order by created_at desc;
```

Expected latest row:

- `direction = INBOUND`
- `transport = REST`
- `message_format = JSON`
- `document_type = APEX_LOAD_TENDER`
- `processing_status = SUCCEEDED`
- `processing_stage = COMPLETED`
- `payload_hash` is populated

Processing logs:

```sql
select pl.stage, pl.status, pl.message, pl.metadata, pl.created_at
from public.processing_logs pl
join public.integration_transactions it on it.id = pl.transaction_id
where it.business_identifier = 'LOAD500'
order by it.created_at desc, pl.created_at;
```

Expected stages include:

- `RECEIVED`
- `AUTHENTICATION`
- `PARSING`
- `VALIDATION`
- `MAPPING`
- `BUSINESS_VALIDATION`
- `COMPLETED`

Errors:

```sql
select ie.category, ie.error_code, ie.safe_message, ie.stage, ie.retryable, ie.created_at
from public.integration_errors ie
join public.integration_transactions it on it.id = ie.transaction_id
where it.business_identifier = 'LOAD500'
order by ie.created_at desc;
```

Expected for successful transaction: no rows for the successful transaction.

## Failure Checks

Invalid integration token:

```text
POST {{freightbridgeBaseUrl}}/api/integrations/apex/load-tenders
Authorization: Bearer invalid-token
Body: sample-data/json/apex/valid-load-tender.json
```

Expected: `401`, `AUTHENTICATION_ERROR`. Verify an `AUTHENTICATION_ERROR` exists at stage `AUTHENTICATION`.

Malformed JSON:

```text
POST {{freightbridgeBaseUrl}}/api/integrations/apex/load-tenders
Authorization: Bearer {{freightbridgeApexToken}}
Body: {bad-json
```

Expected: `400`, `INVALID_JSON`. Verify `SYNTAX_ERROR` at stage `PARSING`.

Missing delivery:

```text
POST {{freightbridgeBaseUrl}}/api/integrations/apex/load-tenders
Authorization: Bearer {{freightbridgeApexToken}}
Body: valid Apex JSON with delivery removed
```

Expected: `422`, `INVALID_APEX_LOAD`. Verify `BUSINESS_VALIDATION_ERROR` at stage `VALIDATION`.

Duplicate `LOAD500`:

```text
POST {{apexBaseUrl}}/v1/load-tenders/LOAD500/dispatch
Authorization: Bearer {{apexBearerToken}}
```

Expected after one successful dispatch: `409`. Verify no second `public.shipments` row and a new failed integration transaction with `DUPLICATE_TRANSACTION`.

Duplicate audit check:

```sql
select business_identifier, processing_status, processing_stage, processed_at
from public.integration_transactions
where business_identifier = 'LOAD500'
order by created_at desc
limit 5;
```

The duplicate attempt should show:

- `processing_status = FAILED`
- `processing_stage = BUSINESS_VALIDATION`
- `processed_at` populated

```sql
select ie.category, ie.error_code, ie.stage, ie.retryable
from public.integration_errors ie
join public.integration_transactions it on it.id = ie.transaction_id
where it.business_identifier = 'LOAD500'
order by ie.created_at desc
limit 5;
```

Expected duplicate error:

- `category = DUPLICATE_TRANSACTION`
- `error_code = DUPLICATE_SHIPMENT`
- `stage = BUSINESS_VALIDATION`
- `retryable = false`

FreightBridge unavailable:

Use a wrong `FREIGHTBRIDGE_API_BASE_URL` only in a safe test environment.

Expected from Apex: safe `DEPENDENCY_ERROR`.
