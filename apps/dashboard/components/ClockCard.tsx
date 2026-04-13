'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card } from './Card';

export function ClockCard() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const time = useMemo(() => {
    return now.toLocaleTimeString('ro-RO', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }, [now]);

  const date = useMemo(() => {
    return now.toLocaleDateString('ro-RO', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }, [now]);

  return (
    <Card
      title="Live clock"
      subtitle={date}
      right={<span className="eyebrow">Local</span>}
      className="hero-card"
    >
      <div className="display-title text-5xl font-semibold tracking-[-0.06em]">{time}</div>
    </Card>
  );
}
