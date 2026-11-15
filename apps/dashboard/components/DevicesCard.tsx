'use client';

import { ArrowUpRight, MonitorSmartphone } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

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

type DeviceWithDerivedStatus = DeviceRow & {
  derivedStatus: Status;
};

const OFFLINE_AFTER_MIN = 45;

function deriveStatus(device: DeviceRow): Status {
  if (!device.last_seen_at) return 'unknown' as const;
  const last = new Date(device.last_seen_at).getTime();
  const diffMin = (Date.now() - last) / 60000;
  if (diffMin > (device.slug === 'astro-pc' ? 0.75 : OFFLINE_AFTER_MIN)) return 'down' as const;
  if (device.alerts && device.alerts.length > 0) return 'warn' as const;
  return 'ok' as const;
}

export function DevicesCard() {
  const [devices, setDevices] = useState<DeviceRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    async function refresh() {
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

      setDevices((data ?? []) as DeviceRow[]);
    }
    void refresh();
    const interval = setInterval(refresh, 10000);

    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, []);

  const derived = useMemo(() => {
    const rows = devices ?? [];
    const enriched = rows.map((d) => ({ ...d, derivedStatus: deriveStatus(d) })) as DeviceWithDerivedStatus[];
    const onlineCount = enriched.filter((d) => d.derivedStatus === 'ok' || d.derivedStatus === 'warn').length;
    return { enriched, onlineCount };
  }, [devices]);

  if (err) {
    return (
      <section className="surface-card surface-card--danger surface-card--infra p-5">
        <div className="text-sm font-semibold">Eroare DB</div>
        <div className="mt-1 text-sm text-[var(--muted)]">{err}</div>
      </section>
    );
  }

  if (devices === null) {
    return (
      <section className="surface-card surface-card--subtle p-5 sm:p-6">
        <div className="text-lg font-semibold tracking-tight">Devices</div>
        <div className="mt-2 text-sm text-[var(--muted)]">Loading…</div>
      </section>
    );
  }

  return (
    <section className="surface-card surface-card--subtle p-6">
      <div className="flex items-start justify-between gap-4">
        <span className="rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] p-3 text-[var(--muted)]"><MonitorSmartphone size={20} aria-hidden="true" /></span>
        <Link href="/devices" aria-label="Deschide dispozitivele" className="text-[var(--muted)] hover:text-[var(--text)]"><ArrowUpRight size={18} aria-hidden="true" /></Link>
      </div>
      <div className="mt-7 flex items-baseline justify-between gap-3">
        <h2 className="text-xl font-semibold tracking-tight">Dispozitive</h2>
        <span className="text-xs text-[var(--muted)]">{derived.onlineCount} din {devices.length} online</span>
      </div>
      <div className="mt-4 divide-y divide-[var(--border)]">
        {derived.enriched.slice(0, 4).map((device) => (
          <div key={device.id} className="flex items-center justify-between gap-3 py-3 text-sm">
            <span className="truncate">{device.name}</span>
            <span className="text-xs text-[var(--muted)]">{device.derivedStatus === 'ok' ? 'Online' : device.derivedStatus === 'warn' ? 'Atenție' : device.derivedStatus === 'down' ? 'Offline' : 'Necunoscut'}</span>
          </div>
        ))}
        {!derived.enriched.length && <p className="py-3 text-sm text-[var(--muted)]">Nu există dispozitive încă.</p>}
      </div>
      <Link href="/devices" className="mt-3 inline-block text-sm font-semibold">Vezi dispozitivele <span aria-hidden="true">→</span></Link>
    </section>
  );
}
