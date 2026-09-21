# Milestone 4 Database Acceptance

Run the migration first:

1. Open Supabase SQL Editor.
2. Paste `infrastructure/supabase/migrations/20260920_001_create_freightbridge_domain.sql`.
3. Run the script.
4. Run the checks below.

Do not paste secrets into the SQL Editor.

## Required Tables

```sql
select table_name
from unnest(array[
  'trading_partners',
  'shipments',
  'shipment_stops',
  'shipment_references',
  'tender_responses',
  'shipment_events',
  'integration_transactions',
  'processing_logs',
  'integration_errors'
]) as required(table_name)
where to_regclass('public.' || quote_ident(table_name)) is not null
order by table_name;
```

Expected: all nine table names.

## Seeded Trading Partners

```sql
select partner_code, name, business_role, integration_style, active
from trading_partners
where partner_code in ('APEX', 'MWCX')
order by partner_code;
```

Expected:

- `APEX`, Apex Logistics, `BROKER_3PL`, `REST_JSON`, active.
- `MWCX`, Midwest Carrier, `MOTOR_CARRIER`, `X12_SFTP`, active.

## Constraint Spot Check

```sql
select conname
from pg_constraint
where conrelid in (
  'shipments'::regclass,
  'shipment_stops'::regclass,
  'shipment_references'::regclass,
  'integration_transactions'::regclass,
  'integration_errors'::regclass
)
order by conname;
```

Expected: check, primary-key, foreign-key, and unique constraints for the domain tables.

## Transaction-Wrapped LOAD500 Smoke Test

This test inserts synthetic data and rolls it back.

```sql
begin;

with inserted_shipment as (
  insert into shipments (
    shipment_number,
    equipment_type,
    weight_lbs,
    pieces,
    commodity_description,
    tender_status,
    current_status
  )
  values (
    'LOAD500',
    'DRY_VAN_53',
    42000,
    22,
    'Packaged auto parts',
    'PENDING',
    'PLANNED'
  )
  returning id
),
stops as (
  insert into shipment_stops (
    shipment_id,
    stop_sequence,
    stop_type,
    facility_name,
    address_line_1,
    city,
    state,
    postal_code,
    scheduled_at
  )
  select id, 1, 'PICKUP', 'ABC Factory', '200 Industrial Rd', 'Aurora', 'IL', '60505', '2026-10-01T14:00:00Z'::timestamptz
  from inserted_shipment
  union all
  select id, 2, 'DELIVERY', 'XYZ Warehouse', '900 Commerce St', 'Detroit', 'MI', '48201', '2026-10-02T18:00:00Z'::timestamptz
  from inserted_shipment
),
refs as (
  insert into shipment_references (
    shipment_id,
    reference_type,
    reference_value
  )
  select id, 'BOL', 'BOL900' from inserted_shipment
  union all
  select id, 'PO', 'PO111' from inserted_shipment
  union all
  select id, 'CUSTOMER_REFERENCE', 'CUST-REF-500' from inserted_shipment
),
events as (
  insert into shipment_events (
    shipment_id,
    status,
    occurred_at,
    received_at,
    city,
    state
  )
  select id, 'ARRIVED', '2026-10-02T13:45:00Z'::timestamptz, '2026-10-02T14:40:00Z'::timestamptz, 'Detroit', 'MI'
  from inserted_shipment
  union all
  select id, 'DELIVERED', '2026-10-02T14:30:00Z'::timestamptz, '2026-10-02T14:31:00Z'::timestamptz, 'Detroit', 'MI'
  from inserted_shipment
)
select
  s.shipment_number,
  count(distinct ss.id) as stops,
  count(distinct sr.id) as refs,
  count(distinct se.id) as events
from shipments s
left join shipment_stops ss on ss.shipment_id = s.id
left join shipment_references sr on sr.shipment_id = s.id
left join shipment_events se on se.shipment_id = s.id
where s.shipment_number = 'LOAD500'
group by s.shipment_number;

rollback;
```

Expected: one row with `LOAD500`, two stops, three references, and two events. The rollback leaves no permanent LOAD500 data.
