alter table if exists public.trading_partners
  add column if not exists description text;

alter table if exists public.trading_partners
  add column if not exists support_contact text;

alter table if exists public.trading_partners
  add column if not exists config_revision integer not null default 1;

do $$
begin
  alter table public.trading_partners
    add constraint trading_partners_config_revision_positive check (config_revision > 0);
exception
  when duplicate_object then null;
  when undefined_table then null;
end $$;

create table if not exists public.trading_partner_capabilities (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.trading_partners(id) on delete cascade,
  direction text not null,
  document_type text not null,
  transport text not null,
  message_format text not null,
  protocol_version text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trading_partner_capabilities_direction_check check (direction in ('INBOUND', 'OUTBOUND')),
  constraint trading_partner_capabilities_transport_check check (transport in ('REST', 'SFTP')),
  constraint trading_partner_capabilities_format_check check (message_format in ('JSON', 'X12')),
  constraint trading_partner_capabilities_doc_nonempty check (length(trim(document_type)) > 0)
);

create table if not exists public.mapping_profiles (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.trading_partners(id),
  mapping_key text not null,
  name text not null,
  description text,
  direction text not null,
  source_format text not null,
  target_format text not null,
  source_document_type text not null,
  target_document_type text not null,
  version_number integer not null,
  status text not null,
  settings jsonb not null default '{}'::jsonb,
  validation_status text not null default 'NOT_VALIDATED',
  validation_errors jsonb not null default '[]'::jsonb,
  based_on_profile_id uuid references public.mapping_profiles(id),
  change_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  validated_at timestamptz,
  activated_at timestamptz,
  constraint mapping_profiles_key_nonempty check (length(trim(mapping_key)) > 0),
  constraint mapping_profiles_name_nonempty check (length(trim(name)) > 0),
  constraint mapping_profiles_direction_check check (direction in ('INBOUND', 'OUTBOUND')),
  constraint mapping_profiles_status_check check (status in ('DRAFT', 'ACTIVE', 'ARCHIVED', 'ABANDONED')),
  constraint mapping_profiles_validation_status_check check (validation_status in ('NOT_VALIDATED', 'VALID', 'INVALID')),
  constraint mapping_profiles_version_positive check (version_number > 0),
  constraint mapping_profiles_unique_version unique (mapping_key, version_number)
);

create unique index if not exists idx_mapping_profiles_one_active
  on public.mapping_profiles (mapping_key)
  where status = 'ACTIVE';

create table if not exists public.mapping_rules (
  id uuid primary key default gen_random_uuid(),
  mapping_profile_id uuid not null references public.mapping_profiles(id) on delete cascade,
  sequence integer not null,
  rule_key text not null,
  source_path text,
  target_path text,
  transformation text not null,
  required boolean not null default false,
  qualifier_or_condition text,
  failure_code text,
  configuration jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mapping_rules_sequence_positive check (sequence > 0),
  constraint mapping_rules_key_nonempty check (length(trim(rule_key)) > 0),
  constraint mapping_rules_transformation_nonempty check (length(trim(transformation)) > 0),
  constraint mapping_rules_unique_key unique (mapping_profile_id, rule_key)
);

create table if not exists public.configuration_change_log (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  before_snapshot jsonb,
  after_snapshot jsonb,
  note text,
  source text not null default 'OPERATIONS_API',
  created_at timestamptz not null default now(),
  constraint configuration_change_entity_type_check check (
    entity_type in ('TRADING_PARTNER', 'PARTNER_CAPABILITY', 'MAPPING_PROFILE', 'MAPPING_RULE')
  ),
  constraint configuration_change_action_check check (
    action in (
      'UPDATE',
      'CREATE_DRAFT',
      'VALIDATE',
      'ACTIVATE',
      'ARCHIVE',
      'ABANDON',
      'CAPABILITY_ENABLE',
      'CAPABILITY_DISABLE'
    )
  )
);

alter table if exists public.integration_transactions
  add column if not exists mapping_profile_id uuid references public.mapping_profiles(id);

alter table if exists public.integration_transactions
  add column if not exists mapping_profile_version integer;

alter table if exists public.integration_transactions
  add column if not exists mapping_key text;

create index if not exists idx_trading_partner_capabilities_partner
  on public.trading_partner_capabilities (partner_id, document_type, direction, enabled);

create unique index if not exists idx_trading_partner_capabilities_unique
  on public.trading_partner_capabilities (
    partner_id,
    direction,
    document_type,
    transport,
    message_format,
    coalesce(protocol_version, '')
  );

create index if not exists idx_mapping_profiles_partner
  on public.mapping_profiles (partner_id, mapping_key, status);

create index if not exists idx_mapping_profiles_status
  on public.mapping_profiles (status, validation_status);

create index if not exists idx_mapping_rules_profile
  on public.mapping_rules (mapping_profile_id, sequence);

create index if not exists idx_configuration_change_log_entity
  on public.configuration_change_log (entity_type, entity_id, created_at desc);

create index if not exists idx_integration_transactions_mapping_profile
  on public.integration_transactions (mapping_profile_id);

create index if not exists idx_integration_transactions_mapping_key
  on public.integration_transactions (mapping_key, mapping_profile_version);

insert into public.trading_partner_capabilities (
  partner_id,
  direction,
  document_type,
  transport,
  message_format,
  protocol_version,
  enabled
)
select p.id, c.direction, c.document_type, c.transport, c.message_format, c.protocol_version, true
from public.trading_partners p
join (
  values
    ('APEX', 'INBOUND', 'APEX_LOAD_TENDER', 'REST', 'JSON', 'v1'),
    ('APEX', 'OUTBOUND', 'APEX_TENDER_RESPONSE', 'REST', 'JSON', 'v1'),
    ('APEX', 'OUTBOUND', 'APEX_SHIPMENT_STATUS', 'REST', 'JSON', 'v1'),
    ('MWCX', 'OUTBOUND', '204', 'REST', 'X12', '004010'),
    ('MWCX', 'OUTBOUND', '204', 'SFTP', 'X12', '004010'),
    ('MWCX', 'INBOUND', '990', 'REST', 'X12', '004010'),
    ('MWCX', 'INBOUND', '997', 'SFTP', 'X12', '004010'),
    ('MWCX', 'INBOUND', '990', 'SFTP', 'X12', '004010'),
    ('MWCX', 'INBOUND', '214', 'SFTP', 'X12', '004010')
) as c(partner_code, direction, document_type, transport, message_format, protocol_version)
  on p.partner_code = c.partner_code
on conflict do nothing;

insert into public.mapping_profiles (
  partner_id,
  mapping_key,
  name,
  description,
  direction,
  source_format,
  target_format,
  source_document_type,
  target_document_type,
  version_number,
  status,
  settings,
  validation_status,
  validation_errors,
  activated_at
)
select
  p.id,
  m.mapping_key,
  m.name,
  m.description,
  m.direction,
  m.source_format,
  m.target_format,
  m.source_document_type,
  m.target_document_type,
  1,
  'ACTIVE',
  m.settings::jsonb,
  'VALID',
  '[]'::jsonb,
  now()
from public.trading_partners p
join (
  values
    (
      'APEX',
      'APEX_LOAD_TO_CANONICAL',
      'Apex load tender to canonical shipment',
      'Controlled REST/JSON to canonical shipment mapping.',
      'INBOUND',
      'JSON',
      'CANONICAL',
      'APEX_LOAD_TENDER',
      'CANONICAL_SHIPMENT',
      '{
        "equipmentMap": {"VAN_53": "DRY_VAN_53", "REEFER_53": "REFRIGERATED_53", "FLATBED": "FLATBED"},
        "referenceMap": {"BOL": "BOL", "PO": "PO", "CUSTOMER_REF": "CUSTOMER_REFERENCE"},
        "ignoredReferenceTypes": ["APPOINTMENT"]
      }'
    ),
    (
      'MWCX',
      'CANONICAL_TO_MWCX_204',
      'Canonical shipment to Midwest 204',
      'Outbound Midwest X12 204 tender profile.',
      'OUTBOUND',
      'CANONICAL',
      'X12',
      'CANONICAL_SHIPMENT',
      '204',
      '{
        "senderId": "FREIGHTBRIDGE",
        "receiverId": "MWCX",
        "x12Version": "004010",
        "isaControlVersion": "00401",
        "functionalIdentifier": "SM",
        "transactionSet": "204",
        "usageIndicator": "T",
        "paymentMethod": "PP",
        "bolQualifier": "BM",
        "poQualifier": "PO",
        "pickupDateQualifier": "37",
        "pickupTimeQualifier": "I",
        "deliveryDateQualifier": "38",
        "deliveryTimeQualifier": "K",
        "pickupStopReason": "LD",
        "deliveryStopReason": "UL",
        "shipperEntityIdentifier": "SH",
        "consigneeEntityIdentifier": "CN",
        "weightQualifier": "G",
        "timestampPolicy": "UTC"
      }'
    ),
    (
      'MWCX',
      'MWCX_990_TO_CANONICAL',
      'Midwest 990 to canonical tender response',
      'Inbound Midwest X12 990 tender decision profile.',
      'INBOUND',
      'X12',
      'CANONICAL',
      '990',
      'CANONICAL_TENDER_RESPONSE',
      '{
        "expectedSender": "MWCX",
        "expectedReceiver": "FREIGHTBRIDGE",
        "x12Version": "004010",
        "isaControlVersion": "00401",
        "functionalIdentifier": "GF",
        "transactionSet": "990",
        "decisionCodeMap": {"A": "ACCEPTED", "D": "REJECTED"},
        "carrierLoadQualifier": "CN",
        "rejectionReasonQualifier": "ZZ",
        "bolQualifier": "BM",
        "poQualifier": "PO"
      }'
    ),
    (
      'MWCX',
      'MWCX_214_TO_CANONICAL',
      'Midwest 214 to canonical shipment event',
      'Inbound Midwest X12 214 shipment-status profile.',
      'INBOUND',
      'X12',
      'CANONICAL',
      '214',
      'CANONICAL_SHIPMENT_EVENT',
      '{
        "expectedSender": "MWCX",
        "expectedReceiver": "FREIGHTBRIDGE",
        "x12Version": "004010",
        "isaControlVersion": "00401",
        "functionalIdentifier": "QM",
        "transactionSet": "214",
        "statusCodeMap": {"AF": "PICKED_UP", "X6": "IN_TRANSIT", "X1": "ARRIVED", "D1": "DELIVERED"},
        "eventTimeCode": "UT",
        "bolQualifier": "BM",
        "poQualifier": "PO"
      }'
    ),
    (
      'MWCX',
      'MWCX_997_TO_ACK',
      'Midwest 997 functional acknowledgment',
      'Inbound Midwest X12 997 technical acknowledgment profile for outbound 204s.',
      'INBOUND',
      'X12',
      'ACK',
      '997',
      'FUNCTIONAL_ACKNOWLEDGMENT',
      '{
        "expectedSender": "MWCX",
        "expectedReceiver": "FREIGHTBRIDGE",
        "x12Version": "004010",
        "isaControlVersion": "00401",
        "functionalIdentifier": "FA",
        "transactionSet": "997",
        "acknowledgedFunctionalIdentifier": "SM",
        "acknowledgedTransactionSet": "204",
        "supportedAckCodes": ["A", "R"],
        "expectedIncludedCount": 1,
        "expectedReceivedCount": 1
      }'
    )
) as m(partner_code, mapping_key, name, description, direction, source_format, target_format, source_document_type, target_document_type, settings)
  on p.partner_code = m.partner_code
on conflict (mapping_key, version_number) do update
set
  name = excluded.name,
  description = excluded.description,
  settings = excluded.settings,
  validation_status = excluded.validation_status,
  validation_errors = excluded.validation_errors,
  updated_at = now();

insert into public.mapping_rules (
  mapping_profile_id,
  sequence,
  rule_key,
  source_path,
  target_path,
  transformation,
  required,
  qualifier_or_condition,
  failure_code,
  configuration,
  notes
)
select mp.id, r.sequence, r.rule_key, r.source_path, r.target_path, r.transformation, r.required,
       r.qualifier_or_condition, r.failure_code, r.configuration::jsonb, r.notes
from public.mapping_profiles mp
join (
  values
    ('APEX_LOAD_TO_CANONICAL', 10, 'equipment_type', 'equipmentType', 'shipment.equipment_type', 'equipmentMap lookup', true, null, 'MAPPING_FAILED', '{}', 'Apex equipment enum to canonical EquipmentType.'),
    ('APEX_LOAD_TO_CANONICAL', 20, 'references', 'references[]', 'shipment.references[]', 'referenceMap lookup and ignoredReferenceTypes filter', false, null, null, '{}', 'Supported Apex references become canonical BOL/PO/customer references.'),
    ('CANONICAL_TO_MWCX_204', 10, 'envelope', 'shipment', 'ISA/GS/ST', 'fixed profile settings plus generated control numbers', true, null, 'MIDWEST_204_ENVELOPE_VALIDATION_FAILED', '{}', 'Sender, receiver, versions, and functional identifiers come from settings.'),
    ('CANONICAL_TO_MWCX_204', 20, 'bol_reference', 'references.BOL', 'L11/BM', 'reference qualifier mapping', true, 'bolQualifier', 'MISSING_BOL_REFERENCE', '{}', 'BOL is required by the current Midwest profile.'),
    ('CANONICAL_TO_MWCX_204', 30, 'appointments', 'origin/destination.scheduled_at', 'G62', 'UTC timestamp formatting with qualifier settings', true, '37/I and 38/K', 'MISSING_PICKUP_APPOINTMENT', '{}', 'Pickup and delivery appointment windows become G62 pairs.'),
    ('CANONICAL_TO_MWCX_204', 40, 'stops', 'origin/destination', 'S5/N1/N3/N4', 'stop and entity qualifier settings', true, 'LD/UL SH/CN', 'MISSING_ORIGIN_ADDRESS', '{}', 'Pickup and delivery addresses become Midwest stop loops.'),
    ('CANONICAL_TO_MWCX_204', 50, 'weight_pieces', 'weight_lbs/pieces', 'L3', 'weightQualifier setting', true, 'G', 'MISSING_WEIGHT', '{}', 'Weight and pieces become the current L3 profile.'),
    ('MWCX_990_TO_CANONICAL', 10, 'profile', 'ISA/GS/ST', 'profile validation', 'expected sender/receiver and version settings', true, null, 'INVALID_PARTNER_PROFILE', '{}', 'Inbound 990 must match the Midwest profile.'),
    ('MWCX_990_TO_CANONICAL', 20, 'decision', 'B1-04', 'TenderDecision', 'decisionCodeMap lookup', true, 'A/D', 'UNSUPPORTED_TENDER_DECISION', '{}', 'A and D map to accepted/rejected.'),
    ('MWCX_990_TO_CANONICAL', 30, 'references', 'L11', 'carrier load/reason/BOL/PO', 'qualifier settings', false, 'CN/ZZ/BM/PO', null, '{}', 'L11 qualifiers provide carrier and reference metadata.'),
    ('MWCX_214_TO_CANONICAL', 10, 'profile', 'ISA/GS/ST', 'profile validation', 'expected sender/receiver and version settings', true, null, 'INVALID_PARTNER_PROFILE', '{}', 'Inbound 214 must match the Midwest profile.'),
    ('MWCX_214_TO_CANONICAL', 20, 'status', 'AT7-01', 'ShipmentStatus', 'statusCodeMap lookup', true, 'AF/X6/X1/D1', 'UNSUPPORTED_AT7_CODE', '{}', 'AT7 status maps to canonical shipment event status.'),
    ('MWCX_214_TO_CANONICAL', 30, 'event_time', 'AT7-05/06/07', 'occurred_at', 'UTC timestamp parsing', true, 'UT', 'UNSUPPORTED_TIME_CODE', '{}', 'Only UTC AT7 event time is currently supported.'),
    ('MWCX_997_TO_ACK', 10, 'profile', 'ISA/GS/ST', 'profile validation', 'expected sender/receiver and FA/997 settings', true, null, 'INVALID_FUNCTIONAL_GROUP', '{}', 'Inbound 997 must match the Midwest technical ack profile.'),
    ('MWCX_997_TO_ACK', 20, 'ack_correlation', 'AK1/AK2', 'acknowledged 204 controls', 'control-number correlation', true, 'SM/204', 'UNSUPPORTED_ACKNOWLEDGED_TRANSACTION_SET', '{}', '997 AK1/AK2 correlates back to the outbound 204.'),
    ('MWCX_997_TO_ACK', 30, 'ack_status', 'AK5/AK9', 'FunctionalAcknowledgmentStatus', 'supportedAckCodes and AK9 counts', true, 'A/R', 'INVALID_AK9_COUNTS', '{}', 'Project profile supports accepted or rejected single-transaction acknowledgments.')
) as r(mapping_key, sequence, rule_key, source_path, target_path, transformation, required, qualifier_or_condition, failure_code, configuration, notes)
  on mp.mapping_key = r.mapping_key
where mp.version_number = 1
on conflict (mapping_profile_id, rule_key) do update
set
  sequence = excluded.sequence,
  source_path = excluded.source_path,
  target_path = excluded.target_path,
  transformation = excluded.transformation,
  required = excluded.required,
  qualifier_or_condition = excluded.qualifier_or_condition,
  failure_code = excluded.failure_code,
  configuration = excluded.configuration,
  notes = excluded.notes,
  updated_at = now();
