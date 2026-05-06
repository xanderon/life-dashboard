import { NextResponse } from 'next/server';
import {
  getCheckins,
  getDailySummary,
  recomputePlan,
  toNumber,
  todayIsoDate,
} from '@/lib/cutCoach';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { jsonError, withCutCoachUser } from '@/lib/cutCoachRoute';

export async function GET() {
  return withCutCoachUser(async ({ userId, supabase }) => ({
    checkins: await getCheckins(supabase, userId, 90),
  }));
}

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return jsonError('Unauthorized', 401);

    const body = await req.json();
    const date = body.date ?? todayIsoDate();
    const payload = {
      user_id: user.id,
      date,
      kcal_actual: body.kcal_actual == null || body.kcal_actual === '' ? null : toNumber(body.kcal_actual),
      activity_kcal_burned:
        body.activity_kcal_burned == null || body.activity_kcal_burned === '' ? null : toNumber(body.activity_kcal_burned),
      activity_summary: body.activity_summary ? String(body.activity_summary).trim() : null,
      steps: body.steps == null || body.steps === '' ? null : Math.max(0, Math.round(toNumber(body.steps))),
      walk_minutes:
        body.walk_minutes == null || body.walk_minutes === '' ? null : Math.max(0, Math.round(toNumber(body.walk_minutes))),
      bike_minutes:
        body.bike_minutes == null || body.bike_minutes === '' ? null : Math.max(0, Math.round(toNumber(body.bike_minutes))),
      notes: body.notes ? String(body.notes).trim() : null,
      source_app: body.source_app ? String(body.source_app).trim() : null,
      copied_from_previous: Boolean(body.copied_from_previous),
    };

    const { error } = await supabase
      .from('cut_coach_daily_checkins')
      .upsert(payload, { onConflict: 'user_id,date' });
    if (error) throw error;

    await recomputePlan(supabase, user.id, 'food-log-update');
    const [summary, checkins] = await Promise.all([
      getDailySummary(supabase, user.id, date),
      getCheckins(supabase, user.id, 90),
    ]);
    return NextResponse.json({ summary, checkins });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return jsonError(message, message === 'Unauthorized' ? 401 : 500);
  }
}
