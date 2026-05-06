import { NextResponse } from 'next/server';
import { getReminderSettings } from '@/lib/cutCoach';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { jsonError, withCutCoachUser } from '@/lib/cutCoachRoute';

function normalizeWeekdays(value: unknown) {
  if (!Array.isArray(value)) return [1, 2, 3, 4, 5, 6, 0];
  const parsed = value
    .map((entry) => Number(entry))
    .filter((entry) => Number.isInteger(entry) && entry >= 0 && entry <= 6);
  return parsed.length ? parsed : [1, 2, 3, 4, 5, 6, 0];
}

export async function GET() {
  return withCutCoachUser(async ({ userId, supabase }) => ({
    reminders: await getReminderSettings(supabase, userId),
  }));
}

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return jsonError('Unauthorized', 401);

    const body = (await req.json()) as { reminders?: Array<Record<string, unknown>> } & Record<string, unknown>;
    const reminders: Array<Record<string, unknown>> = Array.isArray(body?.reminders) ? body.reminders : [body];
    const payload = reminders.map((item) => ({
      id: item.id ?? undefined,
      user_id: user.id,
      kind: item.kind,
      title: item.title ? String(item.title).trim() : null,
      local_time: item.local_time ? String(item.local_time) : '20:30',
      weekdays: normalizeWeekdays(item.weekdays),
      enabled: item.enabled !== false,
    }));

    const { error } = await supabase.from('cut_coach_reminders').upsert(payload);
    if (error) throw error;

    return NextResponse.json({ reminders: await getReminderSettings(supabase, user.id) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return jsonError(message, message === 'Unauthorized' ? 401 : 500);
  }
}
