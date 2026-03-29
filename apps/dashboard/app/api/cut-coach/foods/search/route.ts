import { withCutCoachUser } from '@/lib/cutCoachRoute';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('q')?.trim() ?? '';

  return withCutCoachUser(async ({ userId, supabase }) => {
    const request = supabase
      .from('cut_coach_foods')
      .select('*')
      .eq('user_id', userId)
      .order('is_favorite', { ascending: false })
      .order('last_used_at', { ascending: false, nullsFirst: false })
      .limit(20);

    const { data, error } = query ? await request.ilike('name', `%${query}%`) : await request;
    if (error) throw error;
    return { foods: data ?? [] };
  });
}
