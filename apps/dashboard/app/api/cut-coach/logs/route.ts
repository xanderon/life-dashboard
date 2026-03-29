import { NextResponse } from 'next/server';
import { getDailySummary, getTargetForDate, recomputePlan, toNumber } from '@/lib/cutCoach';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { jsonError, withCutCoachUser } from '@/lib/cutCoachRoute';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date') ?? new Date().toISOString().slice(0, 10);

  return withCutCoachUser(async ({ userId, supabase }) => {
    const summary = await getDailySummary(supabase, userId, date);
    return summary;
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
    const date = body.date ?? new Date().toISOString().slice(0, 10);
    const quantity = toNumber(body.quantity, 1);
    let gramsTotal = toNumber(body.grams_total);
    let nutrition: {
      calories_total: number;
      protein_total: number;
      carbs_total: number;
      fat_total: number;
      food_id: string | null;
      custom_food_name: string | null;
    };

    if (body.food_id) {
      const { data: food, error: foodError } = await supabase
        .from('cut_coach_foods')
        .select('*')
        .eq('id', body.food_id)
        .eq('user_id', user.id)
        .single();
      if (foodError) throw foodError;

      const servingGrams =
        gramsTotal > 0 ? gramsTotal : food.default_serving_grams ? Number(food.default_serving_grams) * quantity : 100 * quantity;
      gramsTotal = servingGrams;
      const ratio = servingGrams / 100;
      nutrition = {
        calories_total: toNumber(food.calories) * ratio,
        protein_total: toNumber(food.protein) * ratio,
        carbs_total: toNumber(food.carbs) * ratio,
        fat_total: toNumber(food.fat) * ratio,
        food_id: food.id,
        custom_food_name: null,
      };

      await supabase
        .from('cut_coach_foods')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', food.id)
        .eq('user_id', user.id);
    } else {
      gramsTotal = gramsTotal || 100;
      nutrition = {
        calories_total: toNumber(body.calories_total),
        protein_total: toNumber(body.protein_total),
        carbs_total: toNumber(body.carbs_total),
        fat_total: toNumber(body.fat_total),
        food_id: null,
        custom_food_name: body.custom_food_name ? String(body.custom_food_name).trim() : 'Custom food',
      };
    }

    const payload = {
      user_id: user.id,
      date,
      meal_type: body.meal_type ?? 'lunch',
      ...nutrition,
      quantity,
      unit: body.unit ?? 'g',
      grams_total: gramsTotal,
      source: body.source ?? 'manual',
      notes: body.notes ?? null,
    };

    const { error } = await supabase.from('cut_coach_food_logs').insert(payload);
    if (error) throw error;

    await recomputePlan(supabase, user.id, 'food-log-update');
    const summary = await getDailySummary(supabase, user.id, date);
    const target = await getTargetForDate(supabase, user.id, date);
    return NextResponse.json({ summary, target });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return jsonError(message, message === 'Unauthorized' ? 401 : 500);
  }
}
