'use client';

import Link from 'next/link';

export function TricorderCard() {
  return (
    <section className="surface-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="eyebrow">Experimental</div>
          <h2 className="mt-4 text-lg font-semibold tracking-tight">Tricorder</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Scanere mobile, bio-readings si interfata dedicata.
          </p>
        </div>
        <div className="rounded-full border border-[color:color-mix(in_srgb,var(--accent-warm)_34%,transparent)] bg-[color:color-mix(in_srgb,var(--accent-warm)_12%,transparent)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--accent-warm)]">
          New
        </div>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3 text-sm">
        <Tile label="Modes" value="6" />
        <Tile label="Display" value="Live" />
        <Tile label="Form" value="Mobile" />
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="text-sm text-[var(--muted)]">
          Experienta separata, stilizata complet ca un tricorder SF.
        </div>
        <Link
          className="btn-base btn-secondary"
          href="/tricorder"
        >
          Launch
        </Link>
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
