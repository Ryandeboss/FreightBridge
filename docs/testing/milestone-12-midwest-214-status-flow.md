# Milestone 12 Midwest 214 Status Flow Acceptance

Milestone 12 adds Midwest X12 214 shipment-status events over the real SFTP transport from Milestone 11.

## Scope

- Midwest creates operational shipment events only for `ACCEPTED` loads.
- Midwest generates and stores X12 214 outbound documents.
- Midwest dispatches 214 files to SFTP `/outbound` using atomic `.part` upload and rename.
- FreightBridge SFTP outbound poll handles both `990` and `214` by parsing ST01, not by filename alone.
- FreightBridge maps 214 files to canonical `ShipmentEvent` rows.
- FreightBridge updates shipment current status using the existing canonical domain rule.
- FreightBridge forwards normalized shipment status JSON to Apex as a child integration transaction.
- Apex stores append-only history and exposes current status plus event history.

No 997, 210, background scheduler, retry engine, or analyst console was added.

## Migration

Apply:

```text
infrastructure/supabase/migrations/20260922_006_add_midwest_shipment_events.sql
```

This migration:

- Creates `midwest_sim.shipment_events`.
- Adds nullable `shipment_event_id` to `midwest_sim.outbound_edi_documents`.
- Makes `tender_decision_id` nullable.
- Adds a check constraint so `990` rows reference a tender decision and `214` rows reference a shipment event.
- Adds indexes for event lookup and outbound document lookup.

## 214 Profile

- ISA sender: `MWCX`
- ISA receiver: `FREIGHTBRIDGE`
- ISA version: `00401`
- GS01: `QM`
- GS08: `004010`
- ST01: `214`
- Required segments: `ISA`, `GS`, `ST`, `B10`, `L11`, `AT7`, `MS1`, `SE`, `GE`, `IEA`

B10 project convention:

```text
B10-01 = Midwest carrier load number
B10-02 = FreightBridge/Apex shipment number
B10-03 = MWCX
```

AT7 project convention:

```text
AT7-01 = status code
AT7-05 = event date
AT7-06 = event time
AT7-07 = UT
```

Status mapping:

| AT7-01 | Canonical status |
| --- | --- |
| `AF` | `PICKED_UP` |
| `X6` | `IN_TRANSIT` |
| `X1` | `ARRIVED` |
| `D1` | `DELIVERED` |

`occurred_at` is the AT7 business event timestamp. `received_at` is when FreightBridge processes the file.

## LOAD503 Setup

Use a fresh load:

- Shipment: `LOAD503`
- BOL: `BOL903`
- PO: `PO114`
- Customer reference: `CUST-REF-503`

Bring `LOAD503` through the existing accepted tender flow:

```text
Apex -> FreightBridge -> Midwest SFTP 204 -> Midwest ACCEPTED tender decision -> Midwest SFTP 990 -> FreightBridge -> Apex
```

Expected before 214 testing:

- Midwest `tenderStatus = ACCEPTED`
- FreightBridge `tender_status = ACCEPTED`
- Apex `currentTenderDecision = ACCEPTED`

## Manual Events

Create each Midwest event with:

```http
POST {{midwestBaseUrl}}/v1/loads/LOAD503/shipment-events
Authorization: Bearer {{midwestBearerToken}}
Content-Type: application/json
```

Event A:

```json
{
  "status": "PICKED_UP",
  "occurredAt": "2026-10-07T14:30:00Z",
  "city": "Aurora",
  "state": "IL",
  "statusDescription": "Shipment departed pickup facility."
}
```

Event B:

```json
{
  "status": "IN_TRANSIT",
  "occurredAt": "2026-10-07T18:00:00Z",
  "city": "South Bend",
  "state": "IN"
}
```

Event C:

```json
{
  "status": "DELIVERED",
  "occurredAt": "2026-10-08T18:30:00Z",
  "city": "Detroit",
  "state": "MI"
}
```

Event D, processed after DELIVERED:

```json
{
  "status": "ARRIVED",
  "occurredAt": "2026-10-08T18:00:00Z",
  "city": "Detroit",
  "state": "MI"
}
```

For each response, capture `eventId`, then dispatch:

```http
POST {{midwestBaseUrl}}/v1/loads/LOAD503/shipment-events/{{eventId}}/dispatch-sftp
Authorization: Bearer {{midwestBearerToken}}
```

Then poll FreightBridge:

```http
POST {{freightbridgeBaseUrl}}/api/integrations/midwest/sftp/outbound/poll
```

Valid files move from `/outbound` to `/archive`. Deterministic invalid files move to `/error`.

## Readback

Apex:

```http
GET {{apexBaseUrl}}/v1/loads/LOAD503/shipment-statuses
Authorization: Bearer {{apexReadonlyToken}}
```

Expected:

- `currentStatus = DELIVERED`
- `currentStatusOccurredAt = 2026-10-08T18:30:00Z`
- Four events are present.
- The late `ARRIVED` event is present but did not regress current status.

## SQL Verification

Canonical current shipment:

```sql
select
  shipment_number,
  tender_status,
  current_status,
  current_status_occurred_at
from public.shipments
where shipment_number = 'LOAD503';
```

Expected: `tender_status = ACCEPTED`, `current_status = DELIVERED`, `current_status_occurred_at = 2026-10-08 18:30:00+00`.

Canonical event history:

```sql
select
  se.status,
  se.occurred_at,
  se.received_at,
  se.city,
  se.state,
  tp.partner_code
from public.shipment_events se
join public.shipments s
  on s.id = se.shipment_id
left join public.trading_partners tp
  on tp.id = se.source_partner_id
where s.shipment_number = 'LOAD503'
order by se.occurred_at, se.received_at;
```

Expected four events ordered by occurred time: `PICKED_UP`, `IN_TRANSIT`, `ARRIVED`, `DELIVERED`.

Received-time demonstration:

```sql
select status, occurred_at, received_at
from public.shipment_events se
join public.shipments s
  on s.id = se.shipment_id
where s.shipment_number = 'LOAD503'
  and se.status in ('ARRIVED', 'DELIVERED')
order by se.received_at;
```

Expected: `ARRIVED.occurred_at < DELIVERED.occurred_at`, while `ARRIVED.received_at > DELIVERED.received_at`.

Integration audit:

```sql
select
  id,
  parent_transaction_id,
  document_type,
  direction,
  transport,
  message_format,
  business_identifier,
  processing_status
from public.integration_transactions
where business_identifier = 'LOAD503'
  and document_type in ('214', 'APEX_SHIPMENT_STATUS')
order by created_at;
```

Expected: four successful inbound SFTP `214` parent transactions and four successful outbound REST `APEX_SHIPMENT_STATUS` child transactions.

Midwest outbound EDI audit:

```sql
select
  oed.document_type,
  oed.customer_shipment_number,
  oed.transport,
  oed.processing_status,
  oed.remote_path,
  se.status,
  se.at7_code,
  se.occurred_at
from midwest_sim.outbound_edi_documents oed
join midwest_sim.shipment_events se
  on se.id = oed.shipment_event_id
where oed.customer_shipment_number = 'LOAD503'
  and oed.document_type = '214'
order by se.occurred_at;
```

Expected: four `214` rows with `transport = SFTP`, `processing_status = DELIVERED`, and `/outbound/MWCX_APEX_214_<control>.edi` remote paths.
