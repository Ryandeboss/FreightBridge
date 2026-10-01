create table if not exists public.learner_course_progress (
  user_id uuid primary key,
  progress_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint learner_course_progress_snapshot_object
    check (jsonb_typeof(progress_snapshot) = 'object')
);

do $$
begin
  if to_regclass('auth.users') is not null
     and not exists (
       select 1
       from pg_constraint
       where conname = 'learner_course_progress_user_id_fkey'
     ) then
    alter table public.learner_course_progress
      add constraint learner_course_progress_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
end
$$;

alter table public.learner_course_progress enable row level security;

create index if not exists idx_learner_course_progress_updated_at
  on public.learner_course_progress (updated_at desc);
