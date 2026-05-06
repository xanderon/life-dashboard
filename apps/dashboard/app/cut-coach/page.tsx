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
const WEEKDAY_LABELS = ['D', 'L', 'Ma', 'Mi', 'J', 'V', 'S'];
const PACE_PRESETS = [
  { label: 'Lejer', value: '12', description: 'Mai ușor de ținut' },
  { label: 'Standard', value: '18', description: 'Ritm bun pentru cut' },
  { label: 'Strict', value: '24', description: 'Mai greu de ținut' },
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
    { kind: 'weigh_in', title: 'Cântărire', local_time: '08:15', weekdays: [1, 2, 3, 4, 5, 6, 0], enabled: true },
    { kind: 'kcal_log', title: 'Ai pus kcal?', local_time: '20:45', weekdays: [1, 2, 3, 4, 5, 6, 0], enabled: true },
    { kind: 'weekend_measure', title: 'Nu uita să te măsori', local_time: '11:00', weekdays: [6, 0], enabled: true },
    { kind: 'over_target_recovery', title: 'Recuperează după depășire', local_time: '09:30', weekdays: [1, 2, 3, 4, 5, 6, 0], enabled: true },
  ];
}

function reminderTitle(kind: CutCoachReminderRow['kind']) {
  switch (kind) {
    case 'weigh_in':
      return 'Cântărire';
    case 'kcal_log':
      return 'Log kcal';
    case 'weekend_measure':
      return 'Măsurători weekend';
    case 'over_target_recovery':
      return 'Recovery prompt';
    case 'milestone':
      return 'Milestone';
    default:
      return 'Reminder';
  }
}

function formatDate(isoDate: string, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('ro-RO', {
    day: 'numeric',
    month: 'short',
    ...options,
  }).format(new Date(`${isoDate}T12:00:00`));
}

function formatFullDate(isoDate: string) {
  return new Intl.DateTimeFormat('ro-RO', {
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
      now: 'Setup profile',
      next: 'Adaugă kg + profil și pornești flow-ul',
    };
  }

  if (logged == null) {
    return {
      now: `${target} kcal target azi`,
      next: 'La final de zi pui kcal totale și gata',
    };
  }

  if (gap == null) {
    return {
      now: `${logged} kcal logate`,
      next: 'Mai completezi restul și clarifici ziua',
    };
  }

  if (gap <= 50) {
    return {
      now: `${logged} / ${target} kcal`,
      next: challengeStats.currentDay > 0 ? `Day ${challengeStats.currentDay}: ești pe bine` : 'Ești pe bine azi',
    };
  }

  if (gap <= 180) {
    return {
      now: `+${gap} kcal peste azi`,
      next: 'Mâine revii simplu la target, fără panic mode',
    };
  }

  return {
    now: `+${gap} kcal peste target`,
    next: 'Taie lejer din următoarele 1-2 zile și rămâi în flow',
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
      body: kcalDays >= 1 ? 'Ai pornit tracking-ul de kcal.' : 'Loghează primul total de kcal.',
    },
    {
      title: 'Three logs',
      unlocked: kcalDays >= 3,
      body: kcalDays >= 3 ? `${kcalDays} zile cu kcal logate.` : 'Ține 3 zile cu kcal logate.',
    },
    {
      title: 'Week recorder',
      unlocked: kcalDays >= 7,
      body: kcalDays >= 7 ? 'Ai trecut de prima săptămână de tracking.' : 'Ajungi la 7 zile cu kcal logate.',
    },
    {
      title: 'Two-week lock',
      unlocked: kcalDays >= 14,
      body: kcalDays >= 14 ? 'Ai prins deja ritmul de 2 săptămâni.' : 'Țintește 14 zile cu check-in complet.',
    },
    {
      title: 'Thirty day ledger',
      unlocked: kcalDays >= 30,
      body: kcalDays >= 30 ? 'Ai o lună de date utile.' : 'Strânge 30 de zile de kcal logate.',
    },
    {
      title: 'Hot streak',
      unlocked: kcalStreak >= 3,
      body: kcalStreak >= 3 ? `Ai ${kcalStreak} zile consecutive de log.` : 'Leagă 3 zile consecutive de kcal log.',
    },
    {
      title: 'Seven-day streak',
      unlocked: kcalStreak >= 7,
      body: kcalStreak >= 7 ? 'O săptămână întreagă fără pauză.' : 'Leagă 7 zile consecutive de kcal log.',
    },
    {
      title: 'Streak architect',
      unlocked: longestKcalStreak >= 14,
      body: longestKcalStreak >= 14 ? `Cel mai bun streak: ${longestKcalStreak} zile.` : 'Construiește un streak maxim de 14 zile.',
    },
    {
      title: 'Scale online',
      unlocked: weighDays >= 1,
      body: weighDays >= 1 ? 'Ai prima cântărire în istoric.' : 'Pune prima greutate ca baseline.',
    },
    {
      title: 'Scale routine',
      unlocked: weighDays >= 3,
      body: weighDays >= 3 ? `${weighDays} cântăriri salvate.` : 'Ajungi la 3 cântăriri salvate.',
    },
    {
      title: 'Morning gravity',
      unlocked: weighStreak >= 3,
      body: weighStreak >= 3 ? `${weighStreak} zile consecutive de cântărire.` : 'Cântărește-te 3 dimineți la rând.',
    },
    {
      title: 'Trend visible',
      unlocked: longestWeighStreak >= 7,
      body: longestWeighStreak >= 7 ? 'Acum trendul începe să aibă sens.' : 'Leagă 7 zile de cântărire pentru trend clar.',
    },
    {
      title: 'Weekend tape',
      unlocked: measurementCount >= 1,
      body: measurementCount >= 1 ? `Ai ${measurementCount} sesiuni de măsurători.` : 'Salvează măsurătorile standard în weekend.',
    },
    {
      title: 'Tape habit',
      unlocked: measurementCount >= 2,
      body: measurementCount >= 2 ? 'Ai deja două weekenduri măsurate.' : 'Pune măsurători în 2 weekenduri diferite.',
    },
    {
      title: 'Body map',
      unlocked: measurementCount >= 4,
      body: measurementCount >= 4 ? 'Ai destule măsurători ca să vezi formă, nu doar kg.' : 'Strânge 4 sesiuni de measurements.',
    },
    {
      title: 'Movement day',
      unlocked: movementCount >= 1,
      body: movementCount >= 1 ? `${movementCount} zile au și mișcare.` : 'Adaugă o zi cu pași, mers sau bicicletă.',
    },
    {
      title: 'Walk engine',
      unlocked: movementCount >= 3,
      body: movementCount >= 3 ? 'Mișcarea începe să devină obicei.' : 'Ajungi la 3 zile cu mișcare utilă.',
    },
    {
      title: 'Green week',
      unlocked: weekGreen >= 3,
      body: weekGreen >= 3 ? `${weekGreen} zile din flow sunt în verde.` : 'Țintește 3 zile verzi în săptămâna curentă.',
    },
    {
      title: 'Five clean days',
      unlocked: weekGreen >= 5,
      body: weekGreen >= 5 ? 'Săptămână foarte solidă.' : 'Țintește 5 zile la target în aceeași săptămână.',
    },
    {
      title: 'Full week visible',
      unlocked: weekLogs >= 7,
      body: weekLogs >= 7 ? 'Ai toată săptămâna completă în sistem.' : 'Completează toate cele 7 zile din week flow.',
    },
    {
      title: 'Sub-2000 day',
      unlocked: hitSub2000,
      body: hitSub2000 ? 'Ai atins deja o zi sub 2000 kcal.' : 'Prinde o zi curată sub 2000 kcal.',
    },
    {
      title: 'Challenge armed',
      unlocked: Boolean(activeChallenge),
      body: activeChallenge ? `${activeChallenge.title} este activ.` : 'Salvează o perioadă activă de challenge.',
    },
    {
      title: 'Quarter mark',
      unlocked: challengeStats.progress >= 0.25,
      body: challengeStats.progress >= 0.25 ? 'Ai trecut de primul sfert din challenge.' : 'Ajungi la 25% din perioada activă.',
    },
    {
      title: 'Halfway',
      unlocked: challengeStats.progress >= 0.5,
      body: challengeStats.progress >= 0.5 ? 'Ai trecut de jumătatea challenge-ului.' : 'Ajungi la 50% din challenge.',
    },
    {
      title: 'Closing phase',
      unlocked: challengeStats.progress >= 0.75,
      body: challengeStats.progress >= 0.75 ? 'Ești în ultimele 25% din challenge.' : 'Ajungi în partea finală a challenge-ului.',
    },
    {
      title: 'Weight moved',
      unlocked: challengeStats.deltaWeight != null && challengeStats.deltaWeight < -1,
      body:
        challengeStats.deltaWeight != null && challengeStats.deltaWeight < -1
          ? `${Math.abs(challengeStats.deltaWeight).toFixed(1)} kg jos față de start.`
          : 'Scade cel puțin 1 kg față de startul challenge-ului.',
    },
    {
      title: 'Three kilos down',
      unlocked: challengeStats.deltaWeight != null && challengeStats.deltaWeight <= -3,
      body:
        challengeStats.deltaWeight != null && challengeStats.deltaWeight <= -3
          ? `Ai coborât ${Math.abs(challengeStats.deltaWeight).toFixed(1)} kg.`
          : 'Țintește -3 kg față de startul challenge-ului.',
    },
    {
      title: 'Goal touch',
      unlocked: Boolean(challengeGoalHit),
      body: challengeGoalHit ? 'Ai atins target weight-ul setat.' : 'Atinge greutatea target din challenge.',
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
          ? 'Ai demonstrat că poți reveni după o depășire.'
          : 'După o zi grea, revino cu 2 zile bune în aceeași săptămână.',
    },
  ].sort((left, right) => {
    if (left.unlocked === right.unlocked) {
      return left.title.localeCompare(right.title);
    }
    return left.unlocked ? -1 : 1;
  });
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

function buildSetupPreview(setup: SetupState) {
  const weightKg = toNumber(setup.initial_weight_kg);
  const heightCm = toNumber(setup.height_cm);
  const age = toNumber(setup.age);
  if (weightKg <= 0 || heightCm <= 0 || age <= 0) return null;

  const profile: CutCoachProfileRow = {
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
  };

  const maintenance = computeMaintenanceCalories(profile, weightKg);
  const safeMinimum = computeSafeMinimumCalories(profile, weightKg);
  const base = Math.max(safeMinimum, computeBaseTargetCalories(profile, weightKg));
  const trainingCount = profile.training_days.length;
  const restCount = 7 - trainingCount;
  const restDelta = trainingCount > 0 && restCount > 0 ? (trainingCount * profile.training_day_kcal_delta) / restCount : 0;
  const trainingTarget = Math.max(safeMinimum, base + profile.training_day_kcal_delta);
  const restTarget = Math.max(safeMinimum, base - restDelta);

  return {
    maintenance: Math.round(maintenance),
    baseTarget: Math.round(base),
    trainingTarget: Math.round(trainingTarget),
    restTarget: Math.round(restTarget),
  };
}

function paceChipText(maintenance: number | null, percentValue: string) {
  if (!maintenance) return null;
  const percent = toNumber(percentValue);
  const deficit = Math.round((maintenance * percent) / 100);
  const target = Math.round(maintenance - deficit);
  return {
    deficit,
    target,
  };
}

function buildReward(url: string): RewardToast {
  const id = Date.now();
  if (url.includes('/checkins')) {
    return { id, title: 'Daily log saved', body: 'XP +12 pentru consistență și claritate pe kcal.', xp: 12 };
  }
  if (url.includes('/weights')) {
    return { id, title: 'Scale sync', body: 'XP +14 pentru greutate și measurements.', xp: 14 };
  }
  if (url.includes('/profile')) {
    return { id, title: 'Metabolism tuned', body: 'XP +20. Flow-ul de kcal are acum o bază mai solidă.', xp: 20 };
  }
  if (url.includes('/challenges')) {
    return { id, title: 'Challenge locked', body: 'XP +16. Perioada ta are acum structură clară.', xp: 16 };
  }
  return { id, title: 'Settings saved', body: 'XP +8. Sistemul tău e mai bine calibrat.', xp: 8 };
}

function applyNoGymPreset() {
  return {
    activity_level: 'sedentary',
    preferred_deficit_pct: '12',
    training_day_kcal_delta: '0',
    training_days: [] as number[],
  };
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
  const pushEnvironment = useSyncExternalStore(
    subscribeNoop,
    getPushEnvironmentSnapshot,
    () => DEFAULT_PUSH_ENVIRONMENT
  );
  const pushSupported = pushEnvironment.supported;
  const setupPreview = buildSetupPreview(setup);

  function applyBootstrap(payload: BootstrapPayload) {
    setData(payload);
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
      setError(payload.error ?? 'Nu am putut încărca cut coach.');
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
          setError(payload.error ?? 'Nu am putut încărca cut coach.');
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

  async function persistProfile(nextSetup: SetupState, successMessage = 'Profilul a fost salvat.') {
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
    await persistProfile(setup);
  }

  async function saveCheckin(copiedFromPrevious = false) {
    await postJson(
      '/api/cut-coach/checkins',
      {
        ...checkin,
        copied_from_previous: copiedFromPrevious,
      },
      'Check-in-ul de azi a fost salvat.'
    );
  }

  async function saveWeight() {
    await postJson('/api/cut-coach/weights', weight, 'Greutatea și măsurătorile au fost salvate.');
  }

  async function saveChallenge() {
    await postJson('/api/cut-coach/challenges', challenge, 'Programul a fost salvat.');
  }

  async function startQuick100Challenge() {
    const nextChallenge = {
      ...challengeDraft(todayIsoDate),
      start_date: todayIsoDate,
      title: '100 day cut',
      status: 'active' as const,
    };
    setChallenge(nextChallenge);
    await postJson('/api/cut-coach/challenges', nextChallenge, 'Challenge-ul de 100 de zile a pornit.');
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
    await postJson('/api/cut-coach/reminders', { reminders }, 'Reminder-ele au fost salvate.');
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
      setNotice('Nu există încă un check-in ieri.');
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
    setNotice('Am copiat check-in-ul de ieri.');
  }

  function copyLastMeasurements() {
    if (!data) return;
    const latestWithTape = data.weights.find(
      (item) => item.waist_cm || item.hips_cm || item.chest_cm || item.thigh_cm || item.arm_cm || item.neck_cm
    );
    if (!latestWithTape) {
      setNotice('Nu există încă măsurători anterioare.');
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
    setNotice('Am copiat ultima sesiune de măsurători.');
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
        setPushError('Notificările sunt blocate în browser.');
        setPushBusy(false);
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setPushError('Permisiunea pentru notificări nu a fost acordată.');
        setPushBusy(false);
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        if (!VAPID_PUBLIC_KEY) {
          setPushError('Lipsește cheia publică VAPID.');
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
        setPushError('Nu am putut salva abonarea.');
        setPushBusy(false);
        return;
      }

      setPushEnabled(true);
      setNotice('Push-ul pentru cut coach este activ.');
      setPushBusy(false);
    } catch {
      setPushError('Nu am putut activa notificările.');
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

  return (
    <PageShell width="7xl" className={styles.shell}>
      <div className={styles.page}>
        <section className={styles.topbar}>
          <BackLink href="/">← Înapoi la dashboard</BackLink>
          <ThemeToggle />
        </section>

        <section className={`hero-card ${styles.hero}`}>
          <div className={styles.heroIntro}>
            <div className="eyebrow">Cut Coach</div>
            <div className={styles.heroMeta}>
              <span>{activeChallenge ? activeChallenge.title : 'Program nou'}</span>
              <span>{activeChallenge ? `${formatDate(activeChallenge.start_date)} → ${formatDate(activeChallenge.end_date)}` : 'Poți porni de mâine'}</span>
            </div>
          </div>

          <div className={styles.heroHeader}>
            <div>
              <h1 className={styles.heroTitle}>Deficit flow, fără fricțiune.</h1>
              <p className={styles.heroText}>
                Focus pe `kg`, `kcal`, trend, reminders și week flow. Food-by-food rămâne opțional. Pentru start, ziua 1 poate fi{' '}
                <strong>6 mai 2026</strong>.
              </p>
            </div>
            <div className={styles.heroActions}>
              <a className="btn-base btn-primary" href="#today">
                Log azi
              </a>
              <a className="btn-base btn-secondary" href="#flow">
                Vezi flow
              </a>
              <a className="btn-base btn-ghost" href="#settings">
                Setup
              </a>
            </div>
          </div>

          <div className={styles.heroStats}>
            <MetricBox label="Challenge day" value={challengeStats.currentDay > 0 ? `${challengeStats.currentDay}/${challengeStats.totalDays}` : 'Pregătire'} helper={activeChallenge ? phaseLabel(challengeStats.progress) : 'Creează primul interval'} />
            <MetricBox label="Plan activ azi" value={today?.target ? `${Math.round(today.target.kcal_target)} kcal` : 'Setup'} helper={today?.target ? humanizeAdjustmentReason(today.target.adjustment_reason, 'today') : 'Pornește profilul'} />
            <MetricBox label="Greutate" value={data?.trends.latest ? `${data.trends.latest.weight_kg} kg` : '—'} helper={challengeStats.deltaWeight != null ? `${challengeStats.deltaWeight > 0 ? '+' : ''}${challengeStats.deltaWeight} kg vs start` : 'Așteaptă baseline'} />
            <MetricBox label="XP / level" value={`${xp.xp} XP`} helper={`Level ${xp.level}`} />
          </div>

          {overToday != null ? (
            <div className={`${styles.alert} ${overToday > 150 ? styles.alertBad : overToday > 0 ? styles.alertWarn : styles.alertGood}`}>
              {overToday > 150
                ? `Ai depășit azi cu ${overToday} kcal. Mâine ține-te de target și taie lejer următoarele 2-3 zile, nu agresiv dintr-o bucată.`
                : overToday > 0
                  ? `Ești puțin peste target azi (+${overToday} kcal). Păstrează controlul mâine și revii rapid pe trend.`
                  : `Azi ești pe bine. ${today?.remaining ? `${Math.max(0, Math.round(today.remaining.calories))} kcal rămase.` : ''}`}
            </div>
          ) : null}
        </section>

        <section className={styles.topFocusGrid}>
          <section className={`surface-card ${styles.panel}`}>
            <div className={styles.focusKicker}>Daily focus</div>
            <div className={styles.focusNow}>{topFocus.now}</div>
            <div className={styles.focusNext}>{topFocus.next}</div>
            <div className={styles.quickSummary}>
              <SummaryTile label="Kg curent" value={data?.trends.latest ? `${data.trends.latest.weight_kg} kg` : '—'} tone="neutral" />
              <SummaryTile label="Ținta azi" value={today?.target ? `${Math.round(today.target.kcal_target)} kcal` : '—'} tone="good" />
              <SummaryTile label="Mâine" value={tomorrow?.target ? `${Math.round(tomorrow.target.kcal_target)} kcal` : '—'} tone="future" />
              <SummaryTile label="Day" value={challengeStats.currentDay > 0 ? `${challengeStats.currentDay}/${challengeStats.totalDays}` : '—'} tone="warn" />
            </div>
          </section>

          <section className={`surface-card ${styles.panel}`}>
            <div className={styles.chartHead}>
              <div>
                <div className={styles.focusKicker}>Weight trend</div>
                <div className={styles.chartTitle}>Istoric kg</div>
              </div>
              <div className={styles.chartMeta}>
                {data?.trends.delta7 != null ? `${data.trends.delta7 > 0 ? '-' : '+'}${Math.abs(data.trends.delta7)} kg / 7 zile` : 'Așteaptă mai multe date'}
              </div>
            </div>
            <div className={styles.chartBox}>
              {weightChartData.length > 1 ? (
                <ResponsiveContainer width="100%" height={220}>
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
                <div className={styles.chartEmpty}>Pune cel puțin 2 cântăriri și apare graficul.</div>
              )}
            </div>
          </section>
        </section>

        {error ? <section className={`surface-card ${styles.banner} ${styles.bannerError}`}>{error}</section> : null}
        {error ? (
          <section className={`surface-card ${styles.banner} ${styles.bannerHint}`}>
            <strong>Debug tip</strong>
            <p>
              Dacă vezi `unexpected error` sau `500`, cel mai probabil ori lipsește ultimul SQL din `cut_coach.sql`, ori serverul a pornit cu un timezone prost din env și trebuie refresh după fix.
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
              <div className={styles.sectionEyebrow}>1 click zone</div>
              <h2 className={styles.sectionTitle}>Today cockpit</h2>
            </div>
            <div className={styles.sectionHeadActions}>
              <div className={styles.sectionMeta}>{formatFullDate(checkin.date)}</div>
              <button className={styles.sectionToggle} onClick={() => toggleSection('today')} type="button">
                {collapsedSections.today ? 'Expand' : 'Collapse'}
              </button>
            </div>
          </div>

          {!collapsedSections.today ? <div className={styles.todayGrid}>
            <section className={`surface-card ${styles.panel}`}>
              <div className={styles.panelHead}>
                <div>
                  <h3 className={styles.panelTitle}>Kcal check-in</h3>
                  <p className={styles.panelText}>Bagi totalul din LifeSum și, dacă ai avut activitate, pui direct kcal arse din app.</p>
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
                  <span>Zi</span>
                  <input type="date" value={checkin.date} onChange={(event) => {
                    const nextDate = event.target.value;
                    setCheckin(fillCheckin(nextDate, data));
                    setWeight(fillWeight(nextDate, data));
                  }} />
                </label>
                <label className={styles.field}>
                  <span>Kcal totale</span>
                  <input className={styles.featureInput} type="number" inputMode="numeric" value={checkin.kcal_actual} onChange={(event) => setCheckin((current) => ({ ...current, kcal_actual: event.target.value }))} placeholder="ex. 2140" />
                </label>
                <label className={styles.field}>
                  <span>Activitate făcută</span>
                  <input value={checkin.activity_summary} onChange={(event) => setCheckin((current) => ({ ...current, activity_summary: event.target.value }))} placeholder="ex. walk 45m / bike / sală / nimic" />
                </label>
                <label className={styles.field}>
                  <span>Kcal arse din app</span>
                  <input className={styles.featureInput} type="number" inputMode="numeric" value={checkin.activity_kcal_burned} onChange={(event) => setCheckin((current) => ({ ...current, activity_kcal_burned: event.target.value }))} placeholder="ex. 320" />
                </label>
                <label className={styles.field}>
                  <span>Sursă</span>
                  <input value={checkin.source_app} onChange={(event) => setCheckin((current) => ({ ...current, source_app: event.target.value }))} placeholder="LifeSum" />
                </label>
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
                <span>Notițe</span>
                <textarea rows={3} value={checkin.notes} onChange={(event) => setCheckin((current) => ({ ...current, notes: event.target.value }))} placeholder="orice context util" />
              </label>

              <div className={styles.quickSummary}>
                <SummaryTile label="Target" value={selectedDay?.target ? `${Math.round(selectedDay.target.kcal_target)} kcal` : '—'} tone="neutral" />
                <SummaryTile label="Logged" value={selectedDay && selectedDay.caloriesSource !== 'none' ? `${Math.round(selectedDay.consumed.calories)} kcal` : 'Necompletat'} tone={selectedDay?.target && selectedDay.caloriesSource !== 'none' && selectedDay.consumed.calories <= selectedDay.target.kcal_target + 50 ? 'good' : 'warn'} />
                <SummaryTile label="Activity burn" value={burnedKcal > 0 ? `${Math.round(burnedKcal)} kcal` : '0 kcal'} tone="future" />
                <SummaryTile label="Net today" value={toNumber(checkin.kcal_actual) > 0 ? `${Math.round(netKcal)} kcal` : '—'} tone="good" />
                <SummaryTile label="Remaining" value={selectedDay?.remaining ? `${Math.round(selectedDay.remaining.calories)} kcal` : '—'} tone={selectedDay?.remaining && selectedDay.remaining.calories >= 0 ? 'good' : 'bad'} />
                <SummaryTile label="Tomorrow" value={tomorrow?.target ? `${Math.round(tomorrow.target.kcal_target)} kcal` : '—'} tone="future" />
              </div>

              <button className="btn-base btn-primary" disabled={busy !== null} onClick={() => void saveCheckin()} type="button">
                {busy === '/api/cut-coach/checkins' ? 'Se salvează…' : 'Save kcal check-in'}
              </button>
            </section>

            <section className={`surface-card ${styles.panel}`}>
              <div className={styles.panelHead}>
                <div>
                  <h3 className={styles.panelTitle}>Weight + tape</h3>
                  <p className={styles.panelText}>Greutate zilnic, dimensiuni mai ales în weekend.</p>
                </div>
                <button className="btn-base btn-ghost" type="button" onClick={copyLastMeasurements}>
                  Copy last measurements
                </button>
              </div>

              <div className={styles.formGrid}>
                <label className={styles.field}>
                  <span>Zi</span>
                  <input type="date" value={weight.date} onChange={(event) => {
                    const nextDate = event.target.value;
                    setWeight(fillWeight(nextDate, data));
                    setCheckin(fillCheckin(nextDate, data));
                  }} />
                </label>
                <label className={styles.field}>
                  <span>Greutate kg</span>
                  <input type="number" step="0.1" inputMode="decimal" value={weight.weight_kg} onChange={(event) => setWeight((current) => ({ ...current, weight_kg: event.target.value }))} placeholder="ex. 89.6" />
                </label>
                <label className={styles.field}>
                  <span>Talie</span>
                  <input type="number" step="0.1" inputMode="decimal" value={weight.waist_cm} onChange={(event) => setWeight((current) => ({ ...current, waist_cm: event.target.value }))} placeholder="cm" />
                </label>
                <label className={styles.field}>
                  <span>Șold</span>
                  <input type="number" step="0.1" inputMode="decimal" value={weight.hips_cm} onChange={(event) => setWeight((current) => ({ ...current, hips_cm: event.target.value }))} placeholder="cm" />
                </label>
                <label className={styles.field}>
                  <span>Piept</span>
                  <input type="number" step="0.1" inputMode="decimal" value={weight.chest_cm} onChange={(event) => setWeight((current) => ({ ...current, chest_cm: event.target.value }))} placeholder="cm" />
                </label>
                <label className={styles.field}>
                  <span>Coapsă</span>
                  <input type="number" step="0.1" inputMode="decimal" value={weight.thigh_cm} onChange={(event) => setWeight((current) => ({ ...current, thigh_cm: event.target.value }))} placeholder="cm" />
                </label>
                <label className={styles.field}>
                  <span>Braț</span>
                  <input type="number" step="0.1" inputMode="decimal" value={weight.arm_cm} onChange={(event) => setWeight((current) => ({ ...current, arm_cm: event.target.value }))} placeholder="cm" />
                </label>
                <label className={styles.field}>
                  <span>Gât</span>
                  <input type="number" step="0.1" inputMode="decimal" value={weight.neck_cm} onChange={(event) => setWeight((current) => ({ ...current, neck_cm: event.target.value }))} placeholder="cm" />
                </label>
              </div>

              <label className={`${styles.field} ${styles.fieldFull}`}>
                <span>Notițe</span>
                <textarea rows={3} value={weight.notes} onChange={(event) => setWeight((current) => ({ ...current, notes: event.target.value }))} placeholder="ex. retenție, masă târzie, weekend" />
              </label>

              <div className={styles.quickSummary}>
                <SummaryTile label="Latest" value={data?.trends.latest ? `${data.trends.latest.weight_kg} kg` : '—'} tone="neutral" />
                <SummaryTile label="Avg 7" value={data?.trends.avg7 ? `${data.trends.avg7} kg` : '—'} tone="neutral" />
                <SummaryTile label="Delta 7" value={data?.trends.delta7 != null ? `${data.trends.delta7 > 0 ? '-' : '+'}${Math.abs(data.trends.delta7)} kg` : '—'} tone={data?.trends.delta7 != null && data.trends.delta7 > 0 ? 'good' : 'future'} />
                <SummaryTile label="Measurements" value={weight.waist_cm || weight.hips_cm || weight.chest_cm ? 'Weekend set' : 'Optional'} tone="future" />
              </div>

              <button className="btn-base btn-primary" disabled={busy !== null} onClick={() => void saveWeight()} type="button">
                {busy === '/api/cut-coach/weights' ? 'Se salvează…' : 'Save weight / measurements'}
              </button>
            </section>
          </div> : null}
        </section>

        <section id="flow" className={styles.appSection}>
          <div className={styles.sectionHead}>
            <div>
              <div className={styles.sectionEyebrow}>program</div>
              <h2 className={styles.sectionTitle}>Week flow</h2>
            </div>
            <div className={styles.sectionHeadActions}>
              <div className={styles.sectionMeta}>{activeChallenge ? `${phaseLabel(challengeStats.progress)} phase` : 'Pregătește intervalul'}</div>
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
                {today?.target ? `Azi ai ${Math.round(today.target.kcal_target)} kcal target.` : 'Mai întâi fă setup.'}{' '}
                {tomorrow?.target ? `Mâine te duci spre ${Math.round(tomorrow.target.kcal_target)} kcal.` : ''}
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
                  : 'Plannerul începe după ce ai profil + greutate.'}
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
              <div className={styles.sectionMeta}>verde bine / roșu rău</div>
              <button className={styles.sectionToggle} onClick={() => toggleSection('calendar')} type="button">
                {collapsedSections.calendar ? 'Expand' : 'Collapse'}
              </button>
            </div>
          </div>

          {!collapsedSections.calendar ? <div className={styles.calendarGrid}>
            <section className={`surface-card ${styles.panel}`}>
              <div className={styles.calendarHeader}>
                <h3 className={styles.panelTitle}>Luna curentă</h3>
                <span className={styles.panelText}>{new Intl.DateTimeFormat('ro-RO', { month: 'long', year: 'numeric' }).format(new Date(`${todayIsoDate}T12:00:00`))}</span>
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
                <li>Ziua principală = `kcal total` la final de zi.</li>
                <li>Greutate zilnică dimineața, același context.</li>
                <li>Talie + restul dimensiunilor în weekend.</li>
                <li>Mișcarea rămâne opțională, dar te ajută la context.</li>
              </ul>
            </section>
          </div> : null}
        </section>

        <section id="settings" className={styles.appSection}>
          <div className={styles.sectionHead}>
            <div>
              <div className={styles.sectionEyebrow}>setup</div>
              <h2 className={styles.sectionTitle}>Profile, reminders, challenge</h2>
            </div>
            <div className={styles.sectionHeadActions}>
              <div className={styles.sectionMeta}>flexibil, nu hardcodat pentru 100</div>
              <button className={styles.sectionToggle} onClick={() => toggleSection('settings')} type="button">
                {collapsedSections.settings ? 'Expand' : 'Collapse'}
              </button>
            </div>
          </div>

          {!collapsedSections.settings ? <div className={styles.settingsGrid}>
            <section className={`surface-card ${styles.panel}`}>
              <h3 className={styles.panelTitle}>Profile</h3>
              <p className={styles.panelText}>Basic first. Restul doar pentru fine tuning.</p>
              <p className={styles.previewNote}>
                Preseturile `No gym for now` și `Lejer / Standard / Strict` se aplică direct în planul activ. Când modifici manual restul câmpurilor, apeși `Save profile`.
              </p>
              <div className={styles.formGrid}>
                <label className={styles.field}>
                  <span>Initial kg</span>
                  <input className={styles.featureInput} inputMode="decimal" value={setup.initial_weight_kg} onChange={(event) => setSetup((current) => ({ ...current, initial_weight_kg: event.target.value }))} placeholder="ex. 89.8" />
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
                <label className={styles.field}>
                  <span>Deficit %</span>
                  <input value={setup.preferred_deficit_pct} onChange={(event) => setSetup((current) => ({ ...current, preferred_deficit_pct: event.target.value }))} inputMode="numeric" />
                </label>
              </div>

              <div className={styles.paceRow}>
                <button
                  className={styles.quickChip}
                  onClick={() => void applyProfilePreset(applyNoGymPreset(), 'Presetul fără sală a fost aplicat în plan.')}
                  type="button"
                >
                  No gym for now
                </button>
                {PACE_PRESETS.map((preset) => (
                  <button
                    className={`${styles.paceCard} ${setup.preferred_deficit_pct === preset.value ? styles.paceCardActive : ''}`}
                    key={preset.value}
                    onClick={() => void applyProfilePreset({ preferred_deficit_pct: preset.value }, `Ritmul ${preset.label.toLowerCase()} a fost aplicat în plan.`)}
                    type="button"
                  >
                    <strong>{preset.label}</strong>
                    <span>{preset.description}</span>
                    <small>
                      {paceChipText(setupPreview?.maintenance ?? null, preset.value)
                        ? `aprox ${paceChipText(setupPreview?.maintenance ?? null, preset.value)!.target} kcal/zi`
                        : `${preset.value}% deficit`}
                    </small>
                    <small>
                      {paceChipText(setupPreview?.maintenance ?? null, preset.value)
                        ? `~ -${paceChipText(setupPreview?.maintenance ?? null, preset.value)!.deficit} kcal din maintenance`
                        : ''}
                    </small>
                  </button>
                ))}
              </div>
              <p className={styles.previewNote}>
                Alege cât de mare să fie tăierea din `maintenance`. Nu e viteză abstractă, e pur și simplu cât de jos cobori kcal zilnic.
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
                    Dacă acum ești sedentar și fără sală, mă uit în primul rând la `Target daily` și `Rest day`. Acolo ar trebui să fii aproape de zona ta reală de slăbit.
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
                <div className={styles.dayPickerLabel}>Zile de sală</div>
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
                {busy === '/api/cut-coach/profile' ? 'Se salvează…' : 'Save profile'}
              </button>
            </section>

            <section className={`surface-card ${styles.panel}`}>
              <h3 className={styles.panelTitle}>Challenge</h3>
              <p className={styles.panelText}>
                `Start 100-day cut` pornește direct perioada de azi. `Save challenge` salvează doar datele care sunt acum în formular.
              </p>
              <div className={styles.formGrid}>
                <label className={styles.field}>
                  <span>Titlu</span>
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
                  <input value={challenge.target_weight_kg} onChange={(event) => setChallenge((current) => ({ ...current, target_weight_kg: event.target.value }))} placeholder="opțional" />
                </label>
              </div>
              <label className={`${styles.field} ${styles.fieldFull}`}>
                <span>Notițe</span>
                <textarea rows={3} value={challenge.notes} onChange={(event) => setChallenge((current) => ({ ...current, notes: event.target.value }))} />
              </label>
              <div className={styles.pillRow}>
                <button className="btn-base btn-secondary" type="button" onClick={() => void startQuick100Challenge()}>
                  Start 100-day cut
                </button>
                <button className="btn-base btn-ghost" type="button" onClick={() => setChallenge(challengeDraft(todayIsoDate))}>
                  Fill 100-day dates
                </button>
                <button className="btn-base btn-primary" disabled={busy !== null} onClick={() => void saveChallenge()} type="button">
                  {busy === '/api/cut-coach/challenges' ? 'Se salvează…' : 'Save challenge'}
                </button>
              </div>
              <div className={styles.challengeStatus}>
                {challenge.start_date ? `Start: ${formatFullDate(challenge.start_date)}` : 'Alege data de start'}
              </div>
            </section>

            <section className={`surface-card ${styles.panel}`}>
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
                  <strong>Push pe mobil</strong>
                  <p>
                    {pushSupported
                      ? pushEnabled
                        ? 'Notificările sunt active.'
                        : pushEnvironment.permission === 'denied'
                          ? 'Permisiunea e blocată în browser.'
                          : 'Activează push și le poți primi ca la termo-alert.'
                      : 'Browserul curent nu suportă push web.'}
                  </p>
                </div>
                {pushSupported ? (
                  <button className="btn-base btn-secondary" disabled={pushBusy || pushEnabled} onClick={() => void enableNotifications()} type="button">
                    {pushEnabled ? 'Activat' : pushBusy ? 'Se activează…' : 'Activează push'}
                  </button>
                ) : null}
              </div>

              {pushError ? <div className={styles.pushError}>{pushError}</div> : null}

              <button className="btn-base btn-primary" disabled={busy !== null} onClick={() => void saveReminders()} type="button">
                {busy === '/api/cut-coach/reminders' ? 'Se salvează…' : 'Save reminders'}
              </button>
            </section>
          </div> : null}
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
