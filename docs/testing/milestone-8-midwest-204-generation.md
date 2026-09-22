# Milestone 8 Midwest 204 Generation Acceptance

This milestone generates a Midwest X12 004010 204 load tender preview from an existing canonical shipment.

It does not send files over SFTP and does not process 990, 214, or 997 documents.

## Endpoint

```text
POST {{freightbridgeBaseUrl}}/api/integrations/midwest/load-tenders/LOAD500/generate
```

Expected HTTP status:

```text
200
```

Expected response fields:

```json
{
  "shipmentNumber": "LOAD500",
  "documentType": "204",
  "x12Version": "004010",
  "interchangeControlNumber": "...",
  "groupControlNumber": "...",
  "transactionControlNumber": "...",
  "mappingSpecVersion": "2026-09-22",
  "x12": "ISA*..."
}
```

## Important Segment Checks

Copy the returned `x12` value and verify it contains:

```text
ST*204
B2**MWCX**LOAD500**PP
L11*BOL900*BM
L11*PO111*PO
N1*SH*ABC Factory
N4*Aurora*IL*60505
N1*CN*XYZ Warehouse
N4*Detroit*MI*48201
L3*42000*G***22
```

Control numbers and envelope timestamps may differ from the static sample unless a deterministic test provider is used.

## SQL Prerequisite

`LOAD500` must already exist as a canonical shipment in Supabase. The normal path is:

1. Create the Apex `LOAD500` tender in the Apex simulator.
2. Dispatch it to FreightBridge.
3. Confirm `public.shipments.shipment_number = 'LOAD500'`.
4. Call the Midwest generation endpoint above.

## Error Expectations

Missing shipment:

```text
404 SHIPMENT_NOT_FOUND
```

Canonical shipment does not satisfy the Midwest 204 business profile:

```text
422 MIDWEST_204_MAPPING_ERROR
```

Database unavailable:

```text
503 DEPENDENCY_ERROR
```

## Automated Coverage

The FreightBridge pytest suite validates:

- LOAD500 canonical data can reproduce `sample-data/x12/midwest/204-valid.edi` structurally.
- Generated 204 output parses and validates through the generic X12 foundation.
- ISA12 is `00401`, GS08 is `004010`, and ST01 is `204`.
- Optional PO is omitted when absent.
- Customer reference is intentionally not emitted.
- Missing BOL, appointments, addresses, shipment number, weight, and pieces fail before X12 is produced.
- The endpoint returns safe 200, 404, and 422 responses.

No database migration is required.
