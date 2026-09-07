create table if not exists public.family_schedule_events (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  child text not null check (child in ('Mina', 'Leon')),
  day smallint not null check (day between 0 and 6),
  title text not null,
  start_time time not null,
  end_time time not null,
  kind text not null default 'activity' check (kind in ('school', 'sds', 'activity')),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time > start_time)
);

alter table public.family_schedule_events enable row level security;
drop policy if exists family_schedule_authenticated on public.family_schedule_events;
create policy family_schedule_authenticated on public.family_schedule_events
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists family_schedule_events_user_id_idx on public.family_schedule_events(user_id);
grant select, insert, update, delete on public.family_schedule_events to authenticated, service_role;

alter table public.family_schedule_events add column if not exists notes text not null default '';
