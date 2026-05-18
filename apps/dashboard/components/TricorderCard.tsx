'use client';

import { ArrowUpRight, Radio } from 'lucide-react';
import Link from 'next/link';

export function TricorderCard() {
  return (
    <section className="surface-card surface-card--tools p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-lg font-semibold tracking-tight">Tricorder</div>
          <div className="mt-1 text-sm text-[var(--muted)]">Open the dedicated interface.</div>
        </div>
        <Link className="app-open-button" href="/tricorder">
          <span className="app-open-button__icon">
            <Radio aria-hidden="true" />
          </span>
          <span>Open</span>
          <ArrowUpRight aria-hidden="true" className="h-4 w-4 text-[var(--muted)]" />
        </Link>
      </div>
    </section>
  );
}
