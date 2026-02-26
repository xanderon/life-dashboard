import { NextRequest, NextResponse } from 'next/server';
import {
  getSprintPulseAdminClient,
  SPRINTPULSE_OWNER,
  type SprintPulsePriority,
  type SprintPulseStatus,
} from '@/lib/sprintpulse';

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as {
      title?: string;
      note?: string | null;
      ownerName?: string | null;
      status?: SprintPulseStatus;
      priority?: SprintPulsePriority;
    } | null;

    const patch: Record<string, unknown> = {};
    if (body?.title !== undefined) patch.title = body.title.trim();
    if (body?.note !== undefined) patch.note = body.note;
    if (body?.ownerName !== undefined) patch.owner_name = body.ownerName;
    if (body?.status !== undefined) {
      patch.status = body.status;
      patch.completed_at = body.status === 'DONE' ? new Date().toISOString() : null;
    }
    if (body?.priority !== undefined) patch.priority = body.priority;

    if (!Object.keys(patch).length) {
      return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
    }

    const client = getSprintPulseAdminClient();
    const { data, error } = await client
      .from('sprintpulse_adhoc_tasks')
      .update(patch)
      .eq('id', id)
      .eq('owner_id', SPRINTPULSE_OWNER)
      .select('id,sprint_id,title,note,owner_name,status,priority,created_at,updated_at,completed_at')
      .limit(1);

    if (error) throw error;
    if (!data?.length) {
      return NextResponse.json({ error: 'Task not found.' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, task: data[0] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const client = getSprintPulseAdminClient();

    const { error } = await client
      .from('sprintpulse_adhoc_tasks')
      .delete()
      .eq('id', id)
      .eq('owner_id', SPRINTPULSE_OWNER);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
