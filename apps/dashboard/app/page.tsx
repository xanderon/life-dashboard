import ClockCard from '@/components/ClockCard';
import WeatherCard from '@/components/WeatherCard';

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6">
          <h1 className="text-2xl font-bold">Life Dashboard</h1>
          <p className="mt-1 text-sm text-gray-600">
            Catalog, status, runs și shortcut-uri către proiectele tale.
          </p>
        </header>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ClockCard />
          <WeatherCard />
        </section>

        <section className="mt-6">
          <h2 className="text-lg font-semibold">Apps</h2>
          <p className="mt-1 text-sm text-gray-600">
            Urmează: listă din DB + “last run” + click către details.
          </p>

          <div className="mt-3 rounded-2xl border bg-white p-5 text-sm text-gray-600 shadow-sm">
            Deocamdată gol. În pasul următor adăugăm autentificare + DB.
          </div>
        </section>
      </div>
    </main>
  );
}
