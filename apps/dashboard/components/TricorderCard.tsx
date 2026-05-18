'use client';

import Link from 'next/link';

export function TricorderCard() {
  return (
    <section className="surface-card surface-card--tools p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-lg font-semibold tracking-tight">Tricorder</div>
          <div className="mt-1 text-sm text-[var(--muted)]">Open the dedicated interface.</div>
        </div>
        <Link className="btn-base btn-secondary" href="/tricorder">
          Open
        </Link>
      </div>
    </section>
  );
}
