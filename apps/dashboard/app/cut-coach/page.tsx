'use client';

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type DragEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type WheelEvent as ReactWheelEvent } from 'react';
import {
  CheckCircle2,
  CircleAlert,
  Dumbbell,
  ArrowUp,
  Flag,
  MoonStar,
  Goal,
  Scale,
  Smartphone,
  UtensilsCrossed,
  Weight,
} from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BackLink, PageShell } from '@/components/PageShell';
import { ThemeToggle } from '@/components/ThemeToggle';
import {
  addDays,
  computeBaseTargetCalories,
  computeMaintenanceCalories,
  computeSafeMinimumCalories,
  humanizeAdjustmentReason,
  type CutCoachChallengeRow,
  type CutCoachDailyCheckinRow,
  type CutCoachProfileRow,
  type CutCoachReminderRow,
  type CutCoachWeightRow,
  type DailySummary,
} from '@/lib/cutCoach';
import styles from './page.module.css';

const APP_SLUG = 'cut-coach';
const SHOW_CHARACTER_LAYER = false;
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';
const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const PACE_PRESETS = [
  { label: 'Easy', value: '12', description: 'Easier to sustain' },
  { label: 'Standard', value: '18', description: 'Solid cut pace' },
  { label: 'Strict', value: '24', description: 'Harder to sustain' },
];

type PushEnvironmentSnapshot = {
  supported: boolean;
  permission: NotificationPermission | null;
};

type RewardToast = {
  id: number;
  title: string;
  body: string;
  xp?: number;
};

type BootstrapPayload = {
  todayIsoDate: string;
  profile: CutCoachProfileRow | null;
  today: DailySummary;
  tomorrow: DailySummary;
  week: DailySummary[];
  weights: CutCoachWeightRow[];
  checkins: CutCoachDailyCheckinRow[];
  challenges: CutCoachChallengeRow[];
  reminders: CutCoachReminderRow[];
  trends: {
    latest: CutCoachWeightRow | null;
    avg7: number | null;
    avg14: number | null;
    avg30: number | null;
    delta7: number | null;
    delta14: number | null;
  };
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

type CheckinState = {
  date: string;
  kcal_actual: string;
  activity_kcal_burned: string;
  activity_summary: string;
  notes: string;
  source_app: string;
};

type ActivityState = {
  date: string;
  activity_kcal_burned: string;
  activity_summary: string;
};

type WeightState = {
  date: string;
  weight_kg: string;
  waist_cm: string;
  hips_cm: string;
  chest_cm: string;
  thigh_cm: string;
  arm_cm: string;
  neck_cm: string;
  notes: string;
};

type ChallengeState = {
  id?: string;
  title: string;
  start_date: string;
  end_date: string;
  target_weight_kg: string;
  notes: string;
  status: 'planned' | 'active' | 'completed' | 'archived';
};

type ReminderDraft = {
  id?: string;
  kind: CutCoachReminderRow['kind'];
  title: string;
  local_time: string;
  weekdays: number[];
  enabled: boolean;
};

type SectionKey = 'today' | 'flow' | 'calendar' | 'progress' | 'settings';
type SetupComposer = 'profile' | 'challenge' | 'reminders' | null;
type ItemRarity = 'common' | 'magic' | 'rare' | 'set' | 'legendary';
type EquipmentSlotSize = 'small' | 'medium' | 'large' | 'tall';
type DragOrigin = { kind: 'equipped'; slot: string } | { kind: 'stash'; index: number } | null;
type SelectedItem = DragOrigin;
type BootstrapDetailPayload = {
  week: DailySummary[];
  reminders: CutCoachReminderRow[];
};

type CheckinMutationPayload = {
  summary: DailySummary;
  today: DailySummary;
  tomorrow: DailySummary;
  week: DailySummary[];
  checkins: CutCoachDailyCheckinRow[];
};

type WeightMutationPayload = {
  weights: CutCoachWeightRow[];
  trends: BootstrapPayload['trends'];
  today: DailySummary;
  tomorrow: DailySummary;
  week: DailySummary[];
};

type ReminderMutationPayload = {
  reminders: CutCoachReminderRow[];
};

type CharacterItem = {
  slot: string;
  name: string;
  rarity: ItemRarity;
  source: string;
  statLine: string;
  flavor: string;
};

type CharacterInventory = {
  equipped: Record<string, CharacterItem | null>;
  stash: CharacterItem[];
};

type CharacterState = {
  archetype: string;
  title: string;
  hp: number;
  maxHp: number;
  resolve: number;
  armor: number;
  magicFind: number;
  latestDrop: CharacterItem;
  inventory: CharacterInventory;
  warnings: string[];
};

const PAPER_DOLL_SLOTS = [
  { slot: 'helm', label: 'Head', area: 'head', size: 'medium' as EquipmentSlotSize },
  { slot: 'amulet', label: 'Amulet', area: 'amulet', size: 'small' as EquipmentSlotSize },
  { slot: 'weapon', label: 'Weapon', area: 'weapon', size: 'tall' as EquipmentSlotSize },
  { slot: 'chest', label: 'Chest', area: 'chest', size: 'large' as EquipmentSlotSize },
  { slot: 'shield', label: 'Shield', area: 'shield', size: 'tall' as EquipmentSlotSize },
  { slot: 'gloves', label: 'Gloves', area: 'gloves', size: 'medium' as EquipmentSlotSize },
  { slot: 'belt', label: 'Belt', area: 'belt', size: 'medium' as EquipmentSlotSize },
  { slot: 'ring', label: 'Ring I', area: 'ring', size: 'small' as EquipmentSlotSize },
  { slot: 'boots', label: 'Boots', area: 'boots', size: 'medium' as EquipmentSlotSize },
] as const;
const QUICK_SLOT_LABELS = ['I', 'II', 'III', 'IV'] as const;

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

const defaultSetup: SetupState = {
  age: '33',
  sex: 'male',
  height_cm: '180',
  activity_level: 'sedentary',
  preferred_deficit_pct: '12',
  protein_target_per_kg: '2',
  fat_min_per_kg: '0.7',
  meals_per_day: '3',
  initial_weight_kg: '',
  training_day_kcal_delta: '0',
  training_days: [],
};

function emptyCheckin(date: string): CheckinState {
  return {
    date,
    kcal_actual: '',
    activity_kcal_burned: '',
    activity_summary: '',
    notes: '',
    source_app: 'LifeSum',
  };
}

function emptyActivity(date: string): ActivityState {
  return {
    date,
    activity_kcal_burned: '',
    activity_summary: '',
  };
}

function emptyWeight(date: string): WeightState {
  return {
    date,
    weight_kg: '',
    waist_cm: '',
    hips_cm: '',
    chest_cm: '',
    thigh_cm: '',
    arm_cm: '',
    neck_cm: '',
    notes: '',
  };
}

function challengeDraft(todayIsoDate: string): ChallengeState {
  const start = addDays(todayIsoDate, 1);
  return {
    title: '100 day cut',
    start_date: start,
    end_date: addDays(start, 99),
    target_weight_kg: '',
    notes: '',
    status: 'active',
  };
}

function defaultReminderDrafts(existing: CutCoachReminderRow[]): ReminderDraft[] {
  if (existing.length > 0) {
    return existing.map((row) => ({
      id: row.id,
      kind: row.kind,
      title: row.title ?? reminderTitle(row.kind),
      local_time: row.local_time,
      weekdays: row.weekdays,
      enabled: row.enabled,
    }));
  }

  return [
    { kind: 'weigh_in', title: 'Weigh-in', local_time: '08:15', weekdays: [1, 2, 3, 4, 5, 6, 0], enabled: true },
    { kind: 'kcal_log', title: 'Log kcal', local_time: '20:45', weekdays: [1, 2, 3, 4, 5, 6, 0], enabled: true },
    { kind: 'weekend_measure', title: 'Weekend measurements', local_time: '11:00', weekdays: [6, 0], enabled: true },
    { kind: 'over_target_recovery', title: 'Recovery check', local_time: '09:30', weekdays: [1, 2, 3, 4, 5, 6, 0], enabled: true },
  ];
}

function reminderTitle(kind: CutCoachReminderRow['kind']) {
  switch (kind) {
    case 'weigh_in':
      return 'Weigh-in';
    case 'kcal_log':
      return 'Log kcal';
    case 'weekend_measure':
      return 'Weekend measurements';
    case 'over_target_recovery':
      return 'Recovery prompt';
    case 'milestone':
      return 'Milestone';
    default:
      return 'Reminder';
  }
}

function reminderDescription(kind: CutCoachReminderRow['kind']) {
  switch (kind) {
    case 'weigh_in':
      return 'A short morning prompt so the trend stays reliable.';
    case 'kcal_log':
      return 'One evening nudge to close the day with a clean total.';
    case 'weekend_measure':
      return 'Low-frequency body measurements for better context.';
    case 'over_target_recovery':
      return 'A softer reset when the previous day drifted high.';
    case 'milestone':
      return 'Celebrate meaningful checkpoints without spamming.';
    default:
      return 'A focused reminder tied to one action.';
  }
}

function formatDate(isoDate: string, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    ...options,
  }).format(new Date(`${isoDate}T12:00:00`));
}

function formatFullDate(isoDate: string) {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${isoDate}T12:00:00`));
}

function shortDay(isoDate: string) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
  }).format(new Date(`${isoDate}T12:00:00`));
}

function formatLocalIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isoDiff(start: string, end: string) {
  const left = new Date(`${start}T00:00:00`);
  const right = new Date(`${end}T00:00:00`);
  return Math.round((right.getTime() - left.getTime()) / 86400000);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function findWeekDay(payload: BootstrapPayload | null, date: string) {
  if (!payload) return null;
  return payload.week.find((day) => day.date === date) ?? null;
}

function selectActiveChallenge(challenges: CutCoachChallengeRow[], todayIsoDate: string) {
  return (
    challenges.find((item) => item.status === 'active') ??
    challenges.find((item) => todayIsoDate >= item.start_date && todayIsoDate <= item.end_date) ??
    challenges[0] ??
    null
  );
}

function findWeightForDate(weights: CutCoachWeightRow[], isoDate: string) {
  return weights.find((item) => item.date === isoDate) ?? null;
}

function findCheckinForDate(checkins: CutCoachDailyCheckinRow[], isoDate: string) {
  return checkins.find((item) => item.date === isoDate) ?? null;
}

function findNearestWeight(weights: CutCoachWeightRow[], isoDate: string) {
  const sorted = [...weights].sort((a, b) => a.date.localeCompare(b.date));
  const onOrBefore = [...sorted].reverse().find((item) => item.date <= isoDate);
  return onOrBefore ?? sorted.find((item) => item.date >= isoDate) ?? null;
}

function buildMonthCells(
  monthIsoDate: string,
  todayIsoDate: string,
  payload: BootstrapPayload | null,
  activeChallenge: CutCoachChallengeRow | null
) {
  const current = new Date(`${monthIsoDate}T12:00:00`);
  const monthStart = new Date(current.getFullYear(), current.getMonth(), 1);
  const firstWeekday = monthStart.getDay();
  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - firstWeekday);

  return Array.from({ length: 35 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    const isoDate = formatLocalIsoDate(date);
    const summary = findWeekDay(payload, isoDate);
    const checkin = payload ? findCheckinForDate(payload.checkins, isoDate) : null;
    const weight = payload ? findWeightForDate(payload.weights, isoDate) : null;
    const targetKcal = summary?.target ? Math.round(summary.target.kcal_target) : null;
    const actualKcal =
      checkin?.kcal_actual != null
        ? Math.round(checkin.kcal_actual)
        : summary && summary.caloriesSource !== 'none'
          ? Math.round(summary.consumed.calories)
          : null;
    const kcalDiff =
      targetKcal != null && actualKcal != null ? actualKcal - targetKcal : null;
    const isChallengeStart = activeChallenge?.start_date === isoDate;
    const isChallengeEnd = activeChallenge?.end_date === isoDate;
    const isInChallenge =
      Boolean(activeChallenge) &&
      isoDate >= (activeChallenge?.start_date ?? '') &&
      isoDate <= (activeChallenge?.end_date ?? '');
    const isChallengePast = isInChallenge && isoDate < todayIsoDate;
    const isChallengeCurrent = isInChallenge && isoDate === todayIsoDate;
    const isChallengeFuture = isInChallenge && isoDate > todayIsoDate;
    return {
      isoDate,
      label: date.getDate(),
      inMonth: date.getMonth() === current.getMonth(),
      summary,
      checkin,
      weight,
      targetKcal,
      actualKcal,
      kcalDiff,
      isChallengeStart,
      isChallengeEnd,
      isInChallenge,
      isChallengePast,
      isChallengeCurrent,
      isChallengeFuture,
      isToday: isoDate === todayIsoDate,
    };
  });
}

function buildYearMonths(
  todayIsoDate: string,
  payload: BootstrapPayload | null,
  activeChallenge: CutCoachChallengeRow | null
) {
  const current = new Date(`${todayIsoDate}T12:00:00`);
  const year = current.getFullYear();
  return Array.from({ length: 12 }, (_, monthIndex) => {
    const monthDate = new Date(year, monthIndex, 1, 12, 0, 0);
    const monthIsoDate = formatLocalIsoDate(monthDate);
    return {
      key: monthIsoDate,
      label: new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(monthDate),
      shortLabel: new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(monthDate),
      monthIndex,
      cells: buildMonthCells(monthIsoDate, todayIsoDate, payload, activeChallenge),
    };
  });
}

function buildChallengeStats(challenge: CutCoachChallengeRow | null, payload: BootstrapPayload | null) {
  if (!challenge || !payload) {
    return {
      totalDays: 0,
      currentDay: 0,
      progress: 0,
      startWeight: null as number | null,
      currentWeight: payload?.trends.latest?.weight_kg ?? null,
      deltaWeight: null as number | null,
      underTargetDays: 0,
      checkinDays: 0,
    };
  }

  const totalDays = isoDiff(challenge.start_date, challenge.end_date) + 1;
  const currentDay = clamp(isoDiff(challenge.start_date, payload.todayIsoDate) + 1, 0, totalDays);
  const progress = totalDays > 0 ? currentDay / totalDays : 0;
  const startWeight = findNearestWeight(payload.weights, challenge.start_date)?.weight_kg ?? null;
  const currentWeight = payload.trends.latest?.weight_kg ?? null;
  const deltaWeight =
    startWeight != null && currentWeight != null ? Number((currentWeight - startWeight).toFixed(1)) : null;
  const challengeCheckins = payload.checkins.filter(
    (item) => item.date >= challenge.start_date && item.date <= payload.todayIsoDate
  );
  const challengeWeek = payload.week.filter(
    (item) => item.date >= challenge.start_date && item.date <= payload.todayIsoDate
  );
  const underTargetDays = challengeWeek.filter(
    (item) => item.target && item.caloriesSource !== 'none' && item.consumed.calories <= item.target.kcal_target + 50
  ).length;

  return {
    totalDays,
    currentDay,
    progress,
    startWeight,
    currentWeight,
    deltaWeight,
    underTargetDays,
    checkinDays: challengeCheckins.filter((item) => item.kcal_actual != null).length,
  };
}

function buildXp(payload: BootstrapPayload | null) {
  if (!payload) return { xp: 0, level: 1 };
  const kcalDays = payload.checkins.filter((item) => item.kcal_actual != null).length;
  const weighDays = payload.weights.length;
  const movementDays = payload.checkins.filter(
    (item) => (item.activity_kcal_burned ?? 0) > 0 || Boolean(item.activity_summary)
  ).length;
  const measurementDays = payload.weights.filter(
    (item) => item.waist_cm || item.chest_cm || item.hips_cm || item.thigh_cm || item.arm_cm || item.neck_cm
  ).length;

  const xp = kcalDays * 12 + weighDays * 14 + movementDays * 8 + measurementDays * 20;
  return {
    xp,
    level: Math.max(1, Math.floor(xp / 120) + 1),
  };
}

function longestDailyStreak(dates: string[]) {
  if (!dates.length) return 0;
  const unique = [...new Set(dates)].sort();
  let best = 1;
  let current = 1;
  for (let index = 1; index < unique.length; index += 1) {
    const previous = unique[index - 1];
    const expected = addDays(previous, 1);
    if (unique[index] === expected) {
      current += 1;
      best = Math.max(best, current);
    } else {
      current = 1;
    }
  }
  return best;
}

function currentDailyStreak(dates: string[], todayIsoDate: string) {
  const unique = new Set(dates);
  let streak = 0;
  let cursor = todayIsoDate;
  while (unique.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

function buildAchievements(
  payload: BootstrapPayload | null,
  activeChallenge: CutCoachChallengeRow | null,
  challengeStats: ReturnType<typeof buildChallengeStats>
) {
  if (!payload) return [];

  const kcalDates = payload.checkins.filter((item) => item.kcal_actual != null).map((item) => item.date);
  const weightDates = payload.weights.map((item) => item.date);
  const measurementDates = payload.weights
    .filter((item) => item.waist_cm || item.hips_cm || item.chest_cm || item.thigh_cm || item.arm_cm || item.neck_cm)
    .map((item) => item.date);
  const movementDates = payload.checkins
    .filter((item) => (item.activity_kcal_burned ?? 0) >= 150 || Boolean(item.activity_summary))
    .map((item) => item.date);

  const kcalDays = kcalDates.length;
  const weighDays = weightDates.length;
  const measurementCount = measurementDates.length;
  const movementCount = movementDates.length;
  const weekGreen = payload.week.filter(
    (item) => item.target && item.caloriesSource !== 'none' && item.consumed.calories <= item.target.kcal_target + 50
  ).length;
  const weekLogs = payload.week.filter((item) => item.caloriesSource !== 'none').length;
  const kcalStreak = currentDailyStreak(kcalDates, payload.todayIsoDate);
  const longestKcalStreak = longestDailyStreak(kcalDates);
  const weighStreak = currentDailyStreak(weightDates, payload.todayIsoDate);
  const longestWeighStreak = longestDailyStreak(weightDates);
  const challengeGoalHit =
    activeChallenge?.target_weight_kg != null &&
    payload.trends.latest?.weight_kg != null &&
    payload.trends.latest.weight_kg <= activeChallenge.target_weight_kg;
  const hitSub2000 =
    payload.week.filter((item) => item.caloriesSource !== 'none' && item.consumed.calories <= 2000).length > 0;

  return [
    {
      title: 'First log',
      unlocked: kcalDays >= 1,
      body: kcalDays >= 1 ? 'You started kcal tracking.' : 'Log your first total kcal entry.',
    },
    {
      title: 'Three logs',
      unlocked: kcalDays >= 3,
      body: kcalDays >= 3 ? `${kcalDays} days with logged kcal.` : 'Hold 3 days with logged kcal.',
    },
    {
      title: 'Week recorder',
      unlocked: kcalDays >= 7,
      body: kcalDays >= 7 ? 'You made it through the first week of tracking.' : 'Reach 7 days with logged kcal.',
    },
    {
      title: 'Two-week lock',
      unlocked: kcalDays >= 14,
      body: kcalDays >= 14 ? 'You are already in a 2-week rhythm.' : 'Aim for 14 days with full check-ins.',
    },
    {
      title: 'Thirty day ledger',
      unlocked: kcalDays >= 30,
      body: kcalDays >= 30 ? 'You have a full month of useful data.' : 'Collect 30 days of logged kcal.',
    },
    {
      title: 'Hot streak',
      unlocked: kcalStreak >= 3,
      body: kcalStreak >= 3 ? `You have a ${kcalStreak}-day logging streak.` : 'Build a 3-day kcal logging streak.',
    },
    {
      title: 'Seven-day streak',
      unlocked: kcalStreak >= 7,
      body: kcalStreak >= 7 ? 'A full week without a break.' : 'Build a 7-day kcal logging streak.',
    },
    {
      title: 'Streak architect',
      unlocked: longestKcalStreak >= 14,
      body: longestKcalStreak >= 14 ? `Best streak: ${longestKcalStreak} days.` : 'Build a best streak of 14 days.',
    },
    {
      title: 'Scale online',
      unlocked: weighDays >= 1,
      body: weighDays >= 1 ? 'Your first weigh-in is on the board.' : 'Add your first weight as baseline.',
    },
    {
      title: 'Scale routine',
      unlocked: weighDays >= 3,
      body: weighDays >= 3 ? `${weighDays} weigh-ins saved.` : 'Reach 3 saved weigh-ins.',
    },
    {
      title: 'Morning gravity',
      unlocked: weighStreak >= 3,
      body: weighStreak >= 3 ? `${weighStreak} days weighed in a row.` : 'Weigh in 3 mornings in a row.',
    },
    {
      title: 'Trend visible',
      unlocked: longestWeighStreak >= 7,
      body: longestWeighStreak >= 7 ? 'Now the trend starts to mean something.' : 'Log 7 days of weigh-ins for a clear trend.',
    },
    {
      title: 'Weekend tape',
      unlocked: measurementCount >= 1,
      body: measurementCount >= 1 ? `You have ${measurementCount} measurement sessions.` : 'Save the standard measurements on the weekend.',
    },
    {
      title: 'Tape habit',
      unlocked: measurementCount >= 2,
      body: measurementCount >= 2 ? 'You already measured two weekends.' : 'Log measurements on 2 different weekends.',
    },
    {
      title: 'Body map',
      unlocked: measurementCount >= 4,
      body: measurementCount >= 4 ? 'You have enough measurements to track shape, not just kg.' : 'Collect 4 measurement sessions.',
    },
    {
      title: 'Movement day',
      unlocked: movementCount >= 1,
      body: movementCount >= 1 ? `${movementCount} days include movement too.` : 'Add one day with steps, walking or biking.',
    },
    {
      title: 'Walk engine',
      unlocked: movementCount >= 3,
      body: movementCount >= 3 ? 'Movement is starting to become a habit.' : 'Reach 3 days with useful movement.',
    },
    {
      title: 'Green week',
      unlocked: weekGreen >= 3,
      body: weekGreen >= 3 ? `${weekGreen} days in the flow are green.` : 'Aim for 3 green days this week.',
    },
    {
      title: 'Five clean days',
      unlocked: weekGreen >= 5,
      body: weekGreen >= 5 ? 'Very solid week.' : 'Aim for 5 on-target days in the same week.',
    },
    {
      title: 'Full week visible',
      unlocked: weekLogs >= 7,
      body: weekLogs >= 7 ? 'You have the full week filled in.' : 'Complete all 7 days in the week flow.',
    },
    {
      title: 'Sub-2000 day',
      unlocked: hitSub2000,
      body: hitSub2000 ? 'You already hit a day under 2000 kcal.' : 'Hit one clean day under 2000 kcal.',
    },
    {
      title: 'Challenge armed',
      unlocked: Boolean(activeChallenge),
      body: activeChallenge ? `${activeChallenge.title} is active.` : 'Save an active challenge period.',
    },
    {
      title: 'Quarter mark',
      unlocked: challengeStats.progress >= 0.25,
      body: challengeStats.progress >= 0.25 ? 'You passed the first quarter of the challenge.' : 'Reach 25% of the active period.',
    },
    {
      title: 'Halfway',
      unlocked: challengeStats.progress >= 0.5,
      body: challengeStats.progress >= 0.5 ? 'You passed the halfway mark.' : 'Reach 50% of the challenge.',
    },
    {
      title: 'Closing phase',
      unlocked: challengeStats.progress >= 0.75,
      body: challengeStats.progress >= 0.75 ? 'You are in the final 25% of the challenge.' : 'Reach the closing part of the challenge.',
    },
    {
      title: 'Weight moved',
      unlocked: challengeStats.deltaWeight != null && challengeStats.deltaWeight < -1,
      body:
        challengeStats.deltaWeight != null && challengeStats.deltaWeight < -1
          ? `${Math.abs(challengeStats.deltaWeight).toFixed(1)} kg down from the start.`
          : 'Drop at least 1 kg from challenge start.',
    },
    {
      title: 'Three kilos down',
      unlocked: challengeStats.deltaWeight != null && challengeStats.deltaWeight <= -3,
      body:
        challengeStats.deltaWeight != null && challengeStats.deltaWeight <= -3
          ? `You are down ${Math.abs(challengeStats.deltaWeight).toFixed(1)} kg.`
          : 'Aim for -3 kg vs challenge start.',
    },
    {
      title: 'Goal touch',
      unlocked: Boolean(challengeGoalHit),
      body: challengeGoalHit ? 'You hit the target weight.' : 'Reach the target weight from the challenge.',
    },
    {
      title: 'Recovery artist',
      unlocked: payload.week.some(
        (item) => item.target && item.caloriesSource !== 'none' && item.consumed.calories > item.target.kcal_target + 150
      ) && weekGreen >= 2,
      body:
        payload.week.some(
          (item) => item.target && item.caloriesSource !== 'none' && item.consumed.calories > item.target.kcal_target + 150
        ) && weekGreen >= 2
          ? 'You proved you can recover after an overage.'
          : 'After a heavy day, come back with 2 good days in the same week.',
    },
  ].sort((left, right) => {
    if (left.unlocked === right.unlocked) {
      return left.title.localeCompare(right.title);
    }
    return left.unlocked ? -1 : 1;
  });
}

function buildWeightChartData(weights: CutCoachWeightRow[]) {
  return [...weights]
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(-14)
    .map((item) => ({
      date: formatDate(item.date, { day: 'numeric', month: 'short' }),
      weight: item.weight_kg,
    }));
}

const SLOT_LIBRARY: Record<string, string[]> = {
  helm: ['Morning Weigh Circlet', 'Cold Iron Hood', 'Discipline Visor', 'Skull of Routine'],
  chest: ['Deficit Carapace', 'Ledger Plate', 'Fasting Harness', 'Quiet Bulkmail'],
  weapon: ['Scalepiercer', 'Calorie Cutter', 'Trendsplitter', 'Hungry Pike'],
  shield: ['Target Guard', 'Weekflow Bulwark', 'Green Day Ward', 'Momentum Aegis'],
  gloves: ['Grip of Routine', 'Check-in Claws', 'Logkeeper Grips', 'Quicksave Wraps'],
  belt: ['Belt of Recovery', 'Waistline Girdle', 'Clean Cut Sash', 'Ratio Strap'],
  boots: ['Steps of Return', 'Low Friction Greaves', 'Weekflow Boots', 'Silent March'],
  ring: ['Ring of the Green Week', 'Scale Loop', 'Disciplined Band', 'Ashen Halo'],
  amulet: ['Amulet of Satiety', 'Charm of Momentum', 'Necklace of Restraint', 'Iron Appetite'],
  charm: ['Stash Talisman', 'XP Fetish', 'Deficit Idol', 'Trend Relic'],
};

function pickSeeded<T>(seed: number, items: T[]) {
  const index = Math.abs(seed) % items.length;
  return items[index]!;
}

function rarityFromScore(score: number): ItemRarity {
  if (score >= 92) return 'legendary';
  if (score >= 78) return 'set';
  if (score >= 58) return 'rare';
  if (score >= 32) return 'magic';
  return 'common';
}

function buildItem(slot: string, seed: number, power: number, source: string): CharacterItem {
  const base = pickSeeded(seed, SLOT_LIBRARY[slot] ?? SLOT_LIBRARY.charm);
  const rarity = rarityFromScore((seed % 100) + power);
  const statTemplates = {
    common: [`+${6 + (power % 5)} focus`, `+${4 + (power % 4)} control`, `+${8 + (power % 6)} grit`],
    magic: [`+${10 + (power % 8)} discipline`, `+${12 + (power % 6)} momentum`, `+${10 + (power % 7)} recovery`],
    rare: [`+${15 + (power % 10)} clean kcal`, `+${14 + (power % 9)} trend power`, `+${16 + (power % 8)} weigh-in luck`],
    set: [`+${18 + (power % 12)} challenge armor`, `+${16 + (power % 10)} streak sustain`, `+${20 + (power % 8)} drop luck`],
    legendary: [`+${24 + (power % 12)} boss discipline`, `+${22 + (power % 10)} late-night resistance`, `+${26 + (power % 8)} cut velocity`],
  } satisfies Record<ItemRarity, string[]>;
  const statLine = pickSeeded(seed + power, statTemplates[rarity]);
  const flavor = pickSeeded(seed + power * 3, [
    'Dropped in the long walk between cravings and control.',
    'Warmed by streaks and sharpened by boring consistency.',
    'A quiet item that gets stronger when you just keep logging.',
    'Found somewhere between the scale, the target and the next clean day.',
  ]);

  return {
    slot,
    name: base,
    rarity,
    source,
    statLine,
    flavor,
  };
}

function buildCharacterState(args: {
  payload: BootstrapPayload | null;
  activeChallenge: CutCoachChallengeRow | null;
  challengeStats: ReturnType<typeof buildChallengeStats>;
  xp: ReturnType<typeof buildXp>;
  achievements: ReturnType<typeof buildAchievements>;
  todayCheckinDone: boolean;
  todayWeightDone: boolean;
  overToday: number | null;
}) {
  const { payload, activeChallenge, challengeStats, xp, achievements, todayCheckinDone, todayWeightDone, overToday } = args;
  const weekGreen = payload?.week.filter(
    (item) => item.target && item.caloriesSource !== 'none' && item.consumed.calories <= item.target.kcal_target + 50
  ).length ?? 0;
  const movementDays =
    payload?.checkins.filter((item) => (item.activity_kcal_burned ?? 0) >= 120 || Boolean(item.activity_summary)).length ?? 0;
  const unlockedCount = achievements.filter((item) => item.unlocked).length;
  const scoreSeed = xp.xp + challengeStats.currentDay * 19 + unlockedCount * 23 + weekGreen * 29 + movementDays * 11;
  const archetype = pickSeeded(scoreSeed, ['Deficit Ranger', 'Scale Paladin', 'Trend Sorcerer', 'Streak Rogue']);
  const title = activeChallenge ? `${phaseLabel(challengeStats.progress)} Walker` : 'Unbound Wanderer';
  const hpLoss =
    (todayCheckinDone ? 0 : 16) +
    (todayWeightDone ? 0 : 10) +
    (overToday != null && overToday > 180 ? 18 : overToday != null && overToday > 50 ? 8 : 0) +
    (activeChallenge ? 0 : 12) +
    (weekGreen < 2 ? 7 : 0);
  const hp = clamp(100 - hpLoss + Math.min(10, unlockedCount), 28, 100);
  const resolve = clamp(28 + weekGreen * 12 + Math.min(22, challengeStats.currentDay) + unlockedCount * 2 - (overToday != null && overToday > 150 ? 10 : 0), 0, 100);
  const armor = 40 + unlockedCount * 3 + weekGreen * 2;
  const magicFind = 6 + challengeStats.currentDay + unlockedCount * 2;
  const warnings = [
    !todayCheckinDone ? 'No kcal check-in today: HP penalty.' : null,
    !todayWeightDone ? 'No weigh-in today: armor drops a bit.' : null,
    overToday != null && overToday > 150 ? 'Heavy overage: health gets chipped.' : null,
    weekGreen < 2 ? 'Too few green days this week: resolve stays low.' : null,
  ].filter(Boolean) as string[];

  const activeSlots = ['helm', 'weapon', 'chest', 'amulet'];
  const equipped = Object.fromEntries(
    PAPER_DOLL_SLOTS.map(({ slot }, index) => [
      slot,
      activeSlots.includes(slot)
        ? buildItem(slot, scoreSeed + index * 41, unlockedCount * 6 + weekGreen * 4 + challengeStats.currentDay, 'equipped')
        : null,
    ])
  ) as Record<string, CharacterItem | null>;
  const stash = ['ring', 'boots', 'belt'].map((slot, index) =>
    buildItem(
      slot,
      scoreSeed + 300 + index * 53,
      unlockedCount * 7 + weekGreen * 5 + movementDays * 3 + index * 4,
      index < 2 ? 'achievement' : index < 4 ? 'daily drop' : 'challenge drop'
    )
  );
  const latestDrop = stash.at(0) ?? equipped.helm ?? buildItem('charm', scoreSeed + 999, unlockedCount * 5, 'daily drop');

  return {
    archetype,
    title,
    hp,
    maxHp: 100,
    resolve,
    armor,
    magicFind,
    latestDrop,
    inventory: {
      equipped,
      stash,
    },
    warnings,
  } satisfies CharacterState;
}

function toneForDay(day: DailySummary, todayIsoDate: string) {
  if (!day.target) return styles.dayToneNeutral;
  if (day.date > todayIsoDate) return styles.dayToneFuture;
  if (day.caloriesSource === 'none') return styles.dayToneMissing;
  const diff = day.consumed.calories - day.target.kcal_target;
  if (diff <= 50) return styles.dayToneGood;
  if (diff <= 180) return styles.dayToneWarn;
  return styles.dayToneBad;
}

function averageWeekTarget(payload: BootstrapPayload | null) {
  const targets = (payload?.week ?? []).filter((day) => day.target).map((day) => day.target!.kcal_target);
  if (!targets.length) return null;
  return average(targets);
}

function describeDayPlan(day: DailySummary, payload: BootstrapPayload | null) {
  if (!day.target) {
    return {
      emphasis: 'Pending',
      note: 'Plan loading',
    };
  }

  const weekAverage = averageWeekTarget(payload);
  const target = day.target.kcal_target;
  const delta = weekAverage != null ? target - weekAverage : 0;
  const emphasis = delta >= 55 ? 'Harder' : delta <= -55 ? 'Lighter' : 'Steady';
  const note = day.target.day_type === 'training' ? 'Train' : 'Rest';

  return { emphasis, note };
}

function fillSetup(profile: CutCoachProfileRow, latestWeight: number | null): SetupState {
  return {
    age: String(profile.age),
    sex: profile.sex,
    height_cm: String(profile.height_cm),
    activity_level: profile.activity_level,
    preferred_deficit_pct: String(profile.preferred_deficit_pct),
    protein_target_per_kg: String(profile.protein_target_per_kg),
    fat_min_per_kg: String(profile.fat_min_per_kg),
    meals_per_day: String(profile.meals_per_day),
    initial_weight_kg: latestWeight != null ? String(latestWeight) : '',
    training_day_kcal_delta: String(profile.training_day_kcal_delta),
    training_days: profile.training_days,
  };
}

function fillCheckin(date: string, payload: BootstrapPayload | null): CheckinState {
  if (!payload) return emptyCheckin(date);
  const checkin = findCheckinForDate(payload.checkins, date);
  if (!checkin) return emptyCheckin(date);
  return {
    date,
    kcal_actual: checkin.kcal_actual != null ? String(checkin.kcal_actual) : '',
    activity_kcal_burned: checkin.activity_kcal_burned != null ? String(checkin.activity_kcal_burned) : '',
    activity_summary: checkin.activity_summary ?? '',
    notes: checkin.notes ?? '',
    source_app: checkin.source_app ?? 'LifeSum',
  };
}

function seedCheckinEntry(date: string, payload: BootstrapPayload | null): CheckinState {
  const existing = fillCheckin(date, payload);
  if (toNumber(existing.kcal_actual) > 0) return existing;

  const summary = findWeekDay(payload, date);
  return {
    ...existing,
    kcal_actual: summary?.target ? String(Math.round(summary.target.kcal_target)) : '',
  };
}

function seedActivityEntry(date: string, payload: BootstrapPayload | null): ActivityState {
  if (!payload) return emptyActivity(date);
  const checkin = findCheckinForDate(payload.checkins, date);
  if (!checkin) return emptyActivity(date);
  return {
    date,
    activity_kcal_burned: checkin.activity_kcal_burned != null ? String(checkin.activity_kcal_burned) : '',
    activity_summary: checkin.activity_summary ?? '',
  };
}

function fillWeight(date: string, payload: BootstrapPayload | null): WeightState {
  if (!payload) return emptyWeight(date);
  const weight = findWeightForDate(payload.weights, date);
  if (!weight) return emptyWeight(date);
  return {
    date,
    weight_kg: String(weight.weight_kg),
    waist_cm: weight.waist_cm != null ? String(weight.waist_cm) : '',
    hips_cm: weight.hips_cm != null ? String(weight.hips_cm) : '',
    chest_cm: weight.chest_cm != null ? String(weight.chest_cm) : '',
    thigh_cm: weight.thigh_cm != null ? String(weight.thigh_cm) : '',
    arm_cm: weight.arm_cm != null ? String(weight.arm_cm) : '',
    neck_cm: weight.neck_cm != null ? String(weight.neck_cm) : '',
    notes: weight.notes ?? '',
  };
}

function seedWeightEntry(date: string, payload: BootstrapPayload | null): WeightState {
  const existing = fillWeight(date, payload);
  if (toNumber(existing.weight_kg) > 0) return existing;

  const latestWeight = payload?.trends.latest;
  return {
    ...existing,
    weight_kg: latestWeight?.weight_kg != null ? formatWeightInputValue(latestWeight.weight_kg) : '',
  };
}

function phaseLabel(progress: number) {
  if (progress < 0.2) return 'Ignition';
  if (progress < 0.55) return 'Rhythm';
  if (progress < 0.85) return 'Lock-in';
  return 'Finish';
}

function toNumber(value: string, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatWeightKg(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toFixed(2).replace(/\.?0+$/, '');
}

function formatWeightInputValue(value: number) {
  return value.toFixed(2).replace(/\.?0+$/, '');
}

function buildPreviewContext(setup: SetupState) {
  const weightKg = toNumber(setup.initial_weight_kg);
  const heightCm = toNumber(setup.height_cm);
  const age = toNumber(setup.age);
  if (weightKg <= 0 || heightCm <= 0 || age <= 0) return null;

  return {
    weightKg,
    profile: {
    user_id: 'preview',
    age,
    sex: setup.sex,
    height_cm: heightCm,
    goal_type: 'cut',
    activity_level: setup.activity_level as CutCoachProfileRow['activity_level'],
    preferred_deficit_pct: toNumber(setup.preferred_deficit_pct, 18),
    protein_target_per_kg: toNumber(setup.protein_target_per_kg, 2),
    fat_min_per_kg: toNumber(setup.fat_min_per_kg, 0.7),
    macro_strategy: 'balanced',
    meals_per_day: toNumber(setup.meals_per_day, 3),
    training_day_kcal_delta: toNumber(setup.training_day_kcal_delta, 150),
    maintenance_adjustment_kcal: 0,
    training_days: setup.training_days,
    created_at: '',
    updated_at: '',
    } satisfies CutCoachProfileRow,
  };
}

function buildSetupPreview(setup: SetupState) {
  const previewContext = buildPreviewContext(setup);
  if (!previewContext) return null;
  const { profile, weightKg } = previewContext;

  const maintenance = computeMaintenanceCalories(profile, weightKg);
  const safeMinimum = computeSafeMinimumCalories(profile, weightKg);
  const rawBase = computeBaseTargetCalories(profile, weightKg);
  const base = Math.max(safeMinimum, rawBase);
  const trainingCount = profile.training_days.length;
  const restCount = 7 - trainingCount;
  const restDelta = trainingCount > 0 && restCount > 0 ? (trainingCount * profile.training_day_kcal_delta) / restCount : 0;
  const trainingTarget = Math.max(safeMinimum, base + profile.training_day_kcal_delta);
  const restTarget = Math.max(safeMinimum, base - restDelta);

  return {
    maintenance: Math.round(maintenance),
    safeMinimum: Math.round(safeMinimum),
    rawBaseTarget: Math.round(rawBase),
    baseTarget: Math.round(base),
    trainingTarget: Math.round(trainingTarget),
    restTarget: Math.round(restTarget),
    effectiveDeficit: Math.round(Math.max(0, maintenance - base)),
    floorApplied: base > rawBase + 0.5,
  };
}

function buildPacePreview(setup: SetupState, percentValue: string) {
  const preview = buildSetupPreview({
    ...setup,
    preferred_deficit_pct: percentValue,
  });
  if (!preview) return null;
  return {
    deficit: preview.effectiveDeficit,
    floorApplied: preview.floorApplied,
    target: preview.baseTarget,
  };
}

function buildReward(url: string, successMessage: string): RewardToast {
  const id = Date.now();
  if (url.includes('/checkins')) {
    return { id, title: 'Saved', body: successMessage };
  }
  if (url.includes('/weights')) {
    return { id, title: 'Saved', body: successMessage };
  }
  if (url.includes('/profile')) {
    return { id, title: 'Saved', body: successMessage };
  }
  if (url.includes('/challenges')) {
    return { id, title: 'Saved', body: successMessage };
  }
  return { id, title: 'Saved', body: successMessage };
}

function applyNoGymPreset() {
  return {
    activity_level: 'sedentary',
    preferred_deficit_pct: '12',
    training_day_kcal_delta: '0',
    training_days: [] as number[],
  };
}

function validateSetup(setup: SetupState) {
  if (toNumber(setup.initial_weight_kg) <= 0) return 'Add a valid current weight first.';
  if (toNumber(setup.height_cm) <= 0) return 'Add a valid height.';
  if (toNumber(setup.age) <= 0) return 'Add a valid age.';
  return null;
}

function validateChallenge(challenge: ChallengeState) {
  if (!challenge.title.trim()) return 'Add a challenge title.';
  if (!challenge.start_date || !challenge.end_date) return 'Pick both start and end dates.';
  if (challenge.end_date < challenge.start_date) return 'End date must be after start date.';
  return null;
}

export default function CutCoachPage() {
  const initialIsoDate = formatLocalIsoDate(new Date());
  const [data, setData] = useState<BootstrapPayload | null>(null);
  const [heroReady, setHeroReady] = useState(false);
  const [detailReady, setDetailReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [setup, setSetup] = useState<SetupState>(defaultSetup);
  const [checkin, setCheckin] = useState<CheckinState>(emptyCheckin(initialIsoDate));
  const [activityDraft, setActivityDraft] = useState<ActivityState>(emptyActivity(initialIsoDate));
  const [weight, setWeight] = useState<WeightState>(emptyWeight(initialIsoDate));
  const [challenge, setChallenge] = useState<ChallengeState>(challengeDraft(initialIsoDate));
  const [reminders, setReminders] = useState<ReminderDraft[]>(defaultReminderDrafts([]));
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [rewardToast, setRewardToast] = useState<RewardToast | null>(null);
  const [optimisticCheckin, setOptimisticCheckin] = useState<{ date: string; kcalActual: number | null } | null>(null);
  const [optimisticWeight, setOptimisticWeight] = useState<{ date: string; weightKg: number } | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Record<SectionKey, boolean>>({
    today: false,
    flow: false,
    calendar: false,
    progress: false,
    settings: true,
  });
  const [setupComposer, setSetupComposer] = useState<SetupComposer>(null);
  const [inventoryOverride, setInventoryOverride] = useState<CharacterInventory | null>(null);
  const [draggedItem, setDraggedItem] = useState<DragOrigin>(null);
  const [selectedItem, setSelectedItem] = useState<SelectedItem>(null);
  const [characterCollapsed, setCharacterCollapsed] = useState(false);
  const [kcalModalOpen, setKcalModalOpen] = useState(false);
  const [activityModalOpen, setActivityModalOpen] = useState(false);
  const [weightModalOpen, setWeightModalOpen] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [weightDraft, setWeightDraft] = useState<WeightState>(emptyWeight(initialIsoDate));
  const [kcalDialRotation, setKcalDialRotation] = useState(0);
  const [weightDialRotation, setWeightDialRotation] = useState(0);
  const kcalDialDragRef = useRef<{
    pointerId: number;
    startValue: number;
    lastAngle: number;
    lastStep: number;
    accumulatedAngle: number;
    startRotation: number;
  } | null>(null);
  const weightDialDragRef = useRef<{
    pointerId: number;
    startValue: number;
    lastAngle: number;
    lastStep: number;
    accumulatedAngle: number;
    startRotation: number;
  } | null>(null);
  const pushEnvironment = useSyncExternalStore(
    subscribeNoop,
    getPushEnvironmentSnapshot,
    () => DEFAULT_PUSH_ENVIRONMENT
  );
  const pushSupported = pushEnvironment.supported;
  const setupPreview = buildSetupPreview(setup);
  const selectedPacePreview = buildPacePreview(setup, setup.preferred_deficit_pct);
  const pacePreviews = Object.fromEntries(
    PACE_PRESETS.map((preset) => [preset.value, buildPacePreview(setup, preset.value)])
  ) as Record<string, ReturnType<typeof buildPacePreview>>;
  const todayIsoDate = data?.todayIsoDate ?? initialIsoDate;

  useEffect(() => {
    if (typeof window === 'undefined') return;

    function handleScroll() {
      setShowBackToTop(window.scrollY > 280);
    }

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  function openCalendarDay(date: string) {
    setCheckin(seedCheckinEntry(date, data));
    setKcalDialRotation(0);
    setKcalModalOpen(true);
  }

  function openTodayEntry() {
    setCheckin(seedCheckinEntry(todayIsoDate, data));
    setKcalDialRotation(0);
    setKcalModalOpen(true);
  }

  function openActivityModal(date = todayIsoDate) {
    setActivityDraft(seedActivityEntry(date, data));
    setActivityModalOpen(true);
  }

  function baseWeightEntryState(date: string) {
    return seedWeightEntry(date, data);
  }

  function openWeightModal(date = todayIsoDate) {
    setWeightDraft(baseWeightEntryState(date));
    setWeightModalOpen(true);
  }

  function closeKcalModal() {
    setKcalModalOpen(false);
    setCheckin(seedCheckinEntry(todayIsoDate, data));
    kcalDialDragRef.current = null;
    setKcalDialRotation(0);
  }

  function closeActivityModal() {
    setActivityModalOpen(false);
    setActivityDraft(seedActivityEntry(todayIsoDate, data));
  }

  function closeWeightModal() {
    setWeightModalOpen(false);
    setWeightDraft(baseWeightEntryState(todayIsoDate));
    weightDialDragRef.current = null;
    setWeightDialRotation(0);
  }

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!kcalModalOpen && !weightModalOpen && !activityModalOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      if (kcalModalOpen) {
        setKcalModalOpen(false);
        setCheckin(seedCheckinEntry(todayIsoDate, data));
        kcalDialDragRef.current = null;
        setKcalDialRotation(0);
        return;
      }
      if (activityModalOpen) {
        setActivityModalOpen(false);
        setActivityDraft(seedActivityEntry(todayIsoDate, data));
        return;
      }
      if (weightModalOpen) {
        setWeightModalOpen(false);
        setWeightDraft(seedWeightEntry(todayIsoDate, data));
        weightDialDragRef.current = null;
        setWeightDialRotation(0);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activityModalOpen, data, kcalModalOpen, todayIsoDate, weightModalOpen]);

  function applyBootstrap(payload: BootstrapPayload) {
    setData(payload);
    setInventoryOverride(null);
    setDraggedItem(null);
    setSelectedItem(null);
    if (payload.profile) {
      setSetup(fillSetup(payload.profile, payload.trends.latest?.weight_kg ?? null));
    }
    const active = selectActiveChallenge(payload.challenges, payload.todayIsoDate);
    setChallenge(
      active
        ? {
            id: active.id,
            title: active.title,
            start_date: active.start_date,
            end_date: active.end_date,
            target_weight_kg: active.target_weight_kg != null ? String(active.target_weight_kg) : '',
            notes: active.notes ?? '',
            status: active.status,
          }
        : challengeDraft(payload.todayIsoDate)
    );
    setCheckin(seedCheckinEntry(payload.todayIsoDate, payload));
    setActivityDraft(seedActivityEntry(payload.todayIsoDate, payload));
    setWeight(seedWeightEntry(payload.todayIsoDate, payload));
    setWeightDraft(seedWeightEntry(payload.todayIsoDate, payload));
    setReminders(defaultReminderDrafts(payload.reminders));
  }

  function mergeWeekDetail(payload: BootstrapDetailPayload) {
    setData((current) => {
      if (!current) return current;
      return {
        ...current,
        week: payload.week,
        reminders: payload.reminders,
      };
    });
    setReminders(defaultReminderDrafts(payload.reminders));
  }

  async function loadBootstrap(options?: { silent?: boolean }) {
    if (!options?.silent) setBusy('loading');
    setError(null);
    const res = await fetch('/api/cut-coach/bootstrap', { cache: 'no-store' });
    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      setError(payload.error ?? 'Could not load Cut Coach.');
      setBusy(null);
      return;
    }

    const payload = (await res.json()) as BootstrapPayload;
    applyBootstrap(payload);
    setHeroReady(true);
    setDetailReady(true);
    setBusy(null);
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setBusy('loading');
      setError(null);
      setHeroReady(false);
      setDetailReady(false);
      const res = await fetch('/api/cut-coach/bootstrap-hero', { cache: 'no-store' });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        if (!cancelled) {
          setError(payload.error ?? 'Could not load Cut Coach.');
          setHeroReady(true);
          setDetailReady(true);
          setBusy(null);
        }
        return;
      }
      const payload = (await res.json()) as BootstrapPayload;
      if (!cancelled) {
        applyBootstrap(payload);
        setHeroReady(true);
        setBusy(null);
        void (async () => {
          const detailRes = await fetch('/api/cut-coach/bootstrap-detail', { cache: 'no-store' });
          if (!detailRes.ok) {
            const detailPayload = (await detailRes.json().catch(() => ({}))) as { error?: string };
            if (!cancelled) {
              setError((current) => current ?? detailPayload.error ?? 'Could not load the week plan.');
              setDetailReady(true);
            }
            return;
          }

          const detailPayload = (await detailRes.json()) as BootstrapDetailPayload;
          if (!cancelled) {
            mergeWeekDetail(detailPayload);
            setDetailReady(true);
          }
        })();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!pushSupported) {
      return;
    }

    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => setPushEnabled(Boolean(subscription)))
      .catch(() => setPushEnabled(false));
  }, [pushSupported]);

  useEffect(() => {
    if (!rewardToast) return;
    const timer = window.setTimeout(() => setRewardToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [rewardToast]);

  async function postJson<T>(
    url: string,
    body: unknown,
    successMessage: string,
    options?: {
      reload?: 'full' | 'none';
      apply?: (payload: T) => void | Promise<void>;
    }
  ) {
    setBusy(url);
    setError(null);
    setNotice(null);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) {
      setError(payload.error ?? 'Request failed.');
      setBusy(null);
      return false;
    }
    setRewardToast(buildReward(url, successMessage));
    if (options?.apply) {
      await options.apply(payload);
    } else if (options?.reload !== 'none') {
      await loadBootstrap({ silent: true });
    }
    setBusy(null);
    return true;
  }

  async function persistProfile(nextSetup: SetupState, successMessage = 'Profile saved.') {
    return await postJson(
      '/api/cut-coach/profile',
      {
        ...nextSetup,
        goal_type: 'cut',
        macro_strategy: 'balanced',
        initial_weight_date: checkin.date,
      },
      successMessage
    );
  }

  async function saveSetup() {
    const validationError = validateSetup(setup);
    if (validationError) {
      setNotice(validationError);
      return false;
    }
    const ok = await persistProfile(setup);
    if (ok) setSetupComposer(null);
    return ok;
  }

  async function persistCheckin(nextCheckin: CheckinState, successMessage: string, copiedFromPrevious = false) {
    const ok = await postJson<CheckinMutationPayload>(
      '/api/cut-coach/checkins',
      {
        ...nextCheckin,
        copied_from_previous: copiedFromPrevious,
      },
      successMessage,
      {
        reload: 'none',
        apply: async (payload) => {
          setData((current) => {
            if (!current) return current;
            return {
              ...current,
              today: payload.today,
              tomorrow: payload.tomorrow,
              week: payload.week,
              checkins: payload.checkins,
            };
          });
        },
      }
    );
    return ok;
  }

  async function saveCheckin(copiedFromPrevious = false) {
    return await persistCheckin(checkin, 'Today kcal saved.', copiedFromPrevious);
  }

  async function saveCheckinAndClose() {
    const optimisticValue = toNumber(checkin.kcal_actual) > 0 ? Math.round(toNumber(checkin.kcal_actual)) : null;
    closeKcalModal();
    setOptimisticCheckin({ date: checkin.date, kcalActual: optimisticValue });
    const ok = await saveCheckin();
    setOptimisticCheckin(null);
    return ok;
  }

  async function saveActivityDraft() {
    setActivityModalOpen(false);
    const existing = fillCheckin(activityDraft.date, data);
    const ok = await postJson<CheckinMutationPayload>(
      '/api/cut-coach/checkins',
      {
        ...existing,
        ...activityDraft,
      },
      'Activity saved.',
      {
        reload: 'none',
        apply: async (payload) => {
          setData((current) => {
            if (!current) return current;
            return {
              ...current,
              today: payload.today,
              tomorrow: payload.tomorrow,
              week: payload.week,
              checkins: payload.checkins,
            };
          });
        },
      }
    );
    return ok;
  }

  async function persistWeightEntry(nextWeight: WeightState, successMessage = 'Weight and measurements saved.') {
    if (toNumber(nextWeight.weight_kg) <= 0) {
      setNotice('Add a valid weight first.');
      return false;
    }
    return await postJson<WeightMutationPayload>('/api/cut-coach/weights', nextWeight, successMessage, {
      reload: 'none',
      apply: async (payload) => {
        setData((current) => {
          if (!current) return current;
          return {
            ...current,
            today: payload.today,
            tomorrow: payload.tomorrow,
            week: payload.week,
            weights: payload.weights,
            trends: payload.trends,
          };
        });
      },
    });
  }

  async function saveWeightDraft() {
    const optimisticValue = toNumber(weightDraft.weight_kg);
    setWeightModalOpen(false);
    if (optimisticValue > 0) {
      setOptimisticWeight({ date: weightDraft.date, weightKg: optimisticValue });
    }
    const ok = await persistWeightEntry(weightDraft, 'Weight saved.');
    setOptimisticWeight(null);
    if (ok) setWeight(weightDraft);
    return ok;
  }

  async function saveChallenge() {
    const validationError = validateChallenge(challenge);
    if (validationError) {
      setNotice(validationError);
      return false;
    }
    if (activeChallenge && activeChallenge.id !== challenge.id && activeChallenge.status === 'active') {
      setNotice('A challenge is already active. Edit it or stop it first.');
      return false;
    }
    const ok = await postJson('/api/cut-coach/challenges', challenge, 'Challenge saved.');
    if (ok) setSetupComposer(null);
    return ok;
  }

  async function startQuick100Challenge() {
    if (activeChallenge?.status === 'active') {
      setNotice('A challenge is already running. Stop it first or edit the current one.');
      return false;
    }
    const nextChallenge = {
      ...challengeDraft(todayIsoDate),
      start_date: todayIsoDate,
      end_date: addDays(todayIsoDate, 99),
      title: '100 day cut',
      status: 'active' as const,
    };
    setChallenge(nextChallenge);
    const ok = await postJson('/api/cut-coach/challenges', nextChallenge, '100-day challenge started.');
    if (ok) setSetupComposer(null);
    return ok;
  }

  async function stopActiveChallenge() {
    if (!activeChallenge) return;
    if (typeof window !== 'undefined') {
      const confirmed = window.confirm('Stop the active challenge? This archives the run, but keeps your logs and weight history.');
      if (!confirmed) return;
    }
    const ok = await postJson(
      '/api/cut-coach/challenges',
      {
        ...activeChallenge,
        status: 'archived',
      },
      'Active challenge stopped.'
    );
    if (ok) setSetupComposer(null);
  }

  async function applyProfilePreset(patch: Partial<SetupState>, successMessage: string) {
    const nextSetup = {
      ...setup,
      ...patch,
    };
    setSetup(nextSetup);
    await persistProfile(nextSetup, successMessage);
  }

  async function saveReminders() {
    const ok = await postJson<ReminderMutationPayload>('/api/cut-coach/reminders', { reminders }, 'Reminders saved.', {
      reload: 'none',
      apply: async (payload) => {
        setData((current) => {
          if (!current) return current;
          return {
            ...current,
            reminders: payload.reminders,
          };
        });
        setReminders(defaultReminderDrafts(payload.reminders));
      },
    });
    if (ok) setSetupComposer(null);
    return ok;
  }

  function currentWeightSeed(source: WeightState = weight) {
    return toNumber(source.weight_kg) > 0
      ? toNumber(source.weight_kg)
      : data?.trends.latest?.weight_kg ?? toNumber(setup.initial_weight_kg);
  }

  function setWeightFromNumber(nextValue: number, target: 'weight' | 'draft' = 'weight') {
    const safeValue = Math.max(0, Math.round(nextValue * 100) / 100);
    const setter = target === 'draft' ? setWeightDraft : setWeight;
    setter((current) => ({
      ...current,
      weight_kg: safeValue > 0 ? formatWeightInputValue(safeValue) : '',
    }));
  }

  function applyWeightDelta(delta: number, target: 'weight' | 'draft' = 'weight', source?: WeightState) {
    setWeightFromNumber(currentWeightSeed(source ?? (target === 'draft' ? weightDraft : weight)) + delta, target);
  }

  function currentKcalSeed(source: CheckinState = checkin) {
    if (toNumber(source.kcal_actual) > 0) return toNumber(source.kcal_actual);
    return findWeekDay(data, source.date)?.target ? Math.round(findWeekDay(data, source.date)!.target!.kcal_target) : 0;
  }

  function setKcalFromNumber(nextValue: number) {
    const safeValue = Math.max(0, Math.round(nextValue));
    setCheckin((current) => ({
      ...current,
      kcal_actual: safeValue > 0 ? String(safeValue) : '',
    }));
  }

  function handleKcalDialStart(event: ReactPointerEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const angle = Math.atan2(event.clientY - centerY, event.clientX - centerX) * (180 / Math.PI);
    kcalDialDragRef.current = {
      pointerId: event.pointerId,
      startValue: currentKcalSeed(checkin),
      lastAngle: angle,
      lastStep: 0,
      accumulatedAngle: 0,
      startRotation: kcalDialRotation,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleKcalDialMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const dragState = kcalDialDragRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const nextAngle = Math.atan2(event.clientY - centerY, event.clientX - centerX) * (180 / Math.PI);
    let delta = nextAngle - dragState.lastAngle;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    dragState.lastAngle = nextAngle;
    dragState.accumulatedAngle += delta;
    const nextStep = Math.trunc(dragState.accumulatedAngle / 8);
    if (nextStep === dragState.lastStep) return;
    dragState.lastStep = nextStep;
    setKcalDialRotation(dragState.startRotation + nextStep * 8);
    setKcalFromNumber(dragState.startValue + nextStep * 10);
  }

  function handleKcalDialEnd(event: ReactPointerEvent<HTMLButtonElement>) {
    const dragState = kcalDialDragRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    kcalDialDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleKcalDialWheel(event: ReactWheelEvent<HTMLButtonElement>) {
    event.preventDefault();
    setKcalDialRotation((current) => current + (event.deltaY < 0 ? 10 : -10));
    setKcalFromNumber(currentKcalSeed(checkin) + (event.deltaY < 0 ? 10 : -10));
  }

  function handleWeightDialStart(event: ReactPointerEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const angle = Math.atan2(event.clientY - centerY, event.clientX - centerX) * (180 / Math.PI);
    const startValue = currentWeightSeed(weightDraft);
    weightDialDragRef.current = {
      pointerId: event.pointerId,
      startValue,
      lastAngle: angle,
      lastStep: 0,
      accumulatedAngle: 0,
      startRotation: weightDialRotation,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleWeightDialMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const dragState = weightDialDragRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const nextAngle = Math.atan2(event.clientY - centerY, event.clientX - centerX) * (180 / Math.PI);
    let delta = nextAngle - dragState.lastAngle;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    dragState.lastAngle = nextAngle;
    dragState.accumulatedAngle += delta;
    const nextStep = Math.trunc(dragState.accumulatedAngle / 8);
    if (nextStep === dragState.lastStep) return;
    dragState.lastStep = nextStep;
    setWeightDialRotation(dragState.startRotation + nextStep * 8);
    setWeightFromNumber(dragState.startValue + nextStep * 0.01, 'draft');
  }

  function handleWeightDialEnd(event: ReactPointerEvent<HTMLButtonElement>) {
    const dragState = weightDialDragRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    weightDialDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleWeightDialWheel(event: ReactWheelEvent<HTMLButtonElement>) {
    event.preventDefault();
    setWeightDialRotation((current) => current + (event.deltaY < 0 ? 10 : -10));
    applyWeightDelta(event.deltaY < 0 ? 0.01 : -0.01, 'draft', weightDraft);
  }

  function toggleSection(section: SectionKey) {
    setCollapsedSections((current) => ({
      ...current,
      [section]: !current[section],
    }));
  }

  async function enableNotifications() {
    if (!pushSupported) return;
    setPushBusy(true);
    setPushError(null);
    try {
      if (Notification.permission === 'denied') {
        setPushError('Notifications are blocked in this browser.');
        setPushBusy(false);
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setPushError('Notification permission was not granted.');
        setPushBusy(false);
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        if (!VAPID_PUBLIC_KEY) {
          setPushError('Missing VAPID public key.');
          setPushBusy(false);
          return;
        }

        const padding = '='.repeat((4 - (VAPID_PUBLIC_KEY.length % 4)) % 4);
        const base64 = (VAPID_PUBLIC_KEY + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        const applicationServerKey = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; i += 1) applicationServerKey[i] = rawData.charCodeAt(i);

        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
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
        setPushError('Could not save the subscription.');
        setPushBusy(false);
        return;
      }

      setPushEnabled(true);
      setNotice('Cut Coach push is now active.');
      setPushBusy(false);
    } catch {
      setPushError('Could not enable notifications.');
      setPushBusy(false);
    }
  }

  const activeChallenge = selectActiveChallenge(data?.challenges ?? [], todayIsoDate);
  const challengeStats = buildChallengeStats(activeChallenge, data);
  const xp = buildXp(data);
  const achievements = buildAchievements(data, activeChallenge, challengeStats);
  const today = data?.today ?? null;
  const tomorrow = data?.tomorrow ?? null;
  const selectedDay = findWeekDay(data, checkin.date);
  const yearMonths = buildYearMonths(todayIsoDate, data, activeChallenge);
  const currentMonth = yearMonths[new Date(`${todayIsoDate}T12:00:00`).getMonth()] ?? yearMonths[0] ?? null;
  const todayCheckinDone = Boolean(data && findCheckinForDate(data.checkins, todayIsoDate)?.kcal_actual != null);
  const todayWeightDone = Boolean(data && findWeightForDate(data.weights, todayIsoDate)?.weight_kg != null);
  const latestKnownWeight = data?.trends.latest?.weight_kg ?? null;
  const selectedTargetKcal = selectedDay?.target ? Math.round(selectedDay.target.kcal_target) : null;
  const kcalDraftDelta =
    selectedTargetKcal != null && toNumber(checkin.kcal_actual) > 0
      ? Math.round(toNumber(checkin.kcal_actual) - selectedTargetKcal)
      : null;
  const weightDraftDelta =
    latestKnownWeight != null && toNumber(weightDraft.weight_kg) > 0
      ? Math.round((toNumber(weightDraft.weight_kg) - latestKnownWeight) * 100) / 100
      : null;
  const visibleAchievements = (achievements.filter((item) => item.unlocked).length
    ? achievements.filter((item) => item.unlocked)
    : achievements).slice(0, 3);
  const todayTargetKcal = today?.target ? Math.round(today.target.kcal_target) : null;
  const optimisticTodayKcal = optimisticCheckin?.date === todayIsoDate ? optimisticCheckin.kcalActual : null;
  const todayConsumedKcal =
    optimisticTodayKcal != null
      ? optimisticTodayKcal
      : today && today.caloriesSource !== 'none'
        ? Math.round(today.consumed.calories)
        : findCheckinForDate(data?.checkins ?? [], todayIsoDate)?.kcal_actual != null
          ? Math.round(findCheckinForDate(data?.checkins ?? [], todayIsoDate)!.kcal_actual ?? 0)
          : null;
  const overToday = todayTargetKcal != null && todayConsumedKcal != null ? Math.round(todayConsumedKcal - todayTargetKcal) : null;
  const characterState = buildCharacterState({
    payload: data,
    activeChallenge,
    challengeStats,
    xp,
    achievements,
    todayCheckinDone,
    todayWeightDone,
    overToday,
  });
  const inventory = inventoryOverride ?? characterState.inventory;
  const selectedLoot = readSelectedItem(selectedItem);
  const draggedLoot = readItemFromOrigin(draggedItem);
  const stashCellCount = Math.max(32, inventory.stash.length + 6);
  const stashCells = Array.from({ length: stashCellCount }, (_, index) => inventory.stash[index] ?? null);
  const weightDialStyle: CSSProperties & Record<'--dial-rotation', string> = {
    '--dial-rotation': `${weightDialRotation}deg`,
  };
  const kcalDialStyle: CSSProperties & Record<'--dial-rotation', string> = {
    '--dial-rotation': `${kcalDialRotation}deg`,
  };
  const weightChartData = buildWeightChartData(data?.weights ?? []);
  const optimisticLatestWeight = optimisticWeight ? optimisticWeight.weightKg : data?.trends.latest?.weight_kg ?? null;
  const currentWeightDelta =
    challengeStats.startWeight != null && optimisticLatestWeight != null
      ? Number((optimisticLatestWeight - challengeStats.startWeight).toFixed(1))
      : null;
  const currentWeightLabel = optimisticLatestWeight != null ? `${formatWeightKg(optimisticLatestWeight)} kg` : 'Ready to start';
  const currentWeightHelper =
    currentWeightDelta != null
      ? `${currentWeightDelta > 0 ? '+' : ''}${formatWeightKg(currentWeightDelta)} kg vs start`
      : optimisticLatestWeight != null
        ? 'Latest saved weight'
        : 'One morning weigh-in starts your trend line.';
  const isTodaySavePending = busy === '/api/cut-coach/checkins' && optimisticCheckin?.date === todayIsoDate;
  const isWeightSavePending = busy === '/api/cut-coach/weights' && optimisticWeight?.date === todayIsoDate;
  const calorieProgress = todayTargetKcal && todayConsumedKcal != null
    ? clamp(todayConsumedKcal / Math.max(todayTargetKcal, 1), 0, 1.35)
    : 0;
  const calorieProgressDegrees = `${Math.round(calorieProgress * 360)}deg`;
  const todayDialHeaderText =
    todayTargetKcal != null
      ? todayConsumedKcal == null
        ? 'Your number is ready'
        : overToday == null
          ? 'Tracking today'
          : overToday > 0
            ? 'Adjust the rest'
            : overToday < 0
              ? 'Room to finish'
              : 'Locked in'
      : 'Set profile';
  const todayDialTitle =
    todayConsumedKcal == null
      ? 'Target set'
      : overToday == null
        ? 'Logged today'
        : overToday > 0
          ? 'Over target'
          : overToday < 0
            ? 'Left today'
            : 'On target';
  const todayDialValue =
    todayConsumedKcal == null
      ? todayTargetKcal != null
        ? String(todayTargetKcal)
        : '—'
      : overToday == null
        ? String(todayConsumedKcal)
        : overToday === 0
          ? 'Perfect'
          : String(Math.abs(overToday));
  const todayDialUnit =
    todayConsumedKcal == null
      ? todayTargetKcal != null
        ? 'kcal ready'
        : 'Set profile'
      : overToday == null
        ? 'kcal logged'
        : overToday === 0
          ? `${todayConsumedKcal} kcal logged`
          : 'kcal';
  const weightTrendMeta =
    data?.weights.length && data.weights.length > 1
      ? data?.trends.delta7 != null
        ? `${data.trends.delta7 > 0 ? '+' : ''}${formatWeightKg(data.trends.delta7)} kg vs prev 7d`
        : 'Trend updates with each weigh-in'
      : data?.weights.length === 1
        ? 'First point saved. The line fills in from here.'
        : 'Your first few weigh-ins will build the line here.';
  const heroCoachTitle =
    todayConsumedKcal == null
      ? 'One total tonight and you are done'
      : overToday != null && overToday > 0
        ? 'Trim the rest of the day'
        : overToday != null && overToday < 0
          ? 'You still have room to finish clean'
          : 'Stay in the same rhythm';
  const heroCoachText = today?.target
    ? humanizeAdjustmentReason(today.target.adjustment_reason, 'today')
    : 'Save profile and the daily target plus the weekly plan appear here.';
  const initialLoading = !heroReady && !data;
  const weekLoading = heroReady && !detailReady;

  function startDrag(origin: DragOrigin) {
    setDraggedItem(origin);
    setSelectedItem(origin);
  }

  function readItemFromOrigin(origin: DragOrigin) {
    if (!origin) return null;
    if (origin.kind === 'equipped') return inventory.equipped[origin.slot] ?? null;
    return inventory.stash[origin.index] ?? null;
  }

  function moveItemToSlot(origin: DragOrigin, targetSlot: string) {
    if (!origin) return;
    const movingPreview = readItemFromOrigin(origin);
    if (!movingPreview) return;
    if (movingPreview.slot !== targetSlot) {
      setNotice(`${movingPreview.name} fits only in ${paperDollLabel(movingPreview.slot)}.`);
      setDraggedItem(null);
      setSelectedItem(origin);
      return;
    }
    setInventoryOverride((currentValue) => {
      const current = currentValue ?? characterState.inventory;
      const nextEquipped = { ...current.equipped };
      const nextStash = [...current.stash];
      let movingItem: CharacterItem | null = null;

      if (origin.kind === 'equipped') {
        movingItem = nextEquipped[origin.slot] ?? null;
        nextEquipped[origin.slot] = null;
      } else {
        movingItem = nextStash[origin.index] ?? null;
        nextStash.splice(origin.index, 1);
      }

      if (!movingItem) return current;

      const replaced = nextEquipped[targetSlot] ?? null;
      nextEquipped[targetSlot] = { ...movingItem, slot: targetSlot, source: 'equipped' };
      if (replaced) nextStash.unshift({ ...replaced, source: 'swapped' });

      return {
        equipped: nextEquipped,
        stash: nextStash,
      };
    });
    setDraggedItem(null);
    setSelectedItem({ kind: 'equipped', slot: targetSlot });
  }

  function moveToSlot(targetSlot: string) {
    moveItemToSlot(draggedItem, targetSlot);
  }

  function moveItemToStash(origin: DragOrigin, insertIndex = 0) {
    if (!origin) return;
    setInventoryOverride((currentValue) => {
      const current = currentValue ?? characterState.inventory;
      const nextEquipped = { ...current.equipped };
      const nextStash = [...current.stash];
      let movingItem: CharacterItem | null = null;

      if (origin.kind === 'equipped') {
        movingItem = nextEquipped[origin.slot] ?? null;
        nextEquipped[origin.slot] = null;
      } else {
        movingItem = nextStash[origin.index] ?? null;
        nextStash.splice(origin.index, 1);
      }

      if (!movingItem) return current;
      const safeIndex = Math.max(0, Math.min(insertIndex, nextStash.length));
      nextStash.splice(safeIndex, 0, { ...movingItem, source: 'stash' });
      return {
        equipped: nextEquipped,
        stash: nextStash,
      };
    });
    setDraggedItem(null);
    setSelectedItem({ kind: 'stash', index: insertIndex });
  }

  function moveToStash(insertIndex = 0) {
    moveItemToStash(draggedItem, insertIndex);
  }

  function readSelectedItem(selection: SelectedItem) {
    if (!selection) return null;
    if (selection.kind === 'equipped') return inventory.equipped[selection.slot] ?? null;
    return inventory.stash[selection.index] ?? null;
  }

  function itemStatus(item: CharacterItem, origin: Exclude<SelectedItem, null>) {
    if (origin.kind === 'equipped') return 'equipped';
    if (item.source === 'daily drop' || item.source === 'challenge drop' || item.source === 'achievement') return 'new';
    if (item.source === 'swapped') return 'swapped';
    return 'stash';
  }

  function handleSelectedPrimaryAction() {
    if (!selectedItem || !selectedLoot) return;
    if (selectedItem.kind === 'stash') {
      moveItemToSlot(selectedItem, selectedLoot.slot);
      return;
    }
    moveItemToStash(selectedItem, 0);
  }

  return (
    <PageShell width="7xl" className={styles.shell}>
      <div className={styles.page}>
        <section className={styles.topbar}>
          <BackLink href="/">← Back to dashboard</BackLink>
          <ThemeToggle />
        </section>

        {initialLoading ? (
          <>
            <section className={`hero-card ${styles.hero} ${styles.loadingHero}`}>
              <div className={styles.loadingMetaRow}>
                <span className={styles.loadingPill} />
                <span className={styles.loadingPillShort} />
              </div>
              <div className={styles.loadingStatsGrid}>
                {Array.from({ length: 4 }).map((_, index) => (
                  <div className={styles.loadingMetricCard} key={`loading-metric-${index}`}>
                    <span className={styles.loadingLineShort} />
                    <span className={styles.loadingLineMedium} />
                    <span className={styles.loadingLineTiny} />
                  </div>
                ))}
              </div>
              <div className={styles.loadingHeroDeck}>
                <div className={styles.loadingPanel}>
                  <span className={styles.loadingLineShort} />
                  <span className={styles.loadingLineWide} />
                  <span className={styles.loadingBar} />
                </div>
                <div className={styles.loadingPanel}>
                  <span className={styles.loadingLineShort} />
                  <span className={styles.loadingChart} />
                </div>
              </div>
            </section>

            <section className={styles.loadingSectionGrid}>
              <div className={`surface-card ${styles.panel} ${styles.loadingPanel}`}>
                <span className={styles.loadingLineShort} />
                <span className={styles.loadingCalendarBlock} />
              </div>
              <div className={`surface-card ${styles.panel} ${styles.loadingPanel}`}>
                <span className={styles.loadingLineShort} />
                <span className={styles.loadingListBlock} />
              </div>
            </section>
          </>
        ) : null}

        {!initialLoading ? (
          <>

        <section className={`hero-card ${styles.hero}`}>
          <div className={styles.todayBoard}>
            <div className={styles.todayDialCard}>
              <div className={styles.todayDialHeader}>
                <div>
                  <span className={styles.todayDialLabel}>Plan for today</span>
                  <strong className={styles.todayDialHeaderValue}>{todayDialHeaderText}</strong>
                </div>
                {isTodaySavePending ? <span className={styles.inlineSavingBadge}>Saving…</span> : null}
              </div>
              <div
                className={styles.todayDial}
                style={{ '--dial-progress': calorieProgressDegrees } as CSSProperties}
              >
                <div className={styles.todayDialInner}>
                  <span>{todayDialTitle}</span>
                  <strong>{todayDialValue}</strong>
                  <small>{todayDialUnit}</small>
                </div>
              </div>
              <div className={styles.todayDialMeta}>
                <div className={styles.todayConsumedCard}>
                  <span>{todayConsumedKcal != null ? 'Consumed' : 'Tonight'}</span>
                  <strong>{todayConsumedKcal != null ? `${todayConsumedKcal} kcal` : 'Log your total'}</strong>
                  {todayConsumedKcal == null ? <small className={styles.todayMetaHint}>One number at the end of the day is enough.</small> : null}
                </div>
                <div className={styles.todayTargetCard}>
                  <span>Target</span>
                  <strong>{todayTargetKcal != null ? `${todayTargetKcal} kcal` : 'Set profile'}</strong>
                  <small className={styles.todayMetaHint}>
                    {todayTargetKcal != null ? 'The ring shows how much room is left today.' : 'Weight trend and challenge pace appear after setup.'}
                  </small>
                </div>
              </div>
            </div>

            <section className={`${styles.spotlightCard} ${styles.spotlightWeight} ${styles.todayWeightCard}`}>
              <div className={styles.spotlightTop}>
                <span className={styles.spotlightLabel}>Weight</span>
                <Scale size={16} strokeWidth={2.2} />
              </div>
              <strong className={styles.spotlightValue}>{currentWeightLabel}</strong>
              <p className={styles.spotlightMeta}>{isWeightSavePending ? 'Saving your weigh-in…' : currentWeightHelper}</p>
            </section>

            <section className={`${styles.spotlightCard} ${styles.heroRunCard}`}>
              <div className={styles.spotlightTop}>
                <span className={styles.spotlightLabel}>Challenge</span>
                <Flag size={16} strokeWidth={2.2} />
              </div>
              <strong className={styles.heroRunValue}>
                {activeChallenge ? `Day ${challengeStats.currentDay} of ${challengeStats.totalDays}` : 'Ready when you are'}
              </strong>
              <p className={styles.spotlightMeta}>
                {activeChallenge
                  ? `${Math.round(challengeStats.progress * 100)}% complete${activeChallenge.title ? ` • ${activeChallenge.title}` : ''}`
                  : 'Start a challenge only if you want a fixed timeline.'}
              </p>
            </section>
          </div>

          <div className={styles.heroCoachBar}>
            <div className={styles.heroCoachCopy}>
              <span className={styles.heroCoachLabel}>Coach note</span>
              <strong className={styles.heroCoachTitle}>{heroCoachTitle}</strong>
              <p className={styles.heroCoachText}>{heroCoachText}</p>
            </div>
            <div className={styles.heroActionRail}>
              <button className={`btn-base btn-primary ${styles.heroActionButton}`} onClick={() => openTodayEntry()} type="button">
                Log kcal
              </button>
              <button className={`btn-base btn-secondary ${styles.heroActionButton}`} onClick={() => openWeightModal()} type="button">
                Log weight
              </button>
              <button className={`btn-base btn-ghost ${styles.heroActionButton}`} onClick={() => openActivityModal()} type="button">
                Add movement
              </button>
            </div>
          </div>
        </section>

        {error ? (
          <section className={`surface-card ${styles.banner} ${styles.bannerError}`}>
            <div className={styles.bannerInner}>
              <span className={styles.bannerIcon} aria-hidden="true"><CircleAlert size={18} strokeWidth={2.2} /></span>
              <div>
                <strong className={styles.bannerTitle}>Could not load Cut Coach</strong>
                <p className={styles.bannerText}>{error}</p>
              </div>
            </div>
          </section>
        ) : null}
        {error ? (
          <section className={`surface-card ${styles.banner} ${styles.bannerHint}`}>
            <div className={styles.bannerInner}>
              <span className={styles.bannerIcon} aria-hidden="true"><CircleAlert size={18} strokeWidth={2.2} /></span>
              <div>
                <strong className={styles.bannerTitle}>Debug tip</strong>
                <p className={styles.bannerText}>
              If you see `unexpected error` or `500`, the usual causes are missing SQL from `cut_coach.sql` or a bad timezone from env before the last refresh.
                </p>
              </div>
            </div>
          </section>
        ) : null}
        {notice ? (
          <div className={styles.noticeToast} key={notice}>
            <span className={styles.noticeToastIcon} aria-hidden="true"><CircleAlert size={16} strokeWidth={2.2} /></span>
            <p>{notice}</p>
          </div>
        ) : null}
        {rewardToast ? (
          <div className={styles.rewardToast} key={rewardToast.id}>
            <span className={styles.noticeToastIcon} aria-hidden="true"><CheckCircle2 size={16} strokeWidth={2.2} /></span>
            <strong>{rewardToast.title}</strong>
            <p>{rewardToast.body}</p>
          </div>
        ) : null}
        {kcalModalOpen ? (
          <div className={styles.modalScrim} onClick={closeKcalModal} role="presentation">
            <section
              aria-modal="true"
              className={styles.weightModal}
              onClick={(event) => event.stopPropagation()}
              role="dialog"
            >
              <div className={styles.modalHead}>
                <div>
                  <div className={styles.sectionEyebrow}>kcal</div>
                  <h3 className={styles.modalTitle}>Quick kcal entry</h3>
                  <p className={styles.panelText}>Just put your total for the day and save.</p>
                </div>
              </div>

              <div className={styles.kcalModalGrid}>
                <label className={styles.field}>
                  <span>Date</span>
                  <input
                    type="date"
                    value={checkin.date}
                    onChange={(event) => {
                      setCheckin(seedCheckinEntry(event.target.value, data));
                      setKcalDialRotation(0);
                    }}
                  />
                </label>
                <label className={`${styles.field} ${styles.kcalPrimaryField}`}>
                  <span>Actual kcal</span>
                  <input
                    className={`${styles.featureInput} ${styles.kcalPrimaryInput}`}
                    type="number"
                    inputMode="numeric"
                    value={checkin.kcal_actual}
                    onChange={(event) => setCheckin((current) => ({ ...current, kcal_actual: event.target.value }))}
                    placeholder="e.g. 2140"
                  />
                  <div className={styles.kcalTargetLine}>
                    <strong>{selectedTargetKcal != null ? `Target ${selectedTargetKcal}` : 'No target yet'}</strong>
                    <em
                      className={`${kcalDraftDelta != null && kcalDraftDelta < 0 ? styles.weightDeltaDown : styles.weightDeltaUp} ${kcalDraftDelta == null || kcalDraftDelta === 0 ? styles.kcalDeltaHidden : ''}`}
                    >
                      {kcalDraftDelta != null && kcalDraftDelta !== 0 ? `${kcalDraftDelta > 0 ? '+' : ''}${kcalDraftDelta}` : '+0'}
                    </em>
                  </div>
                </label>
              </div>

              <div className={styles.kcalDialArea}>
                <button
                  aria-label="Rotate kcal dial"
                  className={styles.weightDial}
                  onPointerDown={handleKcalDialStart}
                  onPointerMove={handleKcalDialMove}
                  onPointerUp={handleKcalDialEnd}
                  onPointerCancel={handleKcalDialEnd}
                  onWheel={handleKcalDialWheel}
                  style={kcalDialStyle}
                  type="button"
                >
                  <span className={styles.weightDialNeedle} aria-hidden="true" />
                </button>
              </div>

              <div className={styles.kcalModalSummary}>
                <SummaryTile label="Target" value={selectedDay?.target ? `${Math.round(selectedDay.target.kcal_target)} kcal` : '—'} tone="neutral" />
                <SummaryTile label="Logged" value={toNumber(checkin.kcal_actual) > 0 ? `${Math.round(toNumber(checkin.kcal_actual))} kcal` : '—'} tone="future" />
              </div>

              <div className={styles.modalActions}>
                <button className="btn-base btn-ghost" onClick={closeKcalModal} type="button">
                  Cancel
                </button>
                <button className="btn-base btn-primary" disabled={busy !== null} onClick={() => void saveCheckinAndClose()} type="button">
                  {busy === '/api/cut-coach/checkins' ? 'Saving…' : 'Save kcal'}
                </button>
              </div>
            </section>
          </div>
        ) : null}
        {activityModalOpen ? (
          <div className={styles.modalScrim} onClick={closeActivityModal} role="presentation">
            <section
              aria-modal="true"
              className={styles.weightModal}
              onClick={(event) => event.stopPropagation()}
              role="dialog"
            >
              <div className={styles.modalHead}>
                <div>
                  <div className={styles.sectionEyebrow}>activity</div>
                  <h3 className={styles.modalTitle}>Quick activity entry</h3>
                  <p className={styles.panelText}>Keep movement separate. Add the burn and a short note.</p>
                </div>
              </div>

              <div className={styles.kcalModalGrid}>
                <label className={styles.field}>
                  <span>Date</span>
                  <input
                    type="date"
                    value={activityDraft.date}
                    onChange={(event) => setActivityDraft(seedActivityEntry(event.target.value, data))}
                  />
                </label>
                <label className={styles.field}>
                  <span>Burned kcal</span>
                  <input
                    className={styles.featureInput}
                    inputMode="numeric"
                    placeholder="e.g. 340"
                    type="number"
                    value={activityDraft.activity_kcal_burned}
                    onChange={(event) => setActivityDraft((current) => ({ ...current, activity_kcal_burned: event.target.value }))}
                  />
                </label>
                <label className={`${styles.field} ${styles.kcalPrimaryField}`}>
                  <span>What did you do?</span>
                  <input
                    placeholder="Walk, bike, gym, stairs..."
                    type="text"
                    value={activityDraft.activity_summary}
                    onChange={(event) => setActivityDraft((current) => ({ ...current, activity_summary: event.target.value }))}
                  />
                </label>
              </div>

              <div className={styles.modalActions}>
                <button className="btn-base btn-ghost" onClick={closeActivityModal} type="button">
                  Cancel
                </button>
                <button className="btn-base btn-primary" disabled={busy !== null} onClick={() => void saveActivityDraft()} type="button">
                  {busy === '/api/cut-coach/checkins' ? 'Saving…' : 'Save activity'}
                </button>
              </div>
            </section>
          </div>
        ) : null}
        {weightModalOpen ? (
          <div className={styles.modalScrim} onClick={closeWeightModal} role="presentation">
            <section
              aria-modal="true"
              className={styles.weightModal}
              onClick={(event) => event.stopPropagation()}
              role="dialog"
            >
              <div className={styles.modalHead}>
                <div>
                  <div className={styles.sectionEyebrow}>weight</div>
                  <h3 className={styles.modalTitle}>Quick weight entry</h3>
                  <p className={styles.panelText}>Change the value here. Nothing is saved until you press Save.</p>
                </div>
              </div>

              <div className={styles.weightAdjuster}>
                <div className={styles.weightAdjustTop}>
                  <span>Current input</span>
                  <div className={styles.weightValueRow}>
                    <strong>{toNumber(weightDraft.weight_kg) > 0 ? `${formatWeightKg(toNumber(weightDraft.weight_kg))} kg` : '—'}</strong>
                    {weightDraftDelta != null && weightDraftDelta !== 0 ? (
                      <em className={weightDraftDelta < 0 ? styles.weightDeltaDown : styles.weightDeltaUp}>
                        {weightDraftDelta > 0 ? '+' : ''}
                        {formatWeightKg(weightDraftDelta)}
                      </em>
                    ) : null}
                  </div>
                  <small>{latestKnownWeight != null ? `Latest saved: ${formatWeightKg(latestKnownWeight)} kg` : 'First weigh-in.'}</small>
                </div>

                <div className={styles.weightQuickCard}>
                  <label className={styles.field}>
                    <span>Date</span>
                    <input
                      type="date"
                      value={weightDraft.date}
                      onChange={(event) => setWeightDraft(fillWeight(event.target.value, data))}
                    />
                  </label>
                </div>

                <div className={styles.weightControlBoard}>
                  <div className={styles.weightDialWrap}>
                    <button
                      aria-label="Rotate weight dial"
                      className={styles.weightDial}
                      onPointerDown={handleWeightDialStart}
                      onPointerMove={handleWeightDialMove}
                      onPointerUp={handleWeightDialEnd}
                      onPointerCancel={handleWeightDialEnd}
                      onWheel={handleWeightDialWheel}
                      style={weightDialStyle}
                      type="button"
                    >
                      <span className={styles.weightDialNeedle} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>

              <div className={styles.modalActions}>
                <button className="btn-base btn-ghost" onClick={closeWeightModal} type="button">
                  Cancel
                </button>
                <button className="btn-base btn-primary" disabled={busy !== null} onClick={() => void saveWeightDraft()} type="button">
                  {busy === '/api/cut-coach/weights' ? 'Saving…' : 'Save weight'}
                </button>
              </div>
            </section>
          </div>
        ) : null}

        <section id="flow" className={styles.appSection}>
          <div className={styles.sectionHead}>
            <div>
              <div className={styles.sectionEyebrow}>flow</div>
              <h2 className={styles.sectionTitle}>Run and week plan</h2>
            </div>
            <div className={styles.sectionHeadActions}>
              <div className={styles.sectionMeta}>{activeChallenge ? `${phaseLabel(challengeStats.progress)} phase` : 'Set up a challenge'}</div>
              <button className={styles.sectionToggle} onClick={() => toggleSection('flow')} type="button">
                {collapsedSections.flow ? 'Expand' : 'Collapse'}
              </button>
            </div>
          </div>

          {!collapsedSections.flow ? <>
          <div className={styles.flowMetaGrid}>
            <section className={`surface-card ${styles.panel}`}>
              <h3 className={styles.panelTitle}>Challenge pace</h3>
              <p className={styles.panelText}>
                {today?.target
                  ? `Day ${Math.max(0, challengeStats.currentDay)} of ${Math.max(0, challengeStats.totalDays)} with ${Math.round(today.target.kcal_target)} kcal today.`
                  : 'Save setup first to create the daily plan.'}{' '}
                {tomorrow?.target ? `Tomorrow points to ${Math.round(tomorrow.target.kcal_target)} kcal.` : ''}
              </p>
              <div className={styles.phaseTrack}>
                <div className={styles.phaseBar}>
                  <span style={{ width: `${Math.round(challengeStats.progress * 100)}%` }} />
                </div>
                <div className={styles.phaseLabels}>
                  <span>Ignition</span>
                  <span>Rhythm</span>
                  <span>Lock-in</span>
                  <span>Finish</span>
                </div>
              </div>
            </section>

            <section className={`surface-card ${styles.panel}`}>
              <div className={styles.chartHead}>
                <div>
                  <h3 className={styles.panelTitle}>Weight trend</h3>
                  <div className={styles.chartTitle}>Last weigh-ins</div>
                </div>
                <div className={styles.chartMeta}>{weightTrendMeta}</div>
              </div>
              <div className={styles.chartBox}>
                {weightChartData.length > 1 ? (
                  <ResponsiveContainer width="100%" height={190}>
                    <LineChart data={weightChartData} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                      <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="date" tick={{ fill: 'var(--muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: 'var(--muted)', fontSize: 11 }} axisLine={false} tickLine={false} width={56} domain={['dataMin - 0.5', 'dataMax + 0.5']} />
                      <Tooltip
                        contentStyle={{
                          background: 'var(--panel-strong)',
                          border: '1px solid var(--border)',
                          borderRadius: 14,
                          color: 'var(--text)',
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="weight"
                        stroke="var(--accent)"
                        strokeWidth={3}
                        dot={{ r: 3, fill: 'var(--accent)' }}
                        activeDot={{ r: 5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className={styles.chartEmpty}>
                    {weightChartData.length === 1
                      ? 'One weigh-in saved. Add the next one and the trend line starts to show.'
                      : 'Your trend line appears here after the first couple of weigh-ins.'}
                  </div>
                )}
              </div>
            </section>
          </div>

          <section className={`surface-card ${styles.panel} ${styles.weekPlanPanel}`}>
            <div className={styles.weekPlanHead}>
              <div>
                <div className={styles.sectionEyebrow}>week plan</div>
                <h3 className={styles.panelTitle}>This week</h3>
              </div>
              <p className={styles.weekPlanMeta}>
                {today?.target
                  ? humanizeAdjustmentReason(today.target.adjustment_reason, 'today')
                  : 'The planner starts after profile and weight are saved.'}
              </p>
            </div>

            {weekLoading ? (
              <div className={styles.flowRailSkeleton} aria-hidden="true">
                {Array.from({ length: 7 }).map((_, index) => (
                  <div className={styles.flowRailSkeletonCard} key={`flow-skeleton-${index}`}>
                    <span className={styles.loadingLineTiny} />
                    <span className={styles.loadingLineMedium} />
                    <span className={styles.loadingLineShort} />
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.flowRail}>
                {(data?.week ?? []).map((day, index) => {
                  const planTone = describeDayPlan(day, data);
                  return (
                    <button
                      className={`${styles.dayCard} ${toneForDay(day, todayIsoDate)} ${day.date === todayIsoDate ? styles.dayCardToday : ''}`}
                      key={day.date}
                      onClick={() => openCalendarDay(day.date)}
                      type="button"
                    >
                      <div className={styles.dayTrackRow}>
                        <span className={styles.dayTrackDot} aria-hidden="true" />
                        {index < (data?.week.length ?? 0) - 1 ? <span className={styles.dayTrackLine} aria-hidden="true" /> : null}
                      </div>
                      <div className={styles.dayTop}>
                        <span>{shortDay(day.date)}</span>
                        <span>{day.date === todayIsoDate ? 'Today' : formatDate(day.date)}</span>
                      </div>
                      <div className={styles.dayKcal}>{day.target ? Math.round(day.target.kcal_target) : '—'} kcal</div>
                      <div className={styles.dayRecommendation}>
                        <span className={styles.dayRecommendationIcon} aria-hidden="true">
                          {day.target?.day_type === 'training' ? <Dumbbell size={13} strokeWidth={2.2} /> : <MoonStar size={13} strokeWidth={2.2} />}
                        </span>
                        <span>{planTone.note}</span>
                      </div>
                      <div className={styles.dayMode}>{planTone.emphasis}</div>
                    </button>
                  );
                })}
              </div>
            )}

            <div className={styles.weekPlanFooter}>
              <div className={styles.weekPlanFooterCopy}>
                <span>Tomorrow</span>
                <strong>{tomorrow?.target ? `${Math.round(tomorrow.target.kcal_target)} kcal` : 'Shows after setup'}</strong>
                <p>{tomorrow?.target ? humanizeAdjustmentReason(tomorrow.target.adjustment_reason, 'tomorrow') : 'Add your profile and first weight to unlock the planner.'}</p>
              </div>
              {activeChallenge ? <div className={styles.weekPlanPhaseBadge}>{phaseLabel(challengeStats.progress)} phase</div> : null}
            </div>
          </section>
          </> : null}
        </section>

        <section id="calendar" className={styles.appSection}>
          <div className={styles.sectionHead}>
            <div>
              <div className={styles.sectionEyebrow}>history</div>
              <h2 className={styles.sectionTitle}>Month snapshot</h2>
            </div>
            <div className={styles.sectionHeadActions}>
              <div className={styles.sectionMeta}>{currentMonth?.label ?? 'Current month'}</div>
              <button className={styles.sectionToggle} onClick={() => toggleSection('calendar')} type="button">
                {collapsedSections.calendar ? 'Expand' : 'Collapse'}
              </button>
            </div>
          </div>

          {!collapsedSections.calendar ? <div className={styles.calendarGrid}>
            <section className={`surface-card ${styles.panel}`}>
              <div className={styles.calendarHeader}>
                <div>
                  <h3 className={styles.panelTitle}>This month</h3>
                  <p className={styles.panelText}>Tap any day to open it. The run markers stay visible without showing the whole year.</p>
                </div>
                <span className={styles.panelText}>{currentMonth?.label ?? ''}</span>
              </div>
              <div className={styles.calendarLegend}>
                <span><Goal size={13} strokeWidth={2.2} /> target</span>
                <span><UtensilsCrossed size={13} strokeWidth={2.2} /> logged</span>
                <span><Weight size={13} strokeWidth={2.2} /> weight</span>
                <span><Flag size={13} strokeWidth={2.2} /> run marks</span>
              </div>
              {currentMonth ? (
                <section className={`${styles.yearMonthCard} ${styles.singleMonthCard}`} key={currentMonth.key}>
                  <div className={styles.weekdays}>
                    {WEEKDAY_LABELS.map((label) => (
                      <span key={`${currentMonth.key}-${label}`}>{label}</span>
                    ))}
                  </div>
                  <div className={styles.monthGrid}>
                    {currentMonth.cells.map((cell) => {
                      const tone =
                        cell.isChallengePast
                          ? styles.monthCellPastPhase
                          : cell.isChallengeCurrent
                            ? styles.monthCellCurrentPhase
                            : cell.isChallengeFuture
                              ? styles.monthCellFuturePhase
                              : cell.kcalDiff != null
                                ? cell.kcalDiff <= 50
                                  ? styles.monthCellGood
                                  : cell.kcalDiff <= 180
                                    ? styles.monthCellWarn
                                    : styles.monthCellBad
                                : cell.weight
                                  ? styles.monthCellWeight
                                  : cell.isInChallenge
                                    ? styles.monthCellChallenge
                                    : styles.monthCellNeutral;
                      return (
                        <button
                          type="button"
                          className={`${styles.monthCell} ${tone} ${cell.isInChallenge ? styles.monthCellInChallenge : ''} ${cell.isChallengePast ? styles.monthCellPastChallenge : ''} ${cell.isChallengeCurrent ? styles.monthCellCurrentChallenge : ''} ${cell.isChallengeFuture ? styles.monthCellFutureChallenge : ''} ${cell.isToday ? styles.monthCellToday : ''} ${!cell.inMonth ? styles.monthCellMuted : ''}`}
                          id={cell.isToday ? 'calendar-today' : undefined}
                          key={cell.isoDate}
                          onClick={() => openCalendarDay(cell.isoDate)}
                          title={`Open ${formatFullDate(cell.isoDate)}`}
                        >
                          <div className={styles.monthCellTop}>
                            <span>{cell.label}</span>
                            <div className={styles.monthCellBadges}>
                              {cell.isChallengeStart ? <em className={styles.monthCellBadge} title="Challenge start"><Flag size={10} strokeWidth={2.5} /></em> : null}
                              {cell.isChallengeEnd ? <em className={`${styles.monthCellBadge} ${styles.monthCellBadgeEnd}`} title="Challenge end"><Goal size={10} strokeWidth={2.5} /></em> : null}
                            </div>
                          </div>
                          <div className={styles.monthCellBody}>
                            {cell.targetKcal != null ? (
                              <div className={`${styles.monthCellMetric} ${cell.isChallengeFuture ? styles.monthCellMetricPlanned : ''}`}>
                                <span className={styles.monthCellMetricIcon} aria-hidden="true"><Goal size={11} strokeWidth={2.2} /></span>
                                <small>{cell.targetKcal}</small>
                              </div>
                            ) : null}
                            {cell.actualKcal != null ? (
                              <div className={styles.monthCellMetric}>
                                <span className={styles.monthCellMetricIcon} aria-hidden="true"><UtensilsCrossed size={11} strokeWidth={2.2} /></span>
                                <small>{cell.actualKcal}</small>
                              </div>
                            ) : null}
                            {cell.weight ? (
                              <div className={styles.monthCellMetric}>
                                <span className={styles.monthCellMetricIcon} aria-hidden="true"><Weight size={11} strokeWidth={2.2} /></span>
                                <small>{formatWeightKg(cell.weight.weight_kg)}</small>
                              </div>
                            ) : null}
                            {cell.kcalDiff == null && !cell.weight && cell.isChallengeStart ? (
                              <div className={styles.monthCellHint}>start</div>
                            ) : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ) : null}
            </section>
          </div> : null}
        </section>

        <section id="progress" className={styles.appSection}>
          <div className={styles.sectionHead}>
            <div>
              <div className={styles.sectionEyebrow}>milestones</div>
              <h2 className={styles.sectionTitle}>Score and achievements</h2>
            </div>
            <div className={styles.sectionHeadActions}>
              <div className={styles.sectionMeta}>{activeChallenge ? `${Math.round(challengeStats.progress * 100)}% complete` : 'Ready to start'}</div>
              <button className={styles.sectionToggle} onClick={() => toggleSection('progress')} type="button">
                {collapsedSections.progress ? 'Expand' : 'Collapse'}
              </button>
            </div>
          </div>

          {!collapsedSections.progress ? <>
          <div className={styles.progressGrid}>
            <section className={`surface-card ${styles.panel}`}>
              <h3 className={styles.panelTitle}>Scoreboard</h3>
              <div className={styles.scoreGrid}>
                <SummaryTile label="Level" value={`Lv ${xp.level}`} tone="future" />
                <SummaryTile label="XP" value={String(xp.xp)} tone="good" />
                <SummaryTile label="Check-in days" value={String(challengeStats.checkinDays)} tone="neutral" />
                <SummaryTile label="Days on target" value={String(challengeStats.underTargetDays)} tone="good" />
                <SummaryTile label="Start kg" value={challengeStats.startWeight != null ? `${formatWeightKg(challengeStats.startWeight)}` : '—'} tone="future" />
                <SummaryTile label="Current kg" value={challengeStats.currentWeight != null ? `${formatWeightKg(challengeStats.currentWeight)}` : '—'} tone="neutral" />
              </div>
            </section>

            <section className={`surface-card ${styles.panel}`}>
              <h3 className={styles.panelTitle}>Unlocked lately</h3>
              <div className={styles.achievementList}>
                {visibleAchievements.map((item) => (
                  <div className={`${styles.achievement} ${item.unlocked ? styles.achievementOn : styles.achievementOff}`} key={item.title}>
                    <div>
                      <strong>{item.title}</strong>
                      <p>{item.body}</p>
                    </div>
                    <span>{item.unlocked ? 'Unlocked' : 'Locked'}</span>
                  </div>
                ))}
              </div>
              <ul className={styles.cleanList}>
                <li>Close the day with one kcal total.</li>
                <li>Morning weigh-ins matter more than more widgets.</li>
                <li>Use movement as context, not as the main event.</li>
              </ul>
            </section>
          </div>

            {SHOW_CHARACTER_LAYER ? (
            <section className={`surface-card ${styles.panel} ${styles.characterPanel}`} id="character-sheet">
              <div className={styles.panelHead}>
                <div>
                  <h3 className={styles.panelTitle}>Character</h3>
                  <p className={styles.panelText}>A dark fantasy inventory layer driven by consistency, misses and milestone drops.</p>
                </div>
                <button className={styles.sectionToggle} onClick={() => setCharacterCollapsed((current) => !current)} type="button">
                  {characterCollapsed ? 'Expand' : 'Collapse'}
                </button>
              </div>
              {!characterCollapsed ? (
                <div className={styles.inventoryScreen}>
                  <div className={styles.inventoryColumns}>
                    <InventoryPanel
                      className={styles.stashRpgPanel}
                      counter={`${inventory.stash.length} / ${stashCellCount}`}
                      subtitle="Drops and spare gear"
                      title="Stash"
                    >
                      <InventoryGrid>
                        {stashCells.map((item, index) => (
                          <InventorySlot
                            badge={item ? statusBadge(itemStatus(item, { kind: 'stash', index })) : null}
                            draggable={Boolean(item)}
                            emptyHint={index < inventory.stash.length ? 'Reorder' : 'Empty'}
                            item={item}
                            key={`${item?.slot ?? 'empty'}-${item?.name ?? 'slot'}-${index}`}
                            label={item ? paperDollLabel(item.slot) : 'Cell'}
                            onClick={item ? () => setSelectedItem({ kind: 'stash', index }) : undefined}
                            onDragEnd={item ? () => setDraggedItem(null) : undefined}
                            onDragOver={(event) => event.preventDefault()}
                            onDragStart={item ? () => startDrag({ kind: 'stash', index }) : undefined}
                            onDrop={(event) => {
                              event.preventDefault();
                              moveToStash(index);
                            }}
                            selected={selectedItem?.kind === 'stash' && selectedItem.index === index}
                            shape="stash"
                            size="medium"
                            status={item ? itemStatus(item, { kind: 'stash', index }) : 'empty'}
                          />
                        ))}
                      </InventoryGrid>

                      <div className={styles.inspectDeck}>
                        <div className={styles.inspectPlaque}>Inspect</div>
                        {selectedLoot ? (
                          <div className={`${styles.inspectCard} ${styles[`rarity${capitalize(selectedLoot.rarity)}`]}`}>
                            <div className={styles.inspectTop}>
                              <span>{selectedItem ? itemStatus(selectedLoot, selectedItem) : 'item'}</span>
                              <strong>{selectedLoot.rarity}</strong>
                            </div>
                            <h4>{selectedLoot.name}</h4>
                            <p>{selectedLoot.statLine}</p>
                            <div className={styles.inspectMeta}>
                              <span>{paperDollLabel(selectedLoot.slot)}</span>
                              <span>{selectedLoot.source}</span>
                            </div>
                            <small>{selectedLoot.flavor}</small>
                            <div className={styles.inspectActions}>
                              <button className="btn-base btn-secondary" onClick={handleSelectedPrimaryAction} type="button">
                                {selectedItem?.kind === 'stash' ? `Equip to ${paperDollLabel(selectedLoot.slot)}` : 'Move to stash'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className={styles.inspectEmpty}>
                            <strong>Select an item</strong>
                            <p>Hover or click a slot to inspect it here. Drag and drop still works between stash and equipment.</p>
                          </div>
                        )}
                      </div>
                    </InventoryPanel>

                    <CharacterPanel
                      actionLabel="SET"
                      subtitle={characterState.title}
                      title={characterState.archetype}
                    >
                      <div className={styles.equipmentBoard}>
                        <div className={styles.characterSilhouette}>
                          <div className={styles.silhouetteHalo} />
                          <div className={styles.silhouetteHead} />
                          <div className={styles.silhouetteTorso} />
                          <div className={styles.silhouetteLegs} />
                        </div>

                        {PAPER_DOLL_SLOTS.map(({ slot, label, area, size }) => {
                          const item = inventory.equipped[slot] ?? null;
                          const canDropHere = draggedLoot?.slot === slot;
                          return (
                            <EquipmentSlot
                              badge={item ? 'EQUIPPED' : null}
                              emptyHint="Empty"
                              item={item}
                              key={slot}
                              label={label}
                              onClick={item ? () => setSelectedItem({ kind: 'equipped', slot }) : () => setSelectedItem(null)}
                              onDragEnd={item ? () => setDraggedItem(null) : undefined}
                              onDragOver={(event) => event.preventDefault()}
                              onDragStart={item ? () => startDrag({ kind: 'equipped', slot }) : undefined}
                              onDrop={(event) => {
                                event.preventDefault();
                                moveToSlot(slot);
                              }}
                              ready={canDropHere}
                              selected={selectedItem?.kind === 'equipped' && selectedItem.slot === slot}
                              size={size}
                              slotArea={area}
                              status={item ? 'equipped' : 'empty'}
                              subdued={Boolean(draggedLoot) && !canDropHere}
                            />
                          );
                        })}

                        <EquipmentSlot
                          className={styles.secondaryRing}
                          emptyHint="Reserved"
                          item={null}
                          label="Ring II"
                          size="small"
                          slotArea="ringtwo"
                          status="empty"
                        />

                        <div className={styles.quickSlots} style={{ gridArea: 'quick' }}>
                          {QUICK_SLOT_LABELS.map((label) => (
                            <div className={styles.quickSlot} key={label}>
                              <span>{label}</span>
                              <strong>Empty</strong>
                            </div>
                          ))}
                        </div>
                      </div>
                    </CharacterPanel>
                  </div>

                  <div className={styles.resourceStrip}>
                    <div className={styles.resourceBars}>
                      <ResourceBar label="HP" max={characterState.maxHp} tone="danger" value={characterState.hp} />
                      <ResourceBar label="Resolve" max={100} tone="accent" value={characterState.resolve} />
                    </div>
                    <div className={styles.resourceMeta}>
                      <StatusPlaque label="Armor" value={String(characterState.armor)} />
                      <StatusPlaque label="Magic find" value={`${characterState.magicFind}%`} />
                      <StatusPlaque label="Latest drop" value={characterState.latestDrop.name} />
                      <StatusPlaque label="Source" value={characterState.latestDrop.source} />
                    </div>
                    <div className={styles.resourceWarnings}>
                      {characterState.warnings.length ? (
                        characterState.warnings.map((warning) => <div className={styles.warningChip} key={warning}>{warning}</div>)
                      ) : (
                        <div className={styles.warningChip}>No current penalties. The sheet is stable.</div>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
            </section>
            ) : null}
          </> : null}
        </section>

        <section id="settings" className={styles.appSection}>
          <div className={styles.sectionHead}>
            <div>
              <div className={styles.sectionEyebrow}>adjust</div>
              <h2 className={styles.sectionTitle}>Profile, challenge, reminders</h2>
            </div>
            <div className={styles.sectionHeadActions}>
              <div className={styles.sectionMeta}>secondary controls, not daily actions</div>
              <button className={styles.sectionToggle} onClick={() => toggleSection('settings')} type="button">
                {collapsedSections.settings ? 'Expand' : 'Collapse'}
              </button>
            </div>
          </div>

          {!collapsedSections.settings ? <>
              <div className={`${styles.composerGrid} ${styles.composerGridThree}`}>
            <button
              className={`${styles.composerButton} ${setupComposer === 'profile' ? styles.composerButtonActive : ''}`}
              onClick={() => setSetupComposer((current) => (current === 'profile' ? null : 'profile'))}
              type="button"
            >
              <strong>Profile</strong>
              <span>Profile values and kcal target tuning.</span>
            </button>
            <button
              className={`${styles.composerButton} ${activeChallenge ? styles.composerButtonDone : ''} ${setupComposer === 'challenge' ? styles.composerButtonActive : ''}`}
              onClick={() => setSetupComposer((current) => (current === 'challenge' ? null : 'challenge'))}
              type="button"
            >
              <strong>{activeChallenge ? 'Challenge active' : 'Challenge setup'}</strong>
              <span>{activeChallenge ? 'Review, edit, or archive the current run.' : 'Create a new cut timeline.'}</span>
            </button>
            <button
              className={`${styles.composerButton} ${setupComposer === 'reminders' ? styles.composerButtonActive : ''}`}
              onClick={() => setSetupComposer((current) => (current === 'reminders' ? null : 'reminders'))}
              type="button"
            >
              <strong>Reminders</strong>
              <span>Push reminders and check-in times.</span>
            </button>
          </div>

          <div className={styles.settingsGrid}>
            {setupComposer === 'profile' ? <section className={`surface-card ${styles.panel}`}>
              <h3 className={styles.panelTitle}>Profile</h3>
              <p className={styles.panelText}>Basic first. The rest is fine tuning.</p>
              <p className={styles.previewNote}>
                `No gym for now` and `Easy / Standard / Strict` apply directly to the active plan. Manual edits need `Save profile`.
              </p>
              <div className={styles.formGrid}>
                <label className={styles.field}>
                  <span>Current kg</span>
                  <input className={styles.featureInput} type="text" inputMode="decimal" pattern="[0-9]*[.,]?[0-9]*" value={setup.initial_weight_kg} onChange={(event) => setSetup((current) => ({ ...current, initial_weight_kg: event.target.value }))} placeholder="e.g. 89.8" />
                </label>
                <label className={styles.field}>
                  <span>Age</span>
                  <input type="text" value={setup.age} onChange={(event) => setSetup((current) => ({ ...current, age: event.target.value }))} inputMode="numeric" pattern="[0-9]*" />
                </label>
                <label className={styles.field}>
                  <span>Sex</span>
                  <select value={setup.sex} onChange={(event) => setSetup((current) => ({ ...current, sex: event.target.value as 'male' | 'female' }))}>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </label>
                <label className={styles.field}>
                  <span>Height cm</span>
                  <input type="text" value={setup.height_cm} onChange={(event) => setSetup((current) => ({ ...current, height_cm: event.target.value }))} inputMode="decimal" pattern="[0-9]*[.,]?[0-9]*" />
                </label>
                <label className={styles.field}>
                  <span>Activity</span>
                  <select value={setup.activity_level} onChange={(event) => setSetup((current) => ({ ...current, activity_level: event.target.value }))}>
                    <option value="sedentary">Sedentary</option>
                    <option value="light">Light</option>
                    <option value="moderate">Moderate</option>
                    <option value="active">Active</option>
                    <option value="athlete">Athlete</option>
                  </select>
                </label>
                <label className={`${styles.field} ${styles.sliderField}`}>
                  <span>Deficit daily</span>
                  <div className={styles.sliderMeta}>
                    <strong>{selectedPacePreview ? `${selectedPacePreview.target} kcal/day` : `${setup.preferred_deficit_pct}%`}</strong>
                    <small>
                      {selectedPacePreview
                        ? `~ -${selectedPacePreview.deficit} kcal below maintenance`
                        : 'Move the slider to see the target.'}
                    </small>
                  </div>
                  <input
                    className={styles.rangeInput}
                    max="28"
                    min="8"
                    onChange={(event) => setSetup((current) => ({ ...current, preferred_deficit_pct: event.target.value }))}
                    onMouseUp={(event) =>
                      void applyProfilePreset(
                        { preferred_deficit_pct: event.currentTarget.value },
                        'Daily deficit applied to the plan.'
                      )
                    }
                    onTouchEnd={(event) =>
                      void applyProfilePreset(
                        { preferred_deficit_pct: event.currentTarget.value },
                        'Daily deficit applied to the plan.'
                      )
                    }
                    step="1"
                    type="range"
                    value={setup.preferred_deficit_pct}
                  />
                  <div className={styles.sliderScale}>
                    <small>Easy</small>
                    <small>Standard</small>
                    <small>Strict</small>
                  </div>
                </label>
              </div>

              <div className={styles.paceRow}>
                <button
                  className={styles.quickChip}
                  onClick={() => void applyProfilePreset(applyNoGymPreset(), 'No-gym preset applied to the plan.')}
                  type="button"
                >
                  No gym for now
                </button>
                {PACE_PRESETS.map((preset) => (
                  <button
                    className={`${styles.paceCard} ${setup.preferred_deficit_pct === preset.value ? styles.paceCardActive : ''}`}
                    key={preset.value}
                    onClick={() => void applyProfilePreset({ preferred_deficit_pct: preset.value }, `${preset.label} pace applied to the plan.`)}
                    type="button"
                  >
                    <strong>{preset.label}</strong>
                    <span>{preset.description}</span>
                    <small>
                      {pacePreviews[preset.value]
                        ? `about ${pacePreviews[preset.value]!.target} kcal/day`
                        : `${preset.value}% deficit`}
                    </small>
                    <small>
                      {pacePreviews[preset.value]
                        ? `~ -${pacePreviews[preset.value]!.deficit} kcal from maintenance`
                        : ''}
                    </small>
                  </button>
                ))}
              </div>
              <p className={styles.previewNote}>
                The slider and cards use the same formula as the active plan. Releasing the slider or tapping a preset resaves the plan instantly.
              </p>

              {setupPreview ? (
                <>
                  <div className={styles.quickSummary}>
                    <SummaryTile label="Maintenance" value={`${setupPreview.maintenance} kcal`} tone="neutral" />
                    <SummaryTile label="Target daily" value={`${setupPreview.baseTarget} kcal`} tone="good" />
                    <SummaryTile label="Training day" value={`${setupPreview.trainingTarget} kcal`} tone="future" />
                    <SummaryTile label="Rest day" value={`${setupPreview.restTarget} kcal`} tone="warn" />
                  </div>
                  <p className={styles.previewNote}>
                    If you are sedentary and not training right now, focus mostly on `Target daily` and `Rest day`.
                  </p>
                </>
              ) : null}

              <details className={styles.advancedSettings}>
                <summary>Advanced settings</summary>
                <div className={styles.formGrid}>
                  <label className={styles.field}>
                    <span>Protein / kg</span>
                    <input type="text" value={setup.protein_target_per_kg} onChange={(event) => setSetup((current) => ({ ...current, protein_target_per_kg: event.target.value }))} inputMode="decimal" pattern="[0-9]*[.,]?[0-9]*" />
                  </label>
                  <label className={styles.field}>
                    <span>Fat min / kg</span>
                    <input type="text" value={setup.fat_min_per_kg} onChange={(event) => setSetup((current) => ({ ...current, fat_min_per_kg: event.target.value }))} inputMode="decimal" pattern="[0-9]*[.,]?[0-9]*" />
                  </label>
                  <label className={styles.field}>
                    <span>Meals / day</span>
                    <input type="text" value={setup.meals_per_day} onChange={(event) => setSetup((current) => ({ ...current, meals_per_day: event.target.value }))} inputMode="numeric" pattern="[0-9]*" />
                  </label>
                  <label className={styles.field}>
                    <span>Training delta kcal</span>
                    <input type="text" value={setup.training_day_kcal_delta} onChange={(event) => setSetup((current) => ({ ...current, training_day_kcal_delta: event.target.value }))} inputMode="numeric" pattern="[0-9]*" />
                  </label>
                </div>
              </details>

              <div className={styles.dayPicker}>
                <div className={styles.dayPickerLabel}>Training days</div>
                {[1, 2, 3, 4, 5, 6, 0].map((day) => {
                  const active = setup.training_days.includes(day);
                  return (
                    <button className={`${styles.dayPickerButton} ${active ? styles.dayPickerButtonActive : ''}`} key={day} onClick={() => setSetup((current) => ({
                      ...current,
                      training_days: active ? current.training_days.filter((item) => item !== day) : [...current.training_days, day].sort(),
                    }))} type="button">
                      {WEEKDAY_LABELS[day]}
                    </button>
                  );
                })}
              </div>

              <button className="btn-base btn-primary" disabled={busy !== null} onClick={() => void saveSetup()} type="button">
                {busy === '/api/cut-coach/profile' ? 'Saving…' : 'Save profile'}
              </button>
            </section> : null}

            {setupComposer === 'challenge' ? <section className={`surface-card ${styles.panel}`}>
              <h3 className={styles.panelTitle}>Challenge</h3>
              <p className={styles.panelText}>Start creates a new active run from today. Save updates the dates or notes shown in this form.</p>
              {activeChallenge ? (
                <div className={styles.challengeStatus}>
                  <strong>Active now:</strong> {activeChallenge.title} · {formatDate(activeChallenge.start_date)} → {formatDate(activeChallenge.end_date)}
                </div>
              ) : (
                <div className={styles.challengeStatus}>No active challenge right now.</div>
              )}
              <div className={styles.formGrid}>
                <label className={styles.field}>
                  <span>Title</span>
                  <input value={challenge.title} onChange={(event) => setChallenge((current) => ({ ...current, title: event.target.value }))} />
                </label>
                <label className={styles.field}>
                  <span>Start</span>
                  <input type="date" value={challenge.start_date} onChange={(event) => setChallenge((current) => ({ ...current, start_date: event.target.value }))} />
                </label>
                <label className={styles.field}>
                  <span>End</span>
                  <input type="date" value={challenge.end_date} onChange={(event) => setChallenge((current) => ({ ...current, end_date: event.target.value }))} />
                </label>
                <label className={styles.field}>
                  <span>Goal kg</span>
                  <input type="text" inputMode="decimal" pattern="[0-9]*[.,]?[0-9]*" value={challenge.target_weight_kg} onChange={(event) => setChallenge((current) => ({ ...current, target_weight_kg: event.target.value }))} placeholder="optional" />
                </label>
              </div>
              <label className={`${styles.field} ${styles.fieldFull}`}>
                <span>Notes</span>
                <textarea rows={3} value={challenge.notes} onChange={(event) => setChallenge((current) => ({ ...current, notes: event.target.value }))} />
              </label>
              <div className={styles.pillRow}>
                <button className="btn-base btn-secondary" disabled={Boolean(activeChallenge)} type="button" onClick={() => void startQuick100Challenge()}>
                  {activeChallenge ? '100-day cut active' : 'Start 100-day cut'}
                </button>
                <button className="btn-base btn-ghost" type="button" onClick={() => setChallenge(challengeDraft(todayIsoDate))}>
                  Load 100-day draft
                </button>
                <button className="btn-base btn-primary" disabled={busy !== null} onClick={() => void saveChallenge()} type="button">
                  {busy === '/api/cut-coach/challenges' ? 'Saving…' : 'Save challenge'}
                </button>
                {activeChallenge ? (
                  <button className="btn-base btn-ghost" disabled={busy !== null} type="button" onClick={() => void stopActiveChallenge()}>
                    Stop active challenge
                  </button>
                ) : null}
              </div>
              <div className={styles.challengeStatus}>
                {challenge.start_date ? `Draft starts: ${formatFullDate(challenge.start_date)}` : 'Pick a start date'}
              </div>
              <div className={styles.challengeStatus}>
                <strong>Safe actions:</strong> weight and kcal entries stay in place. Stopping a challenge archives the run, not your logs.
              </div>
            </section> : null}

            {setupComposer === 'reminders' ? <section className={`surface-card ${styles.panel}`}>
              <h3 className={styles.panelTitle}>Reminders + push</h3>
              <div className={styles.notificationHero}>
                <div>
                  <div className={styles.notificationEyebrow}>Mobile delivery</div>
                  <strong className={styles.notificationTitle}>Short, useful nudges</strong>
                  <p className={styles.notificationText}>
                    Keep reminders tied to one action only: morning weigh-in, evening kcal close, weekend measurements, or a gentle recovery prompt.
                  </p>
                </div>
                <div className={styles.notificationSummary}>
                  <span className={styles.notificationSummaryLabel}>
                    <Smartphone size={14} strokeWidth={2.2} />
                    {pushEnabled ? 'Push active' : 'Push inactive'}
                  </span>
                  <strong>{pushEnabled ? 'This device can receive reminders.' : 'Enable push for mobile delivery.'}</strong>
                </div>
              </div>

              <div className={styles.reminderList}>
                {reminders.map((item) => (
                  <article className={`${styles.reminderCard} ${item.enabled ? styles.reminderCardOn : styles.reminderCardOff}`} key={item.kind}>
                    <div className={styles.reminderCardHead}>
                      <div>
                      <strong>{item.title}</strong>
                        <p>{reminderDescription(item.kind)}</p>
                      </div>
                      <span className={styles.reminderTimeBadge}>{item.local_time}</span>
                    </div>
                    <div className={styles.reminderWeekdays}>
                      {[1, 2, 3, 4, 5, 6, 0].map((day) => (
                        <span
                          className={`${styles.reminderWeekday} ${item.weekdays.includes(day) ? styles.reminderWeekdayActive : ''}`}
                          key={`${item.kind}-${day}`}
                        >
                          {WEEKDAY_LABELS[day]}
                        </span>
                      ))}
                    </div>
                    <div className={styles.reminderControls}>
                      <input type="time" value={item.local_time} onChange={(event) => setReminders((current) => current.map((entry) => entry.kind === item.kind ? { ...entry, local_time: event.target.value } : entry))} />
                      <label className={styles.toggle}>
                        <input checked={item.enabled} type="checkbox" onChange={(event) => setReminders((current) => current.map((entry) => entry.kind === item.kind ? { ...entry, enabled: event.target.checked } : entry))} />
                        <span>{item.enabled ? 'On' : 'Off'}</span>
                      </label>
                    </div>
                  </article>
                ))}
              </div>

              <div className={styles.pushBox}>
                <div>
                  <strong>Mobile push</strong>
                  <p>
                    {pushSupported
                      ? pushEnabled
                        ? 'Notifications are active.'
                        : pushEnvironment.permission === 'denied'
                          ? 'Permission is blocked in the browser.'
                          : 'Enable push to get reminders on mobile.'
                      : 'This browser does not support web push.'}
                  </p>
                </div>
                {pushSupported ? (
                  <button className="btn-base btn-secondary" disabled={pushBusy || pushEnabled} onClick={() => void enableNotifications()} type="button">
                    {pushEnabled ? 'Enabled' : pushBusy ? 'Enabling…' : 'Enable push'}
                  </button>
                ) : null}
              </div>

              {pushError ? <div className={styles.pushError}>{pushError}</div> : null}

              <button className="btn-base btn-primary" disabled={busy !== null} onClick={() => void saveReminders()} type="button">
                {busy === '/api/cut-coach/reminders' ? 'Saving…' : 'Save reminders'}
              </button>
            </section> : null}
          </div>
          </> : null}
        </section>

        <section className={styles.mobileTopbarFooter}>
          <BackLink href="/">← Back to dashboard</BackLink>
          <ThemeToggle />
        </section>

        <div className={styles.mobileActionDock} aria-label="Quick actions">
          <button className={styles.mobileActionButton} onClick={() => openTodayEntry()} type="button">
            <UtensilsCrossed size={16} strokeWidth={2.2} />
            <span>Kcal</span>
          </button>
          <button className={styles.mobileActionButton} onClick={() => openWeightModal()} type="button">
            <Scale size={16} strokeWidth={2.2} />
            <span>Weight</span>
          </button>
          <button className={styles.mobileActionButton} onClick={() => openActivityModal()} type="button">
            <Dumbbell size={16} strokeWidth={2.2} />
            <span>Move</span>
          </button>
        </div>

        {showBackToTop ? (
          <button
            aria-label="Back to top"
            className={styles.backToTopButton}
            onClick={() => {
              if (typeof window === 'undefined') return;
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            type="button"
          >
            <ArrowUp size={18} strokeWidth={2.4} />
          </button>
        ) : null}
          </>
        ) : null}
      </div>
    </PageShell>
  );
}

function InventoryPanel({
  title,
  subtitle,
  counter,
  children,
  className,
}: {
  title: string;
  subtitle: string;
  counter?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={[styles.rpgPanel, className].filter(Boolean).join(' ')}>
      <div className={styles.rpgPanelFrame}>
        <div className={styles.panelPlaqueRow}>
          <div>
            <div className={styles.panelPlaque}>{title}</div>
            <p className={styles.panelSubline}>{subtitle}</p>
          </div>
          {counter ? <div className={styles.panelCounter}>{counter}</div> : null}
        </div>
        {children}
      </div>
    </section>
  );
}

function InventoryGrid({ children }: { children: ReactNode }) {
  return <div className={styles.inventoryMatrix}>{children}</div>;
}

function InventorySlot({
  item,
  label,
  badge,
  status,
  selected,
  size,
  shape,
  emptyHint,
  className,
  style,
  draggable,
  onClick,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: {
  item: CharacterItem | null;
  label: string;
  badge?: string | null;
  status: string;
  selected?: boolean;
  size: EquipmentSlotSize;
  shape: 'stash' | 'equipment';
  emptyHint: string;
  className?: string;
  style?: CSSProperties;
  draggable?: boolean;
  onClick?: () => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onDragOver?: (event: DragEvent<HTMLDivElement>) => void;
  onDrop?: (event: DragEvent<HTMLDivElement>) => void;
}) {
  const rarityClass = item ? styles[`rarity${capitalize(item.rarity)}`] : styles.slotEmpty;
  return (
    <div
      className={[
        styles.inventorySlot,
        styles[`slot${capitalize(size)}`],
        styles[`slot${capitalize(shape)}`],
        rarityClass,
        selected ? styles.itemSelected : '',
        className ?? '',
      ].filter(Boolean).join(' ')}
      style={style}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {item ? (
        <button
          className={styles.slotButton}
          draggable={draggable}
          onClick={onClick}
          onDragEnd={onDragEnd}
          onDragStart={onDragStart}
          type="button"
        >
          <div className={styles.slotTopline}>
            <span className={styles.slotLabel}>{label}</span>
            {badge ? <span className={styles.slotBadge}>{badge}</span> : null}
          </div>
          <div className={styles.slotCore}>
            <div className={styles.slotGlyph}>{itemSigil(item.name)}</div>
          </div>
          <div className={styles.slotBottomline}>
            <strong>{item.name}</strong>
            <small>{status}</small>
          </div>
          <ItemTooltip item={item} status={status} />
        </button>
      ) : (
        <button className={styles.slotButton} onClick={onClick} type="button">
          <div className={styles.slotTopline}>
            <span className={styles.slotLabel}>{label}</span>
          </div>
          <div className={styles.slotCore}>
            <div className={styles.slotGlyphEmpty}>+</div>
          </div>
          <div className={styles.slotBottomline}>
            <strong>EMPTY</strong>
            <small>{emptyHint}</small>
          </div>
        </button>
      )}
    </div>
  );
}

function CharacterPanel({
  title,
  subtitle,
  actionLabel,
  children,
}: {
  title: string;
  subtitle: string;
  actionLabel: string;
  children: ReactNode;
}) {
  return (
    <section className={styles.rpgPanel}>
      <div className={styles.rpgPanelFrame}>
        <div className={styles.panelPlaqueRow}>
          <div>
            <div className={styles.panelPlaque}>Character</div>
            <h4 className={styles.characterNameplate}>{title}</h4>
            <p className={styles.characterClassline}>{subtitle}</p>
          </div>
          <button className={styles.setButton} type="button">{actionLabel}</button>
        </div>
        {children}
      </div>
    </section>
  );
}

function EquipmentSlot({
  item,
  label,
  badge,
  status,
  selected,
  size,
  slotArea,
  emptyHint,
  className,
  ready,
  subdued,
  onClick,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: {
  item: CharacterItem | null;
  label: string;
  badge?: string | null;
  status: string;
  selected?: boolean;
  size: EquipmentSlotSize;
  slotArea: string;
  emptyHint: string;
  className?: string;
  ready?: boolean;
  subdued?: boolean;
  onClick?: () => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onDragOver?: (event: DragEvent<HTMLDivElement>) => void;
  onDrop?: (event: DragEvent<HTMLDivElement>) => void;
}) {
  return (
    <InventorySlot
      badge={badge}
      className={[
        styles.equipmentSlot,
        ready ? styles.itemSlotReady : '',
        subdued ? styles.itemSlotMuted : '',
        className ?? '',
      ].filter(Boolean).join(' ')}
      draggable={Boolean(item)}
      emptyHint={emptyHint}
      item={item}
      label={label}
      onClick={onClick}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragStart={onDragStart}
      onDrop={onDrop}
      selected={selected}
      shape="equipment"
      size={size}
      style={{ gridArea: slotArea }}
      status={status}
    />
  );
}

function ResourceBar({
  label,
  value,
  max,
  tone,
}: {
  label: string;
  value: number;
  max: number;
  tone: 'danger' | 'accent';
}) {
  const width = `${Math.round((value / Math.max(1, max)) * 100)}%`;
  return (
    <div className={styles.resourceBarWrap}>
      <div className={styles.resourceBarTop}>
        <span>{label}</span>
        <strong>{value}/{max}</strong>
      </div>
      <div className={styles.resourceBarTrack}>
        <span className={tone === 'danger' ? styles.resourceBarDanger : styles.resourceBarAccent} style={{ width }} />
      </div>
    </div>
  );
}

function StatusPlaque({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.statusPlaque}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function capitalize(value: string) {
  return `${value[0]?.toUpperCase() ?? ''}${value.slice(1)}`;
}

function statusBadge(status: string) {
  if (status === 'new') return 'NEW';
  if (status === 'swapped') return 'SWAP';
  if (status === 'equipped') return 'ON';
  if (status === 'stash') return 'STASH';
  return null;
}

function paperDollLabel(slot: string) {
  return PAPER_DOLL_SLOTS.find((item) => item.slot === slot)?.label ?? capitalize(slot);
}

function itemSigil(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('')
    .toUpperCase();
}

function ItemTooltip({ item, status }: { item: CharacterItem; status: string }) {
  return (
    <div className={`${styles.itemTooltip} ${styles[`rarity${capitalize(item.rarity)}`]}`}>
      <div className={styles.itemTooltipTop}>
        <span>{status}</span>
        <strong>{item.rarity}</strong>
      </div>
      <h5>{item.name}</h5>
      <div className={styles.itemTooltipMeta}>
        <span>{paperDollLabel(item.slot)}</span>
        <span>{item.source}</span>
      </div>
      <p>{item.statLine}</p>
      <small>{item.flavor}</small>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'good' | 'bad' | 'warn' | 'future' | 'neutral';
}) {
  return (
    <div className={`${styles.summaryTile} ${styles[`summaryTile${tone[0].toUpperCase()}${tone.slice(1)}`]}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
