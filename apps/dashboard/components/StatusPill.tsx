export function StatusPill({ status }: { status: 'ok' | 'warn' | 'down' | 'unknown' }) {
  const map: Record<string, { label: string; cls: string }> = {
    ok: { label: 'OK', cls: 'bg-green-100 text-green-800 border-green-200' },
    warn: { label: 'WARN', cls: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
    down: { label: 'DOWN', cls: 'bg-red-100 text-red-800 border-red-200' },
    unknown: { label: '—', cls: 'bg-gray-100 text-gray-700 border-gray-200' },
  };

  const v = map[status] ?? map.unknown;

  return (
    <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${v.cls}`}>
      {v.label}
    </span>
  );
}
