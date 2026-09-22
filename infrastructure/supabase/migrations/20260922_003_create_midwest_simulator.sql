create schema if not exists midwest_sim;

create extension if not exists pgcrypto;

create table if not exists midwest_sim.loads (
  id uuid primary key default gen_random_uuid(),
  cust_ship_no text not null unique,
  bol_ref text not null,
  po_ref text,
  equip_code text,
  freight_desc text,
  gross_weight_lb numeric(12, 2) not null,
  handling_units integer not null,
  shipper_name text not null,
  shipper_addr_line_1 text not null,
  shipper_city text not null,
  shipper_state_cd text not null,
  shipper_zip text not null,
  cons_name text not null,
  cons_addr_line_1 text not null,
  cons_city text not null,
  cons_state_cd text not null,
  cons_zip text not null,
  pickup_appt_ts timestamptz not null,
  delivery_appt_ts timestamptz not null,
  tender_status text not null default 'PENDING',
  carrier_load_no text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint midwest_loads_tender_status_check check (
    tender_status in ('PENDING', 'ACCEPTED', 'REJECTED')
  ),
  constraint midwest_loads_shipper_state_check check (shipper_state_cd ~ '^[A-Z]{2}$'),
  constraint midwest_loads_consignee_state_check check (cons_state_cd ~ '^[A-Z]{2}$'),
  constraint midwest_loads_weight_positive check (gross_weight_lb > 0),
  constraint midwest_loads_handling_units_positive check (handling_units > 0)
);

create table if not exists midwest_sim.inbound_edi_documents (
  id uuid primary key default gen_random_uuid(),
  document_type text not null,
  x12_version text,
  interchange_control_number text,
  group_control_number text,
  transaction_control_number text,
  customer_shipment_number text,
  payload_hash text not null,
  raw_x12 text,
  processing_status text not null,
  error_code text,
  safe_error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint midwest_inbound_edi_status_check check (
    processing_status in ('RECEIVED', 'PROCESSING', 'ACCEPTED', 'REJECTED')
  )
);

create unique index if not exists idx_midwest_loads_cust_ship_no
  on midwest_sim.loads (cust_ship_no);

create index if not exists idx_midwest_inbound_edi_customer_shipment
  on midwest_sim.inbound_edi_documents (customer_shipment_number);

create index if not exists idx_midwest_inbound_edi_control_numbers
  on midwest_sim.inbound_edi_documents (
    interchange_control_number,
    group_control_number,
    transaction_control_number
  );

create index if not exists idx_midwest_inbound_edi_payload_hash
  on midwest_sim.inbound_edi_documents (payload_hash);

alter table if exists public.integration_transactions
  drop constraint if exists integration_transactions_rest_json_check;

alter table if exists public.integration_transactions
  add constraint integration_transactions_rest_payload_check check (
    transport <> 'REST' or message_format in ('JSON', 'X12')
  );
