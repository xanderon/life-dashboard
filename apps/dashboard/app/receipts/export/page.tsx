'use client';

import { useMemo, useState } from 'react';
import { BackLink, PageShell } from '@/components/PageShell';
import { ThemeToggle } from '@/components/ThemeToggle';

const DEFAULT_START = '2026-02-27';
const DEFAULT_END = '2026-03-26';
const WEEKDAY_LABELS = ['Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sa', 'Du'];

type ExportPayload = {
  meta?: {
    receipt_count?: number;
    item_count?: number;
    store_count?: number;
  };
};

type ErrorPayload = {
  error?: string;
};

type CalendarDatePickerProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
};

function parseDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateLabel(value: string) {
  if (!value) return 'Alege data';
  const date = parseDate(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('ro-RO', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, delta: number) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isBefore(a: Date, b: Date) {
  return a.getTime() < b.getTime();
}

function isAfter(a: Date, b: Date) {
  return a.getTime() > b.getTime();
}

function buildCalendarDays(month: Date) {
  const firstDay = startOfMonth(month);
  const startWeekday = (firstDay.getDay() + 6) % 7;
  const gridStart = new Date(firstDay);
  gridStart.setDate(firstDay.getDate() - startWeekday);

  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + index);
    return day;
  });
}

function buildSampleQuery(start: string, end: string) {
  const nextDay = parseDate(end);
  nextDay.setDate(nextDay.getDate() + 1);

  return `const { data, error } = await supabase
  .from('receipts')
  .select(\`
    id,
    store,
    receipt_date,
    currency,
    total_amount,
    merchant_name,
    receipt_items (
      name,
      quantity,
      unit,
      unit_price,
      paid_amount,
      discount,
      is_food,
      food_quality
    )
  \`)
  .gte('receipt_date', '${start}T00:00:00+02:00')
  .lt('receipt_date', '${toIsoDate(nextDay)}T00:00:00+02:00')
  .order('receipt_date', { ascending: true });`;
}

function CalendarDatePicker({ label, value, onChange, min, max }: CalendarDatePickerProps) {
  const initialMonth = value ? startOfMonth(parseDate(value)) : startOfMonth(new Date());
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(initialMonth);

  const minDate = min ? parseDate(min) : null;
  const maxDate = max ? parseDate(max) : null;
  const selectedDate = value ? parseDate(value) : null;
  const days = useMemo(() => buildCalendarDays(visibleMonth), [visibleMonth]);
  const monthLabel = visibleMonth.toLocaleDateString('ro-RO', {
    month: 'long',
    year: 'numeric',
  });

  function selectDate(date: Date) {
    onChange(toIsoDate(date));
    setVisibleMonth(startOfMonth(date));
    setOpen(false);
  }

  return (
    <div className="relative min-w-[240px]">
      <div className="mb-1 text-sm text-[var(--muted)]">{label}</div>
      <button
        className="flex w-full items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-left text-sm text-[var(--text)]"
        onClick={() => setOpen((prev) => !prev)}
        type="button"
      >
        <span>{formatDateLabel(value)}</span>
        <span className="text-xs text-[var(--muted)]">calendar</span>
      </button>

      {open ? (
        <div className="absolute z-20 mt-2 w-[320px] rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-3 shadow-2xl">
          <div className="flex items-center justify-between gap-2">
            <button
              className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-2 py-1 text-sm text-[var(--text)]"
              onClick={() => setVisibleMonth((prev) => addMonths(prev, -1))}
              type="button"
            >
              ←
            </button>
            <div className="text-sm font-semibold capitalize text-[var(--text)]">{monthLabel}</div>
            <button
              className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-2 py-1 text-sm text-[var(--text)]"
              onClick={() => setVisibleMonth((prev) => addMonths(prev, 1))}
              type="button"
            >
              →
            </button>
          </div>

          <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] uppercase tracking-wide text-[var(--muted)]">
            {WEEKDAY_LABELS.map((weekday) => (
              <div key={weekday} className="py-1">
                {weekday}
              </div>
            ))}
          </div>

          <div className="mt-1 grid grid-cols-7 gap-1">
            {days.map((day) => {
              const inMonth = day.getMonth() === visibleMonth.getMonth();
              const disabled =
                (minDate && isBefore(day, minDate)) || (maxDate && isAfter(day, maxDate));
              const isSelected = selectedDate ? isSameDay(day, selectedDate) : false;

              return (
                <button
                  key={toIsoDate(day)}
                  className={`rounded-lg px-0 py-2 text-sm transition ${
                    isSelected
                      ? 'bg-[#255f73] text-white ring-2 ring-sky-100/80'
                      : inMonth
                        ? 'bg-[var(--panel-2)] text-[var(--text)] hover:bg-[#1b4a45]'
                        : 'bg-[var(--panel-2)]/50 text-[var(--muted)] hover:bg-[var(--panel-2)]'
                  } ${disabled ? 'cursor-not-allowed opacity-35' : ''}`}
                  disabled={Boolean(disabled)}
                  onClick={() => selectDate(day)}
                  type="button"
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            <button
              className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-1 text-xs text-[var(--text)]"
              onClick={() => {
                const today = new Date();
                setVisibleMonth(startOfMonth(today));
                onChange(toIsoDate(today));
                setOpen(false);
              }}
              type="button"
            >
              Azi
            </button>
            <button
              className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-1 text-xs text-[var(--text)]"
              onClick={() => setOpen(false)}
              type="button"
            >
              Închide
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function ReceiptsExportPage() {
  const [startDate, setStartDate] = useState(DEFAULT_START);
  const [endDate, setEndDate] = useState(DEFAULT_END);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<ExportPayload | null>(null);
  const [jsonText, setJsonText] = useState('');

  const sampleQuery = useMemo(() => buildSampleQuery(startDate, endDate), [startDate, endDate]);

  async function generateExport() {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        start: startDate,
        end: endDate,
      });
      const res = await fetch(`/api/receipts/export?${params.toString()}`, {
        method: 'GET',
        cache: 'no-store',
      });
      const body = (await res.json()) as ExportPayload & ErrorPayload;

      if (!res.ok) {
        throw new Error(body?.error || 'Nu am putut genera exportul.');
      }

      setPayload(body);
      setJsonText(JSON.stringify(body, null, 2));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Nu am putut genera exportul.';
      setError(message);
      setPayload(null);
      setJsonText('');
    } finally {
      setLoading(false);
    }
  }

  async function copyJson() {
    if (!jsonText) return;
    await navigator.clipboard.writeText(jsonText);
  }

  function downloadJson() {
    if (!jsonText) return;
    const blob = new Blob([jsonText], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `receipts-export-${startDate}-to-${endDate}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <PageShell width="6xl">
      <div className="space-y-6">
        <section className="hero-card p-5 sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <span className="eyebrow">Receipts export</span>
              <h1 className="display-title mt-5 text-4xl font-semibold tracking-[-0.06em]">
                Export bonuri JSON
              </h1>
              <p className="mt-3 text-base leading-7 text-[var(--muted)]">
                Grupează bonurile pe magazin și îți întoarce un JSON mare, lizibil.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <ThemeToggle />
              <BackLink href="/receipts">Receipts</BackLink>
              <BackLink href="/">Dashboard</BackLink>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-end gap-3">
              <CalendarDatePicker
                label="De la"
                max={endDate}
                onChange={setStartDate}
                value={startDate}
              />
              <CalendarDatePicker
                label="Până la"
                min={startDate}
                onChange={setEndDate}
                value={endDate}
              />
              <button
                className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-4 py-2 text-sm text-[var(--text)] disabled:opacity-50"
                disabled={loading || !startDate || !endDate}
                onClick={generateExport}
                type="button"
              >
                {loading ? 'Generez…' : 'Generează JSON'}
              </button>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="surface-card p-4">
              <div className="text-sm font-semibold text-[var(--text)]">Query Supabase de bază</div>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Da, Supabase poate întoarce rezultatul. Pentru volume mari însă endpointul de mai jos este
                mai sigur, fiindcă face paging și structurează răspunsul.
              </p>
              <pre className="mt-3 overflow-x-auto rounded-lg bg-[var(--panel)] p-3 text-xs leading-5 text-[var(--text)]">
                <code>{sampleQuery}</code>
              </pre>
            </div>

            <div className="surface-card p-4">
              <div className="text-sm font-semibold text-[var(--text)]">Ce întoarce exportul</div>
              <div className="mt-2 text-sm text-[var(--muted)]">
                Structură:
                <div>`meta` cu intervalul și numărul de bonuri</div>
                <div>`stores[]` cu câte un grup pentru fiecare magazin</div>
                <div>`receipts[]` cu antetul bonului și `items[]` pentru produse</div>
              </div>
              {payload?.meta ? (
                <div className="mt-4 rounded-lg bg-[var(--panel)] p-3 text-sm text-[var(--text)]">
                  <div>{payload.meta.receipt_count} bonuri</div>
                  <div>{payload.meta.item_count} produse</div>
                  <div>{payload.meta.store_count} magazine</div>
                </div>
              ) : null}
              {error ? (
                <div className="mt-4 rounded-lg border border-rose-400/40 bg-rose-500/10 p-3 text-sm text-rose-200">
                  {error}
                </div>
              ) : null}
            </div>
        </section>

        <section className="surface-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-lg font-semibold">Rezultat</div>
              <div className="text-sm text-[var(--muted)]">
                JSON-ul apare aici după ce se termină exportul.
              </div>
            </div>
            <div className="flex gap-2">
              <button
                className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-sm text-[var(--text)] disabled:opacity-50"
                disabled={!jsonText}
                onClick={copyJson}
                type="button"
              >
                Copy
              </button>
              <button
                className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-sm text-[var(--text)] disabled:opacity-50"
                disabled={!jsonText}
                onClick={downloadJson}
                type="button"
              >
                Download
              </button>
            </div>
          </div>

          <textarea
            className="field-base mt-4 min-h-[520px] w-full p-4 font-mono text-xs leading-5"
            readOnly
            value={jsonText}
          />
        </section>
      </div>
    </PageShell>
  );
}
