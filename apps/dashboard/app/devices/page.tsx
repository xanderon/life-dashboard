'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { StatusPill } from '@/components/StatusPill';

type DeviceRow = {
  id: string;
  slug: string;
  name: string;
  user_name: string | null;
  os: string | null;
  status: 'ok' | 'warn' | 'down' | 'unknown';
  ip_address: string | null;
  last_seen_at: string | null;
  uptime_sec: number | null;
  mem_total_mb: number | null;
  mem_used_mb: number | null;
  storage_total_gb: number | null;
  storage_used_gb: number | null;
  alerts: { type: string; level: string; message: string }[] | null;
};

const OFFLINE_AFTER_MIN = 45;

function fmtLastSeen(ts: string | null) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('ro-RO');
}

function fmtUptime(seconds: number | null) {
  if (!seconds) return '—';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (mins) parts.push(`${mins}m`);
  return parts.length ? parts.join(' ') : '—';
}

function deriveStatus(device: DeviceRow) {
  if (!device.last_seen_at) return 'unknown' as const;
  const last = new Date(device.last_seen_at).getTime();
  const diffMin = (Date.now() - last) / 60000;
  if (diffMin > OFFLINE_AFTER_MIN) return 'down' as const;
  if (device.alerts && device.alerts.length > 0) return 'warn' as const;
  return 'ok' as const;
}

function Meter({
  label,
  used,
  total,
  unit,
}: {
  label: string;
  used: number | null;
  total: number | null;
  unit: string;
}) {
  const pct =
    used !== null && total !== null && total > 0
      ? Math.min(100, Math.round((used / total) * 100))
      : null;
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2">
      <div className="flex items-center justify-between text-[11px] uppercase text-[var(--muted)]">
        <span>{label}</span>
        <span>{pct !== null ? `${pct}%` : '—'}</span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-black/20">
        <div
          className="h-full rounded-full bg-emerald-400/80"
          style={{ width: pct !== null ? `${pct}%` : '0%' }}
        />
      </div>
      <div className="mt-2 text-xs text-[var(--muted)]">
        {used !== null && total !== null ? `${used}/${total} ${unit}` : '—'}
      </div>
    </div>
  );
}

export default function DevicesPage() {
  const [devices, setDevices] = useState<DeviceRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await supabase
        .from('devices')
        .select(
          'id,slug,name,user_name,os,status,ip_address,last_seen_at,uptime_sec,mem_total_mb,mem_used_mb,storage_total_gb,storage_used_gb,alerts'
        )
        .order('name', { ascending: true });

      if (!alive) return;
      if (error) {
        setErr(error.message);
        setDevices([]);
        return;
      }

      setDevices((data as any) ?? []);
    })();

    return () => {
      alive = false;
    };
  }, []);

  const derived = useMemo(() => {
    const rows = devices ?? [];
    return rows.map((d) => ({ ...d, derivedStatus: deriveStatus(d) }));
  }, [devices]);

  return (
    <main className="min-h-screen bg-[var(--bg)] p-4 sm:p-6">
      <div className="mx-auto max-w-6xl">
        <header className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Devices</h1>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Snapshot rapid pentru PC-uri / laptopuri din casa.
            </p>
          </div>
          <Link
            className="rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm font-semibold hover:bg-[var(--panel-2)]"
            href="/"
          >
            ← Inapoi
          </Link>
        </header>

        {err ? (
          <section className="mt-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 shadow-sm">
            <div className="text-sm font-semibold text-rose-200">Eroare DB</div>
            <div className="mt-1 text-sm text-rose-200/80">{err}</div>
          </section>
        ) : null}

        <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {derived.length ? (
            derived.map((device) => (
              <article
                key={device.id}
                className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="truncate text-lg font-semibold">{device.name}</div>
                      <StatusPill status={device.derivedStatus} />
                      {device.os ? (
                        <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] uppercase text-[var(--muted)]">
                          {device.os}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-2 text-sm text-[var(--muted)]">
                      User: {device.user_name ?? '—'}
                      {' · '}
                      IP: {device.ip_address ?? '—'}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
                      Last seen
                    </div>
                    <div className="mt-1 text-xs font-semibold text-[var(--muted)]">
                      {fmtLastSeen(device.last_seen_at)}
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-[var(--muted)]">
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2">
                    <div className="text-[11px] uppercase text-[var(--muted)]">Uptime</div>
                    <div className="mt-1 text-sm font-semibold text-[var(--text)]">
                      {fmtUptime(device.uptime_sec)}
                    </div>
                  </div>
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2">
                    <div className="text-[11px] uppercase text-[var(--muted)]">RAM</div>
                    <div className="mt-1 text-sm font-semibold text-[var(--text)]">
                      {device.mem_used_mb !== null && device.mem_total_mb !== null
                        ? `${device.mem_used_mb}/${device.mem_total_mb} MB`
                        : '—'}
                    </div>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Meter
                    label="Storage"
                    used={device.storage_used_gb}
                    total={device.storage_total_gb}
                    unit="GB"
                  />
                  <Meter
                    label="RAM usage"
                    used={device.mem_used_mb}
                    total={device.mem_total_mb}
                    unit="MB"
                  />
                </div>

                {device.alerts && device.alerts.length ? (
                  <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                    <div className="text-[11px] uppercase text-amber-200">Alerte</div>
                    <div className="mt-1">
                      {device.alerts.map((alert, idx) => (
                        <div key={`${alert.type}-${idx}`}>• {alert.message}</div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </article>
            ))
          ) : (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5 text-sm text-[var(--muted)]">
              Nu exista device-uri inca.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
