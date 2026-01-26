import { ClockCard } from '../components/ClockCard';
import { LogoutButton } from '../components/LogoutButton';
import { AppCards } from '@/components/AppCards';
import { DevicesCard } from '@/components/DevicesCard';



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
          <DevicesCard />
          <AppCards />
        </section>
      </div>
    </main>
  );
}
