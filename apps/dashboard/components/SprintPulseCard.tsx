'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type Summary = {
  recurringTotal: number;
  recurringDone: number;
  recurringPercent: number;
  adhocTotal: number;
  adhocCompleted: number;
  adhocLeftover: number;
};

type Sprint = {
  start_date: string;
  end_date: string;
  name: string | null;
};

export function SprintPulseCard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [sprint, setSprint] = useState<Sprint | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await fetch('/api/sprintpulse/bootstrap', { cache: 'no-store' });
      if (!alive) return;
      if (!res.ok) return;
      const payload = await res.json();
      setSummary(payload.summary ?? null);
      setSprint(payload.selectedSprint ?? payload.currentSprint ?? null);
    })();

    return () => {
      alive = false;
    };
  }, []);

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">SprintPulse</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {sprint ? `${sprint.start_date} → ${sprint.end_date}` : 'Sprint summary'}
          </p>
        </div>
        <Link
          className="rounded-md border border-sky-500/40 bg-sky-500/20 px-2 py-1 text-xs font-semibold hover:bg-sky-500/30"
          href="/sprintpulse"
        >
          Open
        </Link>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <Tile label="Recurring" value={summary ? `${summary.recurringDone}/${summary.recurringTotal}` : '—'} />
        <Tile label="Completion" value={summary ? `${summary.recurringPercent}%` : '—'} />
        <Tile label="Ad-hoc done" value={summary ? `${summary.adhocCompleted}/${summary.adhocTotal}` : '—'} />
        <Tile label="Leftover" value={summary ? `${summary.adhocLeftover}` : '—'} />
      </div>

      <div className="mt-3 text-xs text-[var(--muted)]">Rosu P0/P1 first. Ritual zilnic: 2 minute.</div>
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
