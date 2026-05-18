'use client';

import { useEffect, useMemo, useState } from 'react';
import { BackLink, PageShell } from '@/components/PageShell';
import { StatusPill } from '@/components/StatusPill';
import { ThemeToggle } from '@/components/ThemeToggle';
import { supabase } from '@/lib/supabaseClient';

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
  storage_volumes: {
    path: string;
    totalBytes: number;
    usedBytes: number;
    freePct: number | null;
  }[] | null;
  alerts: { type: string; level: string; message: string }[] | null;
};

type DeviceWithDerivedStatus = DeviceRow & {
  derivedStatus: DeviceRow['status'];
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
    <div className="metric-tile">
      <div className="flex items-center justify-between text-[11px] uppercase text-[var(--muted)]">
        <span>{label}</span>
        <span>{pct !== null ? `${pct}%` : '—'}</span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-black/20">
        <div
          className="h-full rounded-full bg-[var(--accent)]"
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
          'id,slug,name,user_name,os,status,ip_address,last_seen_at,uptime_sec,mem_total_mb,mem_used_mb,storage_total_gb,storage_used_gb,storage_volumes,alerts'
        )
        .order('name', { ascending: true });

      if (!alive) return;
      if (error) {
        setErr(error.message);
        setDevices([]);
        return;
      }

      setDevices((data ?? []) as DeviceRow[]);
    })();

    return () => {
      alive = false;
    };
  }, []);

  const derived = useMemo(() => {
    const rows = devices ?? [];
    return rows.map((d) => ({ ...d, derivedStatus: deriveStatus(d) })) as DeviceWithDerivedStatus[];
  }, [devices]);

  return (
    <PageShell width="6xl">
      <div className="space-y-6">
        <section className="hero-card hero-card--infra p-5 sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <span className="eyebrow">Infrastructure</span>
              <h1 className="display-title mt-5 text-4xl font-semibold tracking-[-0.06em]">
                Devices
              </h1>
              <p className="mt-3 text-base leading-7 text-[var(--muted)]">
                Snapshot rapid pentru PC-uri și laptopuri din casă, cu accent pe uptime, RAM,
                storage și alerte.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <BackLink href="/">Dashboard</BackLink>
              <ThemeToggle />
            </div>
          </div>
        </section>

        {err ? (
          <section className="surface-card surface-card--danger p-5">
            <div className="text-sm font-semibold">Eroare DB</div>
            <div className="mt-1 text-sm text-[var(--muted)]">{err}</div>
          </section>
        ) : null}

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {derived.length ? (
            derived.map((device) => (
              <article key={device.id} className="surface-card surface-card--infra surface-card--subtle p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="truncate text-lg font-semibold">{device.name}</div>
                      <StatusPill status={device.derivedStatus} />
                      {device.os ? (
                        <span className="rounded-full border border-[var(--border)] bg-[var(--panel-2)] px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">
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
                    <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
                      Last seen
                    </div>
                    <div className="mt-1 text-xs font-semibold text-[var(--text)]/80">
                      {fmtLastSeen(device.last_seen_at)}
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-[var(--muted)]">
                  <div className="metric-tile">
                    <div className="text-[11px] uppercase text-[var(--muted)]">Uptime</div>
                    <div className="mt-1 text-sm font-semibold text-[var(--text)]">
                      {fmtUptime(device.uptime_sec)}
                    </div>
                  </div>
                  <div className="metric-tile">
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

                {device.storage_volumes && device.storage_volumes.length > 1 ? (
                  <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-[var(--muted)]">
                    {device.storage_volumes.map((vol) => {
                      const totalGb = Math.round(vol.totalBytes / (1024 * 1024 * 1024));
                      const usedGb = Math.round(vol.usedBytes / (1024 * 1024 * 1024));
                      const pct =
                        vol.freePct !== null ? Math.max(0, 100 - vol.freePct) : null;
                      return (
                        <div key={vol.path} className="metric-tile">
                          <div className="flex items-center justify-between text-[11px] uppercase text-[var(--muted)]">
                            <span>{vol.path}</span>
                            <span>{pct !== null ? `${pct}%` : '—'}</span>
                          </div>
                          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-black/20">
                            <div
                              className="h-full rounded-full bg-[var(--accent)]"
                              style={{ width: pct !== null ? `${pct}%` : '0%' }}
                            />
                          </div>
                          <div className="mt-2 text-xs text-[var(--muted)]">
                            {`${usedGb}/${totalGb} GB`}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}

                {device.alerts && device.alerts.length ? (
                  <div className="surface-card surface-card--soft surface-card--infra mt-4 p-3 text-xs">
                    <div className="text-[11px] uppercase text-[var(--warning)]">Alerte</div>
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
            <div className="surface-card p-5 text-sm text-[var(--muted)]">
              Nu exista device-uri inca.
            </div>
          )}
        </section>
      </div>
    </PageShell>
  );
}
