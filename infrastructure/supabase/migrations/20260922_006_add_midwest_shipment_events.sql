create table if not exists midwest_sim.shipment_events (
  id uuid primary key default gen_random_uuid(),
  load_id uuid not null references midwest_sim.loads(id) on delete cascade,
  status text not null,
  at7_code text not null,
  status_description text,
  occurred_at timestamptz not null,
  city text not null,
  state text not null,
  created_at timestamptz not null default now(),
  constraint midwest_shipment_events_status_check check (
    status in ('PICKED_UP', 'IN_TRANSIT', 'ARRIVED', 'DELIVERED')
  ),
  constraint midwest_shipment_events_at7_check check (
    (status = 'PICKED_UP' and at7_code = 'AF')
    or (status = 'IN_TRANSIT' and at7_code = 'X6')
    or (status = 'ARRIVED' and at7_code = 'X1')
    or (status = 'DELIVERED' and at7_code = 'D1')
  ),
  constraint midwest_shipment_events_state_check check (state ~ '^[A-Z]{2}$')
);

alter table if exists midwest_sim.outbound_edi_documents
  alter column tender_decision_id drop not null;

alter table if exists midwest_sim.outbound_edi_documents
  add column if not exists shipment_event_id uuid references midwest_sim.shipment_events(id) on delete cascade;

alter table if exists midwest_sim.outbound_edi_documents
  drop constraint if exists midwest_outbound_edi_source_check;

alter table if exists midwest_sim.outbound_edi_documents
  add constraint midwest_outbound_edi_source_check check (
    (
      document_type = '990'
      and tender_decision_id is not null
      and shipment_event_id is null
    )
    or (
      document_type = '214'
      and tender_decision_id is null
      and shipment_event_id is not null
    )
  );

create index if not exists idx_midwest_shipment_events_load_id
  on midwest_sim.shipment_events (load_id);

create index if not exists idx_midwest_shipment_events_occurred_at
  on midwest_sim.shipment_events (occurred_at);

create index if not exists idx_midwest_outbound_edi_shipment_event_id
  on midwest_sim.outbound_edi_documents (shipment_event_id);
