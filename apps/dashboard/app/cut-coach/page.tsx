'use client';

import Link from 'next/link';
import { useEffect, useState, useTransition, type ReactNode } from 'react';
import type {
  CutCoachDailyTargetRow,
  CutCoachFoodLogRow,
  CutCoachFoodRow,
  CutCoachPlanItemRow,
  CutCoachProfileRow,
  CutCoachWeightRow,
} from '@/lib/cutCoach';

type NutritionTotals = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

type DaySnapshot = {
  date: string;
  target: CutCoachDailyTargetRow | null;
  consumed: NutritionTotals;
  remaining: NutritionTotals | null;
  logs: CutCoachFoodLogRow[];
  planItems: CutCoachPlanItemRow[];
  adjustments: Array<{ id: string; delta_kcal: number; reason: string }>;
};

type BootstrapPayload = {
  profile: CutCoachProfileRow | null;
  today: DaySnapshot;
  tomorrow: DaySnapshot;
  week: DaySnapshot[];
  weights: CutCoachWeightRow[];
  trends: {
    latest: CutCoachWeightRow | null;
    avg7: number | null;
    avg14: number | null;
    avg30: number | null;
    delta7: number | null;
    delta14: number | null;
  };
  favorites: CutCoachFoodRow[];
  recentFoods: CutCoachFoodRow[];
  foods: CutCoachFoodRow[];
};

type SetupState = {
  age: string;
  sex: 'male' | 'female';
  height_cm: string;
  activity_level: string;
  preferred_deficit_pct: string;
  protein_target_per_kg: string;
  fat_min_per_kg: string;
  meals_per_day: string;
  initial_weight_kg: string;
  training_day_kcal_delta: string;
  training_days: number[];
};

type LogState = {
  meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  food_id: string;
  grams_total: string;
  quantity: string;
};

type WeightState = {
  date: string;
  weight_kg: string;
};

type FoodState = {
  name: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  default_serving_grams: string;
  is_favorite: boolean;
};

const defaultSetup: SetupState = {
  age: '33',
  sex: 'male',
  height_cm: '180',
  activity_level: 'moderate',
  preferred_deficit_pct: '18',
  protein_target_per_kg: '2',
  fat_min_per_kg: '0.7',
  meals_per_day: '3',
  initial_weight_kg: '90',
  training_day_kcal_delta: '150',
  training_days: [1, 3, 5],
};

const defaultLog: LogState = {
  meal_type: 'lunch',
  food_id: '',
  grams_total: '100',
  quantity: '1',
};

const weekdayLabels = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
];

export default function CutCoachPage() {
  const [data, setData] = useState<BootstrapPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [showSetupPanel, setShowSetupPanel] = useState(false);
  const [setup, setSetup] = useState<SetupState>(defaultSetup);
  const [logState, setLogState] = useState<LogState>(defaultLog);
  const [weightState, setWeightState] = useState<WeightState>({
    date: new Date().toISOString().slice(0, 10),
    weight_kg: '',
  });
  const [foodState, setFoodState] = useState<FoodState>({
    name: '',
    calories: '',
    protein: '',
    carbs: '',
    fat: '',
    default_serving_grams: '100',
    is_favorite: true,
  });

  async function loadBootstrap() {
    setError(null);
    setIsBootstrapping(true);
    const res = await fetch('/api/cut-coach/bootstrap', { cache: 'no-store' });
    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      setError(payload.error ?? 'Failed to load cut coach.');
      setIsBootstrapping(false);
      return;
    }
    const payload = (await res.json()) as BootstrapPayload;
    setData(payload);
    setShowSetupPanel(!payload.profile);
    if (payload.profile) {
      setSetup({
        age: String(payload.profile.age),
        sex: payload.profile.sex,
        height_cm: String(payload.profile.height_cm),
        activity_level: payload.profile.activity_level,
        preferred_deficit_pct: String(payload.profile.preferred_deficit_pct),
        protein_target_per_kg: String(payload.profile.protein_target_per_kg),
        fat_min_per_kg: String(payload.profile.fat_min_per_kg),
        meals_per_day: String(payload.profile.meals_per_day),
        initial_weight_kg: String(payload.trends.latest?.weight_kg ?? ''),
        training_day_kcal_delta: String(payload.profile.training_day_kcal_delta),
        training_days: payload.profile.training_days,
      });
      setWeightState((current) => ({
        ...current,
        weight_kg: payload.trends.latest ? String(payload.trends.latest.weight_kg) : current.weight_kg,
      }));
    }
    setIsBootstrapping(false);
  }

  useEffect(() => {
    void (async () => {
      await loadBootstrap();
    })();
  }, []);

  async function postJson(url: string, method: string, body?: unknown) {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(payload.error ?? `Request failed: ${res.status}`);
    }
    return res.json();
  }

  function mutate(action: () => Promise<void>) {
    startTransition(() => {
      action().catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Unexpected error');
      });
    });
  }

  function submitSetup() {
    mutate(async () => {
      await postJson('/api/cut-coach/profile', 'POST', {
        ...setup,
        goal_type: 'cut',
      });
      await loadBootstrap();
      setShowSetupPanel(false);
    });
  }

  function submitLog() {
    mutate(async () => {
      await postJson('/api/cut-coach/logs', 'POST', {
        ...logState,
        quantity: Number(logState.quantity),
        grams_total: Number(logState.grams_total),
      });
      setLogState(defaultLog);
      await loadBootstrap();
    });
  }

  function quickAdd(food: CutCoachFoodRow) {
    mutate(async () => {
      await postJson('/api/cut-coach/logs', 'POST', {
        food_id: food.id,
        grams_total: food.default_serving_grams ?? 100,
        quantity: 1,
        meal_type: 'snack',
      });
      await loadBootstrap();
    });
  }

  function deleteLog(id: string) {
    mutate(async () => {
      await postJson(`/api/cut-coach/logs/${id}`, 'DELETE');
      await loadBootstrap();
    });
  }

  function submitWeight() {
    mutate(async () => {
      await postJson('/api/cut-coach/weights', 'POST', {
        ...weightState,
        weight_kg: Number(weightState.weight_kg),
      });
      await loadBootstrap();
    });
  }

  function submitFood() {
    mutate(async () => {
      await postJson('/api/cut-coach/foods', 'POST', {
        ...foodState,
        calories: Number(foodState.calories),
        protein: Number(foodState.protein),
        carbs: Number(foodState.carbs),
        fat: Number(foodState.fat),
        default_serving_grams: Number(foodState.default_serving_grams),
      });
      setFoodState({
        name: '',
        calories: '',
        protein: '',
        carbs: '',
        fat: '',
        default_serving_grams: '100',
        is_favorite: true,
      });
      await loadBootstrap();
    });
  }

  function recomputePlan() {
    mutate(async () => {
      await postJson('/api/cut-coach/plans/recompute', 'POST');
      await loadBootstrap();
    });
  }

  const today = data?.today;
  const tomorrow = data?.tomorrow;

  return (
    <main className="min-h-screen bg-[var(--bg)] p-4 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <header className="rounded-3xl border border-[var(--border)] bg-[var(--panel)] p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <Link
                className="inline-flex rounded-full border border-[var(--border)] bg-[var(--panel-2)] px-3 py-1 text-xs font-semibold text-[var(--muted)] hover:text-white"
                href="/"
              >
                Back to dashboard
              </Link>
              <div className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">Adaptive Cut Coach</div>
              <h1 className="mt-2 text-3xl font-semibold">Today first. Tomorrow visible. Adjustments explainable.</h1>
              <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">
                Deterministic calorie and macro planning for your cut, built into Life Dashboard.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {data?.profile ? (
                <button
                  className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] px-4 py-2 text-sm font-semibold hover:bg-[#214547]"
                  onClick={() => setShowSetupPanel((value) => !value)}
                  type="button"
                >
                  {showSetupPanel ? 'Hide profile setup' : 'Profile setup'}
                </button>
              ) : null}
              <button
                className="rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-4 py-2 text-sm font-semibold hover:bg-emerald-500/25"
                onClick={recomputePlan}
                type="button"
              >
                {isPending ? 'Working...' : 'Recompute week'}
              </button>
            </div>
          </div>
          {error ? <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">{error}</div> : null}
        </header>

        {isBootstrapping ? (
          <section className="rounded-3xl border border-[var(--border)] bg-[var(--panel)] p-5 shadow-sm">
            <div className="animate-pulse space-y-3">
              <div className="h-5 w-48 rounded bg-[var(--panel-2)]" />
              <div className="h-4 w-80 rounded bg-[var(--panel-2)]" />
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {Array.from({ length: 8 }, (_, index) => (
                  <div key={index} className="h-20 rounded-2xl bg-[var(--panel-2)]" />
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {!isBootstrapping && (!data?.profile || showSetupPanel) ? (
          <section className="rounded-3xl border border-[var(--border)] bg-[var(--panel)] p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">{data?.profile ? 'Profile setup' : 'Initial setup'}</h2>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {data?.profile
                    ? 'Adjust calories, training day pattern and baseline data only when needed.'
                    : 'Start with profile, weight and training day pattern.'}
                </p>
              </div>
              {data?.profile ? (
                <button
                  className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-sm font-semibold hover:bg-[#214547]"
                  onClick={() => setShowSetupPanel(false)}
                  type="button"
                >
                  Close
                </button>
              ) : null}
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Field label="Age" value={setup.age} onChange={(value) => setSetup((s) => ({ ...s, age: value }))} />
              <SelectField
                label="Sex"
                value={setup.sex}
                options={[
                  { value: 'male', label: 'Male' },
                  { value: 'female', label: 'Female' },
                ]}
                onChange={(value) => setSetup((s) => ({ ...s, sex: value as 'male' | 'female' }))}
              />
              <Field
                label="Height cm"
                value={setup.height_cm}
                onChange={(value) => setSetup((s) => ({ ...s, height_cm: value }))}
              />
              <Field
                label="Initial weight kg"
                value={setup.initial_weight_kg}
                onChange={(value) => setSetup((s) => ({ ...s, initial_weight_kg: value }))}
              />
              <SelectField
                label="Activity"
                value={setup.activity_level}
                options={[
                  { value: 'sedentary', label: 'Sedentary' },
                  { value: 'light', label: 'Light' },
                  { value: 'moderate', label: 'Moderate' },
                  { value: 'active', label: 'Active' },
                  { value: 'athlete', label: 'Athlete' },
                ]}
                onChange={(value) => setSetup((s) => ({ ...s, activity_level: value }))}
              />
              <Field
                label="Deficit %"
                value={setup.preferred_deficit_pct}
                onChange={(value) => setSetup((s) => ({ ...s, preferred_deficit_pct: value }))}
              />
              <Field
                label="Protein g/kg"
                value={setup.protein_target_per_kg}
                onChange={(value) => setSetup((s) => ({ ...s, protein_target_per_kg: value }))}
              />
              <Field
                label="Fat min g/kg"
                value={setup.fat_min_per_kg}
                onChange={(value) => setSetup((s) => ({ ...s, fat_min_per_kg: value }))}
              />
              <Field
                label="Meals / day"
                value={setup.meals_per_day}
                onChange={(value) => setSetup((s) => ({ ...s, meals_per_day: value }))}
              />
              <Field
                label="Training delta kcal"
                value={setup.training_day_kcal_delta}
                onChange={(value) => setSetup((s) => ({ ...s, training_day_kcal_delta: value }))}
              />
            </div>
            <div className="mt-4">
              <div className="text-sm font-medium">Training days</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {weekdayLabels.map((day) => {
                  const active = setup.training_days.includes(day.value);
                  return (
                    <button
                      key={day.value}
                      className={`rounded-full border px-3 py-1 text-sm ${
                        active
                          ? 'border-emerald-500/50 bg-emerald-500/20 text-white'
                          : 'border-[var(--border)] bg-[var(--panel-2)] text-[var(--muted)]'
                      }`}
                      onClick={() =>
                        setSetup((state) => ({
                          ...state,
                          training_days: active
                            ? state.training_days.filter((entry) => entry !== day.value)
                            : [...state.training_days, day.value].sort(),
                        }))
                      }
                      type="button"
                    >
                      {day.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <button
              className="mt-5 rounded-xl border border-emerald-500/40 bg-emerald-500/20 px-4 py-2 font-semibold hover:bg-emerald-500/30"
              onClick={submitSetup}
              type="button"
            >
              {isPending ? 'Saving...' : 'Create plan'}
            </button>
          </section>
        ) : null}

        {!isBootstrapping && data?.profile ? (
          <>
            <section className="grid gap-4 xl:grid-cols-[1.25fr_0.95fr]">
              <Panel title="Today">
                <div className="grid gap-3 sm:grid-cols-4">
                  <Metric label="Target" value={`${Math.round(today?.target?.kcal_target ?? 0)} kcal`} />
                  <Metric label="Consumed" value={`${Math.round(today?.consumed.calories ?? 0)} kcal`} />
                  <Metric label="Remaining" value={`${Math.round(today?.remaining?.calories ?? 0)} kcal`} />
                  <Metric label="Protein left" value={`${Math.round(today?.remaining?.protein ?? 0)} g`} />
                </div>
                <MacroBar title="Calories" current={today?.consumed.calories ?? 0} target={today?.target?.kcal_target ?? 1} />
                <MacroBar title="Protein" current={today?.consumed.protein ?? 0} target={today?.target?.protein_target ?? 1} />
                <MacroBar title="Carbs" current={today?.consumed.carbs ?? 0} target={today?.target?.carbs_target ?? 1} />
                <MacroBar title="Fat" current={today?.consumed.fat ?? 0} target={today?.target?.fat_target ?? 1} />

                <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">Quick add</div>
                      <div className="text-xs text-[var(--muted)]">Favorites first. One tap inserts a default serving.</div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(data.favorites.length ? data.favorites : data.recentFoods).slice(0, 8).map((food) => (
                      <button
                        key={food.id}
                        className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-sm hover:bg-emerald-500/20"
                        onClick={() => quickAdd(food)}
                        type="button"
                      >
                        {food.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1.1fr]">
                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] p-4">
                    <div className="text-sm font-semibold">Manual log</div>
                    <div className="mt-3 grid gap-3">
                      <SelectField
                        label="Food"
                        value={logState.food_id}
                        options={[
                          { value: '', label: 'Select food' },
                          ...data.foods.map((food) => ({ value: food.id, label: food.name })),
                        ]}
                        onChange={(value) => setLogState((state) => ({ ...state, food_id: value }))}
                      />
                      <SelectField
                        label="Meal"
                        value={logState.meal_type}
                        options={[
                          { value: 'breakfast', label: 'Breakfast' },
                          { value: 'lunch', label: 'Lunch' },
                          { value: 'dinner', label: 'Dinner' },
                          { value: 'snack', label: 'Snack' },
                        ]}
                        onChange={(value) => setLogState((state) => ({ ...state, meal_type: value as LogState['meal_type'] }))}
                      />
                      <Field
                        label="Grams"
                        value={logState.grams_total}
                        onChange={(value) => setLogState((state) => ({ ...state, grams_total: value }))}
                      />
                      <Field
                        label="Quantity"
                        value={logState.quantity}
                        onChange={(value) => setLogState((state) => ({ ...state, quantity: value }))}
                      />
                    </div>
                    <button
                      className="mt-4 rounded-xl border border-sky-500/40 bg-sky-500/15 px-4 py-2 text-sm font-semibold hover:bg-sky-500/25"
                      onClick={submitLog}
                      type="button"
                    >
                      Add food
                    </button>
                  </div>

                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-semibold">Meals logged today</div>
                        <div className="text-xs text-[var(--muted)]">Snapshots stay immutable even if the food changes later.</div>
                      </div>
                    </div>
                    <div className="mt-3 space-y-2">
                      {today?.logs.length ? (
                        today.logs.map((log) => (
                          <div key={log.id} className="rounded-xl border border-[var(--border)] px-3 py-2">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <div className="font-medium">{log.custom_food_name ?? data.foods.find((food) => food.id === log.food_id)?.name ?? 'Food'}</div>
                                <div className="text-xs text-[var(--muted)]">
                                  {log.meal_type} • {Math.round(log.grams_total)} g • {Math.round(log.calories_total)} kcal
                                </div>
                              </div>
                              <button
                                className="rounded-md border border-red-500/30 px-2 py-1 text-xs text-red-100 hover:bg-red-500/10"
                                onClick={() => deleteLog(log.id)}
                                type="button"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-xl border border-dashed border-[var(--border)] px-3 py-5 text-sm text-[var(--muted)]">
                          No food logged yet for today.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </Panel>

              <Panel title="Tomorrow">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Metric label="Target" value={`${Math.round(tomorrow?.target?.kcal_target ?? 0)} kcal`} />
                  <Metric label="Protein" value={`${Math.round(tomorrow?.target?.protein_target ?? 0)} g`} />
                  <Metric label="Day type" value={tomorrow?.target?.day_type ?? '—'} />
                </div>
                <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] p-4">
                  <div className="text-sm font-semibold">Adjustment explanation</div>
                  <div className="mt-2 text-sm text-[var(--muted)]">
                    {tomorrow?.target?.adjustment_reason ??
                      (tomorrow?.adjustments.length
                        ? tomorrow.adjustments[0].reason
                        : 'No aggressive correction. Tomorrow follows the current weekly plan.')}
                  </div>
                </div>
                <div className="mt-4 space-y-3">
                  {tomorrow?.planItems.length ? (
                    tomorrow.planItems.map((item) => (
                      <div key={item.id} className="rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold capitalize">{item.meal_slot}</div>
                            <div className="mt-1 text-sm text-[var(--muted)]">{item.suggested_food_text}</div>
                          </div>
                          <div className="text-right text-sm">
                            <div className="font-semibold">{Math.round(item.suggested_calories)} kcal</div>
                            <div className="text-xs text-[var(--muted)]">
                              P {Math.round(item.suggested_protein)} / C {Math.round(item.suggested_carbs)} / F {Math.round(item.suggested_fat)}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-xl border border-dashed border-[var(--border)] px-3 py-5 text-sm text-[var(--muted)]">
                      Tomorrow meal suggestions appear after setup and recompute.
                    </div>
                  )}
                </div>
              </Panel>
            </section>

            <section className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr_1fr]">
              <Panel title="Weight & trend">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                  <Metric label="Latest" value={data.trends.latest ? `${data.trends.latest.weight_kg} kg` : '—'} />
                  <Metric label="7d avg" value={data.trends.avg7 ? `${data.trends.avg7} kg` : '—'} />
                  <Metric label="14d avg" value={data.trends.avg14 ? `${data.trends.avg14} kg` : '—'} />
                  <Metric label="30d avg" value={data.trends.avg30 ? `${data.trends.avg30} kg` : '—'} />
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Field
                    label="Date"
                    type="date"
                    value={weightState.date}
                    onChange={(value) => setWeightState((state) => ({ ...state, date: value }))}
                  />
                  <Field
                    label="Weight kg"
                    value={weightState.weight_kg}
                    onChange={(value) => setWeightState((state) => ({ ...state, weight_kg: value }))}
                  />
                </div>
                <button
                  className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/15 px-4 py-2 text-sm font-semibold hover:bg-amber-500/25"
                  onClick={submitWeight}
                  type="button"
                >
                  Log weight
                </button>
              </Panel>

              <Panel title="Week compliance">
                <div className="space-y-3">
                  {data.week.length ? (
                    data.week.map((day) => (
                      <div key={day.date} className="rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="font-medium">{day.date}</div>
                            <div className="text-xs text-[var(--muted)] capitalize">
                              {day.target?.day_type ?? 'rest'} • {day.target?.plan_status ?? 'planned'}
                            </div>
                          </div>
                          <div className="text-right text-sm">
                            <div>{Math.round(day.consumed.calories)} / {Math.round(day.target?.kcal_target ?? 0)} kcal</div>
                            <div className="text-xs text-[var(--muted)]">remaining {Math.round(day.remaining?.calories ?? 0)} kcal</div>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-xl border border-dashed border-[var(--border)] px-3 py-5 text-sm text-[var(--muted)]">
                      Week summary appears after setup.
                    </div>
                  )}
                </div>
              </Panel>

              <Panel title="Food library">
                <div className="grid gap-3">
                  <Field
                    label="Food name"
                    type="text"
                    value={foodState.name}
                    onChange={(value) => setFoodState((state) => ({ ...state, name: value }))}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Calories / 100g" value={foodState.calories} onChange={(value) => setFoodState((state) => ({ ...state, calories: value }))} />
                    <Field label="Protein" value={foodState.protein} onChange={(value) => setFoodState((state) => ({ ...state, protein: value }))} />
                    <Field label="Carbs" value={foodState.carbs} onChange={(value) => setFoodState((state) => ({ ...state, carbs: value }))} />
                    <Field label="Fat" value={foodState.fat} onChange={(value) => setFoodState((state) => ({ ...state, fat: value }))} />
                  </div>
                  <Field
                    label="Default serving grams"
                    value={foodState.default_serving_grams}
                    onChange={(value) => setFoodState((state) => ({ ...state, default_serving_grams: value }))}
                  />
                  <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
                    <input
                      checked={foodState.is_favorite}
                      onChange={(event) => setFoodState((state) => ({ ...state, is_favorite: event.target.checked }))}
                      type="checkbox"
                    />
                    Pin as favorite
                  </label>
                  <button
                    className="rounded-xl border border-cyan-500/40 bg-cyan-500/15 px-4 py-2 text-sm font-semibold hover:bg-cyan-500/25"
                    onClick={submitFood}
                    type="button"
                  >
                    Save food
                  </button>
                </div>
                <div className="mt-4 max-h-80 space-y-2 overflow-auto pr-1">
                  {data.foods.map((food) => (
                    <div key={food.id} className="rounded-xl border border-[var(--border)] px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-medium">{food.name}</div>
                          <div className="text-xs text-[var(--muted)]">
                            {Math.round(food.calories)} kcal • P {Math.round(food.protein)} / C {Math.round(food.carbs)} / F {Math.round(food.fat)}
                          </div>
                        </div>
                        {food.is_favorite ? <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-xs">favorite</span> : null}
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-[var(--border)] bg-[var(--panel)] p-5 shadow-sm">
      <h2 className="text-xl font-semibold">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--muted)]">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'number',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <div className="mb-1 text-sm font-medium">{label}</div>
      <input
        className="w-full rounded-xl border border-[var(--border)] bg-[#102b2d] px-3 py-2 outline-none ring-0"
        onChange={(event) => onChange(event.target.value)}
        type={type}
        value={value}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block">
      <div className="mb-1 text-sm font-medium">{label}</div>
      <select
        className="w-full rounded-xl border border-[var(--border)] bg-[#102b2d] px-3 py-2 outline-none ring-0"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function MacroBar({ title, current, target }: { title: string; current: number; target: number }) {
  const ratio = target > 0 ? Math.min(1, current / target) : 0;
  return (
    <div className="mt-3">
      <div className="mb-1 flex items-center justify-between text-sm">
        <span>{title}</span>
        <span className="text-[var(--muted)]">
          {Math.round(current)} / {Math.round(target)}
        </span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-[#102b2d]">
        <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-300" style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}
