import { NextResponse } from 'next/server';
import {
  getProfile,
  parseTrainingDays,
  recomputePlan,
  toNumber,
} from '@/lib/cutCoach';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { jsonError, withCutCoachUser } from '@/lib/cutCoachRoute';

export async function GET() {
  return withCutCoachUser(async ({ userId, supabase }) => {
    const profile = await getProfile(supabase, userId);
    return { profile };
  });
}

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return jsonError('Unauthorized', 401);
    }

    const body = await req.json();
    const profilePayload = {
      user_id: user.id,
      age: toNumber(body.age),
      sex: body.sex === 'female' ? 'female' : 'male',
      height_cm: toNumber(body.height_cm),
      goal_type: body.goal_type ?? 'cut',
      activity_level: body.activity_level ?? 'moderate',
      preferred_deficit_pct: toNumber(body.preferred_deficit_pct, 18),
      protein_target_per_kg: toNumber(body.protein_target_per_kg, 2),
      fat_min_per_kg: toNumber(body.fat_min_per_kg, 0.7),
      macro_strategy: body.macro_strategy ?? 'balanced',
      meals_per_day: toNumber(body.meals_per_day, 3),
      training_day_kcal_delta: toNumber(body.training_day_kcal_delta, 150),
      maintenance_adjustment_kcal: toNumber(body.maintenance_adjustment_kcal, 0),
      training_days: parseTrainingDays(body.training_days),
    };

    const { error } = await supabase.from('cut_coach_profiles').upsert(profilePayload, {
      onConflict: 'user_id',
    });
    if (error) throw error;

    const initialWeight = toNumber(body.initial_weight_kg);
    if (initialWeight > 0) {
      const date = body.initial_weight_date ?? new Date().toISOString().slice(0, 10);
      const { error: weightError } = await supabase.from('cut_coach_body_metrics').upsert(
        {
          user_id: user.id,
          date,
          weight_kg: initialWeight,
          notes: 'Initial setup',
        },
        { onConflict: 'user_id,date' }
      );
      if (weightError) throw weightError;
    }

    await recomputePlan(supabase, user.id, 'profile-update');
    const profile = await getProfile(supabase, user.id);
    return NextResponse.json({ profile });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return jsonError(message, message === 'Unauthorized' ? 401 : 500);
  }
}

export async function PATCH(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return jsonError('Unauthorized', 401);

    const body = await req.json();
    const patch: Record<string, unknown> = {};
    const fields = [
      'age',
      'sex',
      'height_cm',
      'goal_type',
      'activity_level',
      'preferred_deficit_pct',
      'protein_target_per_kg',
      'fat_min_per_kg',
      'macro_strategy',
      'meals_per_day',
      'training_day_kcal_delta',
      'maintenance_adjustment_kcal',
    ];

    fields.forEach((field) => {
      if (field in body) patch[field] = body[field];
    });
    if ('training_days' in body) patch.training_days = parseTrainingDays(body.training_days);

    const { error } = await supabase.from('cut_coach_profiles').update(patch).eq('user_id', user.id);
    if (error) throw error;

    await recomputePlan(supabase, user.id, 'profile-update');
    const profile = await getProfile(supabase, user.id);
    return NextResponse.json({ profile });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return jsonError(message, message === 'Unauthorized' ? 401 : 500);
  }
}
