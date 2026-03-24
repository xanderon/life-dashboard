'use client';

import Link from 'next/link';

export function JsSyntaxDrillCard() {
  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">JS Drill Trainer</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Sintaxă, structuri de date, micro-operații tip LeetCode
          </p>
        </div>
        <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-[11px] font-semibold text-amber-200">
          localStorage
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <Tile label="Focus" value="Run -> feedback -> Next" />
        <Tile label="Set" value="82 exerciții micro" />
      </div>

      <div className="mt-3 text-xs leading-5 text-[var(--muted)]">
        Moduri mixed / arrays / objects / set-map / stack-queue, hint-uri progresive,
        soluții scurte și adaptive drilling după conceptele slabe.
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          className="rounded-xl border border-emerald-400/35 bg-emerald-500/15 px-3 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/25"
          href="/js-syntax-drill-trainer.html"
        >
          Open trainer
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
