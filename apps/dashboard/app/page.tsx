import { DashboardGrid, DashboardOrderProvider, DashboardOrderSettings } from '@/components/DashboardGrid';
import { LogoutButton } from '@/components/LogoutButton';
import { MyWorkCard } from '@/components/MyWorkCard';
import { PageShell } from '@/components/PageShell';
import { ThemeToggle } from '@/components/ThemeToggle';

export default function HomePage() {
  return (
    <PageShell>
      <div className="space-y-4 sm:space-y-6">
        <section className="flex justify-start">
          <div className="surface-card surface-card--personal surface-card--subtle w-full max-w-sm px-4 py-3 sm:w-auto sm:min-w-[19rem]">
            <div className="flex items-center justify-between gap-3">
              <h1 className="display-title text-lg font-semibold tracking-[-0.04em] sm:text-xl">
                Dashboard
              </h1>
              <ThemeToggle />
            </div>
          </div>
        </section>
        <DashboardOrderProvider>
          <DashboardGrid />

          <MyWorkCard />

          <section className="surface-card surface-card--personal surface-card--subtle p-4 sm:p-5">
            <div className="flex flex-col gap-4">
              <DashboardOrderSettings />
              <div className="h-px bg-[color:color-mix(in_srgb,var(--border)_82%,transparent)]" />
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium text-[var(--muted)]">Session</div>
                <LogoutButton />
              </div>
            </div>
          </section>
        </DashboardOrderProvider>
      </div>
    </PageShell>
  );
}
