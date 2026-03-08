create table if not exists public.study_leetcode_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null,
  category text not null check (category in ('arrays','binary_search','matrix','stack','queue','recursion','linked_list','binary_tree')),
  problem_title text not null,
  problem_url text,
  solution_file text,
  difficulty text not null check (difficulty in ('easy','medium')),
  perceived_difficulty text not null check (perceived_difficulty in ('easy','medium','hard')),
  notes text,
  solved_at date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.study_leetcode_entries
  add column if not exists solution_file text;

create index if not exists study_leetcode_entries_owner_solved_idx
  on public.study_leetcode_entries(owner_id, solved_at desc);

create index if not exists study_leetcode_entries_owner_category_idx
  on public.study_leetcode_entries(owner_id, category);

create unique index if not exists study_leetcode_entries_owner_solution_unique_idx
  on public.study_leetcode_entries(owner_id, solution_file)
  where solution_file is not null;

create or replace function public.study_leetcode_entries_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists study_leetcode_entries_touch on public.study_leetcode_entries;
create trigger study_leetcode_entries_touch
before update on public.study_leetcode_entries
for each row
execute procedure public.study_leetcode_entries_touch_updated_at();

alter table public.study_leetcode_entries enable row level security;

drop policy if exists study_leetcode_entries_rw on public.study_leetcode_entries;
create policy study_leetcode_entries_rw
  on public.study_leetcode_entries
  for all
  using (true)
  with check (true);
