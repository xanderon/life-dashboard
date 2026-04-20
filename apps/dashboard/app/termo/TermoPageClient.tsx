'use client';

import { useEffect, useMemo, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { BackLink, PageShell } from '@/components/PageShell';
import { StatusPill } from '@/components/StatusPill';
import { ThemeToggle } from '@/components/ThemeToggle';
import {
  addMonths,
  addYears,
  buildCalendarDays,
  buildDaySegments,
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
  toIsoDay,
  type DayCoverage,
  type HistoryViewMode,
  WEEKDAY_LABELS,
} from './termoHistory';
import type { AppRow, PeriodRow, RunRow, ServiceStatus } from './types';

const APP_SLUG = 'termo-alert';
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';
const MOBILE_WEEKDAY_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

type TermoPageClientProps = {
  app: AppRow;
  run: RunRow | null;
  periods: PeriodRow[];
};

type PushEnvironmentSnapshot = {
  supported: boolean;
  permission: NotificationPermission | null;
};

const DEFAULT_PUSH_ENVIRONMENT: PushEnvironmentSnapshot = {
  supported: false,
  permission: null,
};
let cachedPushEnvironment = DEFAULT_PUSH_ENVIRONMENT;

function subscribeNoop() {
  return () => {};
}

function getPushEnvironmentSnapshot(): PushEnvironmentSnapshot {
  if (
    typeof window === 'undefined' ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window) ||
    !('Notification' in window)
  ) {
    return DEFAULT_PUSH_ENVIRONMENT;
  }

  const nextSnapshot: PushEnvironmentSnapshot = {
    supported: true,
    permission: Notification.permission,
  };

  if (
    cachedPushEnvironment.supported === nextSnapshot.supported &&
    cachedPushEnvironment.permission === nextSnapshot.permission
  ) {
    return cachedPushEnvironment;
  }

  cachedPushEnvironment = nextSnapshot;
  return cachedPushEnvironment;
}

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

function isSameDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function daySurfaceClass(day: DayCoverage, inCurrentMonth: boolean, isSelected: boolean) {
  const selectedClass = isSelected
    ? 'border-[color-mix(in_srgb,var(--accent)_62%,var(--border)_38%)] ring-1 ring-[color-mix(in_srgb,var(--accent)_18%,transparent)] md:shadow-[0_18px_30px_-24px_color-mix(in_srgb,var(--accent)_52%,transparent)]'
    : '';

  if (!inCurrentMonth) {
    return day.status === 'future'
      ? `border-transparent bg-transparent opacity-20 ${selectedClass}`
      : `border-transparent bg-transparent opacity-45 ${selectedClass}`;
  }

  if (isSelected) {
    if (day.status === 'future') {
      return `bg-[color-mix(in_srgb,var(--panel)_92%,transparent)] ${selectedClass}`;
    }
    if (day.status === 'untracked') {
      return `bg-[color-mix(in_srgb,var(--panel-2)_72%,transparent)] ${selectedClass}`;
    }
  }

  if (day.status === 'future') {
    return `border-[color-mix(in_srgb,var(--border)_55%,transparent)] bg-[color-mix(in_srgb,var(--panel)_94%,transparent)] opacity-55 ${selectedClass}`;
  }

  if (day.status === 'untracked') {
    return `border-[color-mix(in_srgb,var(--border-strong)_70%,transparent)] bg-[color-mix(in_srgb,var(--panel-2)_72%,transparent)] ${selectedClass}`;
  }

  if (day.status === 'ok') {
    return `border-emerald-500/24 bg-emerald-500/12 ${selectedClass}`;
  }

  if (day.status === 'down') {
    return `border-rose-500/28 bg-rose-500/13 ${selectedClass}`;
  }

  return `border-[color-mix(in_srgb,var(--border)_72%,transparent)] bg-[color-mix(in_srgb,var(--panel-2)_54%,transparent)] ${selectedClass}`;
}

function dayNumberClass(day: DayCoverage, inCurrentMonth: boolean, isSelected: boolean) {
  if (isSelected) return 'text-[var(--text)]';
  if (day.status === 'future') return inCurrentMonth ? 'text-[var(--muted)]' : 'text-[var(--muted)]/50';
  if (!inCurrentMonth) return 'text-[var(--muted)]';
  return 'text-[var(--text)]';
}

function dayNumberWrapClass(isToday: boolean) {
  if (!isToday) return '';
  return 'inline-flex h-5 w-5 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--accent)_42%,transparent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_10%,transparent)] sm:h-8 sm:w-8';
}

function daySurfaceStyle(day: DayCoverage, inCurrentMonth: boolean): CSSProperties | undefined {
  if (!inCurrentMonth) return undefined;

  if (day.status === 'mixed') {
    const totalMs = Math.max(day.upMs + day.downMs, 1);
    const hotPct = Math.max(10, Math.min(90, Math.round((day.upMs / totalMs) * 100)));
    return {
      background:
        `linear-gradient(145deg,
          color-mix(in srgb, rgb(16 185 129) 18%, var(--panel-2) 82%) 0%,
          color-mix(in srgb, rgb(16 185 129) 16%, var(--panel-2) 84%) ${Math.max(hotPct - 4, 0)}%,
          color-mix(in srgb, rgb(244 63 94) 13%, var(--panel-2) 87%) ${Math.min(hotPct + 4, 100)}%,
          color-mix(in srgb, rgb(244 63 94) 21%, var(--panel-2) 79%) 100%)`,
    };
  }

  return undefined;
}

function dayStatusEmoji(day: DayCoverage) {
  if (day.status === 'ok') return '🟢';
  if (day.status === 'down') return '🔴';
  if (day.status === 'mixed') return '🟡';
  if (day.status === 'future') return '🕒';
  return '⚪';
}

function dayStatusText(day: DayCoverage) {
  if (day.status === 'ok') return 'Apă caldă disponibilă';
  if (day.status === 'down') return 'Problemă toată perioada observată';
  if (day.status === 'mixed') return 'Zi afectată parțial';
  if (day.status === 'future') return 'Zi din viitor';
  return 'Fără înregistrări';
}

function DayHoverCard({ day }: { day: DayCoverage }) {
  const unknownMs = Math.max(0, (day.date > new Date() ? 0 : 24 * 60 * 60 * 1000) - day.trackedMs);

  return (
    <div className="pointer-events-none absolute bottom-[calc(100%+0.7rem)] left-1/2 z-20 hidden w-56 -translate-x-1/2 rounded-[1.15rem] border border-[var(--border)] bg-[color-mix(in_srgb,var(--panel)_93%,black_7%)] p-3 text-left shadow-[0_24px_50px_-24px_rgba(0,0,0,0.45)] opacity-0 transition duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 md:block">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
        {formatDayLabel(day.date)}
      </div>
      <div className="mt-1.5 text-sm font-semibold text-[var(--text)]">
        {dayStatusEmoji(day)} {dayStatusText(day)}
      </div>
      <div className="mt-2 space-y-1.5 text-xs text-[var(--muted)]">
        {day.upMs > 0 ? <div>♨️ Cu apă: {formatDuration(day.upMs)}</div> : null}
        {day.downMs > 0 ? <div>⛔ Fără apă: {formatDuration(day.downMs)}</div> : null}
        {day.status === 'untracked' ? <div>⚪ Nu există înregistrări pentru ziua asta.</div> : null}
        {day.status === 'future' ? <div>🕒 Ziua nu a început încă.</div> : null}
        {day.status !== 'future' && day.status !== 'untracked' && unknownMs > 0 && day.trackedMs < 24 * 60 * 60 * 1000 ? (
          <div>⚪ Acoperire parțială: {formatDuration(unknownMs)}</div>
        ) : null}
      </div>
    </div>
  );
}

function selectedDayStatusLabel(day: DayCoverage) {
  if (day.status === 'ok') return 'OK';
  if (day.status === 'down') return 'Problemă';
  if (day.status === 'mixed') return 'Afectată parțial';
  if (day.status === 'future') return 'Viitor';
  return 'Necunoscut';
}

function selectedDayTone(day: DayCoverage) {
  if (day.status === 'ok') return 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200';
  if (day.status === 'down' || day.status === 'mixed') {
    return 'border-rose-400/30 bg-rose-500/12 text-rose-200';
  }
  if (day.status === 'future') return 'border-[var(--border)] bg-[var(--panel-2)]/62 text-[var(--muted)]';
  return 'border-[var(--border)] bg-[var(--panel-2)]/68 text-[var(--muted)]';
}

function segmentTone(status: ServiceStatus) {
  return status === 'ok'
    ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-100'
    : 'border-rose-400/25 bg-rose-500/10 text-rose-100';
}

function formatClock(date: Date) {
  return date.toLocaleTimeString('ro-RO', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function parseDayKey(dayKey: string) {
  const [year, month, day] = dayKey.split('-').map(Number);
  return new Date(year, month - 1, day);
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
  selectedDayKey,
  onSelectDay,
}: {
  month: Date;
  periods: PeriodRow[];
  now: Date;
  selectedDayKey: string | null;
  onSelectDay: (dateKey: string) => void;
}) {
  const days = useMemo(() => buildCalendarDays(month, periods, now), [month, now, periods]);

  return (
    <div className="overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
      <div className="min-w-[22rem] md:min-w-0">
        <div className="grid grid-cols-7 gap-0 text-center text-[8px] font-semibold uppercase tracking-[0.02em] text-[var(--muted)] sm:gap-2 sm:text-[11px] sm:tracking-[0.2em]">
          {WEEKDAY_LABELS.map((weekday, index) => (
            <div key={weekday} className="py-0.5">
              <span className="sm:hidden">{MOBILE_WEEKDAY_LABELS[index]}</span>
              <span className="hidden sm:inline">{weekday}</span>
            </div>
          ))}
        </div>

        <div className="mt-1.5 grid grid-cols-7 gap-0.5 sm:mt-3 sm:gap-2.5">
          {days.map((day) => {
            const inCurrentMonth = day.date.getMonth() === month.getMonth();
            const isToday = isSameDay(day.date, now);
            const isSelected = day.dateKey === selectedDayKey;
            return (
              <button
                key={day.dateKey}
                className={`group relative z-0 flex aspect-square min-h-[2.95rem] flex-col overflow-hidden rounded-[0.72rem] border p-0.5 text-left transition active:scale-[0.985] sm:min-h-[4.9rem] sm:rounded-2xl sm:p-2 md:overflow-visible ${daySurfaceClass(day, inCurrentMonth, isSelected)}`}
                style={daySurfaceStyle(day, inCurrentMonth)}
                title={dayTitle(day)}
                type="button"
                onClick={() => onSelectDay(day.dateKey)}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className={`${dayNumberWrapClass(isToday)} ${isToday ? 'mt-0.5 sm:mt-0' : 'pt-0.5 sm:pt-0'} text-[11px] font-semibold sm:text-sm ${dayNumberClass(day, inCurrentMonth, isSelected)}`}>
                    <span>{day.date.getDate()}</span>
                  </span>
                  <span className="text-[11px] opacity-0 md:opacity-100">{inCurrentMonth ? dayStatusEmoji(day) : ''}</span>
                </div>

                <div className="mt-auto flex items-end justify-end gap-2">
                  {isSelected ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-[color-mix(in_srgb,var(--accent)_72%,white_28%)] shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent)_12%,transparent)] sm:h-2 sm:w-2 sm:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_14%,transparent)]" />
                  ) : null}
                </div>

                <DayHoverCard day={day} />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function YearCalendar({
  yearDate,
  periods,
  now,
  selectedDayKey,
  onSelectDay,
}: {
  yearDate: Date;
  periods: PeriodRow[];
  now: Date;
  selectedDayKey: string | null;
  onSelectDay: (dateKey: string) => void;
}) {
  const months = useMemo(
    () => Array.from({ length: 12 }, (_, index) => new Date(yearDate.getFullYear(), index, 1)),
    [yearDate]
  );

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {months.map((month) => {
        const days = buildCalendarDays(month, periods, now);
        return (
          <div key={month.toISOString()} className="rounded-[1.65rem] border border-[var(--border)] bg-[var(--panel-2)]/70 p-2.5 sm:rounded-3xl sm:p-3">
            <div className="mb-2 text-sm font-semibold capitalize text-[var(--text)] sm:mb-3">
              {month.toLocaleDateString('ro-RO', { month: 'long' })}
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-[8px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)] sm:text-[9px] sm:tracking-[0.16em]">
              {WEEKDAY_LABELS.map((weekday) => (
                <div key={`${month.getMonth()}-${weekday}`}>{weekday}</div>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-7 gap-1">
              {days.map((day) => {
                const inCurrentMonth = day.date.getMonth() === month.getMonth();
                const isToday = isSameDay(day.date, now);
                const isSelected = day.dateKey === selectedDayKey;
                return (
                  <button
                    key={day.dateKey}
                    className={`flex aspect-square items-center justify-center rounded-[0.7rem] border text-[9px] font-semibold transition sm:rounded-[0.85rem] sm:text-[10px] ${daySurfaceClass(day, inCurrentMonth, isSelected)}`}
                    style={daySurfaceStyle(day, inCurrentMonth)}
                    title={dayTitle(day)}
                    type="button"
                    onClick={() => onSelectDay(day.dateKey)}
                    >
                      {inCurrentMonth ? (
                      <span className="relative inline-flex items-center justify-center">
                        <span
                          className={`${dayNumberWrapClass(isToday)} ${isToday ? '' : 'h-6 w-6 sm:h-7 sm:w-7'} ${dayNumberClass(day, inCurrentMonth, isSelected)}`}
                        >
                          {day.date.getDate()}
                        </span>
                        {isSelected ? (
                          <span className="absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full bg-[color-mix(in_srgb,var(--accent)_72%,white_28%)] shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent)_14%,transparent)]" />
                        ) : null}
                      </span>
                    ) : (
                      ''
                    )}
                  </button>
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
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(() => toIsoDay(new Date()));
  const pushEnvironment = useSyncExternalStore(
    subscribeNoop,
    getPushEnvironmentSnapshot,
    () => DEFAULT_PUSH_ENVIRONMENT
  );

  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [pushLoading, setPushLoading] = useState(false);
  const pushSupported = pushEnvironment.supported;
  const pushPermission = pushEnvironment.permission;

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
  const monthDays = useMemo(() => buildCalendarDays(focusDate, periods, now), [focusDate, now, periods]);
  const visibleMonthDayKeys = useMemo(
    () =>
      monthDays
        .filter((day) => day.date.getMonth() === focusDate.getMonth())
        .map((day) => day.dateKey),
    [focusDate, monthDays]
  );
  const canGoForward = useMemo(() => {
    if (viewMode === 'month') {
      const currentMonth = startOfMonth(now);
      return startOfMonth(focusDate).getTime() < currentMonth.getTime();
    }
    return startOfYear(focusDate).getTime() < startOfYear(now).getTime();
  }, [focusDate, now, viewMode]);

  function handleSelectDay(dayKey: string) {
    setSelectedDayKey(dayKey);
    if (viewMode === 'year') {
      const nextDate = parseDayKey(dayKey);
      setFocusDate(nextDate);
      setViewMode('month');
    }
  }

  const resolvedSelectedDayKey = useMemo(() => {
    const todayKey = toIsoDay(now);
    const currentMonthStart = startOfMonth(now).getTime();
    const focusMonthStart = startOfMonth(focusDate).getTime();
    const defaultKey =
      focusMonthStart === currentMonthStart && visibleMonthDayKeys.includes(todayKey)
        ? todayKey
        : (visibleMonthDayKeys[0] ?? null);

    if (!selectedDayKey) return defaultKey;
    return visibleMonthDayKeys.includes(selectedDayKey) ? selectedDayKey : defaultKey;
  }, [focusDate, now, selectedDayKey, visibleMonthDayKeys]);

  const selectedDay = useMemo(
    () => monthDays.find((day) => day.dateKey === resolvedSelectedDayKey) ?? null,
    [monthDays, resolvedSelectedDayKey]
  );
  const selectedDaySegments = useMemo(
    () => (selectedDay ? buildDaySegments(periods, selectedDay.date, now) : []),
    [now, periods, selectedDay]
  );

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
      <div className="space-y-4 sm:space-y-6">
        <section className="hero-card p-4 sm:p-6">
          <div className="flex flex-wrap items-center gap-3">
            <span className="eyebrow">Infra</span>
            <StatusPill status={app.status} />
          </div>

          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="display-title text-3xl font-semibold tracking-[-0.06em] sm:text-[2.35rem]">
                ♨️ Termo alert
              </h1>
            </div>
            <div className="min-w-[10rem] rounded-2xl border border-[var(--border)] bg-[var(--panel-2)]/72 px-3 py-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                ETA curent
              </div>
              <div className="mt-1 text-sm font-semibold text-[var(--text)]">{currentEta || 'Fără ETA activ'}</div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
            <HeroMetricCard
              label="Apă caldă"
              value={statusLabel(currentHotWaterStatus)}
              helper={currentHotWaterStatus === 'ok' ? 'Disponibilă acum' : 'Indisponibilă acum'}
              tone={serviceTone(currentHotWaterStatus)}
            />
            <HeroMetricCard
              label="Încălzire"
              value={statusLabel(currentHeatStatus)}
              helper={currentHeatStatus === 'ok' ? 'Disponibilă acum' : 'Indisponibilă acum'}
              tone={serviceTone(currentHeatStatus)}
            />
            <HeroMetricCard
              label="Interval curent"
              value={currentPeriodDuration}
              helper={currentPeriod ? `Din ${fmt(currentPeriod.started_at)}` : 'Încă fără interval'}
              tone="border-[var(--border)] bg-[var(--panel-2)]/75 text-[var(--text)]"
              compactValue
              className="col-span-2 xl:col-span-2"
            />
          </div>
        </section>

        <section className="surface-card px-3 py-4 sm:p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="text-lg font-semibold sm:text-xl">📊 Statistici & istoric</div>

            <div className="grid gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-end">
              <div className="inline-flex rounded-full border border-[var(--border)] bg-[var(--panel-2)] p-0.5 sm:p-1">
                <button
                  className={`rounded-full px-2.5 py-1.5 text-xs font-semibold transition sm:px-3 sm:py-2 sm:text-sm ${viewMode === 'month' ? 'bg-[var(--accent-2)] text-[var(--bg)]' : 'text-[var(--muted)]'}`}
                  onClick={() => setViewMode('month')}
                  type="button"
                >
                  Lună
                </button>
                <button
                  className={`rounded-full px-2.5 py-1.5 text-xs font-semibold transition sm:px-3 sm:py-2 sm:text-sm ${viewMode === 'year' ? 'bg-[var(--accent-2)] text-[var(--bg)]' : 'text-[var(--muted)]'}`}
                  onClick={() => setViewMode('year')}
                  type="button"
                >
                  An
                </button>
              </div>

              <div className="grid grid-cols-[2.25rem_minmax(0,1fr)_2.25rem] items-center gap-1">
                <button
                  className="btn-base btn-secondary !px-0 !py-1.5 text-sm sm:!px-3 sm:!py-2"
                  onClick={() => setFocusDate((prev) => (viewMode === 'month' ? addMonths(prev, -1) : addYears(prev, -1)))}
                  type="button"
                >
                  ←
                </button>
                <div className="truncate text-center text-xs font-semibold capitalize text-[var(--text)] sm:min-w-[10rem] sm:text-sm">
                  {viewLabel}
                </div>
                <button
                  className="btn-base btn-secondary !px-0 !py-1.5 text-sm disabled:opacity-45 sm:!px-3 sm:!py-2"
                  disabled={!canGoForward}
                  onClick={() => setFocusDate((prev) => (viewMode === 'month' ? addMonths(prev, 1) : addYears(prev, 1)))}
                  type="button"
                >
                  →
                </button>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <LegendItem label="OK" className="border-emerald-400/30 bg-emerald-500/12" />
            <LegendItem label="Problemă" className="border-rose-400/30 bg-rose-500/14" />
            <LegendItem label="Necunoscut" className="border-slate-300/40 bg-slate-300/30" />
          </div>
        </section>

        <section className="surface-card px-2 py-3 sm:p-6">
          {viewMode === 'month' ? (
            <MonthCalendar
              month={focusDate}
              periods={periods}
              now={now}
              selectedDayKey={resolvedSelectedDayKey}
              onSelectDay={handleSelectDay}
            />
          ) : (
            <YearCalendar
              yearDate={focusDate}
              periods={periods}
              now={now}
              selectedDayKey={resolvedSelectedDayKey}
              onSelectDay={handleSelectDay}
            />
          )}
        </section>

        <section className="surface-card p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                Zi selectată
              </div>
              <div className="mt-1 text-lg font-semibold text-[var(--text)]">
                {selectedDay ? selectedDay.date.toLocaleDateString('ro-RO', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'}
              </div>
            </div>
            {selectedDay ? (
              <div className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${selectedDayTone(selectedDay)}`}>
                {selectedDayStatusLabel(selectedDay)}
              </div>
            ) : null}
          </div>

          {selectedDay ? (
            <>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <CompactStatCard label="Disponibilitate zi" value={selectedDay.trackedMs > 0 ? `${Math.round((selectedDay.upMs / selectedDay.trackedMs) * 100)}%` : '—'} />
                <CompactStatCard label="Apă caldă azi" value={selectedDay.upMs > 0 ? formatDuration(selectedDay.upMs) : '—'} />
                <CompactStatCard label="Fără apă azi" value={selectedDay.downMs > 0 ? formatDuration(selectedDay.downMs) : '—'} />
                <CompactStatCard label="Acoperire" value={selectedDay.status === 'future' ? 'Viitor' : selectedDay.status === 'untracked' ? 'Fără date' : formatDuration(selectedDay.trackedMs)} />
              </div>

              <div className="mt-4">
                {selectedDay.status === 'future' ? (
                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel-2)]/62 p-4 text-sm text-[var(--muted)]">
                    Zi din viitor. Încă nu există intervale de afișat.
                  </div>
                ) : selectedDaySegments.length === 0 ? (
                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel-2)]/62 p-4 text-sm text-[var(--muted)]">
                    Nu există segmente înregistrate pentru ziua asta.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedDaySegments.map((segment) => (
                      <div
                        key={`${segment.status}-${segment.start.toISOString()}`}
                        className={`rounded-2xl border px-4 py-3 ${segmentTone(segment.status)}`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-sm font-semibold">
                            {segment.status === 'ok' ? 'Apă caldă' : 'Problemă'}
                          </div>
                          <div className="text-xs font-semibold uppercase tracking-[0.14em]">
                            {formatDuration(segment.durationMs)}
                          </div>
                        </div>
                        <div className="mt-1 text-sm text-[var(--muted)]">
                          {formatClock(segment.start)} - {formatClock(segment.end)}
                        </div>
                        {segment.eta ? (
                          <div className="mt-1 text-xs text-[var(--muted)]">ETA: {segment.eta}</div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : null}
        </section>

        <section className="surface-card p-5 sm:p-6">
          <div className="mb-4 text-sm text-[var(--muted)]">Statistici pentru {viewLabel}</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <CompactStatCard label="Disponibilitate" value={stats.availabilityPct == null ? '—' : `${stats.availabilityPct.toFixed(0)}%`} />
            <CompactStatCard label="Apă caldă" value={formatDuration(stats.upMs)} />
            <CompactStatCard label="Fără apă" value={formatDuration(stats.downMs)} />
            <CompactStatCard label="Fără date" value={stats.daysUntracked > 0 ? `${stats.daysUntracked}z` : '0z'} />
            <CompactStatCard label="Zile OK" value={String(stats.daysOk)} />
            <CompactStatCard label="Afectate" value={String(stats.daysProblematic)} />
            <CompactStatCard label="OFF complet" value={String(stats.daysDown)} />
            <CompactStatCard label="Înregistrări" value={String(periods.length)} />
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <CompactMetaCard label="Adresă urmărită" value={monitoredAddress || '—'} />
            <CompactMetaCard label="Ultima verificare" value={fmt(app.last_run_at)} />
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

        <section className="flex flex-wrap items-center justify-between gap-3">
          <ThemeToggle />
          <BackLink href="/">Dashboard</BackLink>
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

function HeroMetricCard({
  label,
  value,
  helper,
  tone,
  className = '',
  compactValue = false,
}: {
  label: string;
  value: string;
  helper: string;
  tone: string;
  className?: string;
  compactValue?: boolean;
}) {
  return (
    <div className={`rounded-2xl border px-3 py-3 ${tone} ${className}`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em]">{label}</div>
      <div className={`mt-2 font-semibold ${compactValue ? 'text-2xl sm:text-[1.85rem]' : 'text-2xl sm:text-[2rem]'}`}>
        {value}
      </div>
      <div className="mt-1.5 text-xs text-[var(--muted)]">{helper}</div>
    </div>
  );
}

function CompactStatCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel-2)]/68 px-3 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
        {label}
      </div>
      <div className="mt-1.5 text-lg font-semibold text-[var(--text)]">{value}</div>
    </div>
  );
}

function CompactMetaCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel-2)]/65 px-3 py-3">
      <div className="text-xs text-[var(--muted)]">{label}</div>
      <div className="mt-1.5 text-sm font-semibold text-[var(--text)]">{value}</div>
    </div>
  );
}
