'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { supabase } from '@/lib/supabaseClient';

type FoodQuality = 'healthy' | 'balanced' | 'junk';

type ReceiptItemRow = {
  name: string | null;
  quantity: number | null;
  unit_price: number | null;
  paid_amount: number | null;
  discount: number | null;
  is_food: boolean | null;
  food_quality: FoodQuality | null;
  receipt?: {
    receipt_date: string | null;
    currency: string | null;
  } | null;
};

type ReceiptItemRowRaw = Omit<ReceiptItemRow, 'receipt'> & {
  receipt?:
    | {
        receipt_date: string | null;
        currency: string | null;
      }
    | {
        receipt_date: string | null;
        currency: string | null;
      }[]
    | null;
};

type WeekBucket = {
  key: string;
  label: string;
  healthy: number;
  balanced: number;
  junk: number;
  nonFood: number;
};

const FOOD_BUDGET_SPLIT = {
  healthy: 2200,
  balanced: 1400,
  junk: 400,
  nonFood: 1000,
};

const FOOD_COLORS: Record<FoodQuality, string> = {
  healthy: '#7fd7b8',
  balanced: '#f1c36d',
  junk: '#ff7b7b',
};

function startOfWeek(date: Date) {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatWeekLabel(start: Date) {
  const end = addDays(start, 6);
  const startLabel = start.toLocaleDateString('ro-RO', { day: '2-digit', month: 'short' });
  const endLabel = end.toLocaleDateString('ro-RO', { day: '2-digit', month: 'short' });
  return `${startLabel}–${endLabel}`;
}

function formatMonthLabel(date: Date) {
  return date.toLocaleDateString('ro-RO', { month: 'long', year: 'numeric' });
}

function monthIndex(date: Date) {
  return date.getFullYear() * 12 + date.getMonth();
}

function amountForItem(item: ReceiptItemRow) {
  const paid = item.paid_amount ?? null;
  const fallback =
    item.unit_price != null && item.quantity != null
      ? Number(item.unit_price) * Number(item.quantity)
      : 0;
  const base = paid == null ? fallback : Number(paid);
  const discount = Number(item.discount ?? 0);
  return Math.max(0, base - discount);
}

function pctChange(current: number, prev: number) {
  if (!prev) return null;
  return ((current - prev) / prev) * 100;
}

function fmtTrend(value: number | null) {
  if (value == null || Number.isNaN(value)) return '—';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(0)}%`;
}

export default function ReceiptsChartsPage() {
  const [items, setItems] = useState<ReceiptItemRow[]>([]);
  const [currency, setCurrency] = useState('RON');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [monthOffset, setMonthOffset] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      setErr(null);
      setLoading(true);

      const now = new Date();
      const earliestMonth = new Date(now.getFullYear(), now.getMonth() - 24, 1);
      const lookbackStart = addDays(earliestMonth, -7);

      const { data, error } = await supabase
        .from('receipt_items')
        .select(
          'name,quantity,unit_price,paid_amount,discount,is_food,food_quality,receipt:receipts(receipt_date,currency)'
        )
        .gte('receipt.receipt_date', lookbackStart.toISOString())
        .limit(5000);

      if (!alive) return;
      if (error) {
        setErr(error.message);
        setLoading(false);
        return;
      }

      const nextItems = ((data as ReceiptItemRowRaw[]) ?? []).map((row) => ({
        ...row,
        receipt: Array.isArray(row.receipt) ? row.receipt[0] ?? null : row.receipt ?? null,
      }));
      setItems(nextItems);
      const fallbackCurrency =
        nextItems.find((row) => row.receipt?.currency)?.receipt?.currency ?? 'RON';
      setCurrency(fallbackCurrency);
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, []);

  const now = useMemo(() => new Date(), []);
  const selectedMonthDate = useMemo(
    () => new Date(now.getFullYear(), now.getMonth() + monthOffset, 1),
    [now, monthOffset]
  );
  const selectedMonthLabel = useMemo(() => formatMonthLabel(selectedMonthDate), [selectedMonthDate]);

  const {
    stats,
    weeklyBuckets,
    pieData,
    topJunk,
    insight,
    budgetBars,
    minOffset,
    maxOffset,
  } = useMemo(() => {
    const nowIndex = monthIndex(now);
    let minIndex = nowIndex;
    let maxIndex = nowIndex;
    items.forEach((item) => {
      const receiptDate = item.receipt?.receipt_date ? new Date(item.receipt.receipt_date) : null;
      if (!receiptDate || Number.isNaN(receiptDate.getTime())) return;
      const idx = monthIndex(receiptDate);
      if (idx < minIndex) minIndex = idx;
      if (idx > maxIndex) maxIndex = idx;
    });

    const startOfMonth = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + monthOffset + 1, 1);
    const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() + monthOffset - 1, 1);

    const weekCount = 5;
    const weekStarts: Date[] = [];
    let cursor = startOfWeek(now);
    for (let i = 0; i < weekCount; i += 1) {
      weekStarts.unshift(cursor);
      cursor = addDays(cursor, -7);
    }

    const weekMap = new Map<string, WeekBucket>();
    weekStarts.forEach((start) => {
      const key = start.toISOString().slice(0, 10);
      weekMap.set(key, {
        key,
        label: formatWeekLabel(start),
        healthy: 0,
        balanced: 0,
        junk: 0,
        nonFood: 0,
      });
    });

    let foodMonth = 0;
    let nonFoodMonth = 0;
    let healthyMonth = 0;
    let balancedMonth = 0;
    let junkMonth = 0;

    let foodPrev = 0;
    let nonFoodPrev = 0;
    let healthyPrev = 0;
    let junkPrev = 0;

    const junkMap = new Map<string, { spent: number; count: number }>();

    items.forEach((item) => {
      const receiptDate = item.receipt?.receipt_date ? new Date(item.receipt.receipt_date) : null;
      if (!receiptDate || Number.isNaN(receiptDate.getTime())) return;
      const amount = amountForItem(item);
      const isFood = item.is_food !== false;
      const quality = item.food_quality ?? null;

      if (receiptDate >= startOfMonth && receiptDate < startOfNextMonth) {
        if (isFood) {
          foodMonth += amount;
          if (quality === 'healthy') healthyMonth += amount;
          if (quality === 'balanced') balancedMonth += amount;
          if (quality === 'junk') junkMonth += amount;
        } else {
          nonFoodMonth += amount;
        }

        if (quality === 'junk' && item.name) {
          const key = item.name.trim();
          if (key) {
            const entry = junkMap.get(key) ?? { spent: 0, count: 0 };
            entry.spent += amount;
            entry.count += 1;
            junkMap.set(key, entry);
          }
        }
      } else if (receiptDate >= startOfPrevMonth && receiptDate < startOfMonth) {
        if (isFood) {
          foodPrev += amount;
          if (quality === 'healthy') healthyPrev += amount;
          if (quality === 'junk') junkPrev += amount;
        } else {
          nonFoodPrev += amount;
        }
      }

      const weekKey = startOfWeek(receiptDate).toISOString().slice(0, 10);
      const bucket = weekMap.get(weekKey);
      if (bucket) {
        if (isFood) {
          if (quality === 'healthy') bucket.healthy += amount;
          else if (quality === 'balanced') bucket.balanced += amount;
          else if (quality === 'junk') bucket.junk += amount;
        } else {
          bucket.nonFood += amount;
        }
      }
    });

    const weeklyBuckets = Array.from(weekMap.values());
    const totalFood = Math.max(foodMonth, 0);
    const healthyPct = totalFood ? (healthyMonth / totalFood) * 100 : 0;
    const junkPct = totalFood ? (junkMonth / totalFood) * 100 : 0;
    const healthyPrevPct = foodPrev ? (healthyPrev / foodPrev) * 100 : 0;
    const junkPrevPct = foodPrev ? (junkPrev / foodPrev) * 100 : 0;

    const stats = {
      totalFood,
      totalNonFood: nonFoodMonth,
      healthyPercent: healthyPct,
      junkPercent: junkPct,
      foodTrend: fmtTrend(pctChange(totalFood, foodPrev)),
      nonFoodTrend: fmtTrend(pctChange(nonFoodMonth, nonFoodPrev)),
      healthyTrend: fmtTrend(pctChange(healthyPct, healthyPrevPct)),
      junkTrend: fmtTrend(pctChange(junkPct, junkPrevPct)),
    };

    const pieData = [
      { name: 'Healthy', value: healthyMonth, color: FOOD_COLORS.healthy },
      { name: 'Balanced', value: balancedMonth, color: FOOD_COLORS.balanced },
      { name: 'Junk', value: junkMonth, color: FOOD_COLORS.junk },
    ];

    const topJunk = Array.from(junkMap.entries())
      .map(([name, entry]) => ({ name, spent: entry.spent, count: entry.count }))
      .sort((a, b) => b.spent - a.spent)
      .slice(0, 6);

    const lastWeek = weeklyBuckets[weeklyBuckets.length - 1];
    const prevWeek = weeklyBuckets[weeklyBuckets.length - 2];
    const lastWeekFood = lastWeek ? lastWeek.healthy + lastWeek.balanced + lastWeek.junk : 0;
    const prevWeekFood = prevWeek ? prevWeek.healthy + prevWeek.balanced + prevWeek.junk : 0;
    const lastWeekHealthy = lastWeekFood ? (lastWeek.healthy / lastWeekFood) * 100 : null;
    const prevWeekHealthy = prevWeekFood ? (prevWeek.healthy / prevWeekFood) * 100 : null;
    const deltaHealthy =
      lastWeekHealthy != null && prevWeekHealthy != null ? lastWeekHealthy - prevWeekHealthy : null;

    const insight = {
      label: lastWeek ? `Insight (${lastWeek.label})` : 'Insight',
      message:
        deltaHealthy == null
          ? 'Completeaza cateva saptamani pentru trenduri relevante.'
          : `Healthy a ${deltaHealthy >= 0 ? 'crescut' : 'scazut'} cu ${Math.abs(
              deltaHealthy
            ).toFixed(1)}% fata de saptamana trecuta.`,
    };

    const budgetBars = [
      {
        key: 'healthy',
        label: 'Healthy',
        spent: healthyMonth,
        budget: FOOD_BUDGET_SPLIT.healthy,
        icon: '💚',
      },
      {
        key: 'balanced',
        label: 'Balanced',
        spent: balancedMonth,
        budget: FOOD_BUDGET_SPLIT.balanced,
        icon: '🟡',
      },
      {
        key: 'junk',
        label: 'Junk',
        spent: junkMonth,
        budget: FOOD_BUDGET_SPLIT.junk,
        icon: '🔥',
      },
      {
        key: 'nonFood',
        label: 'Non-food',
        spent: nonFoodMonth,
        budget: FOOD_BUDGET_SPLIT.nonFood,
        icon: '🛒',
      },
    ];

    return {
      stats,
      weeklyBuckets,
      pieData,
      topJunk,
      insight,
      budgetBars,
      minOffset: minIndex - nowIndex,
      maxOffset: maxIndex - nowIndex,
    };
  }, [items, now, monthOffset]);

  useEffect(() => {
    if (monthOffset < minOffset) setMonthOffset(minOffset);
    if (monthOffset > maxOffset) setMonthOffset(maxOffset);
  }, [monthOffset, minOffset, maxOffset]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[var(--bg)] p-4 sm:p-6">
        <div className="mx-auto max-w-6xl rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5 text-sm text-[var(--muted)]">
          Se incarca graficele…
        </div>
      </main>
    );
  }

  if (err) {
    return (
      <main className="min-h-screen bg-[var(--bg)] p-4 sm:p-6">
        <div className="mx-auto max-w-6xl rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 text-sm text-rose-200">
          {err}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--bg)] p-4 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">🧠 Grafice bonuri</h1>
            <div className="text-sm text-[var(--muted)]">{selectedMonthLabel}</div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center rounded-full border border-[var(--border)] bg-[var(--panel)] p-1 text-xs text-[var(--muted)]">
              <button
                type="button"
                onClick={() => setMonthOffset((prev) => Math.max(minOffset, prev - 1))}
                disabled={monthOffset <= minOffset}
                className={`rounded-full px-3 py-1 transition ${
                  monthOffset <= minOffset
                    ? 'cursor-not-allowed text-[var(--muted)]'
                    : 'hover:text-[var(--text)]'
                }`}
              >
                ◀
              </button>
              <button
                type="button"
                onClick={() => setMonthOffset(-1)}
                className={`rounded-full px-3 py-1 transition ${
                  monthOffset === -1 ? 'bg-[var(--accent-2)] text-[var(--bg)]' : 'hover:text-[var(--text)]'
                }`}
              >
                Luna trecuta
              </button>
              <button
                type="button"
                onClick={() => setMonthOffset(0)}
                className={`rounded-full px-3 py-1 transition ${
                  monthOffset === 0 ? 'bg-[var(--accent-2)] text-[var(--bg)]' : 'hover:text-[var(--text)]'
                }`}
              >
                Luna curenta
              </button>
              <button
                type="button"
                onClick={() => setMonthOffset((prev) => Math.min(maxOffset, prev + 1))}
                disabled={monthOffset >= maxOffset}
                className={`rounded-full px-3 py-1 transition ${
                  monthOffset >= maxOffset
                    ? 'cursor-not-allowed text-[var(--muted)]'
                    : 'hover:text-[var(--text)]'
                }`}
              >
                ▶
              </button>
            </div>
            <Link className="text-sm underline" href="/receipts">
              ← Inapoi la bonuri
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <StatCard
            label="Alimentare"
            value={`${stats.totalFood.toFixed(0)} ${currency}`}
            trend={stats.foodTrend}
            accent="food"
            icon="🍏"
          />
          <StatCard
            label="Non-alimentare"
            value={`${stats.totalNonFood.toFixed(0)} ${currency}`}
            trend={stats.nonFoodTrend}
            accent="neutral"
            icon="🛒"
          />
          <StatCard
            label="Healthy"
            value={`${stats.healthyPercent.toFixed(0)}%`}
            trend={stats.healthyTrend}
            accent="healthy"
            icon="💚"
          />
          <StatCard
            label="Junk ratio"
            value={`${stats.junkPercent.toFixed(0)}%`}
            trend={stats.junkTrend}
            accent="junk"
            icon="⚡"
          />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ChartCard title="Cheltuieli saptamanale (food quality)">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={weeklyBuckets}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="label" fontSize={11} stroke="var(--muted)" />
                <YAxis fontSize={11} stroke="var(--muted)" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f2d2b',
                    border: '1px solid #244a46',
                    borderRadius: '10px',
                    color: 'var(--text)',
                  }}
                  formatter={(value) => `${Number(value).toFixed(2)} ${currency}`}
                />
                <Legend />
                <Bar dataKey="healthy" stackId="a" fill={FOOD_COLORS.healthy} name="Healthy" />
                <Bar dataKey="balanced" stackId="a" fill={FOOD_COLORS.balanced} name="Balanced" />
                <Bar dataKey="junk" stackId="a" fill={FOOD_COLORS.junk} name="Junk" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title={`Distributie categorii (${selectedMonthLabel})`}>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={95}
                  dataKey="value"
                >
                  {pieData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => `${Number(value).toFixed(2)} ${currency}`} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Trend: Alimentare vs Non-alimentare">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart
                data={weeklyBuckets.map((w) => ({
                  label: w.label,
                  food: w.healthy + w.balanced + w.junk,
                  nonFood: w.nonFood,
                }))}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="label" fontSize={11} stroke="var(--muted)" />
                <YAxis fontSize={11} stroke="var(--muted)" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f2d2b',
                    border: '1px solid #244a46',
                    borderRadius: '10px',
                    color: 'var(--text)',
                  }}
                  formatter={(value) => `${Number(value).toFixed(2)} ${currency}`}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="food"
                  stroke="#7fd7b8"
                  strokeWidth={3}
                  name="Alimentare"
                  dot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="nonFood"
                  stroke="#9ec8b9"
                  strokeWidth={3}
                  name="Non-alimentare"
                  dot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title={`Top produse junk (${selectedMonthLabel})`}>
            <div className="space-y-3">
              {topJunk.length ? (
                topJunk.map((item) => (
                  <div
                    key={item.name}
                    className="flex items-center justify-between rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2"
                  >
                    <div>
                      <div className="text-sm font-semibold text-[var(--text)]">{item.name}</div>
                      <div className="text-xs text-[var(--muted)]">{item.count} cumparari</div>
                    </div>
                    <div className="text-sm font-semibold text-rose-200">
                      {item.spent.toFixed(2)} {currency}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-[var(--muted)]">
                  Nu exista produse junk clasificate in luna selectata.
                </div>
              )}
            </div>
          </ChartCard>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-gradient-to-r from-[#123b3a] to-[#0e2f2d] p-4">
          <div className="flex items-start gap-3">
            <div className="text-xl">📈</div>
            <div>
              <div className="text-sm font-semibold text-[var(--text)]">{insight.label}</div>
              <div className="text-sm text-[var(--muted)]">{insight.message}</div>
            </div>
          </div>
        </div>

        <ChartCard title={`Bugete ${selectedMonthLabel}`}>
          <BudgetProgressBars
            items={budgetBars}
            currency={currency}
            monthLabel={selectedMonthLabel}
          />
        </ChartCard>
      </div>
    </main>
  );
}

function StatCard({
  label,
  value,
  trend,
  accent,
  icon,
}: {
  label: string;
  value: string;
  trend: string;
  accent: 'food' | 'healthy' | 'junk' | 'neutral';
  icon: string;
}) {
  const accentClass =
    accent === 'healthy'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
      : accent === 'junk'
      ? 'border-rose-500/30 bg-rose-500/10 text-rose-200'
      : accent === 'food'
      ? 'border-sky-500/30 bg-sky-500/10 text-sky-200'
      : 'border-[var(--border)] bg-[var(--panel-2)] text-[var(--muted)]';

  const trendClass =
    trend.startsWith('+') ? 'text-emerald-300' : trend === '—' ? 'text-[var(--muted)]' : 'text-rose-300';

  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${accentClass}`}>
      <div className="flex items-center justify-between text-xs uppercase tracking-wide">
        <span>{label}</span>
        <span className={trendClass}>{trend}</span>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <div className="text-2xl font-semibold">{value}</div>
        <div className="text-xl">{icon}</div>
      </div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5 shadow-sm">
      <div className="mb-3 text-sm font-semibold text-[var(--text)]">{title}</div>
      {children}
    </div>
  );
}

function BudgetProgressBars({
  items,
  currency,
  monthLabel,
}: {
  items: {
    key: string;
    label: string;
    spent: number;
    budget: number;
    icon: string;
  }[];
  currency: string;
  monthLabel: string;
}) {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setLoaded(true), 80);
    return () => clearTimeout(id);
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--muted)]">
        <div>Tracking {monthLabel}</div>
        <div>Bugete estimative (ajustabile)</div>
      </div>
      <div className="space-y-4">
        {items.map((item, idx) => (
          <BudgetBar
            key={item.key}
            label={item.label}
            spent={item.spent}
            budget={item.budget}
            currency={currency}
            icon={item.icon}
            delay={idx * 200}
            loaded={loaded}
          />
        ))}
      </div>
      <style jsx>{`
        @keyframes shimmer {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
        }

        @keyframes float {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-8px);
          }
        }

        @keyframes burst {
          0% {
            transform: scale(0.7);
            opacity: 0;
          }
          70% {
            transform: scale(1.1);
            opacity: 1;
          }
          100% {
            transform: scale(1);
            opacity: 0.85;
          }
        }

        @keyframes shake {
          0%,
          100% {
            transform: translateX(0);
          }
          25% {
            transform: translateX(-4px);
          }
          75% {
            transform: translateX(4px);
          }
        }
      `}</style>
    </div>
  );
}

function BudgetBar({
  label,
  spent,
  budget,
  currency,
  icon,
  delay,
  loaded,
}: {
  label: string;
  spent: number;
  budget: number;
  currency: string;
  icon: string;
  delay: number;
  loaded: boolean;
}) {
  const ratio = budget ? spent / budget : 0;
  const percentage = Math.min(ratio * 100, 165);
  const isOver = spent > budget;
  const isWarning = percentage >= 80 && percentage < 100;

  const colorClass =
    percentage < 80
      ? 'from-emerald-400/80 to-emerald-600'
      : percentage < 100
      ? 'from-amber-400/80 to-orange-500'
      : 'from-rose-500/80 to-rose-700';

  const message =
    percentage < 80 ? 'On track' : percentage < 100 ? 'Getting close' : 'Over budget';

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] p-4 shadow-sm transition hover:border-[var(--accent-2)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="text-lg">{icon}</div>
          <div className="text-sm font-semibold text-[var(--text)]">{label}</div>
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold text-[var(--text)]">
            {spent.toFixed(0)} <span className="text-xs text-[var(--muted)]">/ {budget} {currency}</span>
          </div>
          <div
            className={`text-xs font-semibold ${
              percentage >= 100 ? 'text-rose-300' : isWarning ? 'text-amber-200' : 'text-emerald-300'
            }`}
          >
            {message}
          </div>
        </div>
      </div>

      <div className="relative mt-3 h-6 w-full overflow-hidden rounded-full bg-[#0f2c2a]">
        <div
          className={`h-full bg-gradient-to-r ${colorClass} relative`}
          style={{
            width: `${loaded ? Math.min(percentage, 100) : 0}%`,
            transition: `width 1.5s ease ${delay}ms`,
            boxShadow: isOver ? '0 0 14px rgba(255, 123, 123, 0.45)' : 'none',
          }}
        >
          <div
            className="absolute inset-0 opacity-30"
            style={{
              background:
                'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.6) 50%, transparent 100%)',
              animation: 'shimmer 1.8s linear infinite',
            }}
          />
        </div>

        <div className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-white">
          {percentage.toFixed(0)}%
        </div>

        {isOver ? (
          <div className="absolute right-0 top-0 flex h-full items-center">
            <div className="relative animate-[burst_0.6s_ease-out]">
              {Array.from({ length: 5 }).map((_, i) => (
                <span
                  key={i}
                  className="absolute text-rose-400 animate-[float_2.4s_ease-in-out_infinite]"
                  style={{
                    right: `${-8 - i * 12}px`,
                    top: `${-6 + i * 4}px`,
                    animationDelay: `${i * 0.15}s`,
                  }}
                >
                  🔥
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {isOver ? (
        <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200 animate-[shake_0.5s_ease-in-out]">
          Depasire buget: <span className="font-semibold">{(spent - budget).toFixed(0)} {currency}</span>
        </div>
      ) : null}
    </div>
  );
}
