'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { StatusPill } from './StatusPill';

type Status = 'ok' | 'warn' | 'down' | 'unknown';

type DeviceRow = {
  id: string;
  slug: string;
  name: string;
  user_name: string | null;
  status: Status;
  last_seen_at: string | null;
  ip_address: string | null;
  alerts: { type: string; level: string; message: string }[] | null;
};

const OFFLINE_AFTER_MIN = 45;

function deriveStatus(device: DeviceRow): Status {
  if (!device.last_seen_at) return 'unknown' as const;
  const last = new Date(device.last_seen_at).getTime();
  const diffMin = (Date.now() - last) / 60000;
  if (diffMin > OFFLINE_AFTER_MIN) return 'down' as const;
  if (device.alerts && device.alerts.length > 0) return 'warn' as const;
  return 'ok' as const;
}

export function DevicesCard() {
  const [devices, setDevices] = useState<DeviceRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await supabase
        .from('devices')
        .select('id,slug,name,user_name,status,last_seen_at,ip_address,alerts')
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
    const enriched = rows.map((d) => ({ ...d, derivedStatus: deriveStatus(d) }));
    const hasDown = enriched.some((d) => d.derivedStatus === 'down');
    const hasWarn = enriched.some((d) => d.derivedStatus === 'warn');
    const overall: Status = hasDown ? 'down' : hasWarn ? 'warn' : rows.length ? 'ok' : 'unknown';
    const onlineCount = enriched.filter((d) => d.derivedStatus === 'ok' || d.derivedStatus === 'warn').length;
    const warnCount = enriched.filter((d) => d.derivedStatus === 'warn').length;
    const downCount = enriched.filter((d) => d.derivedStatus === 'down').length;
    return { enriched, overall, onlineCount, warnCount, downCount };
  }, [devices]);

  if (err) {
    return (
      <section className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 shadow-sm">
        <div className="text-sm font-semibold text-rose-200">Eroare DB</div>
        <div className="mt-1 text-sm text-rose-200/80">{err}</div>
      </section>
    );
  }

  if (devices === null) {
    return (
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5 shadow-sm">
        <div className="text-lg font-semibold">🖥️ Devices</div>
        <div className="mt-2 text-sm text-[var(--muted)]">Loading…</div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="text-lg font-semibold">🖥️ Devices</div>
            <StatusPill status={derived.overall} />
          </div>
          <div className="mt-2 text-sm text-[var(--muted)]">
            Online {derived.onlineCount}/{devices.length}
            {derived.warnCount > 0 ? ` · Alerte ${derived.warnCount}` : ''}
            {derived.downCount > 0 ? ` · Offline ${derived.downCount}` : ''}
          </div>
        </div>

        <Link
          className="rounded-md px-2 py-1 text-xs font-semibold text-[var(--muted)] hover:bg-[var(--panel-2)]"
          href="/devices"
        >
          Detalii →
        </Link>
      </div>

      <div className="mt-4 grid gap-2 text-xs text-[var(--muted)]">
        {(derived.enriched.length ? derived.enriched : []).slice(0, 4).map((device) => (
            <div key={device.id} className="flex items-center justify-between gap-3">
              <div className="truncate">
                <span className="font-semibold text-[var(--text)]">{device.name}</span>
                {device.user_name ? ` · ${device.user_name}` : ''}
                {device.ip_address ? ` · ${device.ip_address}` : ''}
              </div>
              <StatusPill status={device.derivedStatus} />
            </div>
        ))}
        {!derived.enriched.length ? (
          <div className="text-sm text-[var(--muted)]">Nu exista device-uri inca.</div>
        ) : null}
      </div>
    </section>
  );
}
