import { AppCards } from '@/components/AppCards';
import { ClockCard } from '@/components/ClockCard';
import { CutCoachCard } from '@/components/CutCoachCard';
import { DevicesCard } from '@/components/DevicesCard';
import { LogoutButton } from '@/components/LogoutButton';
import { PageShell } from '@/components/PageShell';
import { ThemeToggle } from '@/components/ThemeToggle';
import { TricorderCard } from '@/components/TricorderCard';
import Link from 'next/link';

export default function HomePage() {
  return (
    <PageShell>
      <div className="space-y-6">
        <section className="hero-card p-5 sm:p-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div className="max-w-2xl">
              <span className="eyebrow">Dashboard</span>
              <h1 className="display-title mt-4 text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">
                Life Dashboard
              </h1>
              <div className="mt-2 text-sm text-[var(--muted)]">
                Receipts, devices and your daily tools.
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link className="btn-base btn-primary" href="/receipts">
                  Open receipts
                </Link>
                <Link className="btn-base btn-secondary" href="/receipts/charts">
                  Spending charts
                </Link>
              </div>
            </div>

            <div className="flex w-full max-w-xl flex-col gap-3 xl:items-end">
              <div className="flex flex-wrap gap-3">
                <Link className="page-back-link" href="/devices">
                  Devices
                </Link>
                <LogoutButton />
              </div>
              <div className="pt-1">
                <ThemeToggle />
              </div>
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
      </div>
    </PageShell>
  );
}
