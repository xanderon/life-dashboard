export default function WeatherCard() {
  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="text-sm text-gray-500">Weather</div>
      <div className="mt-2 text-xl font-semibold">București</div>

      <div className="mt-3 text-sm text-gray-600">
        (placeholder) În pasul următor conectăm un provider meteo și afișăm temperatură + icon.
      </div>

      <div className="mt-4 inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700">
        Not connected
      </div>
    </div>
  );
}
