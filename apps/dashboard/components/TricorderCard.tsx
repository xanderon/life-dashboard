import { ArrowUpRight, Radio } from 'lucide-react';
import Link from 'next/link';

export function TricorderCard() {
  return (
    <Link href="/tricorder" className="surface-card surface-card--subtle flex items-center justify-between gap-4 p-5 transition-opacity hover:opacity-80 sm:p-6">
      <div className="flex items-center gap-4">
        <span className="rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] p-3 text-[var(--muted)]"><Radio size={20} aria-hidden="true" /></span>
        <div><h2 className="font-semibold tracking-tight">Tricorder</h2><p className="mt-1 text-sm text-[var(--muted)]">Instrumente pentru verificări rapide.</p></div>
      </div>
      <ArrowUpRight size={18} className="shrink-0 text-[var(--muted)]" aria-hidden="true" />
    </Link>
  );
}
