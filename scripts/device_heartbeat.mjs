import os from 'os';
import { execSync } from 'child_process';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_OWNER_ID = process.env.SUPABASE_OWNER_ID ?? null;

const DEVICE_SLUG = process.env.DEVICE_SLUG ?? os.hostname().toLowerCase();
const DEVICE_NAME = process.env.DEVICE_NAME ?? os.hostname();
const DEVICE_DISK = process.env.DEVICE_DISK ?? (process.platform === 'win32' ? 'C:' : '/');

const LOW_STORAGE_WARN_PCT = Number.parseInt(process.env.LOW_STORAGE_WARN_PCT ?? '10', 10);
const LOW_STORAGE_CRIT_PCT = Number.parseInt(process.env.LOW_STORAGE_CRIT_PCT ?? '5', 10);

function pickLocalIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    const list = nets[name] ?? [];
    for (const entry of list) {
      if (entry.family !== 'IPv4' || entry.internal) continue;
      if (entry.address.startsWith('169.254.')) continue;
      return entry.address;
    }
  }
  return null;
}

function getDiskUsage() {
  try {
    if (process.platform === 'win32') {
      const output = execSync(
        `wmic logicaldisk where "DeviceID='${DEVICE_DISK}'" get FreeSpace,Size /format:value`,
        { encoding: 'utf8' }
      );
      const freeMatch = output.match(/FreeSpace=(\d+)/i);
      const sizeMatch = output.match(/Size=(\d+)/i);
      if (!freeMatch || !sizeMatch) return null;
      const free = Number.parseInt(freeMatch[1], 10);
      const total = Number.parseInt(sizeMatch[1], 10);
      const used = total - free;
      return { totalBytes: total, usedBytes: used };
    }

    const diskPath =
      process.platform === 'darwin' && DEVICE_DISK === '/' ? '/System/Volumes/Data' : DEVICE_DISK;
    const output = execSync(`df -k "${diskPath}"`, { encoding: 'utf8' });
    const lines = output.trim().split('\n');
    if (lines.length < 2) return null;
    const parts = lines[1].split(/\s+/);
    const totalKb = Number.parseInt(parts[1], 10);
    const usedKb = Number.parseInt(parts[2], 10);
    if (!Number.isFinite(totalKb) || !Number.isFinite(usedKb)) return null;
    return { totalBytes: totalKb * 1024, usedBytes: usedKb * 1024 };
  } catch {
    return null;
  }
}

function toFixedInt(value) {
  if (!Number.isFinite(value)) return null;
  return Math.round(value);
}

function bytesToGb(bytes) {
  if (!Number.isFinite(bytes)) return null;
  return bytes / (1024 * 1024 * 1024);
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  }
  if (!SUPABASE_OWNER_ID) {
    throw new Error('Missing SUPABASE_OWNER_ID (devices.owner_id is required).');
  }

  const memTotal = os.totalmem();
  const memFree = os.freemem();
  const memUsed = memTotal - memFree;
  const userName = os.userInfo().username;
  const uptimeSec = Math.floor(os.uptime());
  const ipAddress = pickLocalIp();
  const disk = getDiskUsage();
  const nowIso = new Date().toISOString();

  const memTotalMb = toFixedInt(memTotal / (1024 * 1024));
  const memUsedMb = toFixedInt(memUsed / (1024 * 1024));
  const storageTotalGb = disk ? toFixedInt(bytesToGb(disk.totalBytes)) : null;
  const storageUsedGb = disk ? toFixedInt(bytesToGb(disk.usedBytes)) : null;

  const alerts = [];
  let status = 'ok';

  if (disk?.totalBytes) {
    const freeBytes = disk.totalBytes - disk.usedBytes;
    const freePct = Math.floor((freeBytes / disk.totalBytes) * 100);
    if (freePct <= LOW_STORAGE_CRIT_PCT) {
      alerts.push({
        type: 'low_storage',
        level: 'down',
        message: `Storage critic: ${freePct}% liber pe ${DEVICE_DISK}`,
      });
      status = 'down';
    } else if (freePct <= LOW_STORAGE_WARN_PCT) {
      alerts.push({
        type: 'low_storage',
        level: 'warn',
        message: `Storage low: ${freePct}% liber pe ${DEVICE_DISK}`,
      });
      status = 'warn';
    }
  }

  const payload = {
    owner_id: SUPABASE_OWNER_ID,
    slug: DEVICE_SLUG,
    name: DEVICE_NAME,
    os: process.platform,
    user_name: userName,
    status,
    ip_address: ipAddress,
    last_seen_at: nowIso,
    uptime_sec: uptimeSec,
    mem_total_mb: memTotalMb,
    mem_used_mb: memUsedMb,
    storage_total_gb: storageTotalGb,
    storage_used_gb: storageUsedGb,
    alerts,
    updated_at: nowIso,
  };

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { error } = await supabase.from('devices').upsert(payload, {
    onConflict: 'slug',
  });

  if (error) {
    throw new Error(`Supabase upsert failed: ${error.message}`);
  }

  console.log(`[device_heartbeat] ok: ${DEVICE_SLUG} @ ${nowIso}`);
}

main().catch((err) => {
  console.error('[device_heartbeat] error', err);
  process.exit(1);
});
