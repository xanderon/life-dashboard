'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { BackLink, PageShell } from '@/components/PageShell';
import { StatusPill } from '@/components/StatusPill';
import { ThemeToggle } from '@/components/ThemeToggle';
import {
  addMonths,
  addYears,
  buildCalendarDays,
  buildRangeStats,
  endOfMonthExclusive,
  endOfYearExclusive,
  formatDayLabel,
  formatDuration,
  formatMonthLabel,
  formatYearLabel,
  getCurrentPeriod,
  startOfMonth,
  startOfYear,
  type DayCoverage,
  type HistoryViewMode,
  WEEKDAY_LABELS,
} from './termoHistory';
import type { AppRow, PeriodRow, RunRow, ServiceStatus } from './types';

const APP_SLUG = 'termo-alert';
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

type TermoPageClientProps = {
  app: AppRow;
  run: RunRow | null;
  periods: PeriodRow[];
};

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function fmt(ts: string | null) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('ro-RO');
}

function statusLabel(status: ServiceStatus | null) {
  return status === 'ok' ? 'DA' : 'NU';
}

function serviceTone(status: ServiceStatus | null) {
  return status === 'ok'
    ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
    : 'border-rose-400/35 bg-rose-500/10 text-rose-200';
}

function dayTone(day: DayCoverage, inCurrentMonth: boolean) {
  if (day.status === 'ok') {
    return 'border-emerald-400/28 bg-emerald-500/12 text-emerald-100';
  }
  if (day.status === 'down') {
    return 'border-rose-400/30 bg-rose-500/14 text-rose-100';
  }
  if (day.status === 'mixed') {
    return 'border-rose-400/32 text-rose-50';
  }
  if (day.status === 'untracked') {
    return 'border-white/6 bg-white/6 text-[var(--muted)]';
  }
  return inCurrentMonth
    ? 'border-dashed border-[var(--border)] bg-transparent text-[var(--muted)]/55'
    : 'border-transparent bg-transparent text-[var(--muted)]/35';
}

function dayStyle(day: DayCoverage) {
  if (day.status !== 'mixed') return undefined;
  return {
    background:
      'linear-gradient(135deg, color-mix(in srgb, var(--danger) 20%, transparent) 0%, color-mix(in srgb, var(--danger) 20%, transparent) 58%, color-mix(in srgb, var(--accent-warm) 22%, transparent) 100%)',
  };
}

function dayTitle(day: DayCoverage) {
  if (day.status === 'future') {
    return `${formatDayLabel(day.date)} • viitor`;
  }
  if (day.status === 'untracked') {
    return `${formatDayLabel(day.date)} • fără înregistrări`;
  }
  if (day.status === 'mixed') {
    return `${formatDayLabel(day.date)} • zi afectată • cu apă ${formatDuration(day.upMs)} • fără apă ${formatDuration(day.downMs)}`;
  }
  return `${formatDayLabel(day.date)} • cu apă ${formatDuration(day.upMs)} • fără apă ${formatDuration(day.downMs)}`;
}

function MonthCalendar({
  month,
  periods,
  now,
}: {
  month: Date;
  periods: PeriodRow[];
  now: Date;
}) {
  const days = useMemo(() => buildCalendarDays(month, periods, now), [month, now, periods]);

  return (
    <div>
      <div className="grid grid-cols-7 gap-2 text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
        {WEEKDAY_LABELS.map((weekday) => (
          <div key={weekday} className="py-1">
            {weekday}
          </div>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-7 gap-2">
        {days.map((day) => {
          const inCurrentMonth = day.date.getMonth() === month.getMonth();
          return (
            <div
              key={day.dateKey}
              className={`min-h-[4.9rem] rounded-2xl border p-2 transition ${dayTone(day, inCurrentMonth)}`}
              style={dayStyle(day)}
              title={dayTitle(day)}
            >
              <div className="flex items-start justify-between gap-2">
                <span className={`text-sm font-semibold ${inCurrentMonth ? 'text-[var(--text)]' : 'text-[var(--muted)]'}`}>
                  {day.date.getDate()}
                </span>
                <span className="text-[10px] text-[var(--muted)]">
                  {day.status === 'future'
                    ? '—'
                    : day.status === 'untracked'
                      ? 'gri'
                      : day.status === 'mixed'
                        ? 'prob'
                        : day.status === 'ok'
                          ? 'ok'
                          : 'off'}
                </span>
              </div>
              <div className="mt-3 space-y-1 text-[10px] leading-4 text-[var(--muted)]">
                <div>Cu: {day.upMs > 0 ? formatDuration(day.upMs) : '0h'}</div>
                <div>Fără: {day.downMs > 0 ? formatDuration(day.downMs) : '0h'}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function YearCalendar({
  yearDate,
  periods,
  now,
}: {
  yearDate: Date;
  periods: PeriodRow[];
  now: Date;
}) {
  const months = useMemo(
    () => Array.from({ length: 12 }, (_, index) => new Date(yearDate.getFullYear(), index, 1)),
    [yearDate]
  );

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {months.map((month) => {
        const days = buildCalendarDays(month, periods, now);
        return (
          <div key={month.toISOString()} className="rounded-3xl border border-[var(--border)] bg-[var(--panel-2)]/70 p-3">
            <div className="mb-3 text-sm font-semibold capitalize text-[var(--text)]">
              {month.toLocaleDateString('ro-RO', { month: 'long' })}
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
              {WEEKDAY_LABELS.map((weekday) => (
                <div key={`${month.getMonth()}-${weekday}`}>{weekday}</div>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-7 gap-1">
              {days.map((day) => {
                const inCurrentMonth = day.date.getMonth() === month.getMonth();
                return (
                  <div
                    key={day.dateKey}
                    className={`flex aspect-square items-center justify-center rounded-[0.85rem] border text-[10px] font-semibold ${dayTone(day, inCurrentMonth)}`}
                    style={dayStyle(day)}
                    title={dayTitle(day)}
                  >
                    {inCurrentMonth ? day.date.getDate() : ''}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LegendItem({
  label,
  className,
  style,
}: {
  label: string;
  className: string;
  style?: CSSProperties;
}) {
  return (
    <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
      <span className={`inline-block h-3.5 w-3.5 rounded-full border ${className}`} style={style} />
      <span>{label}</span>
    </div>
  );
}

export default function TermoPageClient({ app, run, periods }: TermoPageClientProps) {
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [viewMode, setViewMode] = useState<HistoryViewMode>('month');
  const [focusDate, setFocusDate] = useState(() => {
    const base = periods[periods.length - 1]?.started_at ?? run?.created_at ?? new Date().toISOString();
    return new Date(base);
  });

  const [pushSupported] = useState(
    () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  );
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission | null>(
    () => (typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : null)
  );
  const [pushError, setPushError] = useState<string | null>(null);
  const [pushLoading, setPushLoading] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!pushSupported) return;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        setPushEnabled(Boolean(sub));
      })
      .catch(() => {
        setPushEnabled(false);
      });
  }, [pushSupported]);

  const now = useMemo(() => new Date(nowTick), [nowTick]);
  const currentPeriod = useMemo(() => getCurrentPeriod(periods), [periods]);
  const metrics = run?.metrics ?? null;
  const currentDetails = currentPeriod?.details?.data ?? metrics?.data ?? null;
  const target = currentPeriod?.details?.target ?? metrics?.target ?? null;
  const sourceUrl = currentPeriod?.details?.source_url ?? metrics?.source_url ?? null;
  const currentHotWaterStatus = currentPeriod?.hot_water_status ?? metrics?.service?.hot_water ?? (app.status === 'ok' ? 'ok' : 'down');
  const currentHeatStatus = currentPeriod?.heat_status ?? metrics?.service?.heat ?? (app.status === 'ok' ? 'ok' : 'down');
  const currentEta = currentPeriod?.eta ?? currentDetails?.eta ?? null;
  const currentPeriodDuration = currentPeriod ? formatDuration(now.getTime() - new Date(currentPeriod.started_at).getTime()) : '—';
  const monitoredAddress = [target?.street, target?.block].filter(Boolean).join(', ');
  const viewStart = viewMode === 'month' ? startOfMonth(focusDate) : startOfYear(focusDate);
  const viewEnd = viewMode === 'month' ? endOfMonthExclusive(focusDate) : endOfYearExclusive(focusDate);
  const viewLabel = viewMode === 'month' ? formatMonthLabel(focusDate) : formatYearLabel(focusDate);
  const stats = useMemo(() => buildRangeStats(periods, viewStart, viewEnd, now), [now, periods, viewEnd, viewStart]);
  const canGoForward = useMemo(() => {
    if (viewMode === 'month') {
      const currentMonth = startOfMonth(now);
      return startOfMonth(focusDate).getTime() < currentMonth.getTime();
    }
    return startOfYear(focusDate).getTime() < startOfYear(now).getTime();
  }, [focusDate, now, viewMode]);

  async function enableNotifications() {
    if (!pushSupported) return;
    setPushLoading(true);
    setPushError(null);
    try {
      if (Notification.permission === 'denied') {
        setPushError('Notificările sunt blocate în browser.');
        setPushLoading(false);
        return;
      }

      const permission = await Notification.requestPermission();
      setPushPermission(permission);
      if (permission !== 'granted') {
        setPushError('Permisiunea pentru notificări nu a fost acordată.');
        setPushLoading(false);
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        if (!VAPID_PUBLIC_KEY) {
          setPushError('Lipsește cheia publică VAPID.');
          setPushLoading(false);
          return;
        }
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }

      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription,
          appSlug: APP_SLUG,
          userAgent: navigator.userAgent,
        }),
      });

      if (!res.ok) {
        setPushError('Nu am putut salva abonarea.');
        setPushLoading(false);
        return;
      }

      setPushEnabled(true);
      setPushLoading(false);
    } catch {
      setPushError('Nu am putut activa notificările.');
      setPushLoading(false);
    }
  }

  return (
    <PageShell width="7xl">
      <div className="space-y-6">
        <section className="hero-card p-5 sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-3">
                <span className="eyebrow">Infra</span>
                <StatusPill status={app.status} />
              </div>
              <h1 className="display-title mt-5 text-4xl font-semibold tracking-[-0.06em]">
                ♨️ Termo alert
              </h1>
              <p className="mt-3 max-w-2xl text-base leading-7 text-[var(--muted)]">
                Status live pentru adresa urmărită, plus istoric compact cu perioadele în care ai avut sau n-ai avut apă caldă.
              </p>

              <div className="mt-6 grid gap-3 md:grid-cols-3">
                <div className={`rounded-3xl border p-4 ${serviceTone(currentHotWaterStatus)}`}>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.2em]">Apă caldă</div>
                  <div className="mt-3 text-3xl font-semibold">{statusLabel(currentHotWaterStatus)}</div>
                  <div className="mt-2 text-sm text-[var(--muted)]">
                    {currentHotWaterStatus === 'ok' ? 'Disponibilă acum' : 'Indisponibilă acum'}
                  </div>
                </div>
                <div className={`rounded-3xl border p-4 ${serviceTone(currentHeatStatus)}`}>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.2em]">Încălzire</div>
                  <div className="mt-3 text-3xl font-semibold">{statusLabel(currentHeatStatus)}</div>
                  <div className="mt-2 text-sm text-[var(--muted)]">
                    {currentHeatStatus === 'ok' ? 'Disponibilă acum' : 'Indisponibilă acum'}
                  </div>
                </div>
                <div className="rounded-3xl border border-[var(--border)] bg-[var(--panel-2)]/75 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
                    Interval curent
                  </div>
                  <div className="mt-3 text-3xl font-semibold text-[var(--text)]">{currentPeriodDuration}</div>
                  <div className="mt-2 text-sm text-[var(--muted)]">
                    {currentPeriod ? `Din ${fmt(currentPeriod.started_at)}` : 'Încă fără interval înregistrat'}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 lg:justify-end">
              <ThemeToggle />
              <BackLink href="/">Dashboard</BackLink>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <div className="rounded-3xl border border-[var(--border)] bg-[var(--panel-2)]/72 p-4">
              <div className="text-xs text-[var(--muted)]">Adresă urmărită</div>
              <div className="mt-2 text-base font-semibold text-[var(--text)]">{monitoredAddress || '—'}</div>
            </div>
            <div className="rounded-3xl border border-[var(--border)] bg-[var(--panel-2)]/72 p-4">
              <div className="text-xs text-[var(--muted)]">Ultima verificare</div>
              <div className="mt-2 text-base font-semibold text-[var(--text)]">{fmt(app.last_run_at)}</div>
            </div>
            <div className="rounded-3xl border border-[var(--border)] bg-[var(--panel-2)]/72 p-4">
              <div className="text-xs text-[var(--muted)]">ETA curent</div>
              <div className="mt-2 text-base font-semibold text-[var(--text)]">{currentEta || 'Fără ETA activ'}</div>
            </div>
          </div>
        </section>

        <section className="surface-card p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xl font-semibold">🔎 Detalii complete</div>
              <div className="mt-1 text-sm text-[var(--muted)]">
                Statusul curent pentru adresa ta, cu informațiile cele mai recente din CMTEB.
              </div>
            </div>
            <div className="text-xs text-[var(--muted)]">
              {currentDetails ? 'Există avarie activă în listă.' : 'Nu apare avarie activă pentru adresa urmărită.'}
            </div>
          </div>

          {currentDetails ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <DetailCard label="Sector" value={currentDetails.sector ?? '—'} />
              <DetailCard label="ETA repornire" value={currentEta ?? '—'} />
              <DetailCard label="Agent termic afectat" value={currentDetails.agent ?? '—'} className="xl:col-span-2" />
              <DetailCard
                label="Cauză / descriere"
                value={currentDetails.cause ?? '—'}
                className="sm:col-span-2 xl:col-span-4"
              />
              <DetailCard
                label="Zona afectată"
                value={currentDetails.zone ?? '—'}
                preformatted
                className="sm:col-span-2 xl:col-span-4"
              />
            </div>
          ) : (
            <div className="mt-5 grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-3xl border border-emerald-400/24 bg-emerald-500/10 p-5">
                <div className="text-sm font-semibold text-emerald-200">Apa caldă nu apare ca fiind oprită în CMTEB acum.</div>
                <div className="mt-2 text-sm leading-6 text-[var(--muted)]">
                  Asta înseamnă că pentru adresa urmărită nu există o avarie activă publicată în lista lor la ultima verificare.
                </div>
              </div>
              <div className="rounded-3xl border border-[var(--border)] bg-[var(--panel-2)]/72 p-5">
                <div className="text-xs text-[var(--muted)]">Adresă monitorizată</div>
                <div className="mt-2 text-lg font-semibold text-[var(--text)]">{monitoredAddress || '—'}</div>
                <div className="mt-4 text-xs text-[var(--muted)]">Ultimul run</div>
                <div className="mt-1 text-sm text-[var(--text)]">{run?.summary ?? '—'}</div>
              </div>
            </div>
          )}
        </section>

        <section className="surface-card p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-xl font-semibold">📊 Statistici & istoric</div>
              <div className="mt-1 text-sm text-[var(--muted)]">
                Calendar pe lună sau an, calculat din intervalele reale înregistrate în DB.
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-full border border-[var(--border)] bg-[var(--panel-2)] p-1">
                <button
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${viewMode === 'month' ? 'bg-[var(--accent-2)] text-[var(--bg)]' : 'text-[var(--muted)]'}`}
                  onClick={() => setViewMode('month')}
                  type="button"
                >
                  Lună
                </button>
                <button
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${viewMode === 'year' ? 'bg-[var(--accent-2)] text-[var(--bg)]' : 'text-[var(--muted)]'}`}
                  onClick={() => setViewMode('year')}
                  type="button"
                >
                  An
                </button>
              </div>

              <button
                className="btn-base btn-secondary !px-3 !py-2"
                onClick={() => setFocusDate((prev) => (viewMode === 'month' ? addMonths(prev, -1) : addYears(prev, -1)))}
                type="button"
              >
                ←
              </button>
              <div className="min-w-[10rem] text-center text-sm font-semibold capitalize text-[var(--text)]">
                {viewLabel}
              </div>
              <button
                className="btn-base btn-secondary !px-3 !py-2 disabled:opacity-45"
                disabled={!canGoForward}
                onClick={() => setFocusDate((prev) => (viewMode === 'month' ? addMonths(prev, 1) : addYears(prev, 1)))}
                type="button"
              >
                →
              </button>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-4">
            <LegendItem label="Apă caldă" className="border-emerald-400/30 bg-emerald-500/12" />
            <LegendItem label="Fără apă caldă" className="border-rose-400/30 bg-rose-500/14" />
            <LegendItem
              label="Zi afectată"
              className="border-rose-400/32"
              style={{
                background:
                  'linear-gradient(135deg, color-mix(in srgb, var(--danger) 20%, transparent) 0%, color-mix(in srgb, var(--danger) 20%, transparent) 58%, color-mix(in srgb, var(--accent-warm) 22%, transparent) 100%)',
              }}
            />
            <LegendItem label="Neînregistrat" className="border-white/6 bg-white/6" />
            <LegendItem label="Viitor" className="border-dashed border-[var(--border)] bg-transparent" />
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-4">
            <StatCard label="Disponibilitate" value={stats.availabilityPct == null ? '—' : `${stats.availabilityPct.toFixed(0)}%`} hint={viewMode === 'month' ? 'în luna selectată' : 'în anul selectat'} />
            <StatCard label="Cu apă caldă" value={formatDuration(stats.upMs)} hint="timp înregistrat" />
            <StatCard label="Fără apă caldă" value={formatDuration(stats.downMs)} hint="timp înregistrat" />
            <StatCard label="Fără date" value={stats.daysUntracked > 0 ? `${stats.daysUntracked} zile` : '0 zile'} hint="trecut neacoperit" />
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-4">
            <MiniCount label="Zile OK" value={stats.daysOk} tone="text-emerald-200" />
            <MiniCount label="Zile afectate" value={stats.daysProblematic} tone="text-rose-200" />
            <MiniCount label="OFF complet" value={stats.daysDown} tone="text-rose-100" />
            <MiniCount label="Înregistrări" value={periods.length} tone="text-[var(--text)]" />
          </div>

          <div className="mt-6">
            {viewMode === 'month' ? (
              <MonthCalendar month={focusDate} periods={periods} now={now} />
            ) : (
              <YearCalendar yearDate={focusDate} periods={periods} now={now} />
            )}
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="surface-card p-5">
            <div className="text-lg font-semibold">🔔 Notificări</div>
            {!pushSupported ? (
              <div className="mt-2 text-sm text-[var(--muted)]">
                Browserul nu suportă notificări push.
              </div>
            ) : (
              <div className="mt-2 text-sm text-[var(--muted)]">
                {pushEnabled ? 'Notificările sunt active.' : 'Primește alertă la schimbarea statusului.'}
              </div>
            )}
            {pushSupported ? (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  className="btn-base btn-secondary disabled:opacity-60"
                  onClick={enableNotifications}
                  disabled={pushLoading || pushEnabled}
                  type="button"
                >
                  {pushEnabled ? 'Activat' : pushLoading ? 'Se activează…' : 'Activează notificările'}
                </button>
                {pushPermission === 'denied' ? (
                  <span className="text-xs text-rose-300">Permisiune blocată în browser.</span>
                ) : null}
                {pushError ? <span className="text-xs text-rose-300">{pushError}</span> : null}
              </div>
            ) : null}
            <div className="mt-4 text-xs text-[var(--muted)]">
              Pe iOS, notificările web merg doar după “Add to Home Screen”.
            </div>
          </div>

          <div className="surface-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">🔗 Surse</div>
                <div className="mt-1 text-sm text-[var(--muted)]">
                  Linkuri utile și ultimul payload brut pentru debugging.
                </div>
              </div>
              <div className="flex flex-wrap gap-3 text-sm">
                {sourceUrl ? (
                  <a className="underline" href={sourceUrl} target="_blank" rel="noreferrer">
                    CMTEB
                  </a>
                ) : (
                  <span className="text-[var(--muted)]">CMTEB</span>
                )}
                {app.github_url ? (
                  <a className="underline" href={app.github_url} target="_blank" rel="noreferrer">
                    GitHub
                  </a>
                ) : (
                  <span className="text-[var(--muted)]">GitHub</span>
                )}
                {app.chat_url ? (
                  <a className="underline" href={app.chat_url} target="_blank" rel="noreferrer">
                    Chat
                  </a>
                ) : (
                  <span className="text-[var(--muted)]">Chat</span>
                )}
                {app.home_url && !app.home_url.startsWith('/') ? (
                  <a className="underline" href={app.home_url} target="_blank" rel="noreferrer">
                    Home
                  </a>
                ) : null}
              </div>
            </div>

            <div className="mt-4 rounded-3xl border border-[var(--border)] bg-[var(--panel-2)]/72 p-4">
              <div className="text-xs text-[var(--muted)]">Ultima rulare</div>
              <div className="mt-2 text-sm text-[var(--text)]">{run?.summary ?? '—'}</div>
              <pre className="mt-3 overflow-auto rounded-2xl bg-[var(--panel)] p-3 text-xs text-[var(--muted)]">
{JSON.stringify(run?.metrics ?? {}, null, 2)}
              </pre>
            </div>
          </div>
        </section>

        <section className="flex justify-between">
          <Link className="page-back-link" href="/">
            ← Înapoi în dashboard
          </Link>
        </section>
      </div>
    </PageShell>
  );
}

function DetailCard({
  label,
  value,
  className = '',
  preformatted = false,
}: {
  label: string;
  value: string;
  className?: string;
  preformatted?: boolean;
}) {
  return (
    <div className={`rounded-3xl border border-[var(--border)] bg-[var(--panel-2)]/72 p-4 ${className}`}>
      <div className="text-xs text-[var(--muted)]">{label}</div>
      {preformatted ? (
        <pre className="mt-2 whitespace-pre-wrap text-sm text-[var(--text)]">{value}</pre>
      ) : (
        <div className="mt-2 text-sm font-semibold text-[var(--text)]">{value}</div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-3xl border border-[var(--border)] bg-[var(--panel-2)]/72 p-4">
      <div className="text-xs text-[var(--muted)]">{label}</div>
      <div className="mt-2 text-3xl font-semibold text-[var(--text)]">{value}</div>
      <div className="mt-2 text-sm text-[var(--muted)]">{hint}</div>
    </div>
  );
}

function MiniCount({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel-2)]/65 px-4 py-3">
      <div className="text-xs text-[var(--muted)]">{label}</div>
      <div className={`mt-1 text-lg font-semibold ${tone}`}>{value}</div>
    </div>
  );
}
