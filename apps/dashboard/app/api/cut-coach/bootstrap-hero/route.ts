import {
  addDays,
  buildTrendSummary,
  getCheckins,
  getChallenges,
  getDailySummary,
  ensureCurrentWeekPlan,
  getProfile,
  getWeights,
  todayIsoDate,
} from '@/lib/cutCoach';
import { withCutCoachUser } from '@/lib/cutCoachRoute';

export async function GET() {
  return withCutCoachUser(async ({ userId, supabase }) => {
    const profile = await getProfile(supabase, userId);
    await ensureCurrentWeekPlan(supabase, userId, profile);

    const [today, tomorrow, weights, checkins, challenges] = await Promise.all([
      getDailySummary(supabase, userId, todayIsoDate()),
      getDailySummary(supabase, userId, addDays(todayIsoDate(), 1)),
      getWeights(supabase, userId, 500),
      getCheckins(supabase, userId, 500),
      getChallenges(supabase, userId, 12),
    ]);

    return {
      todayIsoDate: todayIsoDate(),
      profile,
      today,
      tomorrow,
      week: [],
      weights,
      checkins,
      challenges,
      reminders: [],
      trends: buildTrendSummary(weights),
    };
  });
}
