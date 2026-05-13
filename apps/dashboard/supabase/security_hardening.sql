alter table public.apps enable row level security;
alter table public.app_runs enable row level security;
alter table public.devices enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.receipts enable row level security;
alter table public.receipt_items enable row level security;

drop policy if exists apps_read on public.apps;
create policy apps_read on public.apps
for select using (owner_id = auth.uid());

drop policy if exists app_runs_read on public.app_runs;
create policy app_runs_read on public.app_runs
for select using (
  exists (
    select 1
    from public.apps
    where apps.id = app_runs.app_id
      and apps.owner_id = auth.uid()
  )
);

drop policy if exists devices_read on public.devices;
create policy devices_read on public.devices
for select using (owner_id = auth.uid());

drop policy if exists push_subscriptions_rw on public.push_subscriptions;
create policy push_subscriptions_rw on public.push_subscriptions
for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists receipts_rw on public.receipts;
create policy receipts_rw on public.receipts
for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists receipt_items_rw on public.receipt_items;
create policy receipt_items_rw on public.receipt_items
for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

grant select on public.apps to authenticated;
grant select on public.app_runs to authenticated;
grant select on public.devices to authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant select, insert, update, delete on public.receipts to authenticated;
grant select, insert, update, delete on public.receipt_items to authenticated;

grant select, insert, update, delete on public.apps to service_role;
grant select, insert, update, delete on public.app_runs to service_role;
grant select, insert, update, delete on public.devices to service_role;
grant select, insert, update, delete on public.push_subscriptions to service_role;
grant select, insert, update, delete on public.receipts to service_role;
grant select, insert, update, delete on public.receipt_items to service_role;
