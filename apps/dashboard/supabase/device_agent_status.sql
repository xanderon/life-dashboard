-- Apply before deploying the updated Guardian and dashboard.
create table if not exists public.device_agent_status (
  device_id uuid primary key references public.devices(id) on delete cascade,
  reported_at timestamptz not null default now(),
  control_updated_at timestamptz,
  youtube_allowed boolean not null,
  hosts_ok boolean not null,
  firewall_ok boolean not null,
  enforcement_ready boolean not null,
  agent_version text not null
);
alter table public.device_agent_status enable row level security;
drop policy if exists device_agent_status_owner_read on public.device_agent_status;
create policy device_agent_status_owner_read on public.device_agent_status for select to authenticated
  using (exists (select 1 from public.devices d where d.id = device_agent_status.device_id and d.owner_id = auth.uid()));
revoke all on public.device_agent_status from anon, authenticated;
grant select on public.device_agent_status to authenticated;
grant select, insert, update, delete on public.device_agent_status to service_role;
