import { searchFoods } from '@/lib/cutCoach';
import { withCutCoachUser } from '@/lib/cutCoachRoute';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('q')?.trim() ?? '';

  return withCutCoachUser(async ({ userId, supabase }) => {
    return { foods: await searchFoods(supabase, userId, query, 20) };
  });
}
