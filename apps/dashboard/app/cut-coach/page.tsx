'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
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
  xp: number;
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
type TodayPanels = {
  checkin: boolean;
  weight: boolean;
};
type SetupComposer = 'profile' | 'challenge' | 'reminders' | null;
type ItemRarity = 'common' | 'magic' | 'rare' | 'set' | 'legendary';
type DragOrigin = { kind: 'equipped'; slot: string } | { kind: 'stash'; index: number } | null;
type SelectedItem = DragOrigin;

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
  { slot: 'helm', label: 'Head', area: 'head' },
  { slot: 'amulet', label: 'Amulet', area: 'amulet' },
  { slot: 'weapon', label: 'Weapon', area: 'weapon' },
  { slot: 'chest', label: 'Chest', area: 'chest' },
  { slot: 'shield', label: 'Shield', area: 'shield' },
  { slot: 'gloves', label: 'Gloves', area: 'gloves' },
  { slot: 'belt', label: 'Belt', area: 'belt' },
  { slot: 'ring', label: 'Ring', area: 'ring' },
  { slot: 'boots', label: 'Boots', area: 'boots' },
] as const;

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

function isoDiff(start: string, end: string) {
  const left = new Date(`${start}T00:00:00`);
  const right = new Date(`${end}T00:00:00`);
  return Math.round((right.getTime() - left.getTime()) / 86400000);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
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

function buildMonthCells(todayIsoDate: string, payload: BootstrapPayload | null) {
  const current = new Date(`${todayIsoDate}T12:00:00`);
  const monthStart = new Date(current.getFullYear(), current.getMonth(), 1);
  const firstWeekday = monthStart.getDay();
  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - firstWeekday);

  return Array.from({ length: 35 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    const isoDate = date.toISOString().slice(0, 10);
    const summary = findWeekDay(payload, isoDate);
    const checkin = payload ? findCheckinForDate(payload.checkins, isoDate) : null;
    const weight = payload ? findWeightForDate(payload.weights, isoDate) : null;
    return {
      isoDate,
      label: date.getDate(),
      inMonth: date.getMonth() === current.getMonth(),
      summary,
      checkin,
      weight,
      isToday: isoDate === todayIsoDate,
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

function buildWeightChartData(payload: BootstrapPayload | null) {
  if (!payload) return [];
  return [...payload.weights]
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(-14)
    .map((item) => ({
      date: formatDate(item.date, { day: 'numeric', month: 'short' }),
      weight: item.weight_kg,
      waist: item.waist_cm,
    }));
}

function buildTopFocus(today: DailySummary | null, challengeStats: ReturnType<typeof buildChallengeStats>) {
  const target = today?.target ? Math.round(today.target.kcal_target) : null;
  const logged = today && today.caloriesSource !== 'none' ? Math.round(today.consumed.calories) : null;
  const gap = target != null && logged != null ? logged - target : null;
  if (target == null) {
    return {
      now: 'Set up your profile',
      next: 'Add your weight and start your plan',
    };
  }

  if (logged == null) {
    return {
      now: `${target} kcal today`,
      next: 'Log total kcal at the end of the day',
    };
  }

  if (gap == null) {
    return {
      now: `${logged} kcal logged`,
      next: 'Add the rest and close the day cleanly',
    };
  }

  if (gap <= 50) {
    return {
      now: `${logged} / ${target} kcal`,
      next: challengeStats.currentDay > 0 ? `Day ${challengeStats.currentDay}: on track` : 'You are on track today',
    };
  }

  if (gap <= 180) {
    return {
      now: `+${gap} kcal over today`,
      next: 'Return to target tomorrow, no panic mode',
    };
  }

  return {
    now: `+${gap} kcal over target`,
    next: 'Trim a bit over the next 1-2 days and stay in flow',
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

function weekdaySummary(days: number[]) {
  return days.map((day) => WEEKDAY_LABELS[day] ?? '?').join(' • ');
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

function buildReward(url: string): RewardToast {
  const id = Date.now();
  if (url.includes('/checkins')) {
    return { id, title: 'Daily log saved', body: 'XP +12 for consistency and clear kcal tracking.', xp: 12 };
  }
  if (url.includes('/weights')) {
    return { id, title: 'Scale sync', body: 'XP +14 for weight and measurements.', xp: 14 };
  }
  if (url.includes('/profile')) {
    return { id, title: 'Metabolism tuned', body: 'XP +20. Your kcal plan now has a stronger base.', xp: 20 };
  }
  if (url.includes('/challenges')) {
    return { id, title: 'Challenge locked', body: 'XP +16. Your cut now has a clear timeline.', xp: 16 };
  }
  return { id, title: 'Settings saved', body: 'XP +8. Your system is better calibrated now.', xp: 8 };
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
  const [data, setData] = useState<BootstrapPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [setup, setSetup] = useState<SetupState>(defaultSetup);
  const [checkin, setCheckin] = useState<CheckinState>(emptyCheckin(new Date().toISOString().slice(0, 10)));
  const [weight, setWeight] = useState<WeightState>(emptyWeight(new Date().toISOString().slice(0, 10)));
  const [challenge, setChallenge] = useState<ChallengeState>(challengeDraft(new Date().toISOString().slice(0, 10)));
  const [reminders, setReminders] = useState<ReminderDraft[]>(defaultReminderDrafts([]));
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [rewardToast, setRewardToast] = useState<RewardToast | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Record<SectionKey, boolean>>({
    today: false,
    flow: false,
    calendar: true,
    progress: true,
    settings: false,
  });
  const [todayPanels, setTodayPanels] = useState<TodayPanels>({ checkin: true, weight: false });
  const [setupComposer, setSetupComposer] = useState<SetupComposer>(null);
  const [kcalQuickAdd, setKcalQuickAdd] = useState('');
  const [inventoryOverride, setInventoryOverride] = useState<CharacterInventory | null>(null);
  const [draggedItem, setDraggedItem] = useState<DragOrigin>(null);
  const [selectedItem, setSelectedItem] = useState<SelectedItem>(null);
  const [characterCollapsed, setCharacterCollapsed] = useState(false);
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
    setCheckin(fillCheckin(payload.todayIsoDate, payload));
    setWeight(fillWeight(payload.todayIsoDate, payload));
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
    setBusy(null);
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setBusy('loading');
      setError(null);
      const res = await fetch('/api/cut-coach/bootstrap', { cache: 'no-store' });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        if (!cancelled) {
          setError(payload.error ?? 'Could not load Cut Coach.');
          setBusy(null);
        }
        return;
      }
      const payload = (await res.json()) as BootstrapPayload;
      if (!cancelled) {
        applyBootstrap(payload);
        setBusy(null);
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

  async function postJson(url: string, body: unknown, successMessage: string) {
    setBusy(url);
    setError(null);
    setNotice(null);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setError(payload.error ?? 'Request failed.');
      setBusy(null);
      return false;
    }
    setNotice(successMessage);
    setRewardToast(buildReward(url));
    await loadBootstrap({ silent: true });
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
    const ok = await postJson(
      '/api/cut-coach/checkins',
      {
        ...nextCheckin,
        copied_from_previous: copiedFromPrevious,
      },
      successMessage
    );
    return ok;
  }

  async function saveCheckin(copiedFromPrevious = false) {
    return await persistCheckin(checkin, 'Today kcal saved.', copiedFromPrevious);
  }

  async function addKcalToToday() {
    const quickAdd = toNumber(kcalQuickAdd);
    if (quickAdd <= 0) {
      setNotice('Add a positive kcal amount first.');
      return false;
    }
    const nextCheckin = {
      ...checkin,
      kcal_actual: String(toNumber(checkin.kcal_actual) + quickAdd),
    };
    setCheckin(nextCheckin);
    const ok = await persistCheckin(nextCheckin, `${quickAdd} kcal added to today.`);
    if (ok) setKcalQuickAdd('');
    return ok;
  }

  async function saveWeight() {
    if (toNumber(weight.weight_kg) <= 0) {
      setNotice('Add a valid weight first.');
      return false;
    }
    return await postJson('/api/cut-coach/weights', weight, 'Weight and measurements saved.');
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
    const ok = await postJson('/api/cut-coach/reminders', { reminders }, 'Reminders saved.');
    if (ok) setSetupComposer(null);
    return ok;
  }

  function applyTargetToCheckin() {
    const summary = findWeekDay(data, checkin.date);
    if (!summary?.target) return;
    setCheckin((current) => ({
      ...current,
      kcal_actual: String(Math.round(summary.target!.kcal_target)),
    }));
  }

  function copyYesterday() {
    if (!data) return;
    const yesterday = findCheckinForDate(data.checkins, addDays(checkin.date, -1));
    if (!yesterday) {
      setNotice('No check-in found for yesterday.');
      return;
    }
    setCheckin({
      date: checkin.date,
      kcal_actual: yesterday.kcal_actual != null ? String(yesterday.kcal_actual) : '',
      activity_kcal_burned: yesterday.activity_kcal_burned != null ? String(yesterday.activity_kcal_burned) : '',
      activity_summary: yesterday.activity_summary ?? '',
      notes: yesterday.notes ?? '',
      source_app: yesterday.source_app ?? 'LifeSum',
    });
    setNotice('Yesterday copied into today.');
  }

  function copyLastMeasurements() {
    if (!data) return;
    const latestWithTape = data.weights.find(
      (item) => item.waist_cm || item.hips_cm || item.chest_cm || item.thigh_cm || item.arm_cm || item.neck_cm
    );
    if (!latestWithTape) {
      setNotice('No previous measurements found.');
      return;
    }
    setWeight((current) => ({
      ...current,
      waist_cm: latestWithTape.waist_cm != null ? String(latestWithTape.waist_cm) : '',
      hips_cm: latestWithTape.hips_cm != null ? String(latestWithTape.hips_cm) : '',
      chest_cm: latestWithTape.chest_cm != null ? String(latestWithTape.chest_cm) : '',
      thigh_cm: latestWithTape.thigh_cm != null ? String(latestWithTape.thigh_cm) : '',
      arm_cm: latestWithTape.arm_cm != null ? String(latestWithTape.arm_cm) : '',
      neck_cm: latestWithTape.neck_cm != null ? String(latestWithTape.neck_cm) : '',
    }));
    setNotice('Last measurement session copied.');
  }

  function toggleSection(section: SectionKey) {
    setCollapsedSections((current) => ({
      ...current,
      [section]: !current[section],
    }));
  }

  function toggleTodayPanel(panel: keyof TodayPanels) {
    setTodayPanels((current) => ({
      ...current,
      [panel]: !current[panel],
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

  const todayIsoDate = data?.todayIsoDate ?? new Date().toISOString().slice(0, 10);
  const activeChallenge = selectActiveChallenge(data?.challenges ?? [], todayIsoDate);
  const challengeStats = buildChallengeStats(activeChallenge, data);
  const xp = buildXp(data);
  const achievements = buildAchievements(data, activeChallenge, challengeStats);
  const today = data?.today ?? null;
  const tomorrow = data?.tomorrow ?? null;
  const selectedDay = findWeekDay(data, checkin.date);
  const monthCells = buildMonthCells(todayIsoDate, data);
  const weightChartData = buildWeightChartData(data);
  const topFocus = buildTopFocus(today, challengeStats);
  const burnedKcal = toNumber(checkin.activity_kcal_burned);
  const netKcal = Math.max(0, toNumber(checkin.kcal_actual) - burnedKcal);
  const overToday =
    today?.target && today.caloriesSource !== 'none' ? Math.round(today.consumed.calories - today.target.kcal_target) : null;
  const todayCheckinDone = Boolean(data && findCheckinForDate(data.checkins, todayIsoDate)?.kcal_actual != null);
  const todayWeightDone = Boolean(data && findWeightForDate(data.weights, todayIsoDate)?.weight_kg != null);
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
  const stashCellCount = Math.max(20, inventory.stash.length + 4);
  const stashCells = Array.from({ length: stashCellCount }, (_, index) => inventory.stash[index] ?? null);

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

        <section className={`hero-card ${styles.hero}`}>
          <div className={styles.heroIntro}>
            <div className="eyebrow">Cut Coach</div>
            <div className={styles.heroMeta}>
              <span>{activeChallenge ? activeChallenge.title : 'No active challenge'}</span>
              <span>{activeChallenge ? `${formatDate(activeChallenge.start_date)} → ${formatDate(activeChallenge.end_date)}` : 'Start whenever you are ready'}</span>
            </div>
          </div>

          <div className={styles.heroHeader}>
            <div>
              <h1 className={styles.heroTitle}>Cut, on rails.</h1>
              <p className={styles.heroText}>Track weight, kcal, trend and the next move.</p>
            </div>
            <div className={styles.heroActions}>
              <a className="btn-base btn-primary" href="#today">
                Log today
              </a>
              <a className="btn-base btn-secondary" href="#flow">
                Week flow
              </a>
              <a className="btn-base btn-ghost" href="#settings">
                Setup
              </a>
            </div>
          </div>

          <div className={styles.heroStats}>
            <MetricBox label="Challenge day" value={challengeStats.currentDay > 0 ? `${challengeStats.currentDay}/${challengeStats.totalDays}` : 'Ready'} helper={activeChallenge ? phaseLabel(challengeStats.progress) : 'Create your first run'} />
            <MetricBox label="Active plan today" value={today?.target ? `${Math.round(today.target.kcal_target)} kcal` : 'Setup'} helper={today?.target ? humanizeAdjustmentReason(today.target.adjustment_reason, 'today') : 'Save your profile'} />
            <MetricBox label="Weight" value={data?.trends.latest ? `${data.trends.latest.weight_kg} kg` : '—'} helper={challengeStats.deltaWeight != null ? `${challengeStats.deltaWeight > 0 ? '+' : ''}${challengeStats.deltaWeight} kg vs start` : 'Waiting for baseline'} />
            <MetricBox label="XP / level" value={`${xp.xp} XP`} helper={`Level ${xp.level}`} />
          </div>

          {overToday != null ? (
            <div className={`${styles.alert} ${overToday > 150 ? styles.alertBad : overToday > 0 ? styles.alertWarn : styles.alertGood}`}>
              {overToday > 150
                ? `You are ${overToday} kcal over today. Return to target tomorrow and trim lightly over the next 2-3 days.`
                : overToday > 0
                  ? `You are slightly over target today (+${overToday} kcal). Stay controlled tomorrow and you are back on trend.`
                  : `You are on track today. ${today?.remaining ? `${Math.max(0, Math.round(today.remaining.calories))} kcal left.` : ''}`}
            </div>
          ) : null}
          <button
            className={styles.characterPeek}
            onClick={() => {
              setCollapsedSections((current) => ({ ...current, progress: false }));
              setCharacterCollapsed(false);
            }}
            type="button"
          >
            <div>
              <div className={styles.characterPeekKicker}>{characterState.archetype}</div>
              <strong>{characterState.latestDrop.name}</strong>
              <span>HP {characterState.hp}/{characterState.maxHp} • Latest drop • {characterState.latestDrop.rarity}</span>
            </div>
            <span className={styles.characterPeekAction}>Open character</span>
          </button>
          <div className={styles.heroDeck}>
            <section className={styles.heroPanel}>
              <div className={styles.focusKicker}>Today</div>
              <div className={styles.focusNow}>{topFocus.now}</div>
              <div className={styles.focusNext}>{topFocus.next}</div>
              <div className={styles.quickSummary}>
                <SummaryTile label="Current kg" value={data?.trends.latest ? `${data.trends.latest.weight_kg} kg` : '—'} tone="neutral" />
                <SummaryTile label="Today" value={today?.target ? `${Math.round(today.target.kcal_target)} kcal` : '—'} tone="good" />
                <SummaryTile label="Tomorrow" value={tomorrow?.target ? `${Math.round(tomorrow.target.kcal_target)} kcal` : '—'} tone="future" />
                <SummaryTile label="Day" value={challengeStats.currentDay > 0 ? `${challengeStats.currentDay}/${challengeStats.totalDays}` : '—'} tone="warn" />
              </div>
            </section>

            <section className={styles.heroPanel}>
              <div className={styles.chartHead}>
                <div>
                  <div className={styles.focusKicker}>Weight trend</div>
                  <div className={styles.chartTitle}>Weight history</div>
                </div>
                <div className={styles.chartMeta}>
                  {data?.trends.delta7 != null ? `${data.trends.delta7 > 0 ? '-' : '+'}${Math.abs(data.trends.delta7)} kg / 7 days` : 'Waiting for more data'}
                </div>
              </div>
              <div className={styles.chartBox}>
                {weightChartData.length > 1 ? (
                  <ResponsiveContainer width="100%" height={190}>
                    <LineChart data={weightChartData} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
                      <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="date" tick={{ fill: 'var(--muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: 'var(--muted)', fontSize: 11 }} axisLine={false} tickLine={false} width={42} domain={['dataMin - 0.5', 'dataMax + 0.5']} />
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
                  <div className={styles.chartEmpty}>Add at least 2 weigh-ins to unlock the chart.</div>
                )}
              </div>
            </section>
          </div>
        </section>

        {error ? <section className={`surface-card ${styles.banner} ${styles.bannerError}`}>{error}</section> : null}
        {error ? (
          <section className={`surface-card ${styles.banner} ${styles.bannerHint}`}>
            <strong>Debug tip</strong>
            <p>
              If you see `unexpected error` or `500`, the usual causes are missing SQL from `cut_coach.sql` or a bad timezone from env before the last refresh.
            </p>
          </section>
        ) : null}
        {notice ? <section className={`surface-card ${styles.banner} ${styles.bannerOk}`}>{notice}</section> : null}
        {rewardToast ? (
          <div className={styles.rewardToast} key={rewardToast.id}>
            <div className={styles.rewardGlow} />
            <div className={styles.rewardKicker}>XP +{rewardToast.xp}</div>
            <strong>{rewardToast.title}</strong>
            <p>{rewardToast.body}</p>
          </div>
        ) : null}

        <section id="today" className={styles.appSection}>
          <div className={styles.sectionHead}>
            <div>
              <div className={styles.sectionEyebrow}>today</div>
              <h2 className={styles.sectionTitle}>Today</h2>
            </div>
            <div className={styles.sectionHeadActions}>
              <div className={styles.sectionMeta}>{formatFullDate(checkin.date)}</div>
            </div>
          </div>

          {!collapsedSections.today ? <>
          <div className={styles.composerGrid}>
            <button
              className={`${styles.composerButton} ${todayCheckinDone ? styles.composerButtonDone : ''} ${todayPanels.checkin ? styles.composerButtonActive : ''}`}
              onClick={() => toggleTodayPanel('checkin')}
              type="button"
            >
              <strong>{todayCheckinDone ? 'Kcal panel ready' : 'Open kcal panel'}</strong>
              <span>{todayCheckinDone ? 'Keep updating today as you go.' : 'Log kcal now and add more later.'}</span>
            </button>
            <button
              className={`${styles.composerButton} ${todayWeightDone ? styles.composerButtonDone : ''} ${todayPanels.weight ? styles.composerButtonActive : ''}`}
              onClick={() => toggleTodayPanel('weight')}
              type="button"
            >
              <strong>{todayWeightDone ? 'Weight panel ready' : 'Open weight panel'}</strong>
              <span>{todayWeightDone ? 'Morning weigh-in is saved. Edit only if needed.' : 'Enter weight when you have the scale reading.'}</span>
            </button>
          </div>

          <div className={styles.todayGrid}>
            {todayPanels.checkin ? <section className={`surface-card ${styles.panel}`}>
              <div className={styles.panelHead}>
                <div>
                  <h3 className={styles.panelTitle}>Kcal check-in</h3>
                  <p className={styles.panelText}>Keep one running total for the day. Save now, then come back later and update it again.</p>
                </div>
                <div className={styles.pillRow}>
                  <button className="btn-base btn-ghost" type="button" onClick={copyYesterday}>
                    Same as yesterday
                  </button>
                  <button className="btn-base btn-secondary" type="button" onClick={applyTargetToCheckin}>
                    Use target
                  </button>
                </div>
              </div>

              <div className={styles.formGrid}>
                <label className={styles.field}>
                  <span>Date</span>
                  <input type="date" value={checkin.date} onChange={(event) => {
                    const nextDate = event.target.value;
                    setCheckin(fillCheckin(nextDate, data));
                    setWeight(fillWeight(nextDate, data));
                  }} />
                </label>
                <label className={styles.field}>
                  <span>Current total kcal</span>
                  <input className={styles.featureInput} type="number" inputMode="numeric" value={checkin.kcal_actual} onChange={(event) => setCheckin((current) => ({ ...current, kcal_actual: event.target.value }))} placeholder="e.g. 2140" />
                </label>
                <label className={styles.field}>
                  <span>Activity</span>
                  <input value={checkin.activity_summary} onChange={(event) => setCheckin((current) => ({ ...current, activity_summary: event.target.value }))} placeholder="e.g. walk 45m / bike / gym / none" />
                </label>
                <label className={styles.field}>
                  <span>Burned kcal from app</span>
                  <input className={styles.featureInput} type="number" inputMode="numeric" value={checkin.activity_kcal_burned} onChange={(event) => setCheckin((current) => ({ ...current, activity_kcal_burned: event.target.value }))} placeholder="e.g. 320" />
                </label>
                <label className={styles.field}>
                  <span>Source</span>
                  <input value={checkin.source_app} onChange={(event) => setCheckin((current) => ({ ...current, source_app: event.target.value }))} placeholder="LifeSum" />
                </label>
              </div>

              <div className={styles.kcalAddRow}>
                <label className={styles.field}>
                  <span>Quick add kcal</span>
                  <input
                    className={styles.featureInput}
                    inputMode="numeric"
                    onChange={(event) => setKcalQuickAdd(event.target.value)}
                    placeholder="e.g. 650"
                    type="number"
                    value={kcalQuickAdd}
                  />
                </label>
                <button className="btn-base btn-secondary" disabled={busy !== null} onClick={() => void addKcalToToday()} type="button">
                  {busy === '/api/cut-coach/checkins' ? 'Saving…' : 'Add to today'}
                </button>
              </div>

              <div className={styles.quickActionsRow}>
                <button className={styles.quickChip} onClick={() => setCheckin((current) => ({ ...current, kcal_actual: String(Math.max(0, toNumber(current.kcal_actual) - 150)) }))} type="button">
                  -150
                </button>
                <button className={styles.quickChip} onClick={() => setCheckin((current) => ({ ...current, kcal_actual: String(toNumber(current.kcal_actual) + 150) }))} type="button">
                  +150
                </button>
                <button className={styles.quickChip} onClick={() => setCheckin((current) => ({ ...current, activity_summary: 'Walk', activity_kcal_burned: '200' }))} type="button">
                  walk +200
                </button>
                <button className={styles.quickChip} onClick={() => setCheckin((current) => ({ ...current, activity_summary: 'Bike', activity_kcal_burned: '350' }))} type="button">
                  bike +350
                </button>
              </div>

              <label className={`${styles.field} ${styles.fieldFull}`}>
                <span>Notes</span>
                <textarea rows={3} value={checkin.notes} onChange={(event) => setCheckin((current) => ({ ...current, notes: event.target.value }))} placeholder="any useful context" />
              </label>

              <div className={styles.quickSummary}>
                <SummaryTile label="Target" value={selectedDay?.target ? `${Math.round(selectedDay.target.kcal_target)} kcal` : '—'} tone="neutral" />
                <SummaryTile label="Logged so far" value={selectedDay && selectedDay.caloriesSource !== 'none' ? `${Math.round(selectedDay.consumed.calories)} kcal` : 'Not logged'} tone={selectedDay?.target && selectedDay.caloriesSource !== 'none' && selectedDay.consumed.calories <= selectedDay.target.kcal_target + 50 ? 'good' : 'warn'} />
                <SummaryTile label="Activity burn" value={burnedKcal > 0 ? `${Math.round(burnedKcal)} kcal` : '0 kcal'} tone="future" />
                <SummaryTile label="Net today" value={toNumber(checkin.kcal_actual) > 0 ? `${Math.round(netKcal)} kcal` : '—'} tone="good" />
                <SummaryTile label="Remaining" value={selectedDay?.remaining ? `${Math.round(selectedDay.remaining.calories)} kcal` : '—'} tone={selectedDay?.remaining && selectedDay.remaining.calories >= 0 ? 'good' : 'bad'} />
                <SummaryTile label="Tomorrow" value={tomorrow?.target ? `${Math.round(tomorrow.target.kcal_target)} kcal` : '—'} tone="future" />
              </div>

              <div className={styles.kcalSaveRow}>
                <button className="btn-base btn-primary" disabled={busy !== null} onClick={() => void saveCheckin()} type="button">
                  {busy === '/api/cut-coach/checkins' ? 'Saving…' : 'Save current total'}
                </button>
                <span className={styles.inlineHint}>You can save this panel multiple times in the same day.</span>
              </div>
            </section> : null}

            {todayPanels.weight ? <section className={`surface-card ${styles.panel}`}>
              <div className={styles.panelHead}>
                <div>
                  <h3 className={styles.panelTitle}>Weight + tape</h3>
                  <p className={styles.panelText}>Daily weight. Tape measurements mostly on weekends.</p>
                </div>
                <button className="btn-base btn-ghost" type="button" onClick={copyLastMeasurements}>
                  Copy last measurements
                </button>
              </div>

              <div className={styles.formGrid}>
                <label className={styles.field}>
                  <span>Date</span>
                  <input type="date" value={weight.date} onChange={(event) => {
                    const nextDate = event.target.value;
                    setWeight(fillWeight(nextDate, data));
                    setCheckin(fillCheckin(nextDate, data));
                  }} />
                </label>
                <label className={styles.field}>
                  <span>Weight kg</span>
                  <input type="number" step="0.1" inputMode="decimal" value={weight.weight_kg} onChange={(event) => setWeight((current) => ({ ...current, weight_kg: event.target.value }))} placeholder="e.g. 89.6" />
                </label>
                <label className={styles.field}>
                  <span>Waist</span>
                  <input type="number" step="0.1" inputMode="decimal" value={weight.waist_cm} onChange={(event) => setWeight((current) => ({ ...current, waist_cm: event.target.value }))} placeholder="cm" />
                </label>
                <label className={styles.field}>
                  <span>Hips</span>
                  <input type="number" step="0.1" inputMode="decimal" value={weight.hips_cm} onChange={(event) => setWeight((current) => ({ ...current, hips_cm: event.target.value }))} placeholder="cm" />
                </label>
                <label className={styles.field}>
                  <span>Chest</span>
                  <input type="number" step="0.1" inputMode="decimal" value={weight.chest_cm} onChange={(event) => setWeight((current) => ({ ...current, chest_cm: event.target.value }))} placeholder="cm" />
                </label>
                <label className={styles.field}>
                  <span>Thigh</span>
                  <input type="number" step="0.1" inputMode="decimal" value={weight.thigh_cm} onChange={(event) => setWeight((current) => ({ ...current, thigh_cm: event.target.value }))} placeholder="cm" />
                </label>
                <label className={styles.field}>
                  <span>Arm</span>
                  <input type="number" step="0.1" inputMode="decimal" value={weight.arm_cm} onChange={(event) => setWeight((current) => ({ ...current, arm_cm: event.target.value }))} placeholder="cm" />
                </label>
                <label className={styles.field}>
                  <span>Neck</span>
                  <input type="number" step="0.1" inputMode="decimal" value={weight.neck_cm} onChange={(event) => setWeight((current) => ({ ...current, neck_cm: event.target.value }))} placeholder="cm" />
                </label>
              </div>

              <label className={`${styles.field} ${styles.fieldFull}`}>
                <span>Notes</span>
                <textarea rows={3} value={weight.notes} onChange={(event) => setWeight((current) => ({ ...current, notes: event.target.value }))} placeholder="e.g. water retention, late meal, weekend" />
              </label>

              <div className={styles.quickSummary}>
                <SummaryTile label="Latest" value={data?.trends.latest ? `${data.trends.latest.weight_kg} kg` : '—'} tone="neutral" />
                <SummaryTile label="Avg 7" value={data?.trends.avg7 ? `${data.trends.avg7} kg` : '—'} tone="neutral" />
                <SummaryTile label="Delta 7" value={data?.trends.delta7 != null ? `${data.trends.delta7 > 0 ? '-' : '+'}${Math.abs(data.trends.delta7)} kg` : '—'} tone={data?.trends.delta7 != null && data.trends.delta7 > 0 ? 'good' : 'future'} />
                <SummaryTile label="Measurements" value={weight.waist_cm || weight.hips_cm || weight.chest_cm ? 'Weekend set' : 'Optional'} tone="future" />
              </div>

              <button className="btn-base btn-primary" disabled={busy !== null} onClick={() => void saveWeight()} type="button">
                {busy === '/api/cut-coach/weights' ? 'Saving…' : 'Save weight / measurements'}
              </button>
            </section> : null}
          </div>
          </> : null}
        </section>

        <section id="flow" className={styles.appSection}>
          <div className={styles.sectionHead}>
            <div>
              <div className={styles.sectionEyebrow}>flow</div>
              <h2 className={styles.sectionTitle}>Week flow</h2>
            </div>
            <div className={styles.sectionHeadActions}>
              <div className={styles.sectionMeta}>{activeChallenge ? `${phaseLabel(challengeStats.progress)} phase` : 'Set up a challenge'}</div>
              <button className={styles.sectionToggle} onClick={() => toggleSection('flow')} type="button">
                {collapsedSections.flow ? 'Expand' : 'Collapse'}
              </button>
            </div>
          </div>

          {!collapsedSections.flow ? <>
          <div className={styles.flowRail}>
            {(data?.week ?? []).map((day) => (
              <button className={`${styles.dayCard} ${toneForDay(day, todayIsoDate)}`} key={day.date} onClick={() => {
                setCheckin(fillCheckin(day.date, data));
                setWeight(fillWeight(day.date, data));
              }} type="button">
                <div className={styles.dayTop}>
                  <span>{shortDay(day.date)}</span>
                  <span>{formatDate(day.date)}</span>
                </div>
                <div className={styles.dayKcal}>{day.target ? Math.round(day.target.kcal_target) : '—'} kcal</div>
                <div className={styles.dayBottom}>
                  <span>{day.caloriesSource === 'none' ? 'No log' : `${Math.round(day.consumed.calories)} logged`}</span>
                  <span>{day.target?.day_type === 'training' ? 'training' : 'rest'}</span>
                </div>
              </button>
            ))}
          </div>

          <div className={styles.flowMetaGrid}>
            <section className={`surface-card ${styles.panel}`}>
              <h3 className={styles.panelTitle}>Current run</h3>
              <p className={styles.panelText}>
                {today?.target ? `Today you have a ${Math.round(today.target.kcal_target)} kcal target.` : 'Save setup first.'}{' '}
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
              <h3 className={styles.panelTitle}>Adaptive note</h3>
              <p className={styles.panelText}>
                {today?.target
                  ? humanizeAdjustmentReason(today.target.adjustment_reason, 'today')
                  : 'The planner starts after profile + weight are saved.'}
              </p>
            </section>
          </div>
          </> : null}
        </section>

        <section id="calendar" className={styles.appSection}>
          <div className={styles.sectionHead}>
            <div>
              <div className={styles.sectionEyebrow}>history</div>
              <h2 className={styles.sectionTitle}>Calendar + momentum</h2>
            </div>
            <div className={styles.sectionHeadActions}>
              <div className={styles.sectionMeta}>green good / red bad</div>
              <button className={styles.sectionToggle} onClick={() => toggleSection('calendar')} type="button">
                {collapsedSections.calendar ? 'Expand' : 'Collapse'}
              </button>
            </div>
          </div>

          {!collapsedSections.calendar ? <div className={styles.calendarGrid}>
            <section className={`surface-card ${styles.panel}`}>
              <div className={styles.calendarHeader}>
                <h3 className={styles.panelTitle}>Current month</h3>
                <span className={styles.panelText}>{new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(new Date(`${todayIsoDate}T12:00:00`))}</span>
              </div>
              <div className={styles.weekdays}>
                {WEEKDAY_LABELS.map((label) => (
                  <span key={label}>{label}</span>
                ))}
              </div>
              <div className={styles.monthGrid}>
                {monthCells.map((cell) => {
                  const diff = cell.summary?.target ? cell.summary.consumed.calories - cell.summary.target.kcal_target : null;
                  const tone =
                    cell.summary && diff != null
                      ? diff <= 50
                        ? styles.monthCellGood
                        : diff <= 180
                          ? styles.monthCellWarn
                          : styles.monthCellBad
                      : cell.weight
                        ? styles.monthCellWeight
                        : styles.monthCellNeutral;
                  return (
                    <div className={`${styles.monthCell} ${tone} ${cell.isToday ? styles.monthCellToday : ''} ${!cell.inMonth ? styles.monthCellMuted : ''}`} key={cell.isoDate}>
                      <span>{cell.label}</span>
                      <small>
                        {cell.summary?.target
                          ? `${Math.round(cell.summary.target.kcal_target)}`
                          : cell.weight
                            ? `${cell.weight.weight_kg}`
                            : ''}
                      </small>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className={`surface-card ${styles.panel}`}>
              <h3 className={styles.panelTitle}>Achievements</h3>
              <div className={styles.achievementList}>
                {achievements.map((item) => (
                  <div className={`${styles.achievement} ${item.unlocked ? styles.achievementOn : styles.achievementOff}`} key={item.title}>
                    <div>
                      <strong>{item.title}</strong>
                      <p>{item.body}</p>
                    </div>
                    <span>{item.unlocked ? 'Unlocked' : 'Locked'}</span>
                  </div>
                ))}
              </div>
            </section>
          </div> : null}
        </section>

        <section id="progress" className={styles.appSection}>
          <div className={styles.sectionHead}>
            <div>
              <div className={styles.sectionEyebrow}>progress</div>
              <h2 className={styles.sectionTitle}>Challenge status</h2>
            </div>
            <div className={styles.sectionHeadActions}>
              <div className={styles.sectionMeta}>{activeChallenge ? `${Math.round(challengeStats.progress * 100)}% complete` : 'No active challenge'}</div>
              <button className={styles.sectionToggle} onClick={() => toggleSection('progress')} type="button">
                {collapsedSections.progress ? 'Expand' : 'Collapse'}
              </button>
            </div>
          </div>

          {!collapsedSections.progress ? <div className={styles.progressGrid}>
            <section className={`surface-card ${styles.panel}`}>
              <h3 className={styles.panelTitle}>Scoreboard</h3>
              <div className={styles.scoreGrid}>
                <SummaryTile label="Check-in days" value={String(challengeStats.checkinDays)} tone="neutral" />
                <SummaryTile label="Green days" value={String(challengeStats.underTargetDays)} tone="good" />
                <SummaryTile label="Start kg" value={challengeStats.startWeight != null ? `${challengeStats.startWeight}` : '—'} tone="future" />
                <SummaryTile label="Current kg" value={challengeStats.currentWeight != null ? `${challengeStats.currentWeight}` : '—'} tone="neutral" />
              </div>
            </section>

            <section className={`surface-card ${styles.panel}`}>
              <h3 className={styles.panelTitle}>What matters now</h3>
              <ul className={styles.cleanList}>
                <li>Main daily input: total kcal at the end of the day.</li>
                <li>Daily weigh-in in the morning, same context.</li>
                <li>Waist and the rest of the measurements on weekends.</li>
                <li>Movement stays optional, but helps with context.</li>
              </ul>
            </section>

            <section className={`surface-card ${styles.panel}`}>
              <div className={styles.panelHead}>
                <div>
                  <h3 className={styles.panelTitle}>Character</h3>
                  <p className={styles.panelText}>A Diablo-style layer that reacts to consistency, misses and milestone drops.</p>
                </div>
                <button className={styles.sectionToggle} onClick={() => setCharacterCollapsed((current) => !current)} type="button">
                  {characterCollapsed ? 'Expand' : 'Collapse'}
                </button>
              </div>
              {!characterCollapsed ? (
                <div className={styles.characterGrid}>
                  <div className={styles.characterBoard}>
                    <div className={styles.stashPanel}>
                      <div className={styles.inventoryHeader}>
                        <div>
                          <div className={styles.focusKicker}>Stash</div>
                          <h4 className={styles.inventoryTitle}>Drops and spare gear</h4>
                        </div>
                        <div className={styles.inventoryCounter}>{inventory.stash.length} / {stashCellCount}</div>
                      </div>
                      <div className={styles.inventoryMatrix}>
                        {stashCells.map((item, index) =>
                          item ? (
                            <button
                              className={`${styles.inventoryCell} ${styles.stashItem} ${styles[`rarity${capitalize(item.rarity)}`]} ${selectedItem?.kind === 'stash' && selectedItem.index === index ? styles.itemSelected : ''}`}
                              draggable
                              key={`${item.slot}-${item.name}-${index}`}
                              onClick={() => setSelectedItem({ kind: 'stash', index })}
                              onDragEnd={() => setDraggedItem(null)}
                              onDragOver={(event) => event.preventDefault()}
                              onDragStart={() => startDrag({ kind: 'stash', index })}
                              onDrop={(event) => {
                                event.preventDefault();
                                moveToStash(index);
                              }}
                              type="button"
                            >
                              <div className={styles.stashTop}>
                                <span>{itemStatus(item, { kind: 'stash', index })}</span>
                                <strong>{paperDollLabel(item.slot)}</strong>
                              </div>
                              <div className={styles.itemGlyph}>{itemSigil(item.name)}</div>
                              <div className={styles.itemMini}>{item.name}</div>
                              <ItemTooltip item={item} status={itemStatus(item, { kind: 'stash', index })} />
                            </button>
                          ) : (
                            <div
                              className={`${styles.inventoryCell} ${styles.inventoryCellEmpty}`}
                              key={`stash-empty-${index}`}
                              onDragOver={(event) => event.preventDefault()}
                              onDrop={(event) => {
                                event.preventDefault();
                                moveToStash(index);
                              }}
                            >
                              <span>{index < inventory.stash.length ? 'reorder' : 'empty'}</span>
                            </div>
                          )
                        )}
                      </div>
                    </div>

                    <div className={styles.equipmentPanel}>
                      <div className={styles.inventoryHeader}>
                        <div>
                          <div className={styles.focusKicker}>Character</div>
                          <h4 className={styles.inventoryTitle}>{characterState.archetype}</h4>
                          <p className={styles.panelText}>{characterState.title}</p>
                        </div>
                        <div className={styles.characterBadge}>{characterState.latestDrop.rarity}</div>
                      </div>
                      <div className={styles.paperDoll}>
                        <div className={styles.dollSilhouette}>
                          <div className={styles.dollHead} />
                          <div className={styles.dollTorso} />
                          <div className={styles.dollLegs} />
                        </div>
                        {PAPER_DOLL_SLOTS.map(({ slot, label, area }) => {
                          const item = inventory.equipped[slot] ?? null;
                          const canDropHere = draggedLoot?.slot === slot;
                          const showBlockedSlot = Boolean(draggedLoot) && !canDropHere;
                          return (
                            <div
                              className={`${styles.itemSlot} ${item ? styles[`rarity${capitalize(item.rarity)}`] : styles.itemSlotEmpty} ${canDropHere ? styles.itemSlotReady : ''} ${showBlockedSlot ? styles.itemSlotMuted : ''}`}
                              key={slot}
                              onDragOver={(event) => event.preventDefault()}
                              onDrop={(event) => {
                                event.preventDefault();
                                moveToSlot(slot);
                              }}
                              style={{ gridArea: area }}
                            >
                              {item ? (
                                <button
                                  className={`${styles.itemDragButton} ${selectedItem?.kind === 'equipped' && selectedItem.slot === slot ? styles.itemSelected : ''}`}
                                  draggable
                                  onClick={() => setSelectedItem({ kind: 'equipped', slot })}
                                  onDragEnd={() => setDraggedItem(null)}
                                  onDragStart={() => startDrag({ kind: 'equipped', slot })}
                                  type="button"
                                >
                                  <em className={styles.itemState}>{label}</em>
                                  <div className={styles.itemGlyph}>{itemSigil(item.name)}</div>
                                  <div className={styles.itemMini}>{item.name}</div>
                                  <ItemTooltip item={item} status="equipped" />
                                </button>
                              ) : (
                                <button className={styles.itemEmptyButton} onClick={() => setSelectedItem(null)} type="button">
                                  <em className={styles.itemState}>{label}</em>
                                  <div className={styles.itemGlyph}>+</div>
                                  <div className={styles.itemMini}>Empty</div>
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  <div className={styles.characterInfo}>
                    <StatBar label="HP" value={characterState.hp} max={characterState.maxHp} tone="danger" />
                    <StatBar label="Resolve" value={characterState.resolve} max={100} tone="accent" />
                    <div className={styles.quickSummary}>
                      <SummaryTile label="Armor" value={String(characterState.armor)} tone="neutral" />
                      <SummaryTile label="Magic find" value={`${characterState.magicFind}%`} tone="future" />
                      <SummaryTile label="Latest drop" value={characterState.latestDrop.name} tone="good" />
                      <SummaryTile label="Source" value={characterState.latestDrop.source} tone="warn" />
                    </div>
                    {selectedLoot ? (
                      <div className={`${styles.selectedCard} ${styles[`rarity${capitalize(selectedLoot.rarity)}`]}`}>
                        <div className={styles.selectedTop}>
                          <span>{selectedItem ? itemStatus(selectedLoot, selectedItem) : 'item'}</span>
                          <strong>{selectedLoot.rarity}</strong>
                        </div>
                        <h4>{selectedLoot.name}</h4>
                        <p>{selectedLoot.statLine}</p>
                        <div className={styles.selectedMeta}>
                          <span>slot: {paperDollLabel(selectedLoot.slot)}</span>
                          <span>source: {selectedLoot.source}</span>
                        </div>
                        <small>{selectedLoot.flavor}</small>
                        <div className={styles.selectedActions}>
                          <button className="btn-base btn-secondary" onClick={handleSelectedPrimaryAction} type="button">
                            {selectedItem?.kind === 'stash' ? `Equip to ${paperDollLabel(selectedLoot.slot)}` : 'Move to stash'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className={styles.selectedCard}>
                        <h4>Select an item</h4>
                        <p>Click or drag an item to inspect it. Equipped pieces stay on the paper doll. Everything else lives in stash.</p>
                      </div>
                    )}
                    <div className={styles.warningList}>
                      {characterState.warnings.length ? (
                        characterState.warnings.map((warning) => <div className={styles.warningChip} key={warning}>{warning}</div>)
                      ) : (
                        <div className={styles.warningChip}>No current penalties. HP is stable.</div>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
            </section>
          </div> : null}
        </section>

        <section id="settings" className={styles.appSection}>
          <div className={styles.sectionHead}>
            <div>
              <div className={styles.sectionEyebrow}>setup</div>
              <h2 className={styles.sectionTitle}>Setup</h2>
            </div>
            <div className={styles.sectionHeadActions}>
              <div className={styles.sectionMeta}>flexible, not hardcoded to 100 days</div>
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
              <span>Weight, age, height, activity and kcal target tuning.</span>
            </button>
            <button
              className={`${styles.composerButton} ${activeChallenge ? styles.composerButtonDone : ''} ${setupComposer === 'challenge' ? styles.composerButtonActive : ''}`}
              onClick={() => setSetupComposer((current) => (current === 'challenge' ? null : 'challenge'))}
              type="button"
            >
              <strong>{activeChallenge ? 'Challenge active' : 'Challenge setup'}</strong>
              <span>{activeChallenge ? 'View or stop the current run.' : 'Create a new cut timeline.'}</span>
            </button>
            <button
              className={`${styles.composerButton} ${setupComposer === 'reminders' ? styles.composerButtonActive : ''}`}
              onClick={() => setSetupComposer((current) => (current === 'reminders' ? null : 'reminders'))}
              type="button"
            >
              <strong>Reminders</strong>
              <span>Push reminders and time slots for check-ins.</span>
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
                  <input className={styles.featureInput} inputMode="decimal" value={setup.initial_weight_kg} onChange={(event) => setSetup((current) => ({ ...current, initial_weight_kg: event.target.value }))} placeholder="e.g. 89.8" />
                </label>
                <label className={styles.field}>
                  <span>Age</span>
                  <input value={setup.age} onChange={(event) => setSetup((current) => ({ ...current, age: event.target.value }))} inputMode="numeric" />
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
                  <input value={setup.height_cm} onChange={(event) => setSetup((current) => ({ ...current, height_cm: event.target.value }))} inputMode="decimal" />
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
                    <input value={setup.protein_target_per_kg} onChange={(event) => setSetup((current) => ({ ...current, protein_target_per_kg: event.target.value }))} inputMode="decimal" />
                  </label>
                  <label className={styles.field}>
                    <span>Fat min / kg</span>
                    <input value={setup.fat_min_per_kg} onChange={(event) => setSetup((current) => ({ ...current, fat_min_per_kg: event.target.value }))} inputMode="decimal" />
                  </label>
                  <label className={styles.field}>
                    <span>Meals / day</span>
                    <input value={setup.meals_per_day} onChange={(event) => setSetup((current) => ({ ...current, meals_per_day: event.target.value }))} inputMode="numeric" />
                  </label>
                  <label className={styles.field}>
                    <span>Training delta kcal</span>
                    <input value={setup.training_day_kcal_delta} onChange={(event) => setSetup((current) => ({ ...current, training_day_kcal_delta: event.target.value }))} inputMode="numeric" />
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
              <p className={styles.panelText}>Start launches a new run from today. Save only updates the draft in this form.</p>
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
                  <input value={challenge.target_weight_kg} onChange={(event) => setChallenge((current) => ({ ...current, target_weight_kg: event.target.value }))} placeholder="optional" />
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
                  Fill 100-day draft
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
            </section> : null}

            {setupComposer === 'reminders' ? <section className={`surface-card ${styles.panel}`}>
              <h3 className={styles.panelTitle}>Reminders + push</h3>
              <div className={styles.reminderList}>
                {reminders.map((item) => (
                  <div className={styles.reminderRow} key={item.kind}>
                    <div>
                      <strong>{item.title}</strong>
                      <p>{weekdaySummary(item.weekdays)}</p>
                    </div>
                    <div className={styles.reminderControls}>
                      <input type="time" value={item.local_time} onChange={(event) => setReminders((current) => current.map((entry) => entry.kind === item.kind ? { ...entry, local_time: event.target.value } : entry))} />
                      <label className={styles.toggle}>
                        <input checked={item.enabled} type="checkbox" onChange={(event) => setReminders((current) => current.map((entry) => entry.kind === item.kind ? { ...entry, enabled: event.target.checked } : entry))} />
                        <span>{item.enabled ? 'On' : 'Off'}</span>
                      </label>
                    </div>
                  </div>
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
      </div>
    </PageShell>
  );
}

function MetricBox({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <div className={styles.metricBox}>
      <div className={styles.metricLabel}>{label}</div>
      <div className={styles.metricValue}>{value}</div>
      <div className={styles.metricHelper}>{helper}</div>
    </div>
  );
}

function StatBar({
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
    <div className={styles.statBarWrap}>
      <div className={styles.statBarTop}>
        <span>{label}</span>
        <strong>{value}/{max}</strong>
      </div>
      <div className={styles.statBar}>
        <span className={tone === 'danger' ? styles.statBarDanger : styles.statBarAccent} style={{ width }} />
      </div>
    </div>
  );
}

function capitalize(value: string) {
  return `${value[0]?.toUpperCase() ?? ''}${value.slice(1)}`;
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
