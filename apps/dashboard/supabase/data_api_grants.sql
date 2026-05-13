-- Backfill grants for Supabase Data API access on existing tables.
-- Safe to run on an existing project even if some tables do not exist yet.

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'apps',
    'app_runs',
    'devices',
    'push_subscriptions',
    'receipts',
    'receipt_items'
  ]
  loop
    if to_regclass('public.' || table_name) is not null then
      execute format('grant select, insert, update, delete on public.%I to service_role', table_name);
    end if;
  end loop;

  foreach table_name in array array[
    'apps',
    'app_runs',
    'devices'
  ]
  loop
    if to_regclass('public.' || table_name) is not null then
      execute format('grant select on public.%I to authenticated', table_name);
    end if;
  end loop;

  foreach table_name in array array[
    'push_subscriptions',
    'receipts',
    'receipt_items'
  ]
  loop
    if to_regclass('public.' || table_name) is not null then
      execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);
    end if;
  end loop;

  if to_regclass('public.termo_status_periods') is not null then
    execute 'grant select on public.termo_status_periods to authenticated';
    execute 'grant select, insert, update, delete on public.termo_status_periods to service_role';
  end if;

  foreach table_name in array array[
    'sprintpulse_sprints',
    'sprintpulse_task_templates',
    'sprintpulse_sprint_task_instances',
    'sprintpulse_adhoc_tasks',
    'study_topics',
    'study_days',
    'study_sessions',
    'study_gap_cards',
    'study_concept_progress',
    'study_leetcode_entries'
  ]
  loop
    if to_regclass('public.' || table_name) is not null then
      execute format('grant select, insert, update, delete on public.%I to service_role', table_name);
      execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);
      execute format('grant select, insert, update, delete on public.%I to anon', table_name);
    end if;
  end loop;

  foreach table_name in array array[
    'cut_coach_profiles',
    'cut_coach_foods',
    'cut_coach_food_logs',
    'cut_coach_body_metrics',
    'cut_coach_daily_targets',
    'cut_coach_daily_plan_items',
    'cut_coach_plan_adjustments',
    'cut_coach_daily_checkins',
    'cut_coach_challenges',
    'cut_coach_reminders'
  ]
  loop
    if to_regclass('public.' || table_name) is not null then
      execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);
      execute format('grant select, insert, update, delete on public.%I to service_role', table_name);
    end if;
  end loop;
end
$$;
