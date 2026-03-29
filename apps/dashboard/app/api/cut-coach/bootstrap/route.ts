import {
  getDailySummary,
  getFavoriteFoods,
  getFoods,
  getProfile,
  getRecentFoods,
  getWeights,
  getWeekSnapshot,
  recomputePlan,
  todayIsoDate,
  addDays,
  buildTrendSummary,
} from '@/lib/cutCoach';
import { withCutCoachUser } from '@/lib/cutCoachRoute';

export async function GET() {
  return withCutCoachUser(async ({ userId, supabase }) => {
    const profile = await getProfile(supabase, userId);
    if (profile) {
      await recomputePlan(supabase, userId, 'bootstrap-refresh');
    }

    const [today, tomorrow, week, weights, favorites, recentFoods, foods] = await Promise.all([
      getDailySummary(supabase, userId, todayIsoDate()),
      getDailySummary(supabase, userId, addDays(todayIsoDate(), 1)),
      getWeekSnapshot(supabase, userId, todayIsoDate()),
      getWeights(supabase, userId, 30),
      getFavoriteFoods(supabase, userId, 8),
      getRecentFoods(supabase, userId, 8),
      getFoods(supabase, userId),
    ]);

    return {
      profile,
      today,
      tomorrow,
      week,
      weights,
      trends: buildTrendSummary(weights),
      favorites,
      recentFoods,
      foods,
    };
  });
}
