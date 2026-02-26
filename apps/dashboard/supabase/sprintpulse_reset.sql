-- SprintPulse-only reset (safe for other dashboard tables)
-- Drops only sprintpulse_* objects.

drop table if exists public.sprintpulse_adhoc_tasks cascade;
drop table if exists public.sprintpulse_sprint_task_instances cascade;
drop table if exists public.sprintpulse_task_templates cascade;
drop table if exists public.sprintpulse_sprints cascade;

drop function if exists public.sprintpulse_touch_updated_at cascade;

-- After this reset, run apps/dashboard/supabase/sprintpulse.sql to recreate schema.
