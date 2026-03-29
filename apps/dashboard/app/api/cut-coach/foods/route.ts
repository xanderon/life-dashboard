import { NextResponse } from 'next/server';
import { getFoods, recomputePlan, toNumber } from '@/lib/cutCoach';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { jsonError, withCutCoachUser } from '@/lib/cutCoachRoute';

export async function GET() {
  return withCutCoachUser(async ({ userId, supabase }) => {
    const foods = await getFoods(supabase, userId);
    return { foods };
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
      name: String(body.name ?? '').trim(),
      brand: body.brand ? String(body.brand).trim() : null,
      unit_type: body.unit_type ?? '100g',
      calories: toNumber(body.calories),
      protein: toNumber(body.protein),
      carbs: toNumber(body.carbs),
      fat: toNumber(body.fat),
      fiber: body.fiber == null ? null : toNumber(body.fiber),
      default_serving_grams:
        body.default_serving_grams == null ? null : toNumber(body.default_serving_grams),
      is_favorite: Boolean(body.is_favorite),
      is_custom: body.is_custom !== false,
    };

    if (!payload.name) return jsonError('Food name is required');

    const { data, error } = await supabase.from('cut_coach_foods').insert(payload).select('*').single();
    if (error) throw error;

    await recomputePlan(supabase, user.id, 'food-catalog-change');
    return NextResponse.json({ food: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return jsonError(message, message === 'Unauthorized' ? 401 : 500);
  }
}
