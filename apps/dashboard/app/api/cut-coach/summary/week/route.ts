import { getWeekSnapshot, todayIsoDate } from '@/lib/cutCoach';
import { withCutCoachUser } from '@/lib/cutCoachRoute';

export async function GET() {
  return withCutCoachUser(async ({ userId, supabase }) => {
    const days = await getWeekSnapshot(supabase, userId, todayIsoDate());
    const aggregates = days.reduce(
      (acc, day) => ({
        kcalTargetAvg: acc.kcalTargetAvg + day.target.kcal_target,
        kcalConsumedAvg: acc.kcalConsumedAvg + day.consumed.calories,
        proteinAvg: acc.proteinAvg + day.consumed.protein,
        adherence:
          acc.adherence +
          (Math.abs(day.target.kcal_target - day.consumed.calories) <= 150 ? 1 : 0),
      }),
      { kcalTargetAvg: 0, kcalConsumedAvg: 0, proteinAvg: 0, adherence: 0 }
    );

    const divisor = days.length || 1;
    return {
      days,
      summary: {
        avg_kcal_target: Math.round(aggregates.kcalTargetAvg / divisor),
        avg_kcal_consumed: Math.round(aggregates.kcalConsumedAvg / divisor),
        avg_protein: Math.round((aggregates.proteinAvg / divisor) * 10) / 10,
        adherence_score: Math.round((aggregates.adherence / divisor) * 100),
      },
    };
  });
}
