export function StatusPill({ status }: { status: 'ok' | 'warn' | 'down' | 'unknown' }) {
  const map: Record<string, { label: string; cls: string }> = {
    ok: { label: 'OK', cls: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/30' },
    warn: { label: 'WARN', cls: 'bg-amber-500/15 text-amber-200 border-amber-500/30' },
    down: { label: 'DOWN', cls: 'bg-rose-500/15 text-rose-200 border-rose-500/30' },
    unknown: { label: '—', cls: 'bg-slate-500/15 text-slate-200 border-slate-500/30' },
  };

  const v = map[status] ?? map.unknown;

  return (
    <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${v.cls}`}>
      {v.label}
    </span>
  );
}
