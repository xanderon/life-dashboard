import { getDailySummary, todayIsoDate } from '@/lib/cutCoach';
import { withCutCoachUser } from '@/lib/cutCoachRoute';

export async function GET() {
  return withCutCoachUser(async ({ userId, supabase }) => ({
    summary: await getDailySummary(supabase, userId, todayIsoDate()),
  }));
}
