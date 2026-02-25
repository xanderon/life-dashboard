import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type SprintPulseStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED';
export type SprintPulsePriority = 'P0' | 'P1' | 'P2' | 'P3';
export type CadenceType = 'ONCE_PER_SPRINT' | 'MULTI_PER_SPRINT';

export type SprintRow = {
  id: string;
  name: string | null;
  start_date: string;
  end_date: string;
  duration_days: number;
  created_at: string;
};

export type TemplateRow = {
  id: string;
  title: string;
  category: string;
  default_owner_name: string | null;
  cadence_type: CadenceType;
  reminder_rules: unknown;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type SprintTaskInstanceRow = {
  id: string;
  sprint_id: string;
  template_id: string | null;
  title_snapshot: string;
  category_snapshot: string;
  owner_name: string | null;
  status: SprintPulseStatus;
  priority: SprintPulsePriority | null;
  notes: string | null;
  due_hint: string | null;
  history: unknown;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type AdhocTaskRow = {
  id: string;
  sprint_id: string;
  title: string;
  note: string | null;
  owner_name: string | null;
  status: SprintPulseStatus;
  priority: SprintPulsePriority;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const SPRINTPULSE_OWNER = process.env.SUPABASE_OWNER_ID ?? 'single-user';

export function getSprintPulseAdminClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing Supabase env (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).');
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

export function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export function addDaysIsoDate(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${isoDate}`);
  }
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function formatSprintName(startDate: string) {
  return `${startDate} Sprint`;
}

export async function ensureDefaultTemplates(client: SupabaseClient) {
  const { count, error: countError } = await client
    .from('sprintpulse_task_templates')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', SPRINTPULSE_OWNER);

  if (countError) throw countError;
  if ((count ?? 0) > 0) return;

  const now = new Date().toISOString();
  const seedRows = [
    {
      owner_id: SPRINTPULSE_OWNER,
      title: 'Create ad-hoc task(s) at sprint start',
      category: 'StartOfSprint',
      cadence_type: 'ONCE_PER_SPRINT',
      reminder_rules: [{ day: 1 }],
      default_owner_name: 'Me',
      is_active: true,
      created_at: now,
      updated_at: now,
    },
    {
      owner_id: SPRINTPULSE_OWNER,
      title: 'Check Coverity',
      category: 'Quality',
      cadence_type: 'MULTI_PER_SPRINT',
      reminder_rules: [{ day: 5 }, { day: 10 }],
      default_owner_name: 'Me',
      is_active: true,
      created_at: now,
      updated_at: now,
    },
    {
      owner_id: SPRINTPULSE_OWNER,
      title: 'Update NuGet utils across microservices',
      category: 'Dependencies',
      cadence_type: 'ONCE_PER_SPRINT',
      reminder_rules: [{ day: 8 }],
      default_owner_name: 'Me',
      is_active: true,
      created_at: now,
      updated_at: now,
    },
    {
      owner_id: SPRINTPULSE_OWNER,
      title: 'Check error logs in OpenSearch (DEV/SIT; optionally UAT)',
      category: 'Logs',
      cadence_type: 'MULTI_PER_SPRINT',
      reminder_rules: [{ intervalDays: 3 }],
      default_owner_name: 'Me',
      is_active: true,
      created_at: now,
      updated_at: now,
    },
    {
      owner_id: SPRINTPULSE_OWNER,
      title: 'DST presentation',
      category: 'Presentation',
      cadence_type: 'ONCE_PER_SPRINT',
      reminder_rules: [{ day: 11 }],
      default_owner_name: 'Me',
      is_active: false,
      created_at: now,
      updated_at: now,
    },
  ];

  const { error } = await client.from('sprintpulse_task_templates').insert(seedRows);
  if (error) throw error;
}

export async function listSprints(client: SupabaseClient) {
  const { data, error } = await client
    .from('sprintpulse_sprints')
    .select('id,name,start_date,end_date,duration_days,created_at')
    .eq('owner_id', SPRINTPULSE_OWNER)
    .order('start_date', { ascending: false });

  if (error) throw error;
  return (data ?? []) as SprintRow[];
}

export async function getTemplates(client: SupabaseClient) {
  const { data, error } = await client
    .from('sprintpulse_task_templates')
    .select('id,title,category,default_owner_name,cadence_type,reminder_rules,is_active,created_at,updated_at')
    .eq('owner_id', SPRINTPULSE_OWNER)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as TemplateRow[];
}

export async function getSprintInstances(client: SupabaseClient, sprintId: string) {
  const { data, error } = await client
    .from('sprintpulse_sprint_task_instances')
    .select('id,sprint_id,template_id,title_snapshot,category_snapshot,owner_name,status,priority,notes,due_hint,history,created_at,updated_at,completed_at')
    .eq('owner_id', SPRINTPULSE_OWNER)
    .eq('sprint_id', sprintId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as SprintTaskInstanceRow[];
}

export async function getSprintAdhoc(client: SupabaseClient, sprintId: string) {
  const { data, error } = await client
    .from('sprintpulse_adhoc_tasks')
    .select('id,sprint_id,title,note,owner_name,status,priority,created_at,updated_at,completed_at')
    .eq('owner_id', SPRINTPULSE_OWNER)
    .eq('sprint_id', sprintId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as AdhocTaskRow[];
}

export async function getCurrentSprint(client: SupabaseClient) {
  const sprints = await listSprints(client);
  return sprints[0] ?? null;
}

function computeSummary(instances: SprintTaskInstanceRow[], adhoc: AdhocTaskRow[]) {
  const recurringTotal = instances.length;
  const recurringDone = instances.filter((task) => task.status === 'DONE').length;
  const recurringPercent = recurringTotal ? Math.round((recurringDone / recurringTotal) * 100) : 0;

  const adhocCompleted = adhoc.filter((task) => task.status === 'DONE').length;
  const adhocLeftover = adhoc.filter((task) => task.status !== 'DONE').length;

  return {
    recurringTotal,
    recurringDone,
    recurringPercent,
    adhocTotal: adhoc.length,
    adhocCompleted,
    adhocLeftover,
  };
}

export async function getSprintSummary(client: SupabaseClient, sprintId: string) {
  const [instances, adhoc] = await Promise.all([
    getSprintInstances(client, sprintId),
    getSprintAdhoc(client, sprintId),
  ]);

  return {
    summary: computeSummary(instances, adhoc),
    recurring: instances,
    adhoc,
  };
}

export type StartSprintPayload = {
  startDate?: string;
  durationDays?: number;
  carryOverMode?: 'carry_unfinished' | 'keep_old' | 'convert_to_template';
  convertTaskIds?: string[];
};

function statusWithCompletion(status: SprintPulseStatus) {
  return {
    completed_at: status === 'DONE' ? new Date().toISOString() : null,
  };
}

export async function startSprint(client: SupabaseClient, payload: StartSprintPayload) {
  await ensureDefaultTemplates(client);

  const startDate = payload.startDate ?? todayIsoDate();
  const durationDays = Math.max(1, Math.min(payload.durationDays ?? 14, 60));
  const endDate = addDaysIsoDate(startDate, durationDays);
  const name = formatSprintName(startDate);

  const { data: sprintRows, error: sprintError } = await client
    .from('sprintpulse_sprints')
    .insert({
      owner_id: SPRINTPULSE_OWNER,
      name,
      start_date: startDate,
      end_date: endDate,
      duration_days: durationDays,
    })
    .select('id,name,start_date,end_date,duration_days,created_at')
    .limit(1);

  if (sprintError) throw sprintError;
  const sprint = (sprintRows?.[0] ?? null) as SprintRow | null;
  if (!sprint) throw new Error('Failed to create sprint.');

  const templates = await getTemplates(client);
  const activeTemplates = templates.filter((template) => template.is_active);

  if (activeTemplates.length) {
    const inserts = activeTemplates.map((template) => ({
      owner_id: SPRINTPULSE_OWNER,
      sprint_id: sprint.id,
      template_id: template.id,
      title_snapshot: template.title,
      category_snapshot: template.category,
      owner_name: template.default_owner_name,
      status: 'NOT_STARTED' as SprintPulseStatus,
      priority: null,
      notes: null,
      due_hint:
        template.category === 'StartOfSprint'
          ? 'Day 1'
          : template.cadence_type === 'MULTI_PER_SPRINT'
            ? 'Multiple checks'
            : 'Once this sprint',
      history: [
        {
          at: new Date().toISOString(),
          action: 'CREATED_FROM_TEMPLATE',
          title: template.title,
        },
      ],
    }));

    const { error: instancesError } = await client.from('sprintpulse_sprint_task_instances').insert(inserts);
    if (instancesError) throw instancesError;
  }

  const previousSprint = (await listSprints(client)).find((row) => row.id !== sprint.id) ?? null;
  const carryOverMode = payload.carryOverMode ?? 'carry_unfinished';

  if (previousSprint && carryOverMode !== 'keep_old') {
    const previousAdhoc = await getSprintAdhoc(client, previousSprint.id);
    const unfinished = previousAdhoc.filter((task) => task.status !== 'DONE');

    if (carryOverMode === 'carry_unfinished' && unfinished.length) {
      const rows = unfinished.map((task) => ({
        owner_id: SPRINTPULSE_OWNER,
        sprint_id: sprint.id,
        title: task.title,
        note: task.note,
        owner_name: task.owner_name,
        status: 'NOT_STARTED' as SprintPulseStatus,
        priority: task.priority ?? 'P2',
      }));

      const { error } = await client.from('sprintpulse_adhoc_tasks').insert(rows);
      if (error) throw error;
    }

    if (carryOverMode === 'convert_to_template' && payload.convertTaskIds?.length) {
      const toConvert = unfinished.filter((task) => payload.convertTaskIds?.includes(task.id));
      if (toConvert.length) {
        const now = new Date().toISOString();
        const rows = toConvert.map((task) => ({
          owner_id: SPRINTPULSE_OWNER,
          title: task.title,
          category: 'AdhocConverted',
          default_owner_name: task.owner_name,
          cadence_type: 'ONCE_PER_SPRINT' as CadenceType,
          reminder_rules: [],
          is_active: true,
          created_at: now,
          updated_at: now,
        }));

        const { error } = await client.from('sprintpulse_task_templates').insert(rows);
        if (error) throw error;
      }
    }
  }

  return sprint;
}

export function appendHistory(existing: unknown, event: Record<string, unknown>) {
  const current = Array.isArray(existing) ? existing : [];
  return [...current, event];
}

export function sortAdhocTasks(rows: AdhocTaskRow[]) {
  const priorityWeight: Record<SprintPulsePriority, number> = {
    P0: 0,
    P1: 1,
    P2: 2,
    P3: 3,
  };

  const statusWeight: Record<SprintPulseStatus, number> = {
    NOT_STARTED: 0,
    IN_PROGRESS: 1,
    BLOCKED: 2,
    DONE: 3,
  };

  return [...rows].sort((a, b) => {
    const p = priorityWeight[a.priority] - priorityWeight[b.priority];
    if (p !== 0) return p;
    const s = statusWeight[a.status] - statusWeight[b.status];
    if (s !== 0) return s;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

export type ReminderHit = {
  instanceId: string;
  title: string;
  category: string;
  status: SprintPulseStatus;
  dayOfSprint: number;
  matchedRule: string;
};

export function computeReminderHits(
  sprint: SprintRow,
  templates: TemplateRow[],
  instances: SprintTaskInstanceRow[]
): ReminderHit[] {
  const start = new Date(`${sprint.start_date}T00:00:00.000Z`).getTime();
  const now = Date.now();
  const dayOfSprint = Math.max(1, Math.floor((now - start) / (24 * 3600 * 1000)) + 1);

  const templateById = new Map(templates.map((template) => [template.id, template]));
  const hits: ReminderHit[] = [];

  instances.forEach((instance) => {
    if (instance.status === 'DONE') return;

    const template = instance.template_id ? templateById.get(instance.template_id) : null;
    const rules = Array.isArray(template?.reminder_rules) ? template?.reminder_rules : [];

    rules.forEach((rule) => {
      if (!rule || typeof rule !== 'object') return;
      const day = Number((rule as { day?: number }).day ?? NaN);
      const intervalDays = Number((rule as { intervalDays?: number }).intervalDays ?? NaN);

      if (Number.isFinite(day) && day === dayOfSprint) {
        hits.push({
          instanceId: instance.id,
          title: instance.title_snapshot,
          category: instance.category_snapshot,
          status: instance.status,
          dayOfSprint,
          matchedRule: `day=${day}`,
        });
        return;
      }

      if (Number.isFinite(intervalDays) && intervalDays > 0 && dayOfSprint % intervalDays === 0) {
        hits.push({
          instanceId: instance.id,
          title: instance.title_snapshot,
          category: instance.category_snapshot,
          status: instance.status,
          dayOfSprint,
          matchedRule: `intervalDays=${intervalDays}`,
        });
      }
    });
  });

  return hits;
}

export { statusWithCompletion };
