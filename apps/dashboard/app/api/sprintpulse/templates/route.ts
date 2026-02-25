import { NextResponse } from 'next/server';
import {
  ensureDefaultTemplates,
  getSprintPulseAdminClient,
  getTemplates,
  SPRINTPULSE_OWNER,
  type CadenceType,
} from '@/lib/sprintpulse';

export async function GET() {
  try {
    const client = getSprintPulseAdminClient();
    await ensureDefaultTemplates(client);
    const templates = await getTemplates(client);
    return NextResponse.json({ ok: true, templates });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      title?: string;
      category?: string;
      defaultOwnerName?: string | null;
      cadenceType?: CadenceType;
      reminderRules?: unknown;
      isActive?: boolean;
    } | null;

    if (!body?.title?.trim()) {
      return NextResponse.json({ error: 'Missing title.' }, { status: 400 });
    }

    const client = getSprintPulseAdminClient();
    const now = new Date().toISOString();

    const { data, error } = await client
      .from('sprintpulse_task_templates')
      .insert({
        owner_id: SPRINTPULSE_OWNER,
        title: body.title.trim(),
        category: body.category ?? 'General',
        default_owner_name: body.defaultOwnerName ?? 'Me',
        cadence_type: body.cadenceType ?? 'ONCE_PER_SPRINT',
        reminder_rules: Array.isArray(body.reminderRules) ? body.reminderRules : [],
        is_active: body.isActive ?? true,
        created_at: now,
        updated_at: now,
      })
      .select('id,title,category,default_owner_name,cadence_type,reminder_rules,is_active,created_at,updated_at')
      .limit(1);

    if (error) throw error;
    return NextResponse.json({ ok: true, template: data?.[0] ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
