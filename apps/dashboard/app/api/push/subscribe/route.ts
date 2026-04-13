import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_OWNER_ID = process.env.SUPABASE_OWNER_ID ?? null;

export async function POST(request: Request) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Missing Supabase env.' }, { status: 500 });
  }

  const authClient = await createSupabaseServerClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  if (SUPABASE_OWNER_ID && user.id !== SUPABASE_OWNER_ID) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }

  const requestOrigin = new URL(request.url).origin;
  const origin = request.headers.get('origin');
  if (origin && origin !== requestOrigin) {
    return NextResponse.json({ error: 'Invalid origin.' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const subscription = body?.subscription ?? null;
  const keys = subscription?.keys ?? null;
  if (!subscription?.endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: 'Invalid subscription.' }, { status: 400 });
  }

  const appSlug = body?.appSlug ?? 'termo-alert';
  const userAgent = body?.userAgent ?? null;
  const nowIso = new Date().toISOString();
  const ownerId = SUPABASE_OWNER_ID ?? user.id;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      owner_id: ownerId,
      app_slug: appSlug,
      endpoint: subscription.endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      user_agent: userAgent,
      enabled: true,
      updated_at: nowIso,
      last_seen_at: nowIso,
    },
    { onConflict: 'endpoint' }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
