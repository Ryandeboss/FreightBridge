create table if not exists public.integration_lab_runs (
  id uuid primary key default gen_random_uuid(),
  scenario_key text not null,
  business_identifier text not null,
  status text not null default 'READY',
  input_snapshot jsonb not null,
  result_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  constraint integration_lab_runs_status_check check (
    status in ('READY', 'RUNNING', 'SUCCEEDED', 'FAILED')
  ),
  constraint integration_lab_runs_scenario_nonempty check (length(trim(scenario_key)) > 0),
  constraint integration_lab_runs_business_identifier_nonempty check (length(trim(business_identifier)) > 0)
);

create table if not exists public.integration_lab_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.integration_lab_runs(id) on delete cascade,
  step_key text not null,
  sequence integer not null,
  display_name text not null,
  sender text not null,
  receiver text not null,
  transport text not null,
  message_format text not null,
  document_type text not null,
  status text not null default 'PENDING',
  attempt_count integer not null default 0,
  request_summary jsonb not null default '{}'::jsonb,
  response_summary jsonb not null default '{}'::jsonb,
  related_transaction_ids jsonb not null default '[]'::jsonb,
  error_code text,
  safe_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  constraint integration_lab_steps_status_check check (
    status in ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED')
  ),
  constraint integration_lab_steps_sequence_positive check (sequence > 0),
  constraint integration_lab_steps_attempt_count_nonnegative check (attempt_count >= 0),
  constraint integration_lab_steps_step_key_nonempty check (length(trim(step_key)) > 0),
  constraint integration_lab_steps_unique_key unique (run_id, step_key)
);

create index if not exists idx_integration_lab_runs_created_at
  on public.integration_lab_runs (created_at desc);

create index if not exists idx_integration_lab_runs_scenario_status
  on public.integration_lab_runs (scenario_key, status, created_at desc);

create index if not exists idx_integration_lab_runs_business_identifier
  on public.integration_lab_runs (business_identifier);

create index if not exists idx_integration_lab_steps_run_sequence
  on public.integration_lab_steps (run_id, sequence);

create index if not exists idx_integration_lab_steps_status
  on public.integration_lab_steps (run_id, status);
