create extension if not exists pgcrypto;

create or replace function public.cut_coach_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.cut_coach_profiles (
  user_id uuid primary key,
  age int not null check (age between 10 and 120),
  sex text not null check (sex in ('male', 'female')),
  height_cm numeric(5,2) not null check (height_cm between 100 and 260),
  goal_type text not null default 'cut' check (goal_type in ('cut', 'recomp', 'maintain')),
  activity_level text not null default 'moderate' check (activity_level in ('sedentary', 'light', 'moderate', 'active', 'athlete')),
  preferred_deficit_pct numeric(5,2) not null default 18 check (preferred_deficit_pct between 0 and 35),
  protein_target_per_kg numeric(5,2) not null default 2.0 check (protein_target_per_kg between 1 and 4),
  fat_min_per_kg numeric(5,2) not null default 0.7 check (fat_min_per_kg between 0.3 and 2),
  macro_strategy text not null default 'balanced' check (macro_strategy in ('balanced', 'lower_carb', 'higher_carb')),
  meals_per_day int not null default 3 check (meals_per_day between 2 and 6),
  training_day_kcal_delta int not null default 150 check (training_day_kcal_delta between 0 and 500),
  maintenance_adjustment_kcal int not null default 0 check (maintenance_adjustment_kcal between -600 and 600),
  training_days smallint[] not null default '{1,3,5}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cut_coach_foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  brand text,
  barcode text,
  source_kind text not null default 'generic' check (source_kind in ('generic', 'product', 'imported_product')),
  unit_type text not null default '100g' check (unit_type in ('100g', 'serving', 'piece')),
  calories numeric(8,2) not null check (calories >= 0),
  protein numeric(8,2) not null default 0 check (protein >= 0),
  carbs numeric(8,2) not null default 0 check (carbs >= 0),
  fat numeric(8,2) not null default 0 check (fat >= 0),
  fiber numeric(8,2) check (fiber >= 0),
  default_serving_grams numeric(8,2) check (default_serving_grams > 0),
  package_size_grams numeric(8,2) check (package_size_grams > 0),
  serving_label text,
  image_url text,
  is_favorite boolean not null default false,
  is_custom boolean not null default true,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cut_coach_food_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  date date not null,
  meal_type text not null check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  food_id uuid references public.cut_coach_foods(id) on delete set null,
  custom_food_name text,
  quantity numeric(8,2) not null check (quantity > 0),
  unit text not null default 'g',
  grams_total numeric(8,2) not null check (grams_total > 0),
  calories_total numeric(8,2) not null check (calories_total >= 0),
  protein_total numeric(8,2) not null default 0 check (protein_total >= 0),
  carbs_total numeric(8,2) not null default 0 check (carbs_total >= 0),
  fat_total numeric(8,2) not null default 0 check (fat_total >= 0),
  source text not null default 'manual' check (source in ('manual', 'template', 'ai')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cut_coach_body_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  date date not null,
  weight_kg numeric(6,2) not null check (weight_kg between 20 and 500),
  waist_cm numeric(6,2),
  notes text,
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

create table if not exists public.cut_coach_daily_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  date date not null,
  day_type text not null default 'rest' check (day_type in ('training', 'rest')),
  baseline_kcal numeric(8,2) not null check (baseline_kcal >= 0),
  maintenance_kcal numeric(8,2) not null check (maintenance_kcal >= 0),
  kcal_target numeric(8,2) not null check (kcal_target >= 0),
  protein_target numeric(8,2) not null check (protein_target >= 0),
  carbs_target numeric(8,2) not null check (carbs_target >= 0),
  fat_target numeric(8,2) not null check (fat_target >= 0),
  plan_status text not null default 'planned' check (plan_status in ('planned', 'adjusted', 'locked', 'completed')),
  adjustment_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

create table if not exists public.cut_coach_daily_plan_items (
  id uuid primary key default gen_random_uuid(),
  daily_target_id uuid not null references public.cut_coach_daily_targets(id) on delete cascade,
  meal_slot text not null check (meal_slot in ('breakfast', 'lunch', 'dinner', 'snack')),
  suggested_food_text text not null,
  suggested_calories numeric(8,2) not null default 0 check (suggested_calories >= 0),
  suggested_protein numeric(8,2) not null default 0 check (suggested_protein >= 0),
  suggested_carbs numeric(8,2) not null default 0 check (suggested_carbs >= 0),
  suggested_fat numeric(8,2) not null default 0 check (suggested_fat >= 0),
  is_optional boolean not null default false,
  sort_order int not null default 0
);

create table if not exists public.cut_coach_plan_adjustments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  source_date date not null,
  target_date date not null,
  delta_kcal numeric(8,2) not null,
  reason text not null,
  algorithm_version text not null default 'v1',
  created_at timestamptz not null default now()
);

create index if not exists cut_coach_foods_user_favorite_idx on public.cut_coach_foods(user_id, is_favorite desc, updated_at desc);
create index if not exists cut_coach_foods_user_last_used_idx on public.cut_coach_foods(user_id, last_used_at desc nulls last);
create index if not exists cut_coach_foods_user_barcode_idx on public.cut_coach_foods(user_id, barcode);
create index if not exists cut_coach_logs_user_date_idx on public.cut_coach_food_logs(user_id, date desc);
create index if not exists cut_coach_weights_user_date_idx on public.cut_coach_body_metrics(user_id, date desc);
create index if not exists cut_coach_targets_user_date_idx on public.cut_coach_daily_targets(user_id, date desc);
create index if not exists cut_coach_adjustments_user_target_idx on public.cut_coach_plan_adjustments(user_id, target_date desc);

drop trigger if exists cut_coach_profiles_updated_at on public.cut_coach_profiles;
create trigger cut_coach_profiles_updated_at
before update on public.cut_coach_profiles
for each row execute function public.cut_coach_set_updated_at();

drop trigger if exists cut_coach_foods_updated_at on public.cut_coach_foods;
create trigger cut_coach_foods_updated_at
before update on public.cut_coach_foods
for each row execute function public.cut_coach_set_updated_at();

drop trigger if exists cut_coach_logs_updated_at on public.cut_coach_food_logs;
create trigger cut_coach_logs_updated_at
before update on public.cut_coach_food_logs
for each row execute function public.cut_coach_set_updated_at();

drop trigger if exists cut_coach_targets_updated_at on public.cut_coach_daily_targets;
create trigger cut_coach_targets_updated_at
before update on public.cut_coach_daily_targets
for each row execute function public.cut_coach_set_updated_at();

alter table public.cut_coach_profiles enable row level security;
alter table public.cut_coach_foods enable row level security;
alter table public.cut_coach_food_logs enable row level security;
alter table public.cut_coach_body_metrics enable row level security;
alter table public.cut_coach_daily_targets enable row level security;
alter table public.cut_coach_daily_plan_items enable row level security;
alter table public.cut_coach_plan_adjustments enable row level security;

drop policy if exists cut_coach_profiles_rw on public.cut_coach_profiles;
create policy cut_coach_profiles_rw on public.cut_coach_profiles
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists cut_coach_foods_rw on public.cut_coach_foods;
create policy cut_coach_foods_rw on public.cut_coach_foods
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists cut_coach_logs_rw on public.cut_coach_food_logs;
create policy cut_coach_logs_rw on public.cut_coach_food_logs
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists cut_coach_body_metrics_rw on public.cut_coach_body_metrics;
create policy cut_coach_body_metrics_rw on public.cut_coach_body_metrics
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists cut_coach_targets_rw on public.cut_coach_daily_targets;
create policy cut_coach_targets_rw on public.cut_coach_daily_targets
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists cut_coach_plan_items_rw on public.cut_coach_daily_plan_items;
create policy cut_coach_plan_items_rw on public.cut_coach_daily_plan_items
for all using (
  exists (
    select 1
    from public.cut_coach_daily_targets t
    where t.id = daily_target_id
      and t.user_id = auth.uid()
  )
) with check (
  exists (
    select 1
    from public.cut_coach_daily_targets t
    where t.id = daily_target_id
      and t.user_id = auth.uid()
  )
);

drop policy if exists cut_coach_adjustments_rw on public.cut_coach_plan_adjustments;
create policy cut_coach_adjustments_rw on public.cut_coach_plan_adjustments
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.cut_coach_foods add column if not exists barcode text;
alter table public.cut_coach_foods add column if not exists source_kind text not null default 'generic';
alter table public.cut_coach_foods add column if not exists package_size_grams numeric(8,2);
alter table public.cut_coach_foods add column if not exists serving_label text;
alter table public.cut_coach_foods add column if not exists image_url text;

alter table public.cut_coach_foods
  drop constraint if exists cut_coach_foods_source_kind_check;
alter table public.cut_coach_foods
  add constraint cut_coach_foods_source_kind_check
  check (source_kind in ('generic', 'product', 'imported_product'));

create unique index if not exists cut_coach_foods_user_barcode_unique_idx
  on public.cut_coach_foods(user_id, barcode)
  where barcode is not null;
