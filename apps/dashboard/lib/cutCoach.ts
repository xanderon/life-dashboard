import type { SupabaseClient } from '@supabase/supabase-js';

export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'athlete';
export type GoalType = 'cut' | 'recomp' | 'maintain';
export type MacroStrategy = 'balanced' | 'lower_carb' | 'higher_carb';
export type DayType = 'training' | 'rest';
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type PlanStatus = 'planned' | 'adjusted' | 'locked' | 'completed';
export type LogSource = 'manual' | 'template' | 'ai';

export type CutCoachProfileRow = {
  user_id: string;
  age: number;
  sex: 'male' | 'female';
  height_cm: number;
  goal_type: GoalType;
  activity_level: ActivityLevel;
  preferred_deficit_pct: number;
  protein_target_per_kg: number;
  fat_min_per_kg: number;
  macro_strategy: MacroStrategy;
  meals_per_day: number;
  training_day_kcal_delta: number;
  maintenance_adjustment_kcal: number;
  training_days: number[];
  created_at: string;
  updated_at: string;
};

export type CutCoachFoodRow = {
  id: string;
  user_id: string;
  name: string;
  brand: string | null;
  barcode: string | null;
  source_kind: 'generic' | 'product' | 'imported_product';
  unit_type: '100g' | 'serving' | 'piece';
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number | null;
  default_serving_grams: number | null;
  package_size_grams: number | null;
  serving_label: string | null;
  image_url: string | null;
  is_favorite: boolean;
  is_custom: boolean;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CutCoachFoodLogRow = {
  id: string;
  user_id: string;
  date: string;
  meal_type: MealType;
  food_id: string | null;
  custom_food_name: string | null;
  quantity: number;
  unit: string;
  grams_total: number;
  calories_total: number;
  protein_total: number;
  carbs_total: number;
  fat_total: number;
  source: LogSource;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type CutCoachWeightRow = {
  id: string;
  user_id: string;
  date: string;
  weight_kg: number;
  waist_cm: number | null;
  notes: string | null;
  created_at: string;
};

export type CutCoachDailyTargetRow = {
  id: string;
  user_id: string;
  date: string;
  day_type: DayType;
  baseline_kcal: number;
  maintenance_kcal: number;
  kcal_target: number;
  protein_target: number;
  carbs_target: number;
  fat_target: number;
  plan_status: PlanStatus;
  adjustment_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type CutCoachPlanItemRow = {
  id: string;
  daily_target_id: string;
  meal_slot: MealType;
  suggested_food_text: string;
  suggested_calories: number;
  suggested_protein: number;
  suggested_carbs: number;
  suggested_fat: number;
  is_optional: boolean;
  sort_order: number;
};

export type CutCoachAdjustmentRow = {
  id: string;
  user_id: string;
  source_date: string;
  target_date: string;
  delta_kcal: number;
  reason: string;
  algorithm_version: string;
  created_at: string;
};

export type DailyNutritionTotals = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export type DailySummary = {
  date: string;
  target: CutCoachDailyTargetRow | null;
  consumed: DailyNutritionTotals;
  remaining: DailyNutritionTotals | null;
  logs: CutCoachFoodLogRow[];
  planItems: CutCoachPlanItemRow[];
  adjustments: CutCoachAdjustmentRow[];
};

export type OpenFoodFactsProduct = {
  barcode: string;
  name: string;
  brand: string | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number | null;
  defaultServingGrams: number | null;
  packageSizeGrams: number | null;
  servingLabel: string | null;
  imageUrl: string | null;
};

type PlannerDay = {
  date: string;
  dayType: DayType;
  maintenanceKcal: number;
  baselineKcal: number;
  kcalTarget: number;
  proteinTarget: number;
  carbsTarget: number;
  fatTarget: number;
  adjustmentReason: string | null;
  status: PlanStatus;
};

type PlannerContext = {
  profile: CutCoachProfileRow;
  latestWeight: number;
  recentWeights: CutCoachWeightRow[];
  upcomingDates: string[];
  recentLogs: CutCoachFoodLogRow[];
  todaySummary: DailySummary | null;
  favoriteFoods: CutCoachFoodRow[];
};

const ACTIVITY_MULTIPLIER: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.35,
  moderate: 1.5,
  active: 1.7,
  athlete: 1.9,
};

const DEFAULT_MEALS: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const PLANNER_ALGO_VERSION = 'v1';

export function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export function addDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function enumerateDates(startIsoDate: string, days: number) {
  return Array.from({ length: days }, (_, index) => addDays(startIsoDate, index));
}

export function round1(value: number) {
  return Math.round(value * 10) / 10;
}

export function roundInt(value: number) {
  return Math.round(value);
}

export function humanizeAdjustmentReason(reason: string | null | undefined, context: 'today' | 'tomorrow' = 'tomorrow') {
  if (!reason) {
    return context === 'tomorrow'
      ? 'No adjustment needed. Tomorrow stays aligned with the current weekly plan.'
      : 'No adjustment needed. You are still on track.';
  }

  if (reason === 'bootstrap-refresh' || reason === 'manual-recompute') {
    return 'Plan refreshed using your current profile, recent weight trend, and today intake.';
  }
  if (reason === 'profile-update') {
    return 'Targets were refreshed because your profile or calorie setup changed.';
  }
  if (reason === 'weight-update') {
    return 'Targets were refreshed after the latest weight update.';
  }
  if (reason === 'food-log-update') {
    return context === 'tomorrow'
      ? 'Tomorrow was recalculated after today intake changed.'
      : 'Today summary was recalculated after your latest food log.';
  }
  if (reason.startsWith('Trend over 14 days is slower')) {
    return 'Weight trend is slower than expected, so calories were tightened slightly.';
  }
  if (reason.startsWith('Trend over 14 days is faster')) {
    return 'Weight trend is dropping faster than expected, so calories were eased slightly.';
  }
  if (reason.startsWith('Redistributed')) {
    return 'A small correction was spread across the next few days instead of cutting hard tomorrow.';
  }
  if (reason.startsWith('Small redistribution after')) {
    return 'A small correction was spread across the next few days to keep the week on track.';
  }
  return reason;
}

export function isTrainingDay(profile: CutCoachProfileRow, isoDate: string) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  return profile.training_days.includes(date.getUTCDay());
}

export function computeBmr(profile: CutCoachProfileRow, weightKg: number) {
  const base = 10 * weightKg + 6.25 * profile.height_cm - 5 * profile.age;
  return profile.sex === 'male' ? base + 5 : base - 161;
}

export function computeMaintenanceCalories(profile: CutCoachProfileRow, weightKg: number) {
  const bmr = computeBmr(profile, weightKg);
  return bmr * ACTIVITY_MULTIPLIER[profile.activity_level] + profile.maintenance_adjustment_kcal;
}

export function computeBaseTargetCalories(profile: CutCoachProfileRow, weightKg: number) {
  const maintenance = computeMaintenanceCalories(profile, weightKg);
  if (profile.goal_type === 'maintain') return maintenance;
  if (profile.goal_type === 'recomp') return maintenance * 0.92;
  return maintenance * (1 - profile.preferred_deficit_pct / 100);
}

export function computeSafeMinimumCalories(profile: CutCoachProfileRow, weightKg: number) {
  const bmr = computeBmr(profile, weightKg);
  return Math.max(1400, bmr * 0.82, weightKg * 22);
}

export function computeMacroTargets(
  profile: CutCoachProfileRow,
  weightKg: number,
  kcalTarget: number
) {
  const protein = round1(weightKg * profile.protein_target_per_kg);
  const fat = round1(weightKg * profile.fat_min_per_kg);

  const proteinCalories = protein * 4;
  let fatCalories = fat * 9;
  let carbCalories = Math.max(0, kcalTarget - proteinCalories - fatCalories);

  if (profile.macro_strategy === 'lower_carb') {
    const extraFat = Math.min(carbCalories * 0.15, kcalTarget * 0.1);
    fatCalories += extraFat;
    carbCalories -= extraFat;
  } else if (profile.macro_strategy === 'higher_carb') {
    const leanerFat = Math.min(fatCalories * 0.1, kcalTarget * 0.06);
    fatCalories -= leanerFat;
    carbCalories += leanerFat;
  }

  return {
    protein,
    fat: round1(fatCalories / 9),
    carbs: round1(carbCalories / 4),
  };
}

export function emptyTotals(): DailyNutritionTotals {
  return { calories: 0, protein: 0, carbs: 0, fat: 0 };
}

export function sumLogs(logs: CutCoachFoodLogRow[]): DailyNutritionTotals {
  return logs.reduce(
    (acc, row) => ({
      calories: round1(acc.calories + row.calories_total),
      protein: round1(acc.protein + row.protein_total),
      carbs: round1(acc.carbs + row.carbs_total),
      fat: round1(acc.fat + row.fat_total),
    }),
    emptyTotals()
  );
}

function mealSlotsForCount(mealsPerDay: number): MealType[] {
  if (mealsPerDay <= 2) return ['lunch', 'dinner'];
  if (mealsPerDay === 3) return ['breakfast', 'lunch', 'dinner'];
  return DEFAULT_MEALS.slice(0, Math.min(mealsPerDay, DEFAULT_MEALS.length));
}

function buildMealSuggestions(
  target: PlannerDay,
  favoriteFoods: CutCoachFoodRow[],
  mealsPerDay: number
) {
  const slots = mealSlotsForCount(mealsPerDay);
  const ratios =
    slots.length === 2
      ? [0.45, 0.55]
      : slots.length === 3
        ? [0.28, 0.38, 0.34]
        : [0.27, 0.33, 0.26, 0.14];

  const proteins = favoriteFoods
    .filter((food) => food.protein >= 10)
    .sort((a, b) => b.protein - a.protein);
  const carbs = favoriteFoods.filter((food) => food.carbs >= 15).sort((a, b) => b.carbs - a.carbs);
  const fats = favoriteFoods.filter((food) => food.fat >= 8).sort((a, b) => b.fat - a.fat);

  return slots.map((slot, index) => {
    const kcalRatio = ratios[index] ?? 1 / slots.length;
    const proteinFood = proteins[index % Math.max(1, proteins.length)];
    const carbFood = carbs[index % Math.max(1, carbs.length)];
    const fatFood = fats[index % Math.max(1, fats.length)];

    const labelParts = [
      proteinFood?.name ?? 'Lean protein',
      carbFood?.name ?? (slot === 'snack' ? 'fruit' : 'rice or potatoes'),
      fatFood?.name ?? 'veg + healthy fat',
    ];

    return {
      meal_slot: slot,
      suggested_food_text: labelParts.filter(Boolean).join(' + '),
      suggested_calories: roundInt(target.kcalTarget * kcalRatio),
      suggested_protein: round1(target.proteinTarget * kcalRatio),
      suggested_carbs: round1(target.carbsTarget * kcalRatio),
      suggested_fat: round1(target.fatTarget * kcalRatio),
      is_optional: slot === 'snack' && slots.length === 4,
      sort_order: index,
    };
  });
}

export async function requireUser(client: SupabaseClient) {
  const {
    data: { user },
    error,
  } = await client.auth.getUser();

  if (error) throw error;
  if (!user) throw new Error('Unauthorized');
  return user;
}

export async function getProfile(client: SupabaseClient, userId: string) {
  const { data, error } = await client
    .from('cut_coach_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return (data as CutCoachProfileRow | null) ?? null;
}

export async function getFoods(client: SupabaseClient, userId: string) {
  const { data, error } = await client
    .from('cut_coach_foods')
    .select('*')
    .eq('user_id', userId)
    .order('is_favorite', { ascending: false })
    .order('last_used_at', { ascending: false, nullsFirst: false })
    .order('name', { ascending: true });

  if (error) throw error;
  return (data ?? []) as CutCoachFoodRow[];
}

export async function getFoodById(client: SupabaseClient, userId: string, foodId: string) {
  const { data, error } = await client
    .from('cut_coach_foods')
    .select('*')
    .eq('user_id', userId)
    .eq('id', foodId)
    .single();

  if (error) throw error;
  return data as CutCoachFoodRow;
}

export async function findFoodByBarcode(client: SupabaseClient, userId: string, barcode: string) {
  const { data, error } = await client
    .from('cut_coach_foods')
    .select('*')
    .eq('user_id', userId)
    .eq('barcode', barcode)
    .maybeSingle();

  if (error) throw error;
  return (data as CutCoachFoodRow | null) ?? null;
}

export async function searchFoods(client: SupabaseClient, userId: string, query: string, limit = 20) {
  const trimmed = query.trim();
  const request = client
    .from('cut_coach_foods')
    .select('*')
    .eq('user_id', userId)
    .order('is_favorite', { ascending: false })
    .order('last_used_at', { ascending: false, nullsFirst: false })
    .limit(limit);

  const { data, error } =
    !trimmed
      ? await request
      : /^\d{6,14}$/.test(trimmed)
        ? await request.or(`barcode.eq.${trimmed},name.ilike.%${trimmed}%`)
        : await request.ilike('name', `%${trimmed}%`);

  if (error) throw error;
  return (data ?? []) as CutCoachFoodRow[];
}

export async function getRecentFoods(client: SupabaseClient, userId: string, limit = 12) {
  const { data, error } = await client
    .from('cut_coach_foods')
    .select('*')
    .eq('user_id', userId)
    .not('last_used_at', 'is', null)
    .order('last_used_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as CutCoachFoodRow[];
}

export async function getFavoriteFoods(client: SupabaseClient, userId: string, limit = 12) {
  const { data, error } = await client
    .from('cut_coach_foods')
    .select('*')
    .eq('user_id', userId)
    .eq('is_favorite', true)
    .order('last_used_at', { ascending: false, nullsFirst: false })
    .order('name', { ascending: true })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as CutCoachFoodRow[];
}

export async function getWeights(client: SupabaseClient, userId: string, limit = 30) {
  const { data, error } = await client
    .from('cut_coach_body_metrics')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as CutCoachWeightRow[];
}

export async function getLatestWeight(client: SupabaseClient, userId: string) {
  const rows = await getWeights(client, userId, 1);
  return rows[0] ?? null;
}

export async function getLogsForDate(client: SupabaseClient, userId: string, isoDate: string) {
  const { data, error } = await client
    .from('cut_coach_food_logs')
    .select('*')
    .eq('user_id', userId)
    .eq('date', isoDate)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as CutCoachFoodLogRow[];
}

export async function getLogsForDateRange(
  client: SupabaseClient,
  userId: string,
  startDate: string,
  endDate: string
) {
  const { data, error } = await client
    .from('cut_coach_food_logs')
    .select('*')
    .eq('user_id', userId)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as CutCoachFoodLogRow[];
}

export async function getTargetForDate(client: SupabaseClient, userId: string, isoDate: string) {
  const { data, error } = await client
    .from('cut_coach_daily_targets')
    .select('*')
    .eq('user_id', userId)
    .eq('date', isoDate)
    .maybeSingle();

  if (error) throw error;
  return (data as CutCoachDailyTargetRow | null) ?? null;
}

export async function getTargetsForDateRange(
  client: SupabaseClient,
  userId: string,
  startDate: string,
  endDate: string
) {
  const { data, error } = await client
    .from('cut_coach_daily_targets')
    .select('*')
    .eq('user_id', userId)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: true });

  if (error) throw error;
  return (data ?? []) as CutCoachDailyTargetRow[];
}

export async function getPlanItemsByTargetIds(client: SupabaseClient, targetIds: string[]) {
  if (targetIds.length === 0) return [];

  const { data, error } = await client
    .from('cut_coach_daily_plan_items')
    .select('*')
    .in('daily_target_id', targetIds)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return (data ?? []) as CutCoachPlanItemRow[];
}

export async function getAdjustmentsForRange(
  client: SupabaseClient,
  userId: string,
  startDate: string,
  endDate: string
) {
  const { data, error } = await client
    .from('cut_coach_plan_adjustments')
    .select('*')
    .eq('user_id', userId)
    .gte('target_date', startDate)
    .lte('target_date', endDate)
    .order('target_date', { ascending: true });

  if (error) throw error;
  return (data ?? []) as CutCoachAdjustmentRow[];
}

export async function getDailySummary(client: SupabaseClient, userId: string, isoDate: string) {
  const [logs, target, adjustments] = await Promise.all([
    getLogsForDate(client, userId, isoDate),
    getTargetForDate(client, userId, isoDate),
    getAdjustmentsForRange(client, userId, isoDate, isoDate),
  ]);

  const consumed = sumLogs(logs);
  const planItems = target ? await getPlanItemsByTargetIds(client, [target.id]) : [];
  const remaining = target
    ? {
        calories: round1(target.kcal_target - consumed.calories),
        protein: round1(target.protein_target - consumed.protein),
        carbs: round1(target.carbs_target - consumed.carbs),
        fat: round1(target.fat_target - consumed.fat),
      }
    : null;

  return {
    date: isoDate,
    target,
    consumed,
    remaining,
    logs,
    planItems,
    adjustments,
  } satisfies DailySummary;
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function computeWeightTrendAdjustment(
  profile: CutCoachProfileRow,
  weights: CutCoachWeightRow[]
) {
  if (weights.length < 14) {
    return { maintenanceDelta: 0, reason: null as string | null };
  }

  const sorted = [...weights].sort((a, b) => a.date.localeCompare(b.date));
  const recent = sorted.slice(-7).map((row) => row.weight_kg);
  const previous = sorted.slice(-14, -7).map((row) => row.weight_kg);
  if (recent.length < 7 || previous.length < 7) {
    return { maintenanceDelta: 0, reason: null as string | null };
  }

  const recentAvg = average(recent);
  const prevAvg = average(previous);
  const actualWeeklyLoss = prevAvg - recentAvg;
  const maintenance = computeMaintenanceCalories(profile, sorted.at(-1)!.weight_kg);
  const baseTarget = computeBaseTargetCalories(profile, sorted.at(-1)!.weight_kg);
  const expectedWeeklyLoss = Math.max(0, ((maintenance - baseTarget) * 7) / 7700);

  if (!expectedWeeklyLoss) {
    return { maintenanceDelta: 0, reason: null as string | null };
  }

  if (actualWeeklyLoss < expectedWeeklyLoss * 0.6) {
    return {
      maintenanceDelta: -100,
      reason: 'Trend over 14 days is slower than expected; reduce maintenance estimate by 100 kcal.',
    };
  }

  if (actualWeeklyLoss > expectedWeeklyLoss * 1.4) {
    return {
      maintenanceDelta: 100,
      reason: 'Trend over 14 days is faster than expected; increase maintenance estimate by 100 kcal.',
    };
  }

  return { maintenanceDelta: 0, reason: null as string | null };
}

function buildPlannerDays(context: PlannerContext): PlannerDay[] {
  const { profile, latestWeight, upcomingDates, recentWeights } = context;
  const maintenance = computeMaintenanceCalories(profile, latestWeight);
  const baseTarget = computeBaseTargetCalories(profile, latestWeight);
  const safeMinimum = computeSafeMinimumCalories(profile, latestWeight);
  const trainingCount = upcomingDates.filter((date) => isTrainingDay(profile, date)).length;
  const restCount = upcomingDates.length - trainingCount;

  const trainingDelta = profile.training_day_kcal_delta;
  const restDelta =
    trainingCount > 0 && restCount > 0 ? (trainingCount * trainingDelta) / restCount : 0;
  const trendAdjustment = computeWeightTrendAdjustment(profile, recentWeights);

  return upcomingDates.map((date) => {
    const dayType: DayType = isTrainingDay(profile, date) ? 'training' : 'rest';
    const dayBase = baseTarget + (dayType === 'training' ? trainingDelta : -restDelta) + trendAdjustment.maintenanceDelta;
    const kcalTarget = Math.max(safeMinimum, dayBase);
    const macros = computeMacroTargets(profile, latestWeight, kcalTarget);

    return {
      date,
      dayType,
      maintenanceKcal: round1(maintenance + trendAdjustment.maintenanceDelta),
      baselineKcal: round1(baseTarget),
      kcalTarget: round1(kcalTarget),
      proteinTarget: macros.protein,
      carbsTarget: macros.carbs,
      fatTarget: macros.fat,
      adjustmentReason: trendAdjustment.reason,
      status: trendAdjustment.reason ? 'adjusted' : 'planned',
    } satisfies PlannerDay;
  });
}

function groupLogsByDate(logs: CutCoachFoodLogRow[]) {
  return logs.reduce<Record<string, CutCoachFoodLogRow[]>>((acc, row) => {
    if (!acc[row.date]) acc[row.date] = [];
    acc[row.date].push(row);
    return acc;
  }, {});
}

function groupTargetsByDate(targets: CutCoachDailyTargetRow[]) {
  return targets.reduce<Record<string, CutCoachDailyTargetRow>>((acc, row) => {
    acc[row.date] = row;
    return acc;
  }, {});
}

function applyDeviationAdjustments(
  plannerDays: PlannerDay[],
  todaySummary: DailySummary | null,
  profile: CutCoachProfileRow,
  latestWeight: number
) {
  if (!todaySummary?.target) {
    return { days: plannerDays, adjustments: [] as Omit<CutCoachAdjustmentRow, 'id' | 'created_at'>[] };
  }

  const safeMinimum = computeSafeMinimumCalories(profile, latestWeight);
  const deviation = todaySummary.consumed.calories - todaySummary.target.kcal_target;
  const rollingGap = deviation;

  if (rollingGap <= 150) {
    return { days: plannerDays, adjustments: [] as Omit<CutCoachAdjustmentRow, 'id' | 'created_at'>[] };
  }

  const futureDays = plannerDays.slice(1, 4);
  if (!futureDays.length) {
    return { days: plannerDays, adjustments: [] as Omit<CutCoachAdjustmentRow, 'id' | 'created_at'>[] };
  }

  const totalCorrection = Math.min(rollingGap, futureDays.length * 150);
  const perDay = round1(totalCorrection / futureDays.length);
  const adjustments: Omit<CutCoachAdjustmentRow, 'id' | 'created_at'>[] = [];

  const updated = plannerDays.map((day, index) => {
    if (index === 0 || index > futureDays.length) return day;
    const nextTarget = Math.max(safeMinimum, day.kcalTarget - perDay);
    const delta = round1(nextTarget - day.kcalTarget);
    if (delta === 0) return day;

    adjustments.push({
      user_id: '',
      source_date: todaySummary.date,
      target_date: day.date,
      delta_kcal: delta,
      reason: `Small redistribution after ${roundInt(rollingGap)} kcal over target on ${todaySummary.date}.`,
      algorithm_version: PLANNER_ALGO_VERSION,
    });

    const adjustedMacros = computeMacroTargets(profile, latestWeight, nextTarget);
    return {
      ...day,
      kcalTarget: round1(nextTarget),
      proteinTarget: adjustedMacros.protein,
      carbsTarget: adjustedMacros.carbs,
      fatTarget: adjustedMacros.fat,
      adjustmentReason: `Redistributed ${roundInt(Math.abs(delta))} kcal from ${todaySummary.date}.`,
      status: 'adjusted' as const,
    };
  });

  return { days: updated, adjustments };
}

export async function recomputePlan(client: SupabaseClient, userId: string, reason = 'manual-recompute') {
  const profile = await getProfile(client, userId);
  if (!profile) {
    return { ok: false as const, reason: 'missing-profile' };
  }

  const latestWeightRow = await getLatestWeight(client, userId);
  if (!latestWeightRow) {
    return { ok: false as const, reason: 'missing-weight' };
  }

  const today = todayIsoDate();
  const upcomingDates = enumerateDates(today, 7);
  const recentStart = addDays(today, -13);
  const [recentWeights, recentLogs, todaySummary, favoriteFoods] = await Promise.all([
    getWeights(client, userId, 20),
    getLogsForDateRange(client, userId, recentStart, today),
    getDailySummary(client, userId, today),
    getFavoriteFoods(client, userId, 10),
  ]);

  const context: PlannerContext = {
    profile,
    latestWeight: latestWeightRow.weight_kg,
    recentWeights,
    upcomingDates,
    recentLogs,
    todaySummary,
    favoriteFoods,
  };

  const plannerDays = buildPlannerDays(context);
  const adjusted = applyDeviationAdjustments(plannerDays, todaySummary, profile, latestWeightRow.weight_kg);

  const targetRows = adjusted.days.map((day) => ({
    user_id: userId,
    date: day.date,
    day_type: day.dayType,
    baseline_kcal: day.baselineKcal,
    maintenance_kcal: day.maintenanceKcal,
    kcal_target: day.kcalTarget,
    protein_target: day.proteinTarget,
    carbs_target: day.carbsTarget,
    fat_target: day.fatTarget,
    plan_status: day.status,
    adjustment_reason: day.adjustmentReason ?? (reason === 'manual-recompute' ? null : reason),
  }));

  const { data: upsertedTargets, error: targetError } = await client
    .from('cut_coach_daily_targets')
    .upsert(targetRows, { onConflict: 'user_id,date' })
    .select('*');

  if (targetError) throw targetError;

  const targets = (upsertedTargets ?? []) as CutCoachDailyTargetRow[];
  const targetByDate = groupTargetsByDate(targets);

  const planItemDeleteError = await client
    .from('cut_coach_daily_plan_items')
    .delete()
    .in(
      'daily_target_id',
      targets.map((target) => target.id)
    );
  if (planItemDeleteError.error) throw planItemDeleteError.error;

  const planItems = adjusted.days.flatMap((day) => {
    const target = targetByDate[day.date];
    if (!target) return [];

    return buildMealSuggestions(day, favoriteFoods, profile.meals_per_day).map((item) => ({
      daily_target_id: target.id,
      ...item,
    }));
  });

  if (planItems.length > 0) {
    const { error: insertPlanItemsError } = await client.from('cut_coach_daily_plan_items').insert(planItems);
    if (insertPlanItemsError) throw insertPlanItemsError;
  }

  const { error: deleteAdjustmentError } = await client
    .from('cut_coach_plan_adjustments')
    .delete()
    .eq('user_id', userId)
    .gte('target_date', today)
    .lte('target_date', addDays(today, 6));
  if (deleteAdjustmentError) throw deleteAdjustmentError;

  if (adjusted.adjustments.length) {
    const { error: insertAdjustmentError } = await client
      .from('cut_coach_plan_adjustments')
      .insert(adjusted.adjustments.map((item) => ({ ...item, user_id: userId })));
    if (insertAdjustmentError) throw insertAdjustmentError;
  }

  return { ok: true as const, targets };
}

export async function getWeekSnapshot(client: SupabaseClient, userId: string, startDate = todayIsoDate()) {
  const endDate = addDays(startDate, 6);
  const [targets, logs, adjustments] = await Promise.all([
    getTargetsForDateRange(client, userId, startDate, endDate),
    getLogsForDateRange(client, userId, startDate, endDate),
    getAdjustmentsForRange(client, userId, startDate, endDate),
  ]);

  const planItems = await getPlanItemsByTargetIds(
    client,
    targets.map((target) => target.id)
  );

  const logsByDate = groupLogsByDate(logs);
  const itemsByTarget = planItems.reduce<Record<string, CutCoachPlanItemRow[]>>((acc, item) => {
    if (!acc[item.daily_target_id]) acc[item.daily_target_id] = [];
    acc[item.daily_target_id].push(item);
    return acc;
  }, {});

  return targets.map((target) => {
    const dateLogs = logsByDate[target.date] ?? [];
    const consumed = sumLogs(dateLogs);

    return {
      target,
      consumed,
      remaining: {
        calories: round1(target.kcal_target - consumed.calories),
        protein: round1(target.protein_target - consumed.protein),
        carbs: round1(target.carbs_target - consumed.carbs),
        fat: round1(target.fat_target - consumed.fat),
      },
      logs: dateLogs,
      planItems: itemsByTarget[target.id] ?? [],
      adjustments: adjustments.filter((adjustment) => adjustment.target_date === target.date),
    };
  });
}

export function buildTrendSummary(weights: CutCoachWeightRow[]) {
  const sorted = [...weights].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted.at(-1) ?? null;
  const trailing = (days: number) => {
    const slice = sorted.slice(-days);
    return slice.length ? average(slice.map((item) => item.weight_kg)) : null;
  };

  const avg7 = trailing(7);
  const avg14 = trailing(14);
  const avg30 = trailing(30);

  return {
    latest,
    avg7: avg7 ? round1(avg7) : null,
    avg14: avg14 ? round1(avg14) : null,
    avg30: avg30 ? round1(avg30) : null,
    delta7:
      avg7 && sorted.length >= 14 ? round1(average(sorted.slice(-14, -7).map((row) => row.weight_kg)) - avg7) : null,
    delta14:
      avg14 && sorted.length >= 28 ? round1(average(sorted.slice(-28, -14).map((row) => row.weight_kg)) - avg14) : null,
  };
}

export function toNumber(value: unknown, fallback = 0) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseTrainingDays(value: unknown) {
  if (!Array.isArray(value)) return [1, 3, 5];
  const parsed = value
    .map((entry) => Number(entry))
    .filter((entry) => Number.isInteger(entry) && entry >= 0 && entry <= 6);
  return parsed.length ? parsed : [1, 3, 5];
}

export function parseGramsFromText(text: string | null | undefined) {
  if (!text) return null;
  const match = text.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l)\b/i);
  if (!match) return null;
  const amount = Number(match[1].replace(',', '.'));
  if (!Number.isFinite(amount)) return null;
  const unit = match[2].toLowerCase();
  if (unit === 'kg' || unit === 'l') return round1(amount * 1000);
  return round1(amount);
}

type OpenFoodFactsResponse = {
  code?: string;
  product?: {
    product_name?: string;
    brands?: string;
    image_front_small_url?: string;
    image_front_url?: string;
    serving_size?: string;
    quantity?: string;
    nutriments?: {
      'energy-kcal_100g'?: number | string;
      energy_kcal_100g?: number | string;
      proteins_100g?: number | string;
      carbohydrates_100g?: number | string;
      fat_100g?: number | string;
      fiber_100g?: number | string;
    };
  };
  status?: number;
};

export async function fetchOpenFoodFactsProduct(barcode: string) {
  const fields = [
    'product_name',
    'brands',
    'image_front_small_url',
    'image_front_url',
    'serving_size',
    'quantity',
    'nutriments',
  ].join(',');
  const response = await fetch(
    `https://world.openfoodfacts.net/api/v2/product/${encodeURIComponent(barcode)}?fields=${fields}`,
    {
      headers: {
        'User-Agent': 'life-dashboard-cut-coach/1.0 (contact: local-app)',
      },
      cache: 'no-store',
    }
  );

  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(`Open Food Facts lookup failed: ${response.status}`);
  }

  const payload = (await response.json()) as OpenFoodFactsResponse;
  if (!payload.product || payload.status === 0) return null;

  const nutriments = payload.product.nutriments ?? {};
  const calories = toNumber(nutriments['energy-kcal_100g'] ?? nutriments.energy_kcal_100g);
  const protein = toNumber(nutriments.proteins_100g);
  const carbs = toNumber(nutriments.carbohydrates_100g);
  const fat = toNumber(nutriments.fat_100g);
  const fiber = nutriments.fiber_100g == null ? null : toNumber(nutriments.fiber_100g);

  if (!payload.product.product_name || calories <= 0) {
    return null;
  }

  return {
    barcode,
    name: payload.product.product_name.trim(),
    brand: payload.product.brands?.split(',')[0]?.trim() ?? null,
    calories,
    protein,
    carbs,
    fat,
    fiber,
    defaultServingGrams: parseGramsFromText(payload.product.serving_size) ?? null,
    packageSizeGrams: parseGramsFromText(payload.product.quantity) ?? null,
    servingLabel: payload.product.serving_size?.trim() ?? null,
    imageUrl: payload.product.image_front_small_url ?? payload.product.image_front_url ?? null,
  } satisfies OpenFoodFactsProduct;
}

export async function importFoodByBarcode(client: SupabaseClient, userId: string, barcode: string) {
  const existing = await findFoodByBarcode(client, userId, barcode);
  if (existing) return { food: existing, imported: false };

  const external = await fetchOpenFoodFactsProduct(barcode);
  if (!external) return { food: null, imported: false };

  const payload = {
    user_id: userId,
    name: external.name,
    brand: external.brand,
    barcode: external.barcode,
    source_kind: 'imported_product',
    unit_type: external.defaultServingGrams ? 'serving' : '100g',
    calories: external.calories,
    protein: external.protein,
    carbs: external.carbs,
    fat: external.fat,
    fiber: external.fiber,
    default_serving_grams: external.defaultServingGrams,
    package_size_grams: external.packageSizeGrams,
    serving_label: external.servingLabel,
    image_url: external.imageUrl,
    is_favorite: false,
    is_custom: false,
  };

  const { data, error } = await client.from('cut_coach_foods').insert(payload).select('*').single();
  if (error) throw error;
  return { food: data as CutCoachFoodRow, imported: true };
}
