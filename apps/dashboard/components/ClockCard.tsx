'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card } from './Card';

export function ClockCard() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const time = useMemo(() => {
    if (!now) {
      return "--:--:--";
    }

    return now.toLocaleTimeString('ro-RO', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }, [now]);

  const date = useMemo(() => {
    if (!now) {
      return '\u00a0';
    }

    return now.toLocaleDateString('ro-RO', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }, [now]);

  return (
    <Card
      title="Clock"
      subtitle={date}
      className="hero-card hero-card--personal p-4 sm:p-5"
    >
      <div className="display-title text-3xl font-semibold tracking-[-0.06em] sm:text-4xl lg:text-5xl">{time}</div>
    </Card>
  );
}
