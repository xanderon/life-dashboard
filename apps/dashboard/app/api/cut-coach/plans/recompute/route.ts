import { recomputePlan } from '@/lib/cutCoach';
import { withCutCoachUser } from '@/lib/cutCoachRoute';

export async function POST() {
  return withCutCoachUser(async ({ userId, supabase }) => recomputePlan(supabase, userId, 'manual-recompute'));
}
