import type { PeriodRow } from './types';
import type { ServiceStatus } from './types';

export const WEEKDAY_LABELS = ['Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sa', 'Du'];

export type HistoryViewMode = 'month' | 'year';
export type DayStatus = 'ok' | 'down' | 'mixed' | 'untracked' | 'future';

export type DayCoverage = {
  date: Date;
  dateKey: string;
  status: DayStatus;
  upMs: number;
  downMs: number;
  trackedMs: number;
};

export type DaySegment = {
  start: Date;
  end: Date;
  status: ServiceStatus;
  durationMs: number;
  eta: string | null;
};

export type RangeStats = {
  upMs: number;
  downMs: number;
  trackedMs: number;
  untrackedMs: number;
  availabilityPct: number | null;
  daysOk: number;
  daysDown: number;
  daysMixed: number;
  daysProblematic: number;
  daysUntracked: number;
};

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, delta: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + delta);
}

export function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function addMonths(date: Date, delta: number) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

export function endOfMonthExclusive(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

export function startOfYear(date: Date) {
  return new Date(date.getFullYear(), 0, 1);
}

export function addYears(date: Date, delta: number) {
  return new Date(date.getFullYear() + delta, 0, 1);
}

export function endOfYearExclusive(date: Date) {
  return new Date(date.getFullYear() + 1, 0, 1);
}

export function toIsoDay(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function clipPeriodEnd(period: PeriodRow, nowMs: number) {
  if (!period.ended_at) return nowMs;
  return Math.min(new Date(period.ended_at).getTime(), nowMs);
}

function sumCoverage(periods: PeriodRow[], startMs: number, endMs: number, nowMs: number) {
  const effectiveEndMs = Math.min(endMs, nowMs);
  let upMs = 0;
  let downMs = 0;

  if (effectiveEndMs <= startMs) {
    return { upMs, downMs, trackedMs: 0 };
  }

  for (const period of periods) {
    const periodStartMs = new Date(period.started_at).getTime();
    const periodEndMs = clipPeriodEnd(period, nowMs);
    if (periodEndMs <= startMs || periodStartMs >= effectiveEndMs) continue;

    const overlapStart = Math.max(startMs, periodStartMs);
    const overlapEnd = Math.min(effectiveEndMs, periodEndMs);
    if (overlapEnd <= overlapStart) continue;

    const overlapMs = overlapEnd - overlapStart;
    if (period.hot_water_status === 'ok') {
      upMs += overlapMs;
    } else {
      downMs += overlapMs;
    }
  }

  return {
    upMs,
    downMs,
    trackedMs: upMs + downMs,
  };
}

export function getCurrentPeriod(periods: PeriodRow[]) {
  return [...periods]
    .sort((left, right) => new Date(right.started_at).getTime() - new Date(left.started_at).getTime())
    .find((period) => period.ended_at === null) ?? null;
}

export function buildCalendarDays(month: Date, periods: PeriodRow[], now = new Date()) {
  const firstDay = startOfMonth(month);
  const startWeekday = (firstDay.getDay() + 6) % 7;
  const gridStart = addDays(firstDay, -startWeekday);

  return Array.from({ length: 42 }, (_, index) => {
    const date = addDays(gridStart, index);
    return buildDayCoverage(periods, date, now);
  });
}

export function buildRangeDayCoverage(
  periods: PeriodRow[],
  start: Date,
  endExclusive: Date,
  now = new Date()
) {
  const result: DayCoverage[] = [];
  for (let cursor = startOfDay(start); cursor < endExclusive; cursor = addDays(cursor, 1)) {
    result.push(buildDayCoverage(periods, cursor, now));
  }
  return result;
}

export function buildRangeStats(periods: PeriodRow[], start: Date, endExclusive: Date, now = new Date()) {
  const nowMs = now.getTime();
  const startMs = start.getTime();
  const endMs = endExclusive.getTime();
  const effectiveEndMs = Math.min(endMs, nowMs);
  const { upMs, downMs, trackedMs } = sumCoverage(periods, startMs, endMs, nowMs);
  const totalWindowMs = Math.max(0, effectiveEndMs - startMs);
  const days = buildRangeDayCoverage(periods, start, endExclusive, now);

  return {
    upMs,
    downMs,
    trackedMs,
    untrackedMs: Math.max(0, totalWindowMs - trackedMs),
    availabilityPct: trackedMs > 0 ? (upMs / trackedMs) * 100 : null,
    daysOk: days.filter((day) => day.status === 'ok').length,
    daysDown: days.filter((day) => day.status === 'down').length,
    daysMixed: days.filter((day) => day.status === 'mixed').length,
    daysProblematic: days.filter((day) => day.status === 'down' || day.status === 'mixed').length,
    daysUntracked: days.filter((day) => day.status === 'untracked').length,
  };
}

export function buildDaySegments(periods: PeriodRow[], day: Date, now = new Date()) {
  const dayStart = startOfDay(day);
  const dayEnd = addDays(dayStart, 1);
  const todayStart = startOfDay(now);
  const nowMs = now.getTime();
  const observedEndMs = dayStart.getTime() === todayStart.getTime() ? nowMs : dayEnd.getTime();
  const segments: DaySegment[] = [];

  if (observedEndMs <= dayStart.getTime()) {
    return segments;
  }

  for (const period of periods) {
    const periodStartMs = new Date(period.started_at).getTime();
    const periodEndMs = clipPeriodEnd(period, nowMs);
    if (periodEndMs <= dayStart.getTime() || periodStartMs >= observedEndMs) continue;

    const overlapStart = Math.max(dayStart.getTime(), periodStartMs);
    const overlapEnd = Math.min(observedEndMs, periodEndMs);
    if (overlapEnd <= overlapStart) continue;

    segments.push({
      start: new Date(overlapStart),
      end: new Date(overlapEnd),
      status: period.hot_water_status,
      durationMs: overlapEnd - overlapStart,
      eta: period.eta,
    });
  }

  return segments.sort((left, right) => left.start.getTime() - right.start.getTime());
}

export function formatDuration(ms: number) {
  if (ms <= 0) return '0h';

  const totalMinutes = Math.round(ms / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days >= 2) {
    return `${days}z ${hours}h`;
  }
  if (days === 1) {
    return hours > 0 ? '1z ' + `${hours}h` : '1z';
  }
  if (hours >= 1) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  return `${minutes}m`;
}

export function formatDayLabel(date: Date) {
  return date.toLocaleDateString('ro-RO', {
    day: '2-digit',
    month: 'short',
  });
}

export function formatMonthLabel(date: Date) {
  return date.toLocaleDateString('ro-RO', {
    month: 'long',
    year: 'numeric',
  });
}

export function formatYearLabel(date: Date) {
  return date.toLocaleDateString('ro-RO', { year: 'numeric' });
}

function buildDayCoverage(periods: PeriodRow[], day: Date, now: Date): DayCoverage {
  const dayStart = startOfDay(day);
  const dayEnd = addDays(dayStart, 1);
  const todayStart = startOfDay(now);
  const nowMs = now.getTime();

  if (dayStart.getTime() > todayStart.getTime()) {
    return {
      date: dayStart,
      dateKey: toIsoDay(dayStart),
      status: 'future',
      upMs: 0,
      downMs: 0,
      trackedMs: 0,
    };
  }

  const observedEndMs = dayStart.getTime() === todayStart.getTime() ? nowMs : dayEnd.getTime();
  const observedWindowMs = Math.max(0, observedEndMs - dayStart.getTime());
  const { upMs, downMs, trackedMs } = sumCoverage(periods, dayStart.getTime(), observedEndMs, nowMs);

  let status: DayStatus = 'untracked';
  if (trackedMs === 0) {
    status = 'untracked';
  } else if (upMs > 0 && downMs > 0) {
    status = 'mixed';
  } else if (trackedMs < observedWindowMs) {
    status = 'mixed';
  } else if (downMs > 0) {
    status = 'down';
  } else {
    status = 'ok';
  }

  return {
    date: dayStart,
    dateKey: toIsoDay(dayStart),
    status,
    upMs,
    downMs,
    trackedMs,
  };
}
