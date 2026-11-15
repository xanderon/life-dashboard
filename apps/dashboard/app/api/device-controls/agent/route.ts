import { createHash, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEVICE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
}

async function authenticate(req: NextRequest) {
  const deviceId = req.headers.get('x-device-id') ?? '';
  const authorization = req.headers.get('authorization') ?? '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!DEVICE_ID_RE.test(deviceId) || token.length < 32 || token.length > 512) return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return null;
  }
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const presentedHash = createHash('sha256').update(token, 'utf8').digest('hex');
  const { data: credential } = await admin.from('device_agent_credentials')
    .select('token_hash').eq('device_id', deviceId).maybeSingle();
  if (!credential) return null;
  const expected = Buffer.from(credential.token_hash, 'hex');
  const presented = Buffer.from(presentedHash, 'hex');
  if (expected.length !== presented.length || !timingSafeEqual(expected, presented)) return null;
  return { admin, deviceId };
}

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (!auth) return unauthorized();
  const { admin, deviceId } = auth;

  const { data, error } = await admin.from('device_controls')
    .select('device_id,youtube_allowed,youtube_allowed_until,updated_at')
    .eq('device_id', deviceId).maybeSingle();
  if (error) return NextResponse.json({ error: 'Unable to read state' }, { status: 503 });

  return NextResponse.json({ data: data ?? {
    device_id: deviceId, youtube_allowed: false, youtube_allowed_until: null, updated_at: null,
  } }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (!auth) return unauthorized();
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!body || ['youtube_allowed', 'hosts_ok', 'firewall_ok', 'enforcement_ready'].some(k => typeof body[k] !== 'boolean') ||
      typeof body.agent_version !== 'string' || body.agent_version.length > 40 ||
      (body.control_updated_at !== null && (typeof body.control_updated_at !== 'string' || !Number.isFinite(Date.parse(body.control_updated_at))))) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }
  const { error } = await auth.admin.from('device_agent_status').upsert({
    device_id: auth.deviceId,
    reported_at: new Date().toISOString(),
    control_updated_at: body.control_updated_at,
    youtube_allowed: body.youtube_allowed,
    hosts_ok: body.hosts_ok,
    firewall_ok: body.firewall_ok,
    enforcement_ready: body.enforcement_ready,
    agent_version: body.agent_version,
  }, { onConflict: 'device_id' });
  if (error) return NextResponse.json({ error: 'Unable to save status' }, { status: 503 });
  if (body.metrics && typeof body.metrics === 'object' && !Array.isArray(body.metrics)) {
    const m = body.metrics as Record<string, unknown>;
    const validNumber = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1e12;
    if ((m.user_name === null || (typeof m.user_name === 'string' && m.user_name.length <= 256)) &&
        (m.ip_address === null || (typeof m.ip_address === 'string' && m.ip_address.length <= 45)) &&
        ['uptime_sec', 'mem_total_mb', 'mem_used_mb', 'storage_total_gb', 'storage_used_gb'].every(k => validNumber(m[k]))) {
      const { error: metricsError } = await auth.admin.from('devices').update({
        user_name: m.user_name, ip_address: m.ip_address,
        uptime_sec: m.uptime_sec, mem_total_mb: m.mem_total_mb, mem_used_mb: m.mem_used_mb,
        storage_total_gb: m.storage_total_gb, storage_used_gb: m.storage_used_gb,
        last_seen_at: new Date().toISOString(), status: 'ok',
      }).eq('id', auth.deviceId);
      if (metricsError) return NextResponse.json({ error: 'Unable to save device metrics' }, { status: 503 });
    } else return NextResponse.json({ error: 'Invalid device metrics' }, { status: 400 });
  }
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
