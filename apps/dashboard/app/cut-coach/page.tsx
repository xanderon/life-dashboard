'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState, useTransition, type ReactNode } from 'react';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { humanizeAdjustmentReason } from '@/lib/cutCoach';
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
  brand: string;
  barcode: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  default_serving_grams: string;
  package_size_grams: string;
  serving_label: string;
  is_favorite: boolean;
};

type ScanReviewState = {
  food: CutCoachFoodRow;
  barcode: string;
  imported: boolean;
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

const quickAddSuggestions = [
  '5 eggs',
  'kefir',
  'lipie',
  'telemea',
  'cascaval',
  'protein bar',
  'eugenie',
  'covrig',
  'chicken + potatoes',
  'standard breakfast',
];

const weekdayLabels = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
];

const mealSections: Array<{ value: LogState['meal_type']; label: string }> = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
];

export default function CutCoachPage() {
  const [data, setData] = useState<BootstrapPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [showSetupPanel, setShowSetupPanel] = useState(false);
  const [setup, setSetup] = useState<SetupState>(defaultSetup);
  const [logState, setLogState] = useState<LogState>(defaultLog);
  const [weightState, setWeightState] = useState<WeightState>({
    date: new Date().toISOString().slice(0, 10),
    weight_kg: '',
  });
  const [foodState, setFoodState] = useState<FoodState>({
    name: '',
    brand: '',
    barcode: '',
    calories: '',
    protein: '',
    carbs: '',
    fat: '',
    default_serving_grams: '100',
    package_size_grams: '',
    serving_label: '',
    is_favorite: true,
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CutCoachFoodRow[]>([]);
  const [selectedFood, setSelectedFood] = useState<CutCoachFoodRow | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [searchBusy, setSearchBusy] = useState(false);
  const [scanReview, setScanReview] = useState<ScanReviewState | null>(null);

  async function loadBootstrap(options?: { silent?: boolean }) {
    setError(null);
    if (!options?.silent) {
      setIsBootstrapping(true);
    }
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
    setSearchResults([]);
    setSelectedFood((current) => {
      if (!current) return null;
      return payload.foods.find((food) => food.id === current.id) ?? current;
    });
    if (!options?.silent) {
      setIsBootstrapping(false);
    }
  }

  useEffect(() => {
    void (async () => {
      await loadBootstrap();
    })();
  }, []);

  useEffect(() => {
    if (!data?.foods) return;
    const trimmed = searchQuery.trim().toLowerCase();
    if (!trimmed) {
      setSearchResults([]);
      return;
    }

    setSearchBusy(true);
    const timer = window.setTimeout(async () => {
      try {
        const local = data.foods
          .filter((food) => {
            const hay = `${food.name} ${food.brand ?? ''} ${food.barcode ?? ''}`.toLowerCase();
            return hay.includes(trimmed);
          })
          .slice(0, 12);

        if (local.length >= 8 || /^\d{6,14}$/.test(trimmed) === false) {
          setSearchResults(local);
          setSearchBusy(false);
          return;
        }

        const res = await fetch(`/api/cut-coach/foods/search?q=${encodeURIComponent(trimmed)}`, {
          cache: 'no-store',
        });
        if (!res.ok) {
          setSearchResults(local);
          setSearchBusy(false);
          return;
        }
        const payload = (await res.json()) as { foods: CutCoachFoodRow[] };
        setSearchResults(payload.foods);
      } finally {
        setSearchBusy(false);
      }
    }, 180);

    return () => {
      window.clearTimeout(timer);
    };
  }, [data?.foods, searchQuery]);

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
    if (!logState.food_id) {
      setError('Pick a food or product first.');
      return;
    }
    mutate(async () => {
      const payload = (await postJson('/api/cut-coach/logs', 'POST', {
        ...logState,
        quantity: Number(logState.quantity),
        grams_total: Number(logState.grams_total),
      })) as { summary?: DaySnapshot };
      const summary = payload.summary;
      if (summary) {
        setData((current) => {
          if (!current) return current;
          return { ...current, today: summary };
        });
      }
      setLogState(defaultLog);
      setScanReview(null);
      setSelectedFood(null);
      setSearchQuery('');
      setSearchResults([]);
      setIsComposerOpen(false);
      await loadBootstrap({ silent: true });
    });
  }

  function openComposer(food?: CutCoachFoodRow | null, mealType?: LogState['meal_type']) {
    setIsComposerOpen(true);
    if (mealType) {
      setLogState((state) => ({ ...state, meal_type: mealType }));
    }
    if (food) {
      selectFood(food);
      setSearchQuery(food.name);
    }
  }

  function selectFood(food: CutCoachFoodRow) {
    setSelectedFood(food);
    setScanReview(null);
    setLogState((state) => ({
      ...state,
      food_id: food.id,
      grams_total: String(Math.round(food.default_serving_grams ?? food.package_size_grams ?? 100)),
      quantity: '1',
    }));
  }

  function applyQuantityPreset(mode: '30g' | '50g' | '100g' | '150g' | '200g' | 'serving' | 'half-pack' | 'pack') {
    if (!selectedFood) return;
    const serving = selectedFood.default_serving_grams ?? 100;
    const pack = selectedFood.package_size_grams ?? selectedFood.default_serving_grams ?? 100;
    const grams =
      mode === '30g'
        ? 30
        : mode === '50g'
          ? 50
          : mode === '100g'
            ? 100
            : mode === '150g'
              ? 150
              : mode === '200g'
                ? 200
                : mode === 'serving'
                  ? serving
                  : mode === 'half-pack'
                    ? Math.round(pack / 2)
                    : pack;
    setLogState((state) => ({
      ...state,
      food_id: selectedFood.id,
      grams_total: String(grams),
      quantity: mode === 'half-pack' ? '0.5' : '1',
    }));
  }

  function deleteLog(id: string) {
    mutate(async () => {
      const payload = (await postJson(`/api/cut-coach/logs/${id}`, 'DELETE')) as { summary?: DaySnapshot };
      const summary = payload.summary;
      if (summary) {
        setData((current) => {
          if (!current) return current;
          return { ...current, today: summary };
        });
      }
      await loadBootstrap({ silent: true });
    });
  }

  function submitWeight() {
    mutate(async () => {
      await postJson('/api/cut-coach/weights', 'POST', {
        ...weightState,
        weight_kg: Number(weightState.weight_kg),
      });
      await loadBootstrap({ silent: true });
    });
  }

  function submitFood() {
    mutate(async () => {
      await postJson('/api/cut-coach/foods', 'POST', {
        ...foodState,
        brand: foodState.brand || null,
        barcode: foodState.barcode || null,
        calories: Number(foodState.calories),
        protein: Number(foodState.protein),
        carbs: Number(foodState.carbs),
        fat: Number(foodState.fat),
        default_serving_grams: foodState.default_serving_grams ? Number(foodState.default_serving_grams) : null,
        package_size_grams: foodState.package_size_grams ? Number(foodState.package_size_grams) : null,
        serving_label: foodState.serving_label || null,
        source_kind: foodState.barcode ? 'product' : 'generic',
        unit_type: foodState.barcode ? 'serving' : '100g',
      });
      setFoodState({
        name: '',
        brand: '',
        barcode: '',
        calories: '',
        protein: '',
        carbs: '',
        fat: '',
        default_serving_grams: '100',
        package_size_grams: '',
        serving_label: '',
        is_favorite: true,
      });
      await loadBootstrap({ silent: true });
    });
  }

  function recomputePlan() {
    mutate(async () => {
      await postJson('/api/cut-coach/plans/recompute', 'POST');
      await loadBootstrap({ silent: true });
    });
  }

  async function handleBarcodeDetected(barcode: string) {
    const payload = (await postJson('/api/cut-coach/foods/scan', 'POST', { barcode })) as {
      food: CutCoachFoodRow;
      imported?: boolean;
    };
    setSelectedFood(payload.food);
    setLogState((state) => ({
      ...state,
      food_id: payload.food.id,
      grams_total: String(Math.round(payload.food.default_serving_grams ?? payload.food.package_size_grams ?? 100)),
      quantity: '1',
    }));
    setSearchQuery(payload.food.name);
    setScanReview({
      food: payload.food,
      barcode,
      imported: Boolean(payload.imported),
    });
    setIsComposerOpen(true);
  }

  const today = data?.today;
  const tomorrow = data?.tomorrow;
  const loggedWithRunningTotals =
    today?.logs.reduce<Array<CutCoachFoodLogRow & { runningCalories: number }>>((acc, log) => {
      const previous = acc.at(-1)?.runningCalories ?? 0;
      acc.push({ ...log, runningCalories: previous + log.calories_total });
      return acc;
    }, []) ?? [];
  const quickAddFoods = (data?.favorites.length ? data.favorites : data?.recentFoods ?? []).slice(0, 8);
  const mealGroups = mealSections.map((section) => {
    const items = loggedWithRunningTotals.filter((log) => log.meal_type === section.value);
    const calories = items.reduce((sum, item) => sum + item.calories_total, 0);
    return { ...section, items, calories };
  });
  const remainingCalories = Math.round(today?.remaining?.calories ?? 0);
  const consumedCalories = Math.round(today?.consumed.calories ?? 0);
  const targetCalories = Math.round(today?.target?.kcal_target ?? 0);
  const calorieRatio =
    targetCalories > 0 ? Math.max(0, Math.min(100, Math.round((consumedCalories / targetCalories) * 100))) : 0;

  return (
    <main className="cut-coach-shell min-h-screen bg-[linear-gradient(180deg,#f6f8fb_0%,#eef3f8_45%,#e6edf5_100%)] p-4 text-slate-900 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <section className="grid gap-4 xl:grid-cols-[0.88fr_1.12fr]">
          <div className="space-y-4">
            <div className="cc-card rounded-[28px] border border-slate-200/70 bg-[radial-gradient(circle_at_top_left,#ffffff_0%,#f7fafc_45%,#edf3f8_100%)] p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-600">Today</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {consumedCalories} eaten / {targetCalories} target
                    {today?.target?.day_type ? ` • ${today.target.day_type}` : ''}
                  </div>
                </div>
                <div className="rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-500">
                  {calorieRatio}% used
                </div>
              </div>

              <div className="mt-4 flex items-center gap-4">
                <div
                  className="relative flex h-36 w-36 shrink-0 items-center justify-center rounded-full border border-white/70 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.96),rgba(241,245,249,0.92)_58%,rgba(226,232,240,0.86)_100%)] shadow-[inset_0_1px_2px_rgba(255,255,255,0.8),0_16px_48px_rgba(15,23,42,0.10)] sm:h-40 sm:w-40"
                  style={{
                    backgroundImage: `conic-gradient(from 270deg, #0ea5e9 0% ${calorieRatio}%, rgba(148,163,184,0.18) ${calorieRatio}% 100%)`,
                  }}
                >
                  <div className="absolute inset-[9px] rounded-full bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.98),rgba(248,250,252,0.95)_62%,rgba(241,245,249,0.9)_100%)]" />
                  <div className="relative z-10 text-center">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Remaining</div>
                    <div className="mt-1 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">{remainingCalories}</div>
                    <div className="mt-0.5 text-xs text-slate-500">kcal</div>
                  </div>
                </div>

                <div className="min-w-0 flex-1 space-y-2">
                  <Metric
                    label="Protein"
                    value={`${Math.round(today?.consumed.protein ?? 0)} / ${Math.round(today?.target?.protein_target ?? 0)}`}
                  />
                  <Metric
                    label="Carbs"
                    value={`${Math.round(today?.consumed.carbs ?? 0)} / ${Math.round(today?.target?.carbs_target ?? 0)}`}
                  />
                  <Metric
                    label="Fat"
                    value={`${Math.round(today?.consumed.fat ?? 0)} / ${Math.round(today?.target?.fat_target ?? 0)}`}
                  />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  className="rounded-2xl border border-sky-300 bg-sky-500 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-sky-600"
                  onClick={() => openComposer()}
                  type="button"
                >
                  Add food
                </button>
                <button
                  className="rounded-2xl border border-violet-200 bg-violet-600 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-700"
                  onClick={() => setScannerOpen(true)}
                  type="button"
                >
                  Scan barcode
                </button>
              </div>
            </div>

            <div className="cc-card rounded-[24px] border border-slate-200/70 p-4 shadow-[0_16px_36px_rgba(15,23,42,0.06)]">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-900">Quick add</div>
                <button
                  className="rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-white"
                  onClick={() => openComposer()}
                  type="button"
                >
                  Search all
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {quickAddFoods.map((food) => (
                  <button
                    key={food.id}
                    className="rounded-2xl border border-slate-200 bg-white/85 px-3 py-2 text-sm font-medium text-slate-800 shadow-sm transition hover:border-sky-300 hover:bg-sky-50"
                    onClick={() => openComposer(food)}
                    type="button"
                  >
                    {food.name}
                  </button>
                ))}
                {quickAddSuggestions
                  .filter(
                    (label) =>
                      !quickAddFoods.some((food) => food.name.toLowerCase().includes(label.toLowerCase()))
                  )
                  .slice(0, 4)
                  .map((label) => (
                    <button
                      key={label}
                      className="rounded-2xl border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500 transition hover:border-slate-400 hover:bg-white/70 hover:text-slate-800"
                      onClick={() => {
                        setSearchQuery(label);
                        setSelectedFood(null);
                        setScanReview(null);
                        setIsComposerOpen(true);
                      }}
                      type="button"
                    >
                      {label}
                    </button>
                  ))}
              </div>
            </div>

            {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
          </div>

          <div className="cc-card rounded-[28px] border border-slate-200/70 bg-[radial-gradient(circle_at_top_left,#ffffff_0%,#f7fafc_45%,#edf3f8_100%)] p-4 shadow-[0_20px_60px_rgba(15,23,42,0.08)] sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-950">Meals</div>
                <div className="text-xs text-slate-500">Breakfast, lunch, dinner, snack.</div>
              </div>
              <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                {loggedWithRunningTotals.length} items
              </div>
            </div>
            <div className="space-y-3">
              {mealGroups.map((group) => (
                <div key={group.value} className="cc-subcard rounded-[24px] border border-slate-200 bg-white/75 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-base font-semibold text-slate-950">{group.label}</div>
                      <div className="text-xs text-slate-500">
                        {Math.round(group.calories)} kcal {group.items.length ? `• ${group.items.length} items` : ''}
                      </div>
                    </div>
                    <button
                      className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-xl font-medium text-slate-700 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700"
                      onClick={() => openComposer(null, group.value)}
                      type="button"
                    >
                      +
                    </button>
                  </div>

                  <div className="mt-3 space-y-2">
                    {group.items.length ? (
                      group.items.map((log) => (
                        <div key={log.id} className="rounded-2xl border border-slate-200/90 bg-white/80 px-3 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate font-medium text-slate-900">
                                {log.custom_food_name ?? data?.foods.find((food) => food.id === log.food_id)?.name ?? 'Food'}
                              </div>
                              <div className="mt-0.5 text-xs text-slate-500">
                                {Math.round(log.grams_total)} g • {Math.round(log.calories_total)} kcal
                              </div>
                            </div>
                            <button
                              className="rounded-lg border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                              onClick={() => deleteLog(log.id)}
                              type="button"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <button
                        className="flex w-full items-center justify-between rounded-2xl border border-dashed border-slate-300 px-3 py-3 text-left text-sm text-slate-500 hover:border-sky-300 hover:bg-sky-50 hover:text-slate-700"
                        onClick={() => openComposer(null, group.value)}
                        type="button"
                      >
                        <span>Nothing here yet</span>
                        <span className="font-medium text-sky-600">Add</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {isBootstrapping ? (
          <section className="cc-card rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <div className="animate-pulse space-y-3">
              <div className="h-5 w-48 rounded bg-slate-200" />
              <div className="h-4 w-80 rounded bg-slate-200" />
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {Array.from({ length: 8 }, (_, index) => (
                  <div key={index} className="h-20 rounded-2xl bg-slate-200" />
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {!isBootstrapping && (!data?.profile || showSetupPanel) ? (
          <section className="cc-card rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">{data?.profile ? 'Profile setup' : 'Initial setup'}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {data?.profile
                    ? 'Change profile only when needed.'
                    : 'Start with profile, weight and training day pattern.'}
                </p>
              </div>
              {data?.profile ? (
                <button
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
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
                          ? 'border-sky-400 bg-sky-500 text-white'
                          : 'border-slate-200 bg-slate-50 text-slate-500'
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
              className="mt-5 rounded-xl border border-sky-300 bg-sky-500 px-4 py-2 font-semibold text-white hover:bg-sky-600"
              onClick={submitSetup}
              type="button"
            >
              {isPending ? 'Saving...' : 'Create plan'}
            </button>
          </section>
        ) : null}

        {!isBootstrapping && data?.profile ? (
          <>
            {scanReview ? (
              <section className="cc-card rounded-[28px] border border-emerald-200 bg-[linear-gradient(135deg,#ecfdf5_0%,#f0fdf4_35%,#ffffff_100%)] p-5 shadow-[0_18px_40px_rgba(16,185,129,0.12)]">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-start gap-4">
                    {scanReview.food.image_url ? (
                      <Image
                        alt={scanReview.food.name}
                        className="h-20 w-20 rounded-2xl border border-emerald-100 object-cover"
                        height={80}
                        src={scanReview.food.image_url}
                        width={80}
                      />
                    ) : (
                      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-emerald-100 text-2xl text-emerald-700">▣</div>
                    )}
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-700">Scanned product ready</div>
                      <div className="mt-1 text-2xl font-semibold text-slate-950">{scanReview.food.name}</div>
                      <div className="mt-1 text-sm text-slate-600">
                        {scanReview.food.brand ? `${scanReview.food.brand} • ` : ''}
                        barcode {scanReview.barcode}
                        {scanReview.imported ? ' • imported now' : ' • found in your foods'}
                      </div>
                      <div className="mt-2 text-sm text-slate-700">
                        {Math.round(scanReview.food.calories)} kcal • P {Math.round(scanReview.food.protein)} / C {Math.round(scanReview.food.carbs)} / F {Math.round(scanReview.food.fat)}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                      onClick={() => setScanReview(null)}
                      type="button"
                    >
                      Dismiss
                    </button>
                    <button
                      className="rounded-xl border border-emerald-300 bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600"
                      onClick={() => {
                        document.getElementById('cut-coach-log-composer')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }}
                      type="button"
                    >
                      Continue to quantity
                    </button>
                  </div>
                </div>
              </section>
            ) : null}

            <section className="grid gap-4">
              <Panel title="Tomorrow">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Metric label="Target" value={`${Math.round(tomorrow?.target?.kcal_target ?? 0)} kcal`} />
                  <Metric label="Protein" value={`${Math.round(tomorrow?.target?.protein_target ?? 0)} g`} />
                  <Metric label="Day type" value={tomorrow?.target?.day_type ?? '—'} />
                </div>
                <div className="cc-subcard mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-sm font-semibold">Adjustment explanation</div>
                  <div className="mt-2 text-sm text-slate-600">
                    {humanizeAdjustmentReason(
                      tomorrow?.target?.adjustment_reason ??
                        tomorrow?.adjustments[0]?.reason ??
                        null,
                      'tomorrow'
                    )}
                  </div>
                </div>
                <div className="mt-4 space-y-3">
                  {tomorrow?.planItems.length ? (
                    tomorrow.planItems.map((item) => (
                      <div key={item.id} className="cc-subcard rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold capitalize">{item.meal_slot}</div>
                            <div className="mt-1 text-sm text-slate-500">{item.suggested_food_text}</div>
                          </div>
                          <div className="text-right text-sm">
                            <div className="font-semibold">{Math.round(item.suggested_calories)} kcal</div>
                            <div className="text-xs text-slate-500">
                              P {Math.round(item.suggested_protein)} / C {Math.round(item.suggested_carbs)} / F {Math.round(item.suggested_fat)}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-300 px-3 py-5 text-sm text-slate-500">
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
                <div className="cc-subcard mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                  {data.trends.delta7 == null
                    ? 'Trend note appears after more weight entries.'
                    : data.trends.delta7 > 0.15
                      ? `Average weight is down ${data.trends.delta7.toFixed(1)} kg vs the previous week.`
                      : data.trends.delta7 < -0.15
                        ? `Average weight is up ${Math.abs(data.trends.delta7).toFixed(1)} kg vs the previous week.`
                        : 'Trend is mostly flat this week.'}
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
                      <div key={day.date} className="cc-subcard rounded-2xl border border-slate-200 bg-slate-50 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="font-medium">{day.date}</div>
                            <div className="text-xs text-slate-500 capitalize">
                              {day.target?.day_type ?? 'rest'} • {day.target?.plan_status ?? 'planned'}
                            </div>
                          </div>
                          <div className="text-right text-sm">
                            <div>{Math.round(day.consumed.calories)} / {Math.round(day.target?.kcal_target ?? 0)} kcal</div>
                            <div className="text-xs text-slate-500">remaining {Math.round(day.remaining?.calories ?? 0)} kcal</div>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-300 px-3 py-5 text-sm text-slate-500">
                      Week summary appears after setup.
                    </div>
                  )}
                </div>
              </Panel>

              <Panel title="My foods">
                <div className="cc-subcard rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-sm font-semibold">Add or edit food</div>
                  <div className="mt-1 text-xs text-slate-500">Generic foods and barcode products.</div>
                </div>
                <div className="mt-4 grid gap-3">
                  <Field
                    label="Food name"
                    type="text"
                    value={foodState.name}
                    onChange={(value) => setFoodState((state) => ({ ...state, name: value }))}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <Field
                      label="Brand"
                      type="text"
                      value={foodState.brand}
                      onChange={(value) => setFoodState((state) => ({ ...state, brand: value }))}
                    />
                    <Field
                      label="Barcode"
                      type="text"
                      value={foodState.barcode}
                      onChange={(value) => setFoodState((state) => ({ ...state, barcode: value }))}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Calories / 100g" value={foodState.calories} onChange={(value) => setFoodState((state) => ({ ...state, calories: value }))} />
                    <Field label="Protein" value={foodState.protein} onChange={(value) => setFoodState((state) => ({ ...state, protein: value }))} />
                    <Field label="Carbs" value={foodState.carbs} onChange={(value) => setFoodState((state) => ({ ...state, carbs: value }))} />
                    <Field label="Fat" value={foodState.fat} onChange={(value) => setFoodState((state) => ({ ...state, fat: value }))} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field
                      label="Default serving grams"
                      value={foodState.default_serving_grams}
                      onChange={(value) => setFoodState((state) => ({ ...state, default_serving_grams: value }))}
                    />
                    <Field
                      label="Package size grams"
                      value={foodState.package_size_grams}
                      onChange={(value) => setFoodState((state) => ({ ...state, package_size_grams: value }))}
                    />
                  </div>
                  <Field
                    label="Serving label"
                    type="text"
                    value={foodState.serving_label}
                    onChange={(value) => setFoodState((state) => ({ ...state, serving_label: value }))}
                  />
                  <label className="flex items-center gap-2 text-sm text-slate-500">
                    <input
                      checked={foodState.is_favorite}
                      onChange={(event) => setFoodState((state) => ({ ...state, is_favorite: event.target.checked }))}
                      type="checkbox"
                    />
                    Pin as favorite
                  </label>
                  <button
                    className="rounded-xl border border-violet-300 bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"
                    onClick={submitFood}
                    type="button"
                  >
                    Save food
                  </button>
                </div>
                <div className="mt-4 max-h-80 space-y-2 overflow-auto pr-1">
                  {data.foods.map((food) => (
                    <div key={food.id} className="rounded-xl border border-slate-200 px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-medium">{food.name}</div>
                          <div className="text-xs text-slate-500">
                            {Math.round(food.calories)} kcal • P {Math.round(food.protein)} / C {Math.round(food.carbs)} / F {Math.round(food.fat)}
                          </div>
                          <div className="mt-1 text-[11px] text-slate-500">
                            {food.source_kind === 'generic' ? 'generic food' : 'barcode product'}
                            {food.barcode ? ` • ${food.barcode}` : ''}
                          </div>
                        </div>
                        {food.is_favorite ? <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-xs">favorite</span> : null}
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
            </section>

            <Panel title="Controls">
              <div className="grid gap-2 sm:grid-cols-3">
                {data?.profile ? (
                  <button
                    className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    onClick={() => setShowSetupPanel((value) => !value)}
                    type="button"
                  >
                    {showSetupPanel ? 'Hide settings' : 'Settings'}
                  </button>
                ) : null}
                <button
                  className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  onClick={recomputePlan}
                  type="button"
                >
                  {isPending ? 'Working...' : 'Refresh plan'}
                </button>
                <Link
                  className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  href="/"
                >
                  Back to dashboard
                </Link>
              </div>
            </Panel>
          </>
        ) : null}
      </div>
      {isComposerOpen ? (
        <AddFoodDrawer
          isPending={isPending}
          logState={logState}
          onClose={() => {
            setIsComposerOpen(false);
            setScanReview(null);
          }}
          onMealChange={(value) => setLogState((state) => ({ ...state, meal_type: value }))}
          onQuantityChange={(value) => setLogState((state) => ({ ...state, quantity: value }))}
          onSave={submitLog}
          onScan={() => setScannerOpen(true)}
          onSearchChange={setSearchQuery}
          onSelectFood={selectFood}
          onGramsChange={(value) => setLogState((state) => ({ ...state, grams_total: value }))}
          onUsePreset={applyQuantityPreset}
          scanReview={scanReview}
          searchBusy={searchBusy}
          searchQuery={searchQuery}
          searchResults={searchResults}
          selectedFood={selectedFood}
        />
      ) : null}
      {scannerOpen ? (
        <BarcodeScanner onClose={() => setScannerOpen(false)} onDetected={handleBarcodeDetected} />
      ) : null}
      <style jsx global>{`
        .cut-coach-shell,
        .cc-drawer {
          --cc-bg: #eef3f8;
          --cc-surface: #ffffff;
          --cc-surface-2: #f8fafc;
          --cc-border: #dbe4ee;
          --cc-text: #0f172a;
          --cc-muted: #64748b;
          --cc-shadow: 0 18px 40px rgba(15, 23, 42, 0.06);
        }

        @media (prefers-color-scheme: dark) {
          .cut-coach-shell,
          .cc-drawer {
            --cc-bg: #12161d;
            --cc-surface: #181d26;
            --cc-surface-2: #202634;
            --cc-border: #31384a;
            --cc-text: #eef2f7;
            --cc-muted: #a2aec2;
            --cc-shadow: 0 24px 64px rgba(2, 6, 23, 0.38);
          }
        }

        .cut-coach-shell {
          background: linear-gradient(180deg, var(--cc-bg) 0%, color-mix(in srgb, var(--cc-bg) 88%, #ffffff 12%) 100%) !important;
          color: var(--cc-text) !important;
        }

        .cut-coach-shell .cc-card,
        .cc-drawer .cc-card {
          background: linear-gradient(180deg, color-mix(in srgb, var(--cc-surface) 96%, white 4%) 0%, var(--cc-surface) 100%) !important;
          border-color: var(--cc-border) !important;
          box-shadow: var(--cc-shadow) !important;
          color: var(--cc-text) !important;
        }

        .cut-coach-shell .cc-subcard,
        .cc-drawer .cc-subcard,
        .cut-coach-shell .cc-stat {
          background: var(--cc-surface-2) !important;
          border-color: var(--cc-border) !important;
          color: var(--cc-text) !important;
        }

        .cut-coach-shell .cc-input,
        .cc-drawer .cc-input {
          background: var(--cc-surface) !important;
          border-color: var(--cc-border) !important;
          color: var(--cc-text) !important;
        }

        .cut-coach-shell .cc-input::placeholder,
        .cc-drawer .cc-input::placeholder {
          color: var(--cc-muted) !important;
        }

        .cut-coach-shell .cc-meter,
        .cc-drawer .cc-meter {
          background: color-mix(in srgb, var(--cc-border) 65%, transparent) !important;
        }

        .cut-coach-shell .text-slate-950,
        .cut-coach-shell .text-slate-900,
        .cc-drawer .text-slate-950,
        .cc-drawer .text-slate-900 {
          color: var(--cc-text) !important;
        }

        .cut-coach-shell .text-slate-700,
        .cut-coach-shell .text-slate-600,
        .cut-coach-shell .text-slate-500,
        .cut-coach-shell .text-slate-400,
        .cc-drawer .text-slate-700,
        .cc-drawer .text-slate-600,
        .cc-drawer .text-slate-500,
        .cc-drawer .text-slate-400 {
          color: var(--cc-muted) !important;
        }

        .cut-coach-shell .border-slate-200,
        .cut-coach-shell .border-slate-300,
        .cc-drawer .border-slate-200,
        .cc-drawer .border-slate-300 {
          border-color: var(--cc-border) !important;
        }

        .cut-coach-shell .bg-white,
        .cc-drawer .bg-white {
          background: var(--cc-surface) !important;
        }

        .cut-coach-shell .bg-slate-50,
        .cut-coach-shell .bg-slate-50\/90,
        .cc-drawer .bg-slate-50,
        .cc-drawer .bg-slate-50\/90 {
          background: var(--cc-surface-2) !important;
        }

        .cut-coach-shell .hover\:bg-slate-50:hover,
        .cc-drawer .hover\:bg-slate-50:hover {
          background: color-mix(in srgb, var(--cc-surface-2) 88%, white 12%) !important;
        }

        .cut-coach-shell .bg-red-50,
        .cc-drawer .bg-red-50 {
          background: color-mix(in srgb, #ef4444 10%, var(--cc-surface) 90%) !important;
        }

        .cut-coach-shell .bg-emerald-50,
        .cc-drawer .bg-emerald-50 {
          background: color-mix(in srgb, #10b981 12%, var(--cc-surface) 88%) !important;
        }
      `}</style>
    </main>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="cc-card rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
      <h2 className="text-xl font-semibold text-slate-950">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="cc-stat rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] px-4 py-2.5">
      <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">{label}</div>
      <div className="mt-0.5 text-base font-semibold text-slate-950 sm:text-lg">{value}</div>
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
      <div className="mb-1 text-sm font-medium text-slate-700">{label}</div>
      <input
        className="cc-input w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 outline-none ring-0 placeholder:text-slate-400"
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
      <div className="mb-1 text-sm font-medium text-slate-700">{label}</div>
      <select
        className="cc-input w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 outline-none ring-0"
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

function AddFoodDrawer({
  isPending,
  logState,
  onClose,
  onMealChange,
  onQuantityChange,
  onSave,
  onScan,
  onSearchChange,
  onSelectFood,
  onGramsChange,
  onUsePreset,
  scanReview,
  searchBusy,
  searchQuery,
  searchResults,
  selectedFood,
}: {
  isPending: boolean;
  logState: LogState;
  onClose: () => void;
  onMealChange: (value: LogState['meal_type']) => void;
  onQuantityChange: (value: string) => void;
  onSave: () => void;
  onScan: () => void;
  onSearchChange: (value: string) => void;
  onSelectFood: (food: CutCoachFoodRow) => void;
  onGramsChange: (value: string) => void;
  onUsePreset: (mode: '30g' | '50g' | '100g' | '150g' | '200g' | 'serving' | 'half-pack' | 'pack') => void;
  scanReview: ScanReviewState | null;
  searchBusy: boolean;
  searchQuery: string;
  searchResults: CutCoachFoodRow[];
  selectedFood: CutCoachFoodRow | null;
}) {
  return (
    <div className="cc-drawer fixed inset-0 z-40 bg-slate-950/45 p-0 backdrop-blur-sm">
      <div className="cc-card absolute inset-x-0 bottom-0 top-12 overflow-auto rounded-t-[32px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f6f9fc_100%)] p-5 shadow-[0_-24px_60px_rgba(15,23,42,0.18)] sm:left-auto sm:right-4 sm:top-4 sm:w-[32rem] sm:rounded-[32px]">
        <div className="mx-auto h-1.5 w-14 rounded-full bg-slate-200 sm:hidden" />
        <div className="mt-4 flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.28em] text-violet-600">Add To Today</div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Choose product, quantity, save.</h2>
            <p className="mt-2 text-sm text-slate-500">Search, scan, pick quantity, save.</p>
          </div>
          <button
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>

        {scanReview ? (
          <div className="cc-subcard mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">Scanned just now</div>
            <div className="mt-2 text-lg font-semibold text-slate-950">{scanReview.food.name}</div>
            <div className="mt-1 text-sm text-slate-600">
              {scanReview.food.brand ? `${scanReview.food.brand} • ` : ''}
              barcode {scanReview.barcode}
              {scanReview.imported ? ' • imported now' : ' • found locally'}
            </div>
          </div>
        ) : null}

        <div className="mt-4 flex gap-2">
          <button
            className="flex-1 rounded-xl border border-violet-200 bg-violet-600 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-700"
            onClick={onScan}
            type="button"
          >
            Scan barcode
          </button>
          <button
            className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            onClick={() => onSearchChange('')}
            type="button"
          >
            Clear search
          </button>
        </div>

        <div className="mt-4 grid gap-3">
          <Field label="Search food or product" type="text" value={searchQuery} onChange={onSearchChange} />
          <SelectField
            label="Meal"
            value={logState.meal_type}
            options={[
              { value: 'breakfast', label: 'Breakfast' },
              { value: 'lunch', label: 'Lunch' },
              { value: 'dinner', label: 'Dinner' },
              { value: 'snack', label: 'Snack' },
            ]}
            onChange={(value) => onMealChange(value as LogState['meal_type'])}
          />

          {selectedFood ? (
            <div className="cc-subcard rounded-2xl border border-sky-200 bg-white p-4 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">Selected</div>
              <div className="mt-2 text-lg font-semibold text-slate-950">{selectedFood.name}</div>
              <div className="mt-1 text-sm text-slate-500">
                {selectedFood.brand ? `${selectedFood.brand} • ` : ''}
                {Math.round(selectedFood.calories)} kcal • P {Math.round(selectedFood.protein)} / C {Math.round(selectedFood.carbs)} / F {Math.round(selectedFood.fat)}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {(['30g', '50g', '100g', '150g', '200g', 'serving'] as const).map((preset) => (
                  <button
                    key={preset}
                    className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-100"
                    onClick={() => onUsePreset(preset)}
                    type="button"
                  >
                    {preset === 'serving'
                      ? selectedFood.serving_label ?? `${Math.round(selectedFood.default_serving_grams ?? 100)}g serving`
                      : preset}
                  </button>
                ))}
                {selectedFood.package_size_grams ? (
                  <>
                    <button
                      className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700 hover:bg-violet-100"
                      onClick={() => onUsePreset('half-pack')}
                      type="button"
                    >
                      half pack
                    </button>
                    <button
                      className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700 hover:bg-violet-100"
                      onClick={() => onUsePreset('pack')}
                      type="button"
                    >
                      full pack
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Grams eaten" value={logState.grams_total} onChange={onGramsChange} />
            <Field label="Quantity" value={logState.quantity} onChange={onQuantityChange} />
          </div>

          {searchBusy ? <div className="text-xs text-slate-500">Searching...</div> : null}
          {searchQuery.trim() ? (
            <div className="max-h-64 space-y-2 overflow-auto pr-1">
              {searchResults.length ? (
                searchResults.map((food) => (
                  <button
                    key={food.id}
                    className={`w-full rounded-xl border px-3 py-3 text-left ${
                      selectedFood?.id === food.id
                        ? 'border-sky-300 bg-sky-50'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                    onClick={() => onSelectFood(food)}
                    type="button"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-medium text-slate-900">
                          {food.name}
                          {food.brand ? <span className="text-slate-500"> • {food.brand}</span> : null}
                        </div>
                        <div className="text-xs text-slate-500">
                          {Math.round(food.calories)} kcal • P {Math.round(food.protein)} / C {Math.round(food.carbs)} / F {Math.round(food.fat)}
                        </div>
                      </div>
                      <div className="text-right text-[11px] uppercase tracking-[0.18em] text-slate-400">
                        {food.source_kind === 'generic' ? 'generic' : 'product'}
                      </div>
                    </div>
                  </button>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500">
                  No matches yet. Add it manually in My foods if needed.
                </div>
              )}
            </div>
          ) : null}
        </div>

        <div className="sticky bottom-0 mt-6 bg-[linear-gradient(180deg,rgba(246,249,252,0)_0%,#f6f9fc_25%,#f6f9fc_100%)] pt-4">
          <button
            className="w-full rounded-2xl border border-emerald-300 bg-emerald-500 px-4 py-4 text-sm font-semibold text-white shadow-sm hover:bg-emerald-600"
            onClick={onSave}
            type="button"
          >
            {isPending ? 'Saving...' : 'Save to today'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* cut coach theme: slate neutrals + cool accents, system light/dark */
