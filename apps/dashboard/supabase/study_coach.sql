create table if not exists public.study_topics (
  id text primary key,
  owner_id text not null,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.study_days (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null,
  date date not null,
  planned_minutes int not null default 0,
  completed_minutes int not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  unique(owner_id, date)
);

create table if not exists public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null,
  day_id uuid not null references public.study_days(id) on delete cascade,
  topic_id text not null references public.study_topics(id) on delete restrict,
  block_type text not null check (block_type in ('learn_concept', 'learn_coding', 'review_spaced', 'interleave_drill')),
  planned_start timestamptz,
  actual_start timestamptz,
  actual_end timestamptz,
  score text check (score in ('pass', 'hard', 'fail')),
  energy text check (energy in ('normal', 'low', 'focus')),
  created_at timestamptz not null default now()
);

create table if not exists public.study_gap_cards (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null,
  topic_id text not null references public.study_topics(id) on delete cascade,
  prompt text not null,
  gold_answer text,
  example text,
  status text not null default 'new' check (status in ('new', 'reviewing', 'mastered')),
  next_due_date date not null,
  last_result text check (last_result in ('pass', 'fail')),
  created_at timestamptz not null default now()
);

create index if not exists study_days_owner_date_idx on public.study_days(owner_id, date desc);
create index if not exists study_sessions_owner_day_idx on public.study_sessions(owner_id, day_id);
create index if not exists study_gap_cards_owner_due_idx on public.study_gap_cards(owner_id, next_due_date);

alter table public.study_topics enable row level security;
alter table public.study_days enable row level security;
alter table public.study_sessions enable row level security;
alter table public.study_gap_cards enable row level security;

drop policy if exists study_topics_rw on public.study_topics;
create policy study_topics_rw on public.study_topics for all using (true) with check (true);

drop policy if exists study_days_rw on public.study_days;
create policy study_days_rw on public.study_days for all using (true) with check (true);

drop policy if exists study_sessions_rw on public.study_sessions;
create policy study_sessions_rw on public.study_sessions for all using (true) with check (true);

drop policy if exists study_gap_cards_rw on public.study_gap_cards;
create policy study_gap_cards_rw on public.study_gap_cards for all using (true) with check (true);
