alter table if exists public.integration_errors
  add column if not exists resolution_note text;

alter table if exists public.integration_errors
  drop constraint if exists integration_errors_resolution_note_length_check;

alter table if exists public.integration_errors
  add constraint integration_errors_resolution_note_length_check
  check (resolution_note is null or length(resolution_note) <= 500);

create index if not exists idx_integration_transactions_created_at_desc
  on public.integration_transactions (created_at desc);

create index if not exists idx_integration_transactions_status_created_at
  on public.integration_transactions (processing_status, created_at desc);

create index if not exists idx_integration_transactions_document_type_created_at
  on public.integration_transactions (document_type, created_at desc);

create index if not exists idx_integration_transactions_business_identifier_created_at
  on public.integration_transactions (business_identifier, created_at desc);

create index if not exists idx_processing_logs_transaction_created_at
  on public.processing_logs (transaction_id, created_at, id);

create index if not exists idx_integration_errors_resolved_created_at
  on public.integration_errors (resolved, created_at desc);

create index if not exists idx_integration_errors_retryable_resolved_created_at
  on public.integration_errors (retryable, resolved, created_at desc);
