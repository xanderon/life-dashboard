import { NextResponse } from 'next/server';
import { addDays, buildTrendSummary, getDailySummary, getWeekSnapshot, getWeights, recomputePlan, toNumber, todayIsoDate } from '@/lib/cutCoach';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { jsonError, withCutCoachUser } from '@/lib/cutCoachRoute';

export async function GET() {
  return withCutCoachUser(async ({ userId, supabase }) => {
    const weights = await getWeights(supabase, userId, 60);
    return { weights, trends: buildTrendSummary(weights) };
  });
}

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return jsonError('Unauthorized', 401);

    const body = await req.json();
    const payload = {
      user_id: user.id,
      date: body.date ?? new Date().toISOString().slice(0, 10),
      weight_kg: toNumber(body.weight_kg),
      waist_cm: body.waist_cm == null ? null : toNumber(body.waist_cm),
      hips_cm: body.hips_cm == null ? null : toNumber(body.hips_cm),
      chest_cm: body.chest_cm == null ? null : toNumber(body.chest_cm),
      thigh_cm: body.thigh_cm == null ? null : toNumber(body.thigh_cm),
      arm_cm: body.arm_cm == null ? null : toNumber(body.arm_cm),
      neck_cm: body.neck_cm == null ? null : toNumber(body.neck_cm),
      notes: body.notes ?? null,
    };

    const { error } = await supabase
      .from('cut_coach_body_metrics')
      .upsert(payload, { onConflict: 'user_id,date' });
    if (error) throw error;

    await recomputePlan(supabase, user.id, 'weight-update');
    const [weights, today, tomorrow, week] = await Promise.all([
      getWeights(supabase, user.id, 60),
      getDailySummary(supabase, user.id, todayIsoDate()),
      getDailySummary(supabase, user.id, addDays(todayIsoDate(), 1)),
      getWeekSnapshot(supabase, user.id, todayIsoDate()),
    ]);
    return NextResponse.json({ weights, trends: buildTrendSummary(weights), today, tomorrow, week });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return jsonError(message, message === 'Unauthorized' ? 401 : 500);
  }
}
