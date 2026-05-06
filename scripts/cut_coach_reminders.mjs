import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_OWNER_ID = process.env.SUPABASE_OWNER_ID ?? null;

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY ?? null;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? null;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? null;

const CUT_COACH_TIMEZONE = process.env.CUT_COACH_TIMEZONE ?? 'Europe/Bucharest';
const APP_SLUG = process.env.CUT_COACH_APP_SLUG ?? 'cut-coach';
const PUSH_URL = process.env.CUT_COACH_PUSH_URL ?? '/cut-coach';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
}

if (!SUPABASE_OWNER_ID) {
  throw new Error('Missing SUPABASE_OWNER_ID.');
}

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) {
  throw new Error('Missing VAPID configuration.');
}

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function nowParts() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CUT_COACH_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  })
    .formatToParts(new Date())
    .reduce((acc, item) => {
      if (item.type !== 'literal') acc[item.type] = item.value;
      return acc;
    }, {});

  const weekdayMap = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return {
    isoDate: `${parts.year}-${parts.month}-${parts.day}`,
    hourMinute: `${parts.hour}:${parts.minute}`,
    weekday: weekdayMap[parts.weekday] ?? 0,
  };
}

function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isTimeDue(reminder, currentHourMinute) {
  return reminder.local_time === currentHourMinute;
}

function buildRecoveryText(extraKcal) {
  const trim = Math.min(150, Math.max(80, Math.round(extraKcal / 2)));
  return `Ieri ai fost cu +${Math.round(extraKcal)} kcal peste target. Ține targetul azi și taie lejer cam ${trim} kcal din următoarele 1-2 zile.`;
}

async function fetchSingle(table, columns, filters = []) {
  let query = supabase.from(table).select(columns);
  for (const filter of filters) {
    query = query[filter.op](filter.column, filter.value);
  }
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data ?? null;
}

async function sendPush(title, body) {
  const { data: subscriptions, error } = await supabase
    .from('push_subscriptions')
    .select('endpoint,p256dh,auth')
    .eq('owner_id', SUPABASE_OWNER_ID)
    .eq('app_slug', APP_SLUG)
    .eq('enabled', true);

  if (error) throw error;
  if (!subscriptions?.length) {
    return { sent: 0 };
  }

  const payload = JSON.stringify({
    title,
    body,
    url: PUSH_URL,
    tag: `cut-coach-${title}`,
  });

  let sent = 0;
  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
        },
        payload
      );
      sent += 1;
    } catch (error) {
      console.error('Push send failed:', error instanceof Error ? error.message : error);
    }
  }

  return { sent };
}

async function reminderBody(reminder, context) {
  if (reminder.kind === 'weigh_in') {
    const todayWeight = await fetchSingle('cut_coach_body_metrics', 'id', [
      { op: 'eq', column: 'user_id', value: SUPABASE_OWNER_ID },
      { op: 'eq', column: 'date', value: context.today },
    ]);
    return todayWeight ? null : 'Cântarul te așteaptă. Pune greutatea de azi înainte să înceapă ziua.';
  }

  if (reminder.kind === 'kcal_log') {
    const todayCheckin = await fetchSingle('cut_coach_daily_checkins', 'kcal_actual', [
      { op: 'eq', column: 'user_id', value: SUPABASE_OWNER_ID },
      { op: 'eq', column: 'date', value: context.today },
    ]);
    return todayCheckin?.kcal_actual != null ? null : 'Ai pus kcal pe azi? Dacă ai terminat cu LifeSum, bagă totalul și în cut coach.';
  }

  if (reminder.kind === 'weekend_measure') {
    if (![0, 6].includes(context.weekday)) return null;
    const todayMetrics = await fetchSingle('cut_coach_body_metrics', 'waist_cm,chest_cm,hips_cm', [
      { op: 'eq', column: 'user_id', value: SUPABASE_OWNER_ID },
      { op: 'eq', column: 'date', value: context.today },
    ]);
    return todayMetrics?.waist_cm != null || todayMetrics?.chest_cm != null || todayMetrics?.hips_cm != null
      ? null
      : 'Weekend check: pune talie + măsurătorile standard cât timp sunt proaspete.';
  }

  if (reminder.kind === 'over_target_recovery') {
    const yesterday = addDays(context.today, -1);
    const [checkin, target] = await Promise.all([
      fetchSingle('cut_coach_daily_checkins', 'kcal_actual', [
        { op: 'eq', column: 'user_id', value: SUPABASE_OWNER_ID },
        { op: 'eq', column: 'date', value: yesterday },
      ]),
      fetchSingle('cut_coach_daily_targets', 'kcal_target', [
        { op: 'eq', column: 'user_id', value: SUPABASE_OWNER_ID },
        { op: 'eq', column: 'date', value: yesterday },
      ]),
    ]);
    const extraKcal = (checkin?.kcal_actual ?? null) != null && target?.kcal_target != null
      ? Number(checkin.kcal_actual) - Number(target.kcal_target)
      : null;
    return extraKcal != null && extraKcal > 150 ? buildRecoveryText(extraKcal) : null;
  }

  return null;
}

async function main() {
  const context = {
    today: nowParts().isoDate,
    hourMinute: nowParts().hourMinute,
    weekday: nowParts().weekday,
  };

  const { data: reminders, error } = await supabase
    .from('cut_coach_reminders')
    .select('*')
    .eq('user_id', SUPABASE_OWNER_ID)
    .eq('enabled', true);

  if (error) throw error;

  const dueReminders = (reminders ?? []).filter((reminder) => {
    if (!reminder.weekdays?.includes(context.weekday)) return false;
    if (!isTimeDue(reminder, context.hourMinute)) return false;
    if (reminder.last_sent_at?.slice(0, 10) === context.today) return false;
    return true;
  });

  for (const reminder of dueReminders) {
    const body = await reminderBody(reminder, context);
    if (!body) continue;

    const title = reminder.title || 'Cut coach';
    const result = await sendPush(title, body);
    if (result.sent > 0) {
      const { error: updateError } = await supabase
        .from('cut_coach_reminders')
        .update({ last_sent_at: new Date().toISOString() })
        .eq('id', reminder.id);
      if (updateError) throw updateError;
    }
    console.log(`[cut-coach] ${title}: sent=${result.sent}`);
  }
}

await main();
