# Milestone 11 Midwest SFTP Transport Acceptance

Milestone 11 adds the real portfolio SFTP transport for Midwest 204/990 exchange while keeping the temporary REST test harness available.

## Flow

```text
Apex
  -> REST/JSON
FreightBridge
  -> CanonicalShipment
Midwest 204 mapper
  -> X12 204
SFTP /inbound
  -> Midwest Carrier Simulator poll
  -> Midwest-owned load (PENDING)
  -> Midwest tender decision
  -> X12 990
SFTP /outbound
  -> FreightBridge poll
  -> TenderResponse persistence
  -> Apex tender-status update
```

## Scope

- FreightBridge writes 204 files to SFTP `/inbound`.
- Midwest manually polls `/inbound`, processes 204 files, creates Midwest-owned loads, and moves files to `/archive` or `/error`.
- Midwest writes stored 990 files to SFTP `/outbound`.
- FreightBridge manually polls `/outbound`, reuses the existing 990 mapping/persistence/Apex forwarding flow, and moves files to `/archive` or `/error`.
- Both services use Paramiko with SSH public-key authentication and SHA256 host-key verification.
- SFTP upload is atomic: write `<filename>.part`, then rename to the final `.edi` path.
- Existing direct REST test-harness endpoints remain available.

## Explicitly Deferred

- Background polling.
- 997 generation or processing.
- 214 shipment-status processing.
- 210 invoicing.
- SFTP password authentication.
- Major UI changes.

## Environment

Configure the same values on FreightBridge API and Midwest simulator:

```text
MWCX_SFTP_HOST=<railway-tcp-proxy-host>
MWCX_SFTP_PORT=<railway-tcp-proxy-port>
MWCX_SFTP_USERNAME=mwcx_freightbridge
MWCX_SFTP_PRIVATE_KEY_B64=<base64-private-key>
MWCX_SFTP_HOST_KEY_SHA256=<SHA256:...>
```

Keep the existing REST harness variables for compatibility:

```text
MIDWEST_SIM_BASE_URL=<Midwest URL>
MIDWEST_SIM_BEARER_TOKEN=<Midwest write token>
MIDWEST_INBOUND_BEARER_TOKEN=<FreightBridge Midwest inbound token>
FREIGHTBRIDGE_API_BASE_URL=<FreightBridge API URL>
FREIGHTBRIDGE_MIDWEST_BEARER_TOKEN=<same inbound token>
```

## Database Migration

Apply:

```text
infrastructure/supabase/migrations/20260922_005_add_sftp_transport_metadata.sql
```

This migration adds SFTP transport metadata to Midwest inbound/outbound EDI audit tables:

- `transport`
- source or remote filename/path
- archive path
- error path

## Endpoints

FreightBridge:

```http
POST /api/integrations/midwest/load-tenders/{shipment_number}/dispatch-sftp
POST /api/integrations/midwest/sftp/outbound/poll
GET /api/integrations/midwest/sftp/readiness
```

Midwest:

```http
POST /v1/sftp/inbound/poll
GET /v1/sftp/readiness
POST /v1/loads/{customer_shipment_number}/tender-response/dispatch-sftp
```

Existing REST harness endpoints remain:

```http
POST /api/integrations/midwest/load-tenders/{shipment_number}/dispatch-direct
POST /api/integrations/midwest/tender-responses
POST /v1/edi/inbound/204
POST /v1/loads/{customer_shipment_number}/tender-response/dispatch-direct
```

## Manual LOAD502 Test

Follow the detailed setup in the [SFTPGo Railway runbook](../operations/sftpgo-railway-runbook.md), then run:

1. Create or seed `LOAD502` through the existing Apex -> FreightBridge load tender flow.
2. Dispatch to SFTP:

```http
POST {{freightbridgeBaseUrl}}/api/integrations/midwest/load-tenders/LOAD502/dispatch-sftp
```

Expected: `202`, `transport` is `SFTP`, remote path starts with `/inbound/APEX_MWCX_204_`.

3. Poll Midwest inbound:

```http
POST {{midwestBaseUrl}}/v1/sftp/inbound/poll
Authorization: Bearer {{midwestBearerToken}}
```

Expected: the 204 is processed and archived.

4. Verify the Midwest load:

```http
GET {{midwestBaseUrl}}/v1/loads/LOAD502
Authorization: Bearer {{midwestReadonlyToken}}
```

Expected: `tenderStatus` is `PENDING`.

5. Accept the load:

```http
POST {{midwestBaseUrl}}/v1/loads/LOAD502/tender-decisions
Authorization: Bearer {{midwestBearerToken}}
Content-Type: application/json

{
  "decision": "ACCEPTED"
}
```

6. Dispatch the 990 to SFTP:

```http
POST {{midwestBaseUrl}}/v1/loads/LOAD502/tender-response/dispatch-sftp
Authorization: Bearer {{midwestBearerToken}}
```

Expected: `202`, remote path starts with `/outbound/MWCX_APEX_990_`.

7. Poll FreightBridge outbound:

```http
POST {{freightbridgeBaseUrl}}/api/integrations/midwest/sftp/outbound/poll
```

Expected: the 990 is processed and archived.

8. Verify Apex:

```http
GET {{apexBaseUrl}}/v1/loads/LOAD502/tender-status
Authorization: Bearer {{apexReadonlyToken}}
```

Expected: latest tender response is `ACCEPTED`.

## Regression Coverage

- SFTP 204 dispatch writes `.part` then renames to deterministic final filename.
- FreightBridge outbound audit records `Transport.SFTP` and remote payload path.
- SFTP dispatch maps file conflict, host-key mismatch, auth failure, missing config, and generic transport errors.
- Midwest inbound SFTP poll ignores hidden, `.part`, and non-EDI files.
- Midwest inbound SFTP poll archives valid 204s and moves deterministic invalid 204s to `/error`.
- Midwest SFTP 990 dispatch writes deterministic outbound filenames.
- FreightBridge outbound SFTP poll archives valid 990s and moves deterministic invalid 990s to `/error`.
- REST direct harness endpoints remain covered.
