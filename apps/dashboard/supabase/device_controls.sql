-- YouTube Guardian control state and device-scoped polling credentials.
-- Safe to re-run. Apply with the Supabase SQL editor or your migration runner.

create table if not exists public.device_controls (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id) on delete cascade,
  youtube_allowed boolean not null default false,
  youtube_allowed_until timestamptz null,
  updated_at timestamptz not null default now(),
  updated_by uuid null references auth.users(id)
);

-- Repair duplicate rows before adding the invariant. The newest row wins.
delete from public.device_controls older
using public.device_controls newer
where older.device_id = newer.device_id
  and (older.updated_at, older.id) < (newer.updated_at, newer.id);

create unique index if not exists device_controls_device_id_key
  on public.device_controls(device_id);

create or replace function public.touch_device_controls()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  if auth.uid() is not null then
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_touch_device_controls on public.device_controls;
create trigger trg_touch_device_controls
  before insert or update on public.device_controls
  for each row execute function public.touch_device_controls();

alter table public.device_controls enable row level security;

drop policy if exists device_controls_owner_rw on public.device_controls;
create policy device_controls_owner_rw on public.device_controls
  for all to authenticated
  using (exists (
    select 1 from public.devices d
    where d.id = device_controls.device_id and d.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.devices d
    where d.id = device_controls.device_id and d.owner_id = auth.uid()
  ));

-- Remove the old policy/grant that allowed any anon-key holder to enumerate rows.
drop policy if exists device_controls_anon_read on public.device_controls;
drop policy if exists device_controls_service_all on public.device_controls;
revoke all on public.device_controls from anon;
grant select, insert, update, delete on public.device_controls to authenticated;
grant select, insert, update, delete on public.device_controls to service_role;

-- Only the server service role can read these hashes. The raw token stays on the PC.
create table if not exists public.device_agent_credentials (
  device_id uuid primary key references public.devices(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  rotated_at timestamptz not null default now()
);

alter table public.device_agent_credentials enable row level security;
revoke all on public.device_agent_credentials from anon, authenticated;
grant select, insert, update, delete on public.device_agent_credentials to service_role;

comment on column public.device_agent_credentials.token_hash is
  'Lowercase SHA-256 hex of the random per-device bearer token; never store the raw token.';
