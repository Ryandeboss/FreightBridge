create sequence if not exists midwest_sim.carrier_load_number_seq
  start with 900500
  increment by 1;

create sequence if not exists midwest_sim.outbound_interchange_control_seq
  start with 906
  increment by 1;

create sequence if not exists midwest_sim.outbound_group_control_seq
  start with 906
  increment by 1;

create table if not exists midwest_sim.tender_decisions (
  id uuid primary key default gen_random_uuid(),
  load_id uuid not null references midwest_sim.loads(id) on delete cascade,
  decision text not null,
  carrier_load_no text,
  reason_code text,
  message text,
  decided_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint midwest_tender_decisions_one_per_load unique (load_id),
  constraint midwest_tender_decisions_decision_check check (decision in ('ACCEPTED', 'REJECTED')),
  constraint midwest_tender_decisions_accepted_check check (
    decision <> 'ACCEPTED' or (carrier_load_no is not null and reason_code is null)
  ),
  constraint midwest_tender_decisions_rejected_check check (
    decision <> 'REJECTED' or (reason_code is not null and carrier_load_no is null)
  )
);

create table if not exists midwest_sim.outbound_edi_documents (
  id uuid primary key default gen_random_uuid(),
  tender_decision_id uuid not null references midwest_sim.tender_decisions(id) on delete cascade,
  document_type text not null,
  customer_shipment_number text not null,
  x12_version text not null,
  interchange_control_number text not null,
  group_control_number text not null,
  transaction_control_number text not null,
  payload_hash text not null,
  raw_x12 text not null,
  processing_status text not null,
  attempt_count integer not null default 0,
  error_code text,
  safe_error_message text,
  generated_at timestamptz not null,
  last_attempt_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint midwest_outbound_edi_status_check check (
    processing_status in ('GENERATED', 'DELIVERING', 'DELIVERED', 'FAILED')
  ),
  constraint midwest_outbound_edi_attempt_count_check check (attempt_count >= 0)
);

create unique index if not exists idx_midwest_tender_decisions_load_id
  on midwest_sim.tender_decisions (load_id);

create index if not exists idx_midwest_outbound_edi_customer_shipment
  on midwest_sim.outbound_edi_documents (customer_shipment_number);

create index if not exists idx_midwest_outbound_edi_status
  on midwest_sim.outbound_edi_documents (processing_status);

create index if not exists idx_midwest_outbound_edi_control_numbers
  on midwest_sim.outbound_edi_documents (
    interchange_control_number,
    group_control_number,
    transaction_control_number
  );
