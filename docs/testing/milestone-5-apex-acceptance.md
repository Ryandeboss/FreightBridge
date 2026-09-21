# Milestone 5 Apex Simulator Acceptance

This checklist validates the Apex Logistics REST/JSON partner simulator. Apex is logically separate from FreightBridge even when both services share one physical Supabase PostgreSQL project for portfolio cost and deployment simplicity.

## A. Apply the Apex Migration

1. Open the Supabase Dashboard.
2. Select the FreightBridge project.
3. Open SQL Editor.
4. Open or copy `infrastructure/supabase/migrations/20260920_002_create_apex_simulator.sql`.
5. Run the migration once.

The migration creates schema `apex_sim` and does not seed permanent `LOAD500` data.

## B. Schema Checks

Confirm the schema exists:

```sql
select schema_name
from information_schema.schemata
where schema_name = 'apex_sim';
```

Confirm the Apex tables exist:

```sql
select table_schema, table_name
from information_schema.tables
where table_schema = 'apex_sim'
  and table_name in (
    'loads',
    'load_locations',
    'load_references',
    'tender_responses',
    'shipment_statuses'
  )
order by table_name;
```

Expected tables:

- `loads`
- `load_locations`
- `load_references`
- `tender_responses`
- `shipment_statuses`

## C. Render Deployment Checks

Create or deploy the Render web service named `apex-partner-sim` from `render.yaml`.

Required settings:

- Root directory: `services/apex-partner-sim`
- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`

Environment variables:

- `APP_ENV=production`
- `DATABASE_URL`: the Supabase PostgreSQL connection string. It may match FreightBridge for this portfolio lab.
- `APEX_API_BEARER_TOKEN`: user-generated strong random bearer token.
- `APEX_API_READONLY_TOKEN`: optional second strong random token for read-only acceptance testing.

Do not store Apex tokens in Vercel or browser-visible configuration.

## D. API Acceptance Sequence

Set local shell variables or Postman environment variables:

```text
apexBaseUrl=https://your-apex-render-service.onrender.com
apexBearerToken=your-render-token
apexReadonlyToken=optional-read-only-token
```

1. `GET {{apexBaseUrl}}/health`

Expected: `200`.

2. `GET {{apexBaseUrl}}/readiness`

Expected after migration: `200` with `dependencies.database = ok` and `dependencies.apex_schema = ok`.

3. `POST {{apexBaseUrl}}/v1/load-tenders`

Use `sample-data/json/apex/valid-load-tender.json` as the request body and `Authorization: Bearer {{apexBearerToken}}`.

Expected: `202`.

4. `GET {{apexBaseUrl}}/v1/loads/LOAD500`

Expected: `200`, with these values preserved:

- `loadId`: `LOAD500`
- `bolNumber`: `BOL900`
- `purchaseOrderNumber`: `PO111`
- pickup `facilityName`: `ABC Factory`
- pickup `city/state/postalCode`: `Aurora` / `IL` / `60505`
- delivery `facilityName`: `XYZ Warehouse`
- delivery `city/state/postalCode`: `Detroit` / `MI` / `48201`
- `equipmentType`: `VAN_53`
- `weightLbs`: `42000`

5. Repeat `POST /v1/load-tenders` with the same body.

Expected: `409` with error code `DUPLICATE_LOAD`.

6. `POST {{apexBaseUrl}}/v1/tender-responses`

Use `sample-data/json/apex/tender-accepted.json`.

Expected: `202`.

7. Post statuses in order:

- `sample-data/json/apex/status-picked-up.json`
- `sample-data/json/apex/status-in-transit.json`
- `sample-data/json/apex/status-arrived.json`
- `sample-data/json/apex/status-delivered.json`

Expected for each: `202`.

8. Optionally send an older `ARRIVED` event after `DELIVERED`.

Expected: the event may be stored in `apex_sim.shipment_statuses`, but `apex_sim.loads.current_shipment_status` remains `DELIVERED`.

## E. Negative API Checks

- No `Authorization` header on business endpoint: `401`, `AUTHENTICATION_ERROR`.
- Invalid bearer token: `401`, `AUTHENTICATION_ERROR`.
- Read-only token on `GET /v1/loads/LOAD500`: `200`, if configured.
- Read-only token on `POST /v1/load-tenders`: `403`, `AUTHORIZATION_ERROR`, if configured.
- `GET /v1/loads/LOAD999`: `404`, `LOAD_NOT_FOUND`.
- `POST /v1/tender-responses` for unknown load: `404`, `LOAD_NOT_FOUND`.
- `POST /v1/tender-responses` with `REJECTED` and no `reasonCode`: `422`, `BUSINESS_VALIDATION_ERROR`.
- `POST /v1/shipment-statuses` with Midwest code such as `X6`: `422`, `BUSINESS_VALIDATION_ERROR`.

All error responses should use:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Safe message",
    "correlationId": "safe-correlation-id"
  }
}
```

## F. Database Verification

Verify Apex wrote only into `apex_sim.*`:

```sql
select load_id, bol_number, equipment_type, weight_lbs, current_tender_decision, current_shipment_status
from apex_sim.loads
where load_id = 'LOAD500';
```

```sql
select location_role, facility_name, city, state, postal_code
from apex_sim.load_locations
where load_id = 'LOAD500'
order by location_role;
```

```sql
select decision, carrier_code, carrier_load_number, reason_code, decided_at, received_at
from apex_sim.tender_responses
where load_id = 'LOAD500'
order by received_at;
```

```sql
select status_code, occurred_at, city, state, received_at
from apex_sim.shipment_statuses
where load_id = 'LOAD500'
order by occurred_at;
```

Verify FreightBridge public domain rows were not created by Apex:

```sql
select count(*) as freightbridge_shipment_rows
from public.shipments
where shipment_number = 'LOAD500';
```

Expected: `0`, unless a future milestone intentionally maps Apex loads into FreightBridge.

## G. Cleanup

Remove the synthetic Apex acceptance data when desired:

```sql
delete from apex_sim.loads
where load_id = 'LOAD500';
```

Related child rows are removed by `on delete cascade`.
