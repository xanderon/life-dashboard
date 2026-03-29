import { addDays, getDailySummary, todayIsoDate } from '@/lib/cutCoach';
import { withCutCoachUser } from '@/lib/cutCoachRoute';

export async function GET() {
  return withCutCoachUser(async ({ userId, supabase }) =>
    getDailySummary(supabase, userId, addDays(todayIsoDate(), 1))
  );
}
