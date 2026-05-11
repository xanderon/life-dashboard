import { getWeekSnapshot, todayIsoDate } from '@/lib/cutCoach';
import { withCutCoachUser } from '@/lib/cutCoachRoute';

export async function GET() {
  return withCutCoachUser(async ({ userId, supabase }) => ({
    week: await getWeekSnapshot(supabase, userId, todayIsoDate()),
  }));
}
