alter table if exists public.integration_transactions
  add column if not exists replay_of_transaction_id uuid references public.integration_transactions(id);

alter table if exists public.integration_errors
  add column if not exists resolved_by_transaction_id uuid references public.integration_transactions(id);

create table if not exists public.integration_idempotency_records (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.trading_partners(id),
  direction text not null,
  document_type text not null,
  operation text not null,
  idempotency_key text not null,
  request_fingerprint text not null,
  business_identifier text,
  original_transaction_id uuid references public.integration_transactions(id),
  status text not null,
  response_snapshot jsonb,
  replay_count integer not null default 0,
  last_replayed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integration_idempotency_direction_check check (direction in ('INBOUND', 'OUTBOUND')),
  constraint integration_idempotency_status_check check (status in ('PROCESSING', 'SUCCEEDED', 'FAILED')),
  constraint integration_idempotency_key_nonempty check (length(trim(idempotency_key)) > 0),
  constraint integration_idempotency_key_length check (length(idempotency_key) <= 120),
  constraint integration_idempotency_replay_nonnegative check (replay_count >= 0),
  constraint integration_idempotency_unique_key unique (
    partner_id,
    direction,
    document_type,
    operation,
    idempotency_key
  )
);

create table if not exists public.integration_message_payloads (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null unique references public.integration_transactions(id) on delete cascade,
  media_type text not null,
  payload_sha256 text not null,
  payload_text text not null,
  created_at timestamptz not null default now(),
  constraint integration_payloads_media_type_nonempty check (length(trim(media_type)) > 0),
  constraint integration_payloads_sha_nonempty check (length(trim(payload_sha256)) > 0)
);

create table if not exists public.integration_retry_attempts (
  id uuid primary key default gen_random_uuid(),
  original_transaction_id uuid not null references public.integration_transactions(id) on delete cascade,
  retry_transaction_id uuid not null unique references public.integration_transactions(id) on delete cascade,
  attempt_number integer not null,
  status text not null,
  note text,
  delivery_disposition text,
  error_code text,
  safe_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint integration_retry_attempts_attempt_positive check (attempt_number > 0),
  constraint integration_retry_attempts_status_check check (status in ('PROCESSING', 'SUCCEEDED', 'FAILED')),
  constraint integration_retry_attempts_note_length check (note is null or length(note) <= 500),
  constraint integration_retry_attempts_unique_attempt unique (original_transaction_id, attempt_number)
);

alter table if exists midwest_sim.inbound_edi_documents
  add column if not exists replay_of_document_id uuid references midwest_sim.inbound_edi_documents(id);

create index if not exists idx_integration_transactions_replay_of
  on public.integration_transactions (replay_of_transaction_id);

create index if not exists idx_integration_transactions_x12_replay_identity
  on public.integration_transactions (
    partner_id,
    direction,
    document_type,
    interchange_control_number,
    group_control_number,
    transaction_control_number
  )
  where message_format = 'X12';

create index if not exists idx_integration_idempotency_records_partner
  on public.integration_idempotency_records (partner_id, document_type, operation, status);

create index if not exists idx_integration_idempotency_records_original
  on public.integration_idempotency_records (original_transaction_id);

create index if not exists idx_integration_payloads_payload_sha
  on public.integration_message_payloads (payload_sha256);

create index if not exists idx_integration_retry_attempts_original
  on public.integration_retry_attempts (original_transaction_id, created_at desc);

create index if not exists idx_integration_errors_resolved_by_transaction
  on public.integration_errors (resolved_by_transaction_id);

create index if not exists idx_midwest_inbound_edi_replay_identity
  on midwest_sim.inbound_edi_documents (
    document_type,
    interchange_control_number,
    group_control_number,
    transaction_control_number
  );

create index if not exists idx_midwest_inbound_edi_replay_of
  on midwest_sim.inbound_edi_documents (replay_of_document_id);
