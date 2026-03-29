import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { requireUser } from '@/lib/cutCoach';

export async function withCutCoachUser<T>(
  handler: (args: { userId: string; supabase: Awaited<ReturnType<typeof createSupabaseServerClient>> }) => Promise<T>
) {
  try {
    const supabase = await createSupabaseServerClient();
    const user = await requireUser(supabase);
    const payload = await handler({ userId: user.id, supabase });
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    const status = message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
