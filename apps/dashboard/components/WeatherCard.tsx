import { Card } from './Card';

export function WeatherCard() {
  return (
    <Card
      title="🌤️ Vremea"
      subtitle="(placeholder) — următorul pas: Open-Meteo / weather API"
      right={<span className="text-xs text-[var(--muted)]">București</span>}
    >
      <div className="text-sm text-[var(--muted)]">
        În pasul următor conectăm un API gratuit și afișăm temperatura + icon + forecast scurt.
      </div>
    </Card>
  );
}
