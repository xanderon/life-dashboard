import { getFavoriteFoods } from '@/lib/cutCoach';
import { withCutCoachUser } from '@/lib/cutCoachRoute';

export async function GET() {
  return withCutCoachUser(async ({ userId, supabase }) => ({
    foods: await getFavoriteFoods(supabase, userId, 20),
  }));
}
