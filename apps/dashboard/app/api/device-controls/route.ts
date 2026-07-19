import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

const DEVICE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_DURATIONS = new Set([15, 30, 60]);

type Action =
  | { action: 'block'; device_id: string }
  | { action: 'allow'; device_id: string }
  | { action: 'allow_temporarily'; device_id: string; minutes: number };

async function authenticatedOwner(deviceId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: 'Unauthorized', status: 401 } as const;

  const { data: device, error } = await supabase
    .from('devices')
    .select('id')
    .eq('id', deviceId)
    .eq('owner_id', user.id)
    .maybeSingle();
  if (error) return { error: 'Unable to validate device ownership', status: 500 } as const;
  if (!device) return { error: 'Device not found', status: 404 } as const;
  return { supabase, user } as const;
}

export async function GET(req: NextRequest) {
  const deviceId = req.nextUrl.searchParams.get('device_id') ?? '';
  if (!DEVICE_ID_RE.test(deviceId)) {
    return NextResponse.json({ error: 'A valid device_id is required' }, { status: 400 });
  }
  const owner = await authenticatedOwner(deviceId);
  if ('error' in owner) return NextResponse.json({ error: owner.error }, { status: owner.status });

  const { data, error } = await owner.supabase
    .from('device_controls')
    .select('id,device_id,youtube_allowed,youtube_allowed_until,updated_at,updated_by')
    .eq('device_id', deviceId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: 'Unable to read controls' }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  let body: Action;
  try { body = await req.json() as Action; }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

  if (!body || !DEVICE_ID_RE.test(body.device_id ?? '')) {
    return NextResponse.json({ error: 'A valid device_id is required' }, { status: 400 });
  }
  if (!['block', 'allow', 'allow_temporarily'].includes(body.action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }
  if (body.action === 'allow_temporarily' && !ALLOWED_DURATIONS.has(body.minutes)) {
    return NextResponse.json({ error: 'minutes must be 15, 30, or 60' }, { status: 400 });
  }

  const owner = await authenticatedOwner(body.device_id);
  if ('error' in owner) return NextResponse.json({ error: owner.error }, { status: owner.status });

  const allowed = body.action !== 'block';
  const allowedUntil = body.action === 'allow_temporarily'
    ? new Date(Date.now() + body.minutes * 60_000).toISOString()
    : null;
  const { data, error } = await owner.supabase.from('device_controls').upsert({
    device_id: body.device_id,
    youtube_allowed: allowed,
    youtube_allowed_until: allowedUntil,
    updated_by: owner.user.id,
  }, { onConflict: 'device_id' })
    .select('id,device_id,youtube_allowed,youtube_allowed_until,updated_at,updated_by')
    .single();

  if (error) return NextResponse.json({ error: 'Unable to update controls' }, { status: 500 });
  return NextResponse.json({ data });
}
