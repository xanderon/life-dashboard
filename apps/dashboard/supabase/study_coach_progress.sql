create table if not exists public.study_concept_progress (
  owner_id text not null,
  concept_id text not null,
  status text not null default 'new' check (status in ('new', 'learning', 'reviewing', 'mastered')),
  mastery_score int not null default 0,
  last_result text check (last_result in ('pass', 'hard', 'fail')),
  last_reviewed_at timestamptz,
  next_due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, concept_id)
);

create index if not exists study_concept_progress_owner_status_idx
  on public.study_concept_progress(owner_id, status);

create index if not exists study_concept_progress_owner_due_idx
  on public.study_concept_progress(owner_id, next_due_date);

create or replace function public.study_concept_progress_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists study_concept_progress_touch on public.study_concept_progress;
create trigger study_concept_progress_touch
before update on public.study_concept_progress
for each row
execute procedure public.study_concept_progress_touch_updated_at();

alter table public.study_concept_progress enable row level security;

drop policy if exists study_concept_progress_rw on public.study_concept_progress;
create policy study_concept_progress_rw
  on public.study_concept_progress
  for all
  using (true)
  with check (true);
