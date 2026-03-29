import { NextResponse } from 'next/server';
import { buildTrendSummary, getWeights, recomputePlan, toNumber } from '@/lib/cutCoach';
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
      notes: body.notes ?? null,
    };

    const { error } = await supabase
      .from('cut_coach_body_metrics')
      .upsert(payload, { onConflict: 'user_id,date' });
    if (error) throw error;

    await recomputePlan(supabase, user.id, 'weight-update');
    const weights = await getWeights(supabase, user.id, 60);
    return NextResponse.json({ weights, trends: buildTrendSummary(weights) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return jsonError(message, message === 'Unauthorized' ? 401 : 500);
  }
}
