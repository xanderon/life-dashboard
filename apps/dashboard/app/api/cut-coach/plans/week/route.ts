import { getWeekSnapshot, todayIsoDate } from '@/lib/cutCoach';
import { withCutCoachUser } from '@/lib/cutCoachRoute';

export async function GET() {
  return withCutCoachUser(async ({ userId, supabase }) => ({
    days: await getWeekSnapshot(supabase, userId, todayIsoDate()),
  }));
}
