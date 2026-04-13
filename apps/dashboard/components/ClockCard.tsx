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
    <Card title="🕒 Ora & data" subtitle={date} right={<span className="text-xs text-[var(--muted)]">local</span>}>
      <div className="text-4xl font-bold tracking-tight">{time}</div>
    </Card>
  );
}
