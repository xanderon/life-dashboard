import { getRecentFoods } from '@/lib/cutCoach';
import { withCutCoachUser } from '@/lib/cutCoachRoute';

export async function GET() {
  return withCutCoachUser(async ({ userId, supabase }) => ({
    foods: await getRecentFoods(supabase, userId, 20),
  }));
}
