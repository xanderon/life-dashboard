import { ArrowUpRight, CalendarDays } from 'lucide-react';
import Link from 'next/link';

export function FamilyScheduleCard() {
  return (
    <section className="surface-card surface-card--personal p-4 sm:p-5">
      <div className="app-card-shell min-w-0">
        <div className="app-card-head">
          <div className="app-card-meta">
            <div className="app-card-kicker">Familie</div>
            <div className="app-card-title text-lg">Orar Mina & Leon</div>
          </div>
          <span className="app-card-icon"><CalendarDays aria-hidden="true" /></span>
        </div>
        <div className="app-card-description">Toată săptămâna, activitățile și suprapunerile într-un singur loc.</div>
        <Link className="app-open-button app-card-footer" href="/family-schedule">
          <span className="app-open-button__icon"><CalendarDays aria-hidden="true" /></span>
          <span>Deschide orarul</span>
          <ArrowUpRight aria-hidden="true" className="h-4 w-4 text-[var(--muted)]" />
        </Link>
      </div>
    </section>
  );
}
