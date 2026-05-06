import { NextResponse } from 'next/server';
import { getChallenges, toNumber } from '@/lib/cutCoach';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { jsonError, withCutCoachUser } from '@/lib/cutCoachRoute';

export async function GET() {
  return withCutCoachUser(async ({ userId, supabase }) => ({
    challenges: await getChallenges(supabase, userId, 20),
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
    const status =
      body.status === 'planned' || body.status === 'completed' || body.status === 'archived'
        ? body.status
        : 'active';

    if (status === 'active') {
      const { error: clearError } = await supabase
        .from('cut_coach_challenges')
        .update({ status: 'planned' })
        .eq('user_id', user.id)
        .eq('status', 'active');
      if (clearError) throw clearError;
    }

    const payload = {
      id: body.id ?? undefined,
      user_id: user.id,
      title: body.title ? String(body.title).trim() : 'Cut phase',
      start_date: String(body.start_date),
      end_date: String(body.end_date),
      target_weight_kg:
        body.target_weight_kg == null || body.target_weight_kg === '' ? null : toNumber(body.target_weight_kg),
      notes: body.notes ? String(body.notes).trim() : null,
      status,
    };

    const { error } = await supabase.from('cut_coach_challenges').upsert(payload).select('id').single();
    if (error) throw error;

    return NextResponse.json({ challenges: await getChallenges(supabase, user.id, 20) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return jsonError(message, message === 'Unauthorized' ? 401 : 500);
  }
}
