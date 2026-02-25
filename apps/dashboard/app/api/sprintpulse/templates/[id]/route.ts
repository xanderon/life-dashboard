import { NextRequest, NextResponse } from 'next/server';
import {
  getSprintPulseAdminClient,
  SPRINTPULSE_OWNER,
  type CadenceType,
} from '@/lib/sprintpulse';

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as {
      title?: string;
      category?: string;
      defaultOwnerName?: string | null;
      cadenceType?: CadenceType;
      reminderRules?: unknown;
      isActive?: boolean;
    } | null;

    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body?.title !== undefined) patch.title = body.title.trim();
    if (body?.category !== undefined) patch.category = body.category;
    if (body?.defaultOwnerName !== undefined) patch.default_owner_name = body.defaultOwnerName;
    if (body?.cadenceType !== undefined) patch.cadence_type = body.cadenceType;
    if (body?.reminderRules !== undefined) {
      patch.reminder_rules = Array.isArray(body.reminderRules) ? body.reminderRules : [];
    }
    if (body?.isActive !== undefined) patch.is_active = body.isActive;

    const client = getSprintPulseAdminClient();
    const { data, error } = await client
      .from('sprintpulse_task_templates')
      .update(patch)
      .eq('id', id)
      .eq('owner_id', SPRINTPULSE_OWNER)
      .select('id,title,category,default_owner_name,cadence_type,reminder_rules,is_active,created_at,updated_at')
      .limit(1);

    if (error) throw error;
    if (!data?.length) {
      return NextResponse.json({ error: 'Template not found.' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, template: data[0] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
