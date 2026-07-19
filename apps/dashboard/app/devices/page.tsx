'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackLink, PageShell } from '@/components/PageShell';
import { StatusPill } from '@/components/StatusPill';
import { ThemeToggle } from '@/components/ThemeToggle';
import { supabase } from '@/lib/supabaseClient';

// ─── Types ────────────────────────────────────────────────────────────────────

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

type DeviceControl = {
  id: string;
  device_id: string;
  youtube_allowed: boolean;
  youtube_allowed_until: string | null;
  updated_at: string;
  updated_by?: string | null;
};

type ControlMap = Record<string, DeviceControl>;

// ─── Constants ────────────────────────────────────────────────────────────────

const OFFLINE_AFTER_MIN = 45;

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

/** Returns seconds until expiry, or null if no expiry / already expired. */
function secondsUntilExpiry(allowedUntil: string | null): number | null {
  if (!allowedUntil) return null;
  const diff = Math.floor((new Date(allowedUntil).getTime() - Date.now()) / 1000);
  return diff > 0 ? diff : null;
}

function fmtCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

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

// ─── Parental Controls Panel ──────────────────────────────────────────────────

function ParentalControlsPanel({
  deviceId,
  control,
  onUpdated,
}: {
  deviceId: string;
  control: DeviceControl | null;
  onUpdated: (deviceId: string, ctrl: DeviceControl | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Countdown ticker ──
  useEffect(() => {
    function tick() {
      if (!control?.youtube_allowed || !control.youtube_allowed_until) {
        setCountdown(null);
        return;
      }
      const secs = secondsUntilExpiry(control.youtube_allowed_until);
      setCountdown(secs);
    }
    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [control]);

  const send = useCallback(
    async (action: 'block' | 'allow' | 'allow_temporarily', minutes?: 15 | 30 | 60) => {
      const previous = control;
      const optimistic: DeviceControl = {
        id: control?.id ?? `optimistic-${deviceId}`,
        device_id: deviceId,
        youtube_allowed: action !== 'block',
        youtube_allowed_until: action === 'allow_temporarily'
          ? new Date(Date.now() + (minutes ?? 15) * 60_000).toISOString()
          : null,
        updated_at: new Date().toISOString(),
      };
      onUpdated(deviceId, optimistic);
      setBusy(true);
      setErr(null);
      try {
        const res = await fetch('/api/device-controls', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            device_id: deviceId,
            action,
            ...(action === 'allow_temporarily' ? { minutes } : {}),
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'Unknown error');
        onUpdated(deviceId, json.data as DeviceControl);
      } catch (e) {
        onUpdated(deviceId, previous);
        setErr(e instanceof Error ? e.message : 'Failed');
      } finally {
        setBusy(false);
      }
    },
    [control, deviceId, onUpdated]
  );

  // Effective state: allowed_until might have expired in the browser
  const timerExpired =
    control?.youtube_allowed &&
    control.youtube_allowed_until !== null &&
    countdown === null;

  const effectivelyAllowed = control?.youtube_allowed && !timerExpired;

  return (
    <div className="parental-panel mt-4 rounded-[1.2rem] border border-[var(--border)] bg-[color-mix(in_srgb,var(--panel-2)_88%,transparent)] p-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-base" role="img" aria-label="controls">🎮</span>
          <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">
            Parental Controls
          </span>
        </div>
        {/* YouTube status badge */}
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] transition-all duration-300 ${
            effectivelyAllowed
              ? 'border-[color-mix(in_srgb,var(--success)_36%,transparent)] bg-[color-mix(in_srgb,var(--success)_12%,transparent)] text-[var(--success)]'
              : 'border-[color-mix(in_srgb,var(--danger)_38%,transparent)] bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] text-[var(--danger)]'
          }`}
        >
          <span
            className={`h-[0.42rem] w-[0.42rem] rounded-full ${
              effectivelyAllowed ? 'bg-[var(--success)] shadow-[0_0_0_0.18rem_color-mix(in_srgb,var(--success)_22%,transparent)]' : 'bg-[var(--danger)]'
            } ${effectivelyAllowed ? 'animate-pulse' : ''}`}
          />
          {control === null
            ? 'Not configured'
            : effectivelyAllowed
            ? 'YouTube ON'
            : 'YouTube BLOCKED'}
        </span>
      </div>

      {/* Countdown */}
      {control?.youtube_allowed && control.youtube_allowed_until && countdown !== null && (
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-[color-mix(in_srgb,var(--accent-warm)_28%,transparent)] bg-[color-mix(in_srgb,var(--accent-warm)_8%,transparent)] px-3 py-2 text-xs text-[var(--accent-warm)]">
          <span className="text-sm">⏱</span>
          <span className="font-semibold">Expires in {fmtCountdown(countdown)}</span>
        </div>
      )}
      {timerExpired && (
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-[color-mix(in_srgb,var(--warning)_28%,transparent)] bg-[color-mix(in_srgb,var(--warning)_8%,transparent)] px-3 py-2 text-xs text-[var(--warning)]">
          <span className="text-sm">⏰</span>
          <span className="font-semibold">Timer expired — device will re-block on next poll</span>
        </div>
      )}

      {/* Error */}
      {err && (
        <div className="mt-3 rounded-xl border border-[color-mix(in_srgb,var(--danger)_36%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2 text-xs text-[var(--danger)]">
          {err}
        </div>
      )}

      {/* Action buttons */}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          id={`ctrl-allow-${deviceId}`}
          disabled={busy}
          onClick={() => send('allow')}
          className="ctrl-btn ctrl-btn--allow"
          title="Allow YouTube indefinitely"
        >
          ✅ Unblock
        </button>
        <button
          id={`ctrl-15m-${deviceId}`}
          disabled={busy}
          onClick={() => send('allow_temporarily', 15)}
          className="ctrl-btn ctrl-btn--timer"
          title="Allow YouTube for 15 minutes"
        >
          🕐 15 min
        </button>
        <button
          id={`ctrl-30m-${deviceId}`}
          disabled={busy}
          onClick={() => send('allow_temporarily', 30)}
          className="ctrl-btn ctrl-btn--timer"
          title="Allow YouTube for 30 minutes"
        >
          🕐 30 min
        </button>
        <button
          id={`ctrl-1h-${deviceId}`}
          disabled={busy}
          onClick={() => send('allow_temporarily', 60)}
          className="ctrl-btn ctrl-btn--timer"
          title="Allow YouTube for 1 hour"
        >
          🕐 1 hr
        </button>
        <button
          id={`ctrl-block-${deviceId}`}
          disabled={busy}
          onClick={() => send('block')}
          className="ctrl-btn ctrl-btn--block"
          title="Block YouTube now"
        >
          🚫 Block now
        </button>
      </div>

      {/* Last updated */}
      {control?.updated_at && (
        <div className="mt-3 text-[10px] text-[var(--muted)]">
          Last updated: {new Date(control.updated_at).toLocaleString('ro-RO')}
        </div>
      )}

      {/* Busy overlay indicator */}
      {busy && (
        <div className="mt-2 text-[11px] text-[var(--muted)]">
          <span className="animate-pulse">Applying…</span>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DevicesPage() {
  const [devices, setDevices] = useState<DeviceRow[] | null>(null);
  const [controls, setControls] = useState<ControlMap>({});
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      // Fetch devices
      const { data: devData, error: devErr } = await supabase
        .from('devices')
        .select(
          'id,slug,name,user_name,os,status,ip_address,last_seen_at,uptime_sec,mem_total_mb,mem_used_mb,storage_total_gb,storage_used_gb,storage_volumes,alerts'
        )
        .order('name', { ascending: true });

      if (!alive) return;
      if (devErr) {
        setErr(devErr.message);
        setDevices([]);
        return;
      }

      setDevices((devData ?? []) as DeviceRow[]);

      // Controls are read through the authenticated API so ownership is checked explicitly.
      const ctrlData = await Promise.all((devData ?? []).map(async (device) => {
        const response = await fetch(`/api/device-controls?device_id=${encodeURIComponent(device.id)}`);
        if (!response.ok) return null;
        const payload = await response.json() as { data: DeviceControl | null };
        return payload.data;
      }));
      if (!alive) return;
      const map: ControlMap = {};
      for (const row of ctrlData) {
        if (!row) continue;
        map[row.device_id] = row as DeviceControl;
      }
      setControls(map);
    }

    load();
    return () => { alive = false; };
  }, []);

  const derived = useMemo(() => {
    const rows = devices ?? [];
    return rows.map((d) => ({ ...d, derivedStatus: deriveStatus(d) })) as DeviceWithDerivedStatus[];
  }, [devices]);

  const handleControlUpdated = useCallback((deviceId: string, ctrl: DeviceControl | null) => {
    setControls((prev) => {
      if (!ctrl) {
        const next = { ...prev };
        delete next[deviceId];
        return next;
      }
      return { ...prev, [ctrl.device_id]: ctrl };
    });
  }, []);

  return (
    <>
      <style>{`
        .ctrl-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          border-radius: 999px;
          border: 1px solid var(--border);
          font-size: 0.78rem;
          font-weight: 700;
          padding: 0.52rem 0.9rem;
          cursor: pointer;
          transition: transform 150ms ease, border-color 150ms ease, background 150ms ease, opacity 150ms ease;
          white-space: nowrap;
        }
        .ctrl-btn:disabled { opacity: 0.45; cursor: not-allowed; transform: none !important; }
        .ctrl-btn:not(:disabled):hover { transform: translateY(-1px); }

        .ctrl-btn--allow {
          background: color-mix(in srgb, var(--success) 12%, var(--panel-2));
          border-color: color-mix(in srgb, var(--success) 36%, transparent);
          color: var(--success);
        }
        .ctrl-btn--allow:not(:disabled):hover {
          background: color-mix(in srgb, var(--success) 18%, var(--panel-2));
          border-color: color-mix(in srgb, var(--success) 52%, transparent);
        }
        .ctrl-btn--timer {
          background: color-mix(in srgb, var(--accent-warm) 10%, var(--panel-2));
          border-color: color-mix(in srgb, var(--accent-warm) 32%, transparent);
          color: var(--accent-warm);
        }
        .ctrl-btn--timer:not(:disabled):hover {
          background: color-mix(in srgb, var(--accent-warm) 16%, var(--panel-2));
          border-color: color-mix(in srgb, var(--accent-warm) 48%, transparent);
        }
        .ctrl-btn--block {
          background: color-mix(in srgb, var(--danger) 10%, var(--panel-2));
          border-color: color-mix(in srgb, var(--danger) 34%, transparent);
          color: var(--danger);
        }
        .ctrl-btn--block:not(:disabled):hover {
          background: color-mix(in srgb, var(--danger) 16%, var(--panel-2));
          border-color: color-mix(in srgb, var(--danger) 50%, transparent);
        }
      `}</style>

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

                  {/* ── Parental Controls ── */}
                  <ParentalControlsPanel
                    deviceId={device.id}
                    control={controls[device.id] ?? null}
                    onUpdated={handleControlUpdated}
                  />
                </article>
              ))
            ) : (
              <div className="surface-card p-5 text-sm text-[var(--muted)]">
                {devices === null ? 'Loading…' : 'Nu exista device-uri inca.'}
              </div>
            )}
          </section>
        </div>
      </PageShell>
    </>
  );
}
