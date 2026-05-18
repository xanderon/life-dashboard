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
    <section className="surface-card surface-card--nutrition p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="eyebrow">Nutrition</div>
          <h2 className="mt-4 text-lg font-semibold tracking-tight">Adaptive Cut Coach</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">Today + tomorrow nutrition plan</p>
        </div>
        <Link
          className="btn-base btn-secondary"
          href="/cut-coach"
        >
          Open
        </Link>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
        <Tile label="Target today" value={data?.today?.target ? `${Math.round(data.today.target.kcal_target)} kcal` : 'Setup'} />
        <Tile label="Consumed" value={data?.today ? `${Math.round(data.today.consumed.calories)} kcal` : '—'} />
        <Tile
          label="Remaining"
          value={data?.today?.remaining ? `${Math.round(data.today.remaining.calories)} kcal` : '—'}
        />
        <Tile label="Tomorrow" value={data?.tomorrow?.target ? `${Math.round(data.tomorrow.target.kcal_target)} kcal` : '—'} />
      </div>

      <div className="mt-4 text-sm text-[var(--muted)]">
        Deterministic planner, quick logging, visible adjustments.
      </div>
    </section>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-tile">
      <div className="metric-tile__label">{label}</div>
      <div className="metric-tile__value">{value}</div>
    </div>
  );
}
