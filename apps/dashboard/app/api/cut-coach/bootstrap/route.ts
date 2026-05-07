import {
  getDailySummary,
  getCheckins,
  getChallenges,
  getProfile,
  getReminderSettings,
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

    const [today, tomorrow, week, weights, checkins, challenges, reminders] =
      await Promise.all([
      getDailySummary(supabase, userId, todayIsoDate()),
      getDailySummary(supabase, userId, addDays(todayIsoDate(), 1)),
      getWeekSnapshot(supabase, userId, todayIsoDate()),
      getWeights(supabase, userId, 30),
      getCheckins(supabase, userId, 60),
      getChallenges(supabase, userId, 12),
      getReminderSettings(supabase, userId),
      ]);

    return {
      todayIsoDate: todayIsoDate(),
      profile,
      today,
      tomorrow,
      week,
      weights,
      checkins,
      challenges,
      reminders,
      trends: buildTrendSummary(weights),
    };
  });
}
