import { DevicesCard } from '@/components/DevicesCard';
import { FamilyScheduleCard } from '@/components/FamilyScheduleCard';
import { LogoutButton } from '@/components/LogoutButton';
import { MyWorkCard } from '@/components/MyWorkCard';
import { PageShell } from '@/components/PageShell';
import { ThemeToggle } from '@/components/ThemeToggle';
import { TricorderCard } from '@/components/TricorderCard';

export default function HomePage() {
  return (
    <PageShell>
      <div className="space-y-8 py-4 sm:py-6">
        <header className="flex flex-wrap items-start justify-between gap-4 px-1">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Acasă</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.05em]">Dashboard</h1>
            <p className="mt-2 text-sm text-[var(--muted)]">Tot ce contează, la îndemână.</p>
          </div>
          <ThemeToggle />
        </header>
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
          <FamilyScheduleCard />
          <DevicesCard />
        </div>
        <section>
          <h2 className="mb-3 px-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Infrastructure</h2>
          <TricorderCard />
        </section>
        <MyWorkCard />
        <footer className="flex justify-end px-1"><LogoutButton /></footer>
      </div>
    </PageShell>
  );
}
