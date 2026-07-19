import { createHash, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEVICE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(req: NextRequest) {
  const deviceId = req.headers.get('x-device-id') ?? '';
  const authorization = req.headers.get('authorization') ?? '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!DEVICE_ID_RE.test(deviceId) || token.length < 32 || token.length > 512) return unauthorized();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });
  }
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const presentedHash = createHash('sha256').update(token, 'utf8').digest('hex');
  const { data: credential } = await admin.from('device_agent_credentials')
    .select('token_hash').eq('device_id', deviceId).maybeSingle();
  if (!credential) return unauthorized();
  const expected = Buffer.from(credential.token_hash, 'hex');
  const presented = Buffer.from(presentedHash, 'hex');
  if (expected.length !== presented.length || !timingSafeEqual(expected, presented)) return unauthorized();

  const { data, error } = await admin.from('device_controls')
    .select('device_id,youtube_allowed,youtube_allowed_until,updated_at')
    .eq('device_id', deviceId).maybeSingle();
  if (error) return NextResponse.json({ error: 'Unable to read state' }, { status: 503 });

  return NextResponse.json({ data: data ?? {
    device_id: deviceId, youtube_allowed: false, youtube_allowed_until: null, updated_at: null,
  } }, { headers: { 'Cache-Control': 'no-store' } });
}
