import { buildTrendSummary, getWeights } from '@/lib/cutCoach';
import { withCutCoachUser } from '@/lib/cutCoachRoute';

export async function GET() {
  return withCutCoachUser(async ({ userId, supabase }) => {
    const weights = await getWeights(supabase, userId, 60);
    return { trends: buildTrendSummary(weights) };
  });
}
