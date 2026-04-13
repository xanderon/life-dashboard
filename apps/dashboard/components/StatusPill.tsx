export function StatusPill({ status }: { status: 'ok' | 'warn' | 'down' | 'unknown' }) {
  const map: Record<string, { label: string; cls: string }> = {
    ok: { label: 'OK', cls: 'status-pill--ok' },
    warn: { label: 'Warn', cls: 'status-pill--warn' },
    down: { label: 'Down', cls: 'status-pill--down' },
    unknown: { label: 'Idle', cls: 'status-pill--unknown' },
  };

  const v = map[status] ?? map.unknown;

  return (
    <span className={`status-pill ${v.cls}`}>
      {v.label}
    </span>
  );
}
