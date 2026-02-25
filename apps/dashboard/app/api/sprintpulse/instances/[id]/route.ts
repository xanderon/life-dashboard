import { NextRequest, NextResponse } from 'next/server';
import {
  appendHistory,
  getSprintPulseAdminClient,
  SPRINTPULSE_OWNER,
  statusWithCompletion,
  type SprintPulseStatus,
} from '@/lib/sprintpulse';

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as {
      status?: SprintPulseStatus;
      ownerName?: string | null;
      notes?: string | null;
      dueHint?: string | null;
      action?: string;
    } | null;

    const client = getSprintPulseAdminClient();
    const { data: currentRows, error: currentError } = await client
      .from('sprintpulse_sprint_task_instances')
      .select('id,status,owner_name,notes,due_hint,history')
      .eq('id', id)
      .eq('owner_id', SPRINTPULSE_OWNER)
      .limit(1);

    if (currentError) throw currentError;
    const current = currentRows?.[0] ?? null;
    if (!current) {
      return NextResponse.json({ error: 'Task not found.' }, { status: 404 });
    }

    const nextStatus = body?.status ?? current.status;
    const patch = {
      status: nextStatus,
      owner_name: body?.ownerName === undefined ? current.owner_name : body.ownerName,
      notes: body?.notes === undefined ? current.notes : body.notes,
      due_hint: body?.dueHint === undefined ? current.due_hint : body.dueHint,
      history: appendHistory(current.history, {
        at: new Date().toISOString(),
        action: body?.action ?? 'UPDATED',
        status: nextStatus,
      }),
      ...statusWithCompletion(nextStatus),
    };

    const { data, error } = await client
      .from('sprintpulse_sprint_task_instances')
      .update(patch)
      .eq('id', id)
      .eq('owner_id', SPRINTPULSE_OWNER)
      .select('id,sprint_id,template_id,title_snapshot,category_snapshot,owner_name,status,priority,notes,due_hint,history,created_at,updated_at,completed_at')
      .limit(1);

    if (error) throw error;
    return NextResponse.json({ ok: true, task: data?.[0] ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
