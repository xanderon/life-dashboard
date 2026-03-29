'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type BootstrapCardPayload = {
  today?: {
    consumed: { calories: number };
    remaining: { calories: number } | null;
    target: { kcal_target: number } | null;
  };
  tomorrow?: {
    target: { kcal_target: number } | null;
  };
};

export function CutCoachCard() {
  const [data, setData] = useState<BootstrapCardPayload | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await fetch('/api/cut-coach/bootstrap', { cache: 'no-store' });
      if (!alive || !res.ok) return;
      const payload = (await res.json()) as BootstrapCardPayload;
      setData(payload);
    })();

    return () => {
      alive = false;
    };
  }, []);

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Adaptive Cut Coach</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">Today + tomorrow nutrition plan</p>
        </div>
        <Link
          className="rounded-md border border-emerald-500/40 bg-emerald-500/20 px-2 py-1 text-xs font-semibold hover:bg-emerald-500/30"
          href="/cut-coach"
        >
          Open
        </Link>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <Tile label="Target today" value={data?.today?.target ? `${Math.round(data.today.target.kcal_target)} kcal` : 'Setup'} />
        <Tile label="Consumed" value={data?.today ? `${Math.round(data.today.consumed.calories)} kcal` : '—'} />
        <Tile
          label="Remaining"
          value={data?.today?.remaining ? `${Math.round(data.today.remaining.calories)} kcal` : '—'}
        />
        <Tile label="Tomorrow" value={data?.tomorrow?.target ? `${Math.round(data.tomorrow.target.kcal_target)} kcal` : '—'} />
      </div>

      <div className="mt-3 text-xs text-[var(--muted)]">
        Deterministic planner, quick logging, visible adjustments.
      </div>
    </section>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2">
      <div className="text-[10px] uppercase text-[var(--muted)]">{label}</div>
      <div className="mt-1 text-sm font-semibold">{value}</div>
    </div>
  );
}
