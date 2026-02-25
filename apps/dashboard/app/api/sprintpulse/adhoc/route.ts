import { NextResponse } from 'next/server';
import {
  getSprintPulseAdminClient,
  SPRINTPULSE_OWNER,
  type SprintPulsePriority,
} from '@/lib/sprintpulse';

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      sprintId?: string;
      title?: string;
      note?: string | null;
      ownerName?: string | null;
      priority?: SprintPulsePriority;
    } | null;

    if (!body?.sprintId || !body?.title?.trim()) {
      return NextResponse.json({ error: 'Missing sprintId/title.' }, { status: 400 });
    }

    const client = getSprintPulseAdminClient();
    const { data, error } = await client
      .from('sprintpulse_adhoc_tasks')
      .insert({
        owner_id: SPRINTPULSE_OWNER,
        sprint_id: body.sprintId,
        title: body.title.trim(),
        note: body.note ?? null,
        owner_name: body.ownerName ?? 'Me',
        status: 'NOT_STARTED',
        priority: body.priority ?? 'P2',
      })
      .select('id,sprint_id,title,note,owner_name,status,priority,created_at,updated_at,completed_at')
      .limit(1);

    if (error) throw error;
    return NextResponse.json({ ok: true, task: data?.[0] ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
