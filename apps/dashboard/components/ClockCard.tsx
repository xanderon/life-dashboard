'use client';

import { useEffect, useState } from 'react';

function formatDateTime(d: Date) {
  return new Intl.DateTimeFormat('ro-RO', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(d);
}

export default function ClockCard() {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="text-sm text-gray-500">Clock</div>
      <div className="mt-2 text-xl font-semibold">{formatDateTime(now)}</div>
      <div className="mt-2 text-xs text-gray-500">Timezone: Europe/Bucharest</div>
    </div>
  );
}
