-- FreightBridge Milestone 4 domain schema.
-- Safe to review and run in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists trading_partners (
  id uuid primary key default gen_random_uuid(),
  partner_code text not null unique,
  name text not null,
  business_role text not null,
  integration_style text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trading_partners_partner_code_nonempty check (length(trim(partner_code)) > 0),
  constraint trading_partners_business_role_check check (business_role in ('BROKER_3PL', 'MOTOR_CARRIER')),
  constraint trading_partners_integration_style_check check (integration_style in ('REST_JSON', 'X12_SFTP'))
);

create table if not exists shipments (
  id uuid primary key default gen_random_uuid(),
  shipment_number text not null unique,
  equipment_type text not null,
  weight_lbs numeric(12, 2) not null,
  pieces integer,
  commodity_description text not null,
  tender_status text not null default 'PENDING',
  current_status text not null default 'PLANNED',
  current_status_occurred_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shipments_shipment_number_nonempty check (length(trim(shipment_number)) > 0),
  constraint shipments_equipment_type_check check (equipment_type in ('DRY_VAN_53', 'REFRIGERATED_53', 'FLATBED')),
  constraint shipments_weight_lbs_positive check (weight_lbs > 0),
  constraint shipments_pieces_positive check (pieces is null or pieces > 0),
  constraint shipments_tender_status_check check (tender_status in ('PENDING', 'ACCEPTED', 'REJECTED')),
  constraint shipments_current_status_check check (current_status in ('PLANNED', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED', 'DELIVERED')),
  constraint shipments_active_status_timestamp_check check (
    current_status = 'PLANNED' or current_status_occurred_at is not null
  )
);

create table if not exists shipment_stops (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references shipments(id) on delete cascade,
  stop_sequence integer not null,
  stop_type text not null,
  facility_name text not null,
  address_line_1 text not null,
  address_line_2 text,
  city text not null,
  state text not null,
  postal_code text not null,
  scheduled_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shipment_stops_stop_sequence_positive check (stop_sequence > 0),
  constraint shipment_stops_stop_type_check check (stop_type in ('PICKUP', 'DELIVERY')),
  constraint shipment_stops_state_length_check check (state ~ '^[A-Z]{2}$'),
  constraint shipment_stops_one_sequence_per_shipment unique (shipment_id, stop_sequence),
  constraint shipment_stops_one_type_per_sequence unique (shipment_id, stop_type, stop_sequence)
);

create table if not exists shipment_references (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references shipments(id) on delete cascade,
  reference_type text not null,
  reference_value text not null,
  source_partner_id uuid references trading_partners(id),
  created_at timestamptz not null default now(),
  constraint shipment_references_type_check check (reference_type in ('BOL', 'PO', 'CUSTOMER_REFERENCE')),
  constraint shipment_references_value_nonempty check (length(trim(reference_value)) > 0),
  constraint shipment_references_unique_per_shipment unique (shipment_id, reference_type, reference_value)
);

create table if not exists integration_transactions (
  id uuid primary key default gen_random_uuid(),
  correlation_id text not null,
  partner_id uuid not null references trading_partners(id),
  direction text not null,
  transport text not null,
  message_format text not null,
  document_type text not null,
  business_identifier text,
  x12_version text,
  interchange_control_number text,
  group_control_number text,
  transaction_control_number text,
  payload_hash text,
  raw_payload_location text,
  processing_status text not null default 'RECEIVED',
  processing_stage text not null default 'RECEIVED',
  retry_count integer not null default 0,
  parent_transaction_id uuid references integration_transactions(id),
  received_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integration_transactions_correlation_nonempty check (length(trim(correlation_id)) > 0),
  constraint integration_transactions_direction_check check (direction in ('INBOUND', 'OUTBOUND')),
  constraint integration_transactions_transport_check check (transport in ('REST', 'SFTP')),
  constraint integration_transactions_format_check check (message_format in ('JSON', 'X12')),
  constraint integration_transactions_status_check check (processing_status in ('RECEIVED', 'PROCESSING', 'SUCCEEDED', 'FAILED')),
  constraint integration_transactions_stage_check check (
    processing_stage in (
      'RECEIVED',
      'AUTHENTICATION',
      'PARSING',
      'VALIDATION',
      'MAPPING',
      'BUSINESS_VALIDATION',
      'ROUTING',
      'DELIVERY',
      'ACKNOWLEDGMENT',
      'COMPLETED'
    )
  ),
  constraint integration_transactions_retry_nonnegative check (retry_count >= 0),
  constraint integration_transactions_rest_json_check check (
    transport <> 'REST' or message_format = 'JSON'
  ),
  constraint integration_transactions_sftp_x12_check check (
    transport <> 'SFTP' or message_format = 'X12'
  )
);

create table if not exists tender_responses (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references shipments(id) on delete cascade,
  carrier_partner_id uuid not null references trading_partners(id),
  decision text not null,
  carrier_load_number text,
  reason_code text,
  message text,
  decided_at timestamptz not null,
  received_at timestamptz not null,
  source_transaction_id uuid references integration_transactions(id),
  created_at timestamptz not null default now(),
  constraint tender_responses_decision_check check (decision in ('ACCEPTED', 'REJECTED')),
  constraint tender_responses_rejected_reason_check check (
    decision <> 'REJECTED' or reason_code is not null
  ),
  constraint tender_responses_accepted_reason_check check (
    decision <> 'ACCEPTED' or reason_code is null
  )
);

create table if not exists shipment_events (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references shipments(id) on delete cascade,
  status text not null,
  occurred_at timestamptz not null,
  received_at timestamptz not null,
  city text,
  state text,
  source_partner_id uuid references trading_partners(id),
  source_transaction_id uuid references integration_transactions(id),
  created_at timestamptz not null default now(),
  constraint shipment_events_status_check check (status in ('PLANNED', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED', 'DELIVERED')),
  constraint shipment_events_state_check check (state is null or state ~ '^[A-Z]{2}$')
);

create table if not exists processing_logs (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references integration_transactions(id) on delete cascade,
  stage text not null,
  status text not null,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint processing_logs_stage_check check (
    stage in (
      'RECEIVED',
      'AUTHENTICATION',
      'PARSING',
      'VALIDATION',
      'MAPPING',
      'BUSINESS_VALIDATION',
      'ROUTING',
      'DELIVERY',
      'ACKNOWLEDGMENT',
      'COMPLETED'
    )
  ),
  constraint processing_logs_status_check check (status in ('RECEIVED', 'PROCESSING', 'SUCCEEDED', 'FAILED')),
  constraint processing_logs_message_nonempty check (length(trim(message)) > 0)
);

create table if not exists integration_errors (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references integration_transactions(id) on delete cascade,
  category text not null,
  error_code text not null,
  safe_message text not null,
  stage text not null,
  retryable boolean not null default false,
  resolved boolean not null default false,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint integration_errors_category_check check (
    category in (
      'TRANSPORT_ERROR',
      'AUTHENTICATION_ERROR',
      'AUTHORIZATION_ERROR',
      'SYNTAX_ERROR',
      'UNSUPPORTED_VERSION',
      'MAPPING_ERROR',
      'BUSINESS_VALIDATION_ERROR',
      'DUPLICATE_TRANSACTION',
      'DOWNSTREAM_ERROR'
    )
  ),
  constraint integration_errors_stage_check check (
    stage in (
      'RECEIVED',
      'AUTHENTICATION',
      'PARSING',
      'VALIDATION',
      'MAPPING',
      'BUSINESS_VALIDATION',
      'ROUTING',
      'DELIVERY',
      'ACKNOWLEDGMENT',
      'COMPLETED'
    )
  ),
  constraint integration_errors_code_nonempty check (length(trim(error_code)) > 0),
  constraint integration_errors_message_nonempty check (length(trim(safe_message)) > 0),
  constraint integration_errors_resolved_time_check check (
    resolved = false or resolved_at is not null
  )
);

create index if not exists idx_trading_partners_partner_code
  on trading_partners (partner_code);

create index if not exists idx_shipments_shipment_number
  on shipments (shipment_number);

create index if not exists idx_shipments_current_status
  on shipments (current_status);

create index if not exists idx_shipment_stops_shipment_id
  on shipment_stops (shipment_id);

create index if not exists idx_shipment_references_shipment_id
  on shipment_references (shipment_id);

create index if not exists idx_shipment_references_value
  on shipment_references (reference_type, reference_value);

create index if not exists idx_tender_responses_shipment_id
  on tender_responses (shipment_id);

create index if not exists idx_shipment_events_shipment_id
  on shipment_events (shipment_id);

create index if not exists idx_shipment_events_occurred_at
  on shipment_events (occurred_at);

create index if not exists idx_integration_transactions_correlation_id
  on integration_transactions (correlation_id);

create index if not exists idx_integration_transactions_business_identifier
  on integration_transactions (business_identifier);

create index if not exists idx_integration_transactions_status
  on integration_transactions (processing_status);

create index if not exists idx_integration_transactions_partner_id
  on integration_transactions (partner_id);

create index if not exists idx_integration_transactions_x12_controls
  on integration_transactions (
    interchange_control_number,
    group_control_number,
    transaction_control_number
  )
  where message_format = 'X12';

create index if not exists idx_integration_transactions_parent
  on integration_transactions (parent_transaction_id);

create index if not exists idx_processing_logs_transaction_id
  on processing_logs (transaction_id);

create index if not exists idx_integration_errors_transaction_id
  on integration_errors (transaction_id);

create index if not exists idx_integration_errors_category
  on integration_errors (category);

insert into trading_partners (
  partner_code,
  name,
  business_role,
  integration_style,
  active
)
values
  ('APEX', 'Apex Logistics', 'BROKER_3PL', 'REST_JSON', true),
  ('MWCX', 'Midwest Carrier', 'MOTOR_CARRIER', 'X12_SFTP', true)
on conflict (partner_code) do update
set
  name = excluded.name,
  business_role = excluded.business_role,
  integration_style = excluded.integration_style,
  active = excluded.active,
  updated_at = now();
