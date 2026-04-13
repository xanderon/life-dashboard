import { ClockCard } from '../components/ClockCard';
import { LogoutButton } from '../components/LogoutButton';
import { AppCards } from '@/components/AppCards';
import { DevicesCard } from '@/components/DevicesCard';
import { SprintPulseCard } from '@/components/SprintPulseCard';
import { StudyCoachCard } from '@/components/StudyCoachCard';
import { TricorderCard } from '@/components/TricorderCard';
import { CutCoachCard } from '@/components/CutCoachCard';



export default function HomePage() {
  return (
    <main className="min-h-screen bg-[var(--bg)] p-4 sm:p-6">
      <div className="mx-auto max-w-6xl">
        <header className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Life Dashboard</h1>
          </div>
          <LogoutButton />
        </header>

        <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <ClockCard />
          <AppCards slugs={['receipts', 'termo-alert']} />
          <DevicesCard />
          <TricorderCard />
          <AppCards excludeSlugs={['receipts', 'termo-alert']} />
          <StudyCoachCard />
          <SprintPulseCard />
          <CutCoachCard />
        </section>
      </div>
    </main>
  );
}
