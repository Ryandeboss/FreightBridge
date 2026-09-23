alter table if exists midwest_sim.outbound_edi_documents
  add column if not exists inbound_document_id uuid references midwest_sim.inbound_edi_documents(id) on delete cascade;

alter table if exists midwest_sim.outbound_edi_documents
  drop constraint if exists midwest_outbound_edi_source_check;

alter table if exists midwest_sim.outbound_edi_documents
  add constraint midwest_outbound_edi_source_check check (
    (
      document_type = '990'
      and tender_decision_id is not null
      and shipment_event_id is null
      and inbound_document_id is null
    )
    or (
      document_type = '214'
      and tender_decision_id is null
      and shipment_event_id is not null
      and inbound_document_id is null
    )
    or (
      document_type = '997'
      and tender_decision_id is null
      and shipment_event_id is null
      and inbound_document_id is not null
    )
  );

create index if not exists idx_midwest_outbound_edi_inbound_document_id
  on midwest_sim.outbound_edi_documents (inbound_document_id);

create table if not exists public.functional_acknowledgments (
  id uuid primary key default gen_random_uuid(),
  ack_transaction_id uuid not null unique references public.integration_transactions(id) on delete cascade,
  acknowledged_transaction_id uuid not null references public.integration_transactions(id),
  partner_id uuid not null references public.trading_partners(id),
  acknowledged_document_type text not null,
  functional_identifier text not null,
  acknowledged_group_control_number text not null,
  transaction_set_identifier text not null,
  acknowledged_transaction_control_number text not null,
  transaction_ack_code text not null,
  group_ack_code text not null,
  transaction_sets_included integer,
  transaction_sets_received integer,
  transaction_sets_accepted integer,
  received_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint functional_acks_ack_doc_type_check check (acknowledged_document_type = '204'),
  constraint functional_acks_functional_identifier_check check (functional_identifier = 'SM'),
  constraint functional_acks_transaction_set_check check (transaction_set_identifier = '204'),
  constraint functional_acks_transaction_code_check check (transaction_ack_code in ('A', 'R')),
  constraint functional_acks_group_code_check check (group_ack_code in ('A', 'R')),
  constraint functional_acks_counts_nonnegative check (
    (transaction_sets_included is null or transaction_sets_included >= 0)
    and (transaction_sets_received is null or transaction_sets_received >= 0)
    and (transaction_sets_accepted is null or transaction_sets_accepted >= 0)
  ),
  constraint functional_acks_project_status_consistency check (
    (
      transaction_ack_code = 'A'
      and group_ack_code = 'A'
      and transaction_sets_included = 1
      and transaction_sets_received = 1
      and transaction_sets_accepted = 1
    )
    or (
      transaction_ack_code = 'R'
      and group_ack_code = 'R'
      and transaction_sets_included = 1
      and transaction_sets_received = 1
      and transaction_sets_accepted = 0
    )
  )
);

create index if not exists idx_functional_acks_acknowledged_transaction
  on public.functional_acknowledgments (acknowledged_transaction_id);

create index if not exists idx_functional_acks_partner_controls
  on public.functional_acknowledgments (
    partner_id,
    acknowledged_document_type,
    acknowledged_group_control_number,
    acknowledged_transaction_control_number
  );
