import { AppCards } from '@/components/AppCards';
import { ClockCard } from '@/components/ClockCard';
import { CutCoachCard } from '@/components/CutCoachCard';
import { DevicesCard } from '@/components/DevicesCard';
import { LogoutButton } from '@/components/LogoutButton';
import { PageShell } from '@/components/PageShell';
import { ThemeToggle } from '@/components/ThemeToggle';
import { TricorderCard } from '@/components/TricorderCard';

export default function HomePage() {
  return (
    <PageShell>
      <div className="space-y-4 sm:space-y-6">
        <section className="flex justify-start">
          <div className="surface-card surface-card--soft w-full max-w-sm px-4 py-3 sm:w-auto sm:min-w-[19rem]">
            <div className="flex items-center justify-between gap-3">
              <h1 className="display-title text-lg font-semibold tracking-[-0.04em] sm:text-xl">
                Dashboard
              </h1>
              <ThemeToggle />
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <ClockCard />
          <AppCards slugs={['receipts', 'termo-alert']} />
          <DevicesCard />
          <TricorderCard />
          <AppCards excludeSlugs={['receipts', 'termo-alert']} />
          <CutCoachCard />
        </section>

        <section className="surface-card surface-card--soft p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-[var(--muted)]">Session</div>
            <LogoutButton />
          </div>
        </section>
      </div>
    </PageShell>
  );
}
