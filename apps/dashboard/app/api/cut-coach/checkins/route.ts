import { NextResponse } from 'next/server';
import {
  addDays,
  getCheckins,
  getDailySummary,
  getWeekSnapshot,
  recomputePlan,
  toNumber,
  todayIsoDate,
} from '@/lib/cutCoach';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { jsonError, withCutCoachUser } from '@/lib/cutCoachRoute';

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return 'Unexpected error';
}

function isMissingSchemaColumn(error: unknown, column: string) {
  const message = getErrorMessage(error);
  return message.includes(column) && (message.includes('schema cache') || message.includes('column'));
}

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
    const basePayload = {
      user_id: user.id,
      date,
      kcal_actual: body.kcal_actual == null || body.kcal_actual === '' ? null : toNumber(body.kcal_actual),
      notes: body.notes ? String(body.notes).trim() : null,
      source_app: body.source_app ? String(body.source_app).trim() : null,
    };
    const payload = {
      ...basePayload,
      activity_kcal_burned:
        body.activity_kcal_burned == null || body.activity_kcal_burned === '' ? null : toNumber(body.activity_kcal_burned),
      activity_summary: body.activity_summary ? String(body.activity_summary).trim() : null,
      steps: body.steps == null || body.steps === '' ? null : Math.max(0, Math.round(toNumber(body.steps))),
      protein_g: body.protein_g == null || body.protein_g === '' ? null : Math.max(0, toNumber(body.protein_g)),
      training_type:
        body.training_type === 'gym' || body.training_type === 'walking' || body.training_type === 'recovery' || body.training_type === 'other'
          ? body.training_type
          : body.training_type === 'none'
            ? 'none'
            : null,
      recovery_done: typeof body.recovery_done === 'boolean' ? body.recovery_done : null,
      neck_pain_score:
        body.neck_pain_score == null || body.neck_pain_score === ''
          ? null
          : Math.min(10, Math.max(0, toNumber(body.neck_pain_score))),
    };

    const firstWrite = await supabase
      .from('cut_coach_daily_checkins')
      .upsert(payload, { onConflict: 'user_id,date' });
    if (firstWrite.error) {
      const fallbackNeeded =
        isMissingSchemaColumn(firstWrite.error, 'activity_kcal_burned') ||
        isMissingSchemaColumn(firstWrite.error, 'activity_summary') ||
        isMissingSchemaColumn(firstWrite.error, 'protein_g') ||
        isMissingSchemaColumn(firstWrite.error, 'training_type') ||
        isMissingSchemaColumn(firstWrite.error, 'recovery_done') ||
        isMissingSchemaColumn(firstWrite.error, 'neck_pain_score');

      if (!fallbackNeeded) throw firstWrite.error;

      const fallbackNotes = [
        basePayload.notes,
        payload.activity_summary ? `Activity: ${payload.activity_summary}` : null,
        payload.activity_kcal_burned != null ? `Burned kcal: ${payload.activity_kcal_burned}` : null,
        payload.protein_g != null ? `Protein: ${payload.protein_g} g` : null,
        payload.steps != null ? `Steps: ${payload.steps}` : null,
        payload.training_type ? `Training: ${payload.training_type}` : null,
        payload.recovery_done ? 'Recovery done' : null,
        payload.neck_pain_score != null ? `Neck: ${payload.neck_pain_score}/10` : null,
      ]
        .filter(Boolean)
        .join(' • ');

      const fallbackWrite = await supabase.from('cut_coach_daily_checkins').upsert(
        {
          ...basePayload,
          notes: fallbackNotes || null,
        },
        { onConflict: 'user_id,date' }
      );
      if (fallbackWrite.error) {
        throw fallbackWrite.error;
      }
    }

    await recomputePlan(supabase, user.id, 'food-log-update');
    const [summary, today, tomorrow, week, checkins] = await Promise.all([
      getDailySummary(supabase, user.id, date),
      getDailySummary(supabase, user.id, todayIsoDate()),
      getDailySummary(supabase, user.id, addDays(todayIsoDate(), 1)),
      getWeekSnapshot(supabase, user.id, todayIsoDate()),
      getCheckins(supabase, user.id, 90),
    ]);
    return NextResponse.json({ summary, today, tomorrow, week, checkins });
  } catch (error) {
    const message = getErrorMessage(error);
    return jsonError(message, message === 'Unauthorized' ? 401 : 500);
  }
}
