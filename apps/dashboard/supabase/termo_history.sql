create table if not exists public.termo_status_periods (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.apps(id) on delete cascade,
  source_run_id uuid references public.app_runs(id) on delete set null,
  started_at timestamptz not null,
  ended_at timestamptz,
  hot_water_status text not null check (hot_water_status in ('ok', 'down')),
  heat_status text not null check (heat_status in ('ok', 'down')),
  eta text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists termo_status_periods_app_started_idx
  on public.termo_status_periods (app_id, started_at desc);

create unique index if not exists termo_status_periods_open_idx
  on public.termo_status_periods (app_id)
  where ended_at is null;

alter table public.termo_status_periods enable row level security;

drop policy if exists termo_status_periods_read on public.termo_status_periods;
create policy termo_status_periods_read on public.termo_status_periods
  for select using (true);

grant select on public.termo_status_periods to authenticated;
grant select, insert, update, delete on public.termo_status_periods to service_role;
