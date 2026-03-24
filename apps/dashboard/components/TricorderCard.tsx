'use client';

import Link from 'next/link';

export function TricorderCard() {
  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Tricorder</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Scanere mobile, bio-readings si interfata dedicata.
          </p>
        </div>
        <div className="rounded-full border border-amber-400/30 bg-amber-300/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-amber-200">
          New
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
        <Tile label="Modes" value="6" />
        <Tile label="Display" value="Live" />
        <Tile label="Form" value="Mobile" />
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="text-xs text-[var(--muted)]">
          Experienta separata, stilizata complet ca un tricorder SF.
        </div>
        <Link
          className="rounded-xl border border-emerald-300/35 bg-emerald-500/15 px-3 py-2.5 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/25"
          href="/tricorder"
        >
          Open
        </Link>
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
