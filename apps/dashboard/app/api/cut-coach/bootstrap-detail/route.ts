import { getReminderSettings, getWeekSnapshot, todayIsoDate } from '@/lib/cutCoach';
import { withCutCoachUser } from '@/lib/cutCoachRoute';

export async function GET() {
  return withCutCoachUser(async ({ userId, supabase }) => {
    const [week, reminders] = await Promise.all([
      getWeekSnapshot(supabase, userId, todayIsoDate()),
      getReminderSettings(supabase, userId),
    ]);

    return { week, reminders };
  });
}
