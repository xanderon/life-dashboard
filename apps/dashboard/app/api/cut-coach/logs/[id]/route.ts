import { NextResponse } from 'next/server';
import { getDailySummary, recomputePlan, toNumber } from '@/lib/cutCoach';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { jsonError } from '@/lib/cutCoachRoute';

type Params = {
  params: Promise<{ id: string }>;
};

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return jsonError('Unauthorized', 401);

    const body = await req.json();
    const patch: Record<string, unknown> = {};
    const fields = ['meal_type', 'quantity', 'unit', 'grams_total', 'notes'];
    fields.forEach((field) => {
      if (field in body) patch[field] = body[field];
    });
    ['calories_total', 'protein_total', 'carbs_total', 'fat_total'].forEach((field) => {
      if (field in body) patch[field] = toNumber(body[field]);
    });

    const { data: existing, error: existingError } = await supabase
      .from('cut_coach_food_logs')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();
    if (existingError) throw existingError;

    const { error } = await supabase.from('cut_coach_food_logs').update(patch).eq('id', id).eq('user_id', user.id);
    if (error) throw error;

    await recomputePlan(supabase, user.id, 'food-log-update');
    const summary = await getDailySummary(supabase, user.id, existing.date);
    return NextResponse.json({ summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return jsonError(message, message === 'Unauthorized' ? 401 : 500);
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return jsonError('Unauthorized', 401);

    const { data: existing, error: existingError } = await supabase
      .from('cut_coach_food_logs')
      .select('date')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();
    if (existingError) throw existingError;

    const { error } = await supabase.from('cut_coach_food_logs').delete().eq('id', id).eq('user_id', user.id);
    if (error) throw error;

    await recomputePlan(supabase, user.id, 'food-log-update');
    const summary = await getDailySummary(supabase, user.id, existing.date);
    return NextResponse.json({ summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return jsonError(message, message === 'Unauthorized' ? 401 : 500);
  }
}
