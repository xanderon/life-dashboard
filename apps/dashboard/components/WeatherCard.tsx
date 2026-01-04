import { Card } from './Card';

export function WeatherCard() {
  return (
    <Card
      title="🌤️ Vremea"
      subtitle="(placeholder) — următorul pas: Open-Meteo / weather API"
      right={<span className="text-xs text-gray-500">București</span>}
    >
      <div className="text-sm text-gray-700">
        În pasul următor conectăm un API gratuit și afișăm temperatura + icon + forecast scurt.
      </div>
    </Card>
  );
}
