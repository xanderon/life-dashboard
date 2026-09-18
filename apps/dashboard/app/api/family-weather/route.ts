import { NextResponse } from "next/server";

const BUCHAREST = { latitude: 44.4268, longitude: 26.1025 };
const HOURS = ["08:00", "13:00", "18:00"];

type Forecast = {
  current?: { time: string; temperature_2m: number; weather_code: number };
  hourly?: {
    time: string[];
    temperature_2m: number[];
    weather_code: number[];
    precipitation_probability: number[];
  };
};

/** Public, read-only forecast for the family dashboard's Bucharest view. */
export async function GET() {
  const query = new URLSearchParams({
    latitude: String(BUCHAREST.latitude),
    longitude: String(BUCHAREST.longitude),
    current: "temperature_2m,weather_code",
    hourly: "temperature_2m,weather_code,precipitation_probability",
    forecast_days: "3",
    timezone: "Europe/Bucharest",
  });

  try {
    const response = await fetch(
      `https://api.open-meteo.com/v1/forecast?${query}`,
      {
        next: { revalidate: 900 },
      },
    );
    if (!response.ok) throw new Error("Weather provider unavailable");
    const forecast = (await response.json()) as Forecast;
    const hourly = forecast.hourly;
    if (!hourly?.time?.length) throw new Error("Weather payload incomplete");

    const dates = [
      ...new Set(hourly.time.map((time) => time.slice(0, 10))),
    ].slice(0, 3);
    const days = dates.map((date) => ({
      date,
      moments: HOURS.flatMap((time) => {
        const index = hourly.time.indexOf(`${date}T${time}`);
        return index < 0
          ? []
          : [
              {
                time,
                temperature: Math.round(hourly.temperature_2m[index]),
                code: hourly.weather_code[index],
                precipitationProbability:
                  hourly.precipitation_probability[index],
              },
            ];
      }),
    }));

    return NextResponse.json(
      {
        location: "București",
        current: forecast.current
          ? {
              time: forecast.current.time,
              temperature: Math.round(forecast.current.temperature_2m),
              code: forecast.current.weather_code,
            }
          : null,
        days,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=900, stale-while-revalidate=900",
        },
      },
    );
  } catch {
    return NextResponse.json({ error: "Weather unavailable" }, { status: 503 });
  }
}
