import { ArrowUpRight, CalendarDays } from 'lucide-react';
import Link from 'next/link';

export function FamilyScheduleCard() {
  return (
    <Link href="/family-schedule" className="surface-card surface-card--subtle group block p-6 transition-opacity hover:opacity-80">
      <div className="flex items-start justify-between gap-4">
        <span className="rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] p-3 text-[var(--muted)]"><CalendarDays size={20} aria-hidden="true" /></span>
        <ArrowUpRight size={18} className="text-[var(--muted)]" aria-hidden="true" />
      </div>
      <h2 className="mt-7 text-xl font-semibold tracking-tight">Orar Mina & Leon</h2>
      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Activitățile și programul familiei, într-un singur loc.</p>
      <span className="mt-6 inline-block text-sm font-semibold">Deschide orarul <span aria-hidden="true">→</span></span>
    </Link>
  );
}
