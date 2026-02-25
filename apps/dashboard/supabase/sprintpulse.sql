create table if not exists public.sprintpulse_sprints (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null,
  name text,
  start_date date not null,
  end_date date not null,
  duration_days int not null default 14,
  created_at timestamptz not null default now()
);

create table if not exists public.sprintpulse_task_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null,
  title text not null,
  category text not null,
  default_owner_name text,
  cadence_type text not null check (cadence_type in ('ONCE_PER_SPRINT', 'MULTI_PER_SPRINT')),
  reminder_rules jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sprintpulse_sprint_task_instances (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null,
  sprint_id uuid not null references public.sprintpulse_sprints(id) on delete cascade,
  template_id uuid references public.sprintpulse_task_templates(id) on delete set null,
  title_snapshot text not null,
  category_snapshot text not null,
  owner_name text,
  status text not null check (status in ('NOT_STARTED', 'IN_PROGRESS', 'DONE', 'BLOCKED')) default 'NOT_STARTED',
  priority text check (priority in ('P0', 'P1', 'P2', 'P3')),
  notes text,
  due_hint text,
  history jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.sprintpulse_adhoc_tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null,
  sprint_id uuid not null references public.sprintpulse_sprints(id) on delete cascade,
  title text not null,
  note text,
  owner_name text,
  status text not null check (status in ('NOT_STARTED', 'IN_PROGRESS', 'DONE', 'BLOCKED')) default 'NOT_STARTED',
  priority text not null check (priority in ('P0', 'P1', 'P2', 'P3')) default 'P2',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists sprintpulse_sprints_owner_start_idx
  on public.sprintpulse_sprints(owner_id, start_date desc);

create index if not exists sprintpulse_templates_owner_active_idx
  on public.sprintpulse_task_templates(owner_id, is_active);

create index if not exists sprintpulse_instances_owner_sprint_idx
  on public.sprintpulse_sprint_task_instances(owner_id, sprint_id);

create index if not exists sprintpulse_adhoc_owner_sprint_idx
  on public.sprintpulse_adhoc_tasks(owner_id, sprint_id);

create or replace function public.sprintpulse_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists sprintpulse_templates_touch_updated_at on public.sprintpulse_task_templates;
create trigger sprintpulse_templates_touch_updated_at
before update on public.sprintpulse_task_templates
for each row
execute procedure public.sprintpulse_touch_updated_at();

drop trigger if exists sprintpulse_instances_touch_updated_at on public.sprintpulse_sprint_task_instances;
create trigger sprintpulse_instances_touch_updated_at
before update on public.sprintpulse_sprint_task_instances
for each row
execute procedure public.sprintpulse_touch_updated_at();

drop trigger if exists sprintpulse_adhoc_touch_updated_at on public.sprintpulse_adhoc_tasks;
create trigger sprintpulse_adhoc_touch_updated_at
before update on public.sprintpulse_adhoc_tasks
for each row
execute procedure public.sprintpulse_touch_updated_at();

alter table public.sprintpulse_sprints enable row level security;
alter table public.sprintpulse_task_templates enable row level security;
alter table public.sprintpulse_sprint_task_instances enable row level security;
alter table public.sprintpulse_adhoc_tasks enable row level security;

create policy "sprintpulse_sprints_read" on public.sprintpulse_sprints
  for select using (true);
create policy "sprintpulse_templates_read" on public.sprintpulse_task_templates
  for select using (true);
create policy "sprintpulse_instances_read" on public.sprintpulse_sprint_task_instances
  for select using (true);
create policy "sprintpulse_adhoc_read" on public.sprintpulse_adhoc_tasks
  for select using (true);
