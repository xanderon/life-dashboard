-- ȘcoalaNouă catalog monitoring. Run once in the Supabase SQL Editor.
-- The raw password is never stored in Supabase; this stores only the latest
-- server-fetched catalogue snapshot needed to detect changes.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid,
  app_slug text not null,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz
);

create table if not exists public.school_catalog_snapshots (
  owner_id uuid not null references auth.users(id) on delete cascade,
  catalog_id text not null default 'principal' check (catalog_id ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  catalog jsonb not null,
  checked_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, catalog_id)
);

create table if not exists public.school_catalog_notification_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  catalog_id text not null default 'principal' check (catalog_id ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  previous_fingerprint text not null check (previous_fingerprint ~ '^[0-9a-f]{64}$'),
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  observed_on date not null default current_date,
  change_summary jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- Upgrade a first version that tracked one catalogue per owner.
alter table public.school_catalog_snapshots
  add column if not exists catalog_id text not null default 'principal';
alter table public.school_catalog_snapshots
  drop constraint if exists school_catalog_snapshots_pkey;
alter table public.school_catalog_snapshots
  add primary key (owner_id, catalog_id);
alter table public.school_catalog_notification_events
  add column if not exists catalog_id text not null default 'principal';
alter table public.school_catalog_notification_events
  drop constraint if exists school_catalog_notification_events_owner_id_fingerprint_observed_on_key;
alter table public.school_catalog_notification_events
  drop constraint if exists school_catalog_notification_events_owner_catalog_fingerprint_day_key;
alter table public.school_catalog_notification_events
  add constraint school_catalog_notification_events_owner_catalog_fingerprint_day_key
  unique (owner_id, catalog_id, fingerprint, observed_on);

create index if not exists school_catalog_notification_events_owner_created_idx
  on public.school_catalog_notification_events (owner_id, created_at desc);

alter table public.school_catalog_snapshots enable row level security;
alter table public.school_catalog_notification_events enable row level security;
alter table public.push_subscriptions enable row level security;

-- These records are for the server cron only. The UI always reads fresh data
-- through the authenticated dashboard API instead of directly from these tables.
revoke all on public.school_catalog_snapshots from anon, authenticated;
revoke all on public.school_catalog_notification_events from anon, authenticated;
grant select, insert, update, delete on public.school_catalog_snapshots to service_role;
grant select, insert, update, delete on public.school_catalog_notification_events to service_role;
grant select, insert, update, delete on public.push_subscriptions to service_role;

-- One browser endpoint can subscribe to more than one dashboard feature.
-- The old unique(endpoint) constraint would overwrite the Termo subscription
-- when enabling school notifications (or vice versa).
alter table public.push_subscriptions
  drop constraint if exists push_subscriptions_endpoint_key;
drop index if exists public.push_subscriptions_endpoint_key;
create unique index if not exists push_subscriptions_app_slug_endpoint_key
  on public.push_subscriptions (app_slug, endpoint);
