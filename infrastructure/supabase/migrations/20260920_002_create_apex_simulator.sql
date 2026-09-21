create extension if not exists pgcrypto;

create schema if not exists apex_sim;

create table if not exists apex_sim.loads (
  load_id text primary key,
  bol_number text not null,
  purchase_order_number text,
  customer_reference text,
  equipment_type text not null,
  weight_lbs numeric(12, 2) not null,
  pieces integer,
  commodity_description text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  current_tender_decision text,
  current_shipment_status text,
  current_shipment_status_occurred_at timestamptz,
  inserted_at timestamptz not null default now(),
  constraint loads_load_id_length check (char_length(load_id) between 6 and 30),
  constraint loads_bol_number_present check (char_length(bol_number) between 1 and 40),
  constraint loads_purchase_order_number_length check (
    purchase_order_number is null or char_length(purchase_order_number) between 1 and 40
  ),
  constraint loads_customer_reference_length check (
    customer_reference is null or char_length(customer_reference) between 1 and 40
  ),
  constraint loads_equipment_type_valid check (equipment_type in ('VAN_53', 'REEFER_53', 'FLATBED')),
  constraint loads_weight_lbs_positive check (weight_lbs > 0),
  constraint loads_pieces_positive check (pieces is null or pieces > 0),
  constraint loads_commodity_description_length check (char_length(commodity_description) between 1 and 80),
  constraint loads_updated_not_before_created check (updated_at >= created_at),
  constraint loads_tender_decision_valid check (
    current_tender_decision is null or current_tender_decision in ('ACCEPTED', 'REJECTED')
  ),
  constraint loads_shipment_status_valid check (
    current_shipment_status is null
    or current_shipment_status in ('PICKED_UP', 'IN_TRANSIT', 'ARRIVED', 'DELIVERED')
  ),
  constraint loads_current_status_time_pair check (
    (current_shipment_status is null and current_shipment_status_occurred_at is null)
    or (current_shipment_status is not null and current_shipment_status_occurred_at is not null)
  )
);

create table if not exists apex_sim.load_locations (
  id uuid primary key default gen_random_uuid(),
  load_id text not null references apex_sim.loads(load_id) on delete cascade,
  location_role text not null,
  facility_name text not null,
  address_1 text not null,
  address_2 text,
  city text not null,
  state text not null,
  postal_code text not null,
  scheduled_datetime timestamptz not null,
  created_at timestamptz not null default now(),
  constraint load_locations_role_valid check (location_role in ('PICKUP', 'DELIVERY')),
  constraint load_locations_facility_length check (char_length(facility_name) between 1 and 60),
  constraint load_locations_address_1_length check (char_length(address_1) between 1 and 80),
  constraint load_locations_address_2_length check (
    address_2 is null or char_length(address_2) between 1 and 80
  ),
  constraint load_locations_city_length check (char_length(city) between 1 and 40),
  constraint load_locations_state_format check (state ~ '^[A-Z]{2}$'),
  constraint load_locations_postal_code_length check (char_length(postal_code) between 5 and 10),
  constraint load_locations_one_role_per_load unique (load_id, location_role)
);

create table if not exists apex_sim.load_references (
  id uuid primary key default gen_random_uuid(),
  load_id text not null references apex_sim.loads(load_id) on delete cascade,
  reference_type text not null,
  reference_value text not null,
  description text,
  created_at timestamptz not null default now(),
  constraint load_references_type_valid check (
    reference_type in ('BOL', 'PO', 'CUSTOMER_REF', 'APPOINTMENT')
  ),
  constraint load_references_value_length check (char_length(reference_value) between 1 and 80),
  constraint load_references_description_length check (
    description is null or char_length(description) between 1 and 120
  ),
  constraint load_references_unique_per_load unique (load_id, reference_type, reference_value)
);

create table if not exists apex_sim.tender_responses (
  id uuid primary key default gen_random_uuid(),
  load_id text not null references apex_sim.loads(load_id) on delete cascade,
  decision text not null,
  carrier_code text not null,
  carrier_load_number text,
  reason_code text,
  message text,
  decided_at timestamptz not null,
  received_at timestamptz not null default now(),
  constraint tender_responses_decision_valid check (decision in ('ACCEPTED', 'REJECTED')),
  constraint tender_responses_carrier_code_length check (char_length(carrier_code) between 2 and 10),
  constraint tender_responses_carrier_load_number_length check (
    carrier_load_number is null or char_length(carrier_load_number) between 1 and 40
  ),
  constraint tender_responses_reason_code_length check (
    reason_code is null or char_length(reason_code) between 1 and 40
  ),
  constraint tender_responses_message_length check (
    message is null or char_length(message) between 1 and 240
  ),
  constraint tender_responses_rejected_requires_reason check (
    decision <> 'REJECTED' or reason_code is not null
  ),
  constraint tender_responses_accepted_omits_reason check (
    decision <> 'ACCEPTED' or reason_code is null
  )
);

create table if not exists apex_sim.shipment_statuses (
  id uuid primary key default gen_random_uuid(),
  load_id text not null references apex_sim.loads(load_id) on delete cascade,
  carrier_code text not null,
  status_code text not null,
  status_description text,
  occurred_at timestamptz not null,
  city text,
  state text,
  received_at timestamptz not null default now(),
  constraint shipment_statuses_carrier_code_length check (char_length(carrier_code) between 2 and 10),
  constraint shipment_statuses_status_code_valid check (
    status_code in ('PICKED_UP', 'IN_TRANSIT', 'ARRIVED', 'DELIVERED')
  ),
  constraint shipment_statuses_description_length check (
    status_description is null or char_length(status_description) between 1 and 240
  ),
  constraint shipment_statuses_city_length check (city is null or char_length(city) between 1 and 40),
  constraint shipment_statuses_state_format check (state is null or state ~ '^[A-Z]{2}$')
);

create index if not exists idx_apex_loads_current_tender_decision
  on apex_sim.loads(current_tender_decision);

create index if not exists idx_apex_loads_current_shipment_status
  on apex_sim.loads(current_shipment_status);

create index if not exists idx_apex_load_locations_load_id
  on apex_sim.load_locations(load_id);

create index if not exists idx_apex_load_references_load_id
  on apex_sim.load_references(load_id);

create index if not exists idx_apex_load_references_value
  on apex_sim.load_references(reference_value);

create index if not exists idx_apex_tender_responses_load_id
  on apex_sim.tender_responses(load_id);

create index if not exists idx_apex_tender_responses_received_at
  on apex_sim.tender_responses(received_at);

create index if not exists idx_apex_shipment_statuses_load_id
  on apex_sim.shipment_statuses(load_id);

create index if not exists idx_apex_shipment_statuses_occurred_at
  on apex_sim.shipment_statuses(occurred_at);

create index if not exists idx_apex_shipment_statuses_received_at
  on apex_sim.shipment_statuses(received_at);
