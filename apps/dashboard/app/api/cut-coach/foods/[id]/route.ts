import { NextResponse } from 'next/server';
import { recomputePlan, toNumber } from '@/lib/cutCoach';
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
    ['name', 'brand', 'unit_type', 'is_favorite', 'is_custom'].forEach((field) => {
      if (field in body) patch[field] = body[field];
    });
    ['calories', 'protein', 'carbs', 'fat', 'fiber', 'default_serving_grams'].forEach((field) => {
      if (field in body) patch[field] = body[field] == null ? null : toNumber(body[field]);
    });

    const { data, error } = await supabase
      .from('cut_coach_foods')
      .update(patch)
      .eq('id', id)
      .eq('user_id', user.id)
      .select('*')
      .single();
    if (error) throw error;

    await recomputePlan(supabase, user.id, 'food-catalog-change');
    return NextResponse.json({ food: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return jsonError(message, message === 'Unauthorized' ? 401 : 500);
  }
}
