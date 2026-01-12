import { ClockCard } from '../components/ClockCard';
import { WeatherCard } from '../components/WeatherCard';
import { LogoutButton } from '../components/LogoutButton';
import { AppCards } from '@/components/AppCards';



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
          <WeatherCard />
          <AppCards />
        </section>

        <section className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4 shadow-sm">
          <div className="text-base font-semibold">🧩 Apps</div>
          <div className="mt-2 text-sm text-[var(--muted)]">
            Următorul pas: tabel/tiles cu apps (Lidl receipts, Termo, Price tracker), cu:
            <ul className="mt-2 list-disc pl-5">
              <li>status (healthy / failed)</li>
              <li>last run</li>
              <li>quick actions (Run / Open / Logs)</li>
              <li>link GitHub + link chat GPT</li>
            </ul>
          </div>
        </section>
      </div>
    </main>
  );
}
