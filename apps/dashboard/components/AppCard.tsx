'use client';

import Link from 'next/link';
import { StatusPill } from './StatusPill';

type AppRow = {
  id: string;
  slug: string;
  name: string;
  description: string;
  status: 'ok' | 'warn' | 'down' | 'unknown';
  last_run_at: string | null;
  github_url: string | null;
  chat_url: string | null;
  home_url: string | null;
};

function fmt(ts: string | null) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('ro-RO');
}

export function AppCard({ app }: { app: AppRow }) {
  const isTermo = app.slug === 'termo-alert';
  const termoParts = isTermo
    ? app.description.split('|').map((part) => part.trim()).filter(Boolean)
    : [];
  const termoBadgeClass = (part: string) => {
    if (part.includes('ETA')) return 'border-slate-500/30 bg-slate-500/10 text-slate-200';
    if (part.includes('DA')) return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';
    if (part.includes('NU')) return 'border-rose-500/30 bg-rose-500/10 text-rose-200';
    return 'border-slate-500/30 bg-slate-500/10 text-slate-200';
  };

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="truncate text-lg font-semibold">{app.name}</div>
            <StatusPill status={app.status} />
          </div>
          {isTermo ? (
            <div className="mt-3 flex flex-wrap gap-2 text-sm">
              {termoParts.map((part) => (
                <span
                  key={part}
                  className={`rounded-full border px-2.5 py-1 font-semibold ${termoBadgeClass(part)}`}
                >
                  {part}
                </span>
              ))}
            </div>
          ) : (
            <div className="mt-2 text-sm text-[var(--muted)]">
              {app.description}
            </div>
          )}
        </div>

        <div className="text-right">
          <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">Last run</div>
          <div className="mt-1 text-xs font-semibold text-[var(--muted)]">{fmt(app.last_run_at)}</div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 text-xs text-[var(--muted)]">
        <span className="font-semibold">Quick</span>
        <Link className="rounded-md px-1.5 py-1 hover:bg-[var(--panel-2)]" href={`/apps/${app.slug}`} aria-label="Details">
          🔎
        </Link>
        {app.home_url ? (
          <a className="rounded-md px-1.5 py-1 hover:bg-[var(--panel-2)]" href={app.home_url} target="_blank" rel="noreferrer" aria-label="Open UI">
            🚀
          </a>
        ) : (
          <span className="rounded-md px-1.5 py-1 text-[var(--muted)] opacity-50" aria-label="Open UI">
            🚀
          </span>
        )}
        {app.github_url ? (
          <a className="rounded-md px-1.5 py-1 hover:bg-[var(--panel-2)]" href={app.github_url} target="_blank" rel="noreferrer" aria-label="GitHub">
            🧠
          </a>
        ) : (
          <span className="rounded-md px-1.5 py-1 text-[var(--muted)] opacity-50" aria-label="GitHub">
            🧠
          </span>
        )}
        {app.chat_url ? (
          <a className="rounded-md px-1.5 py-1 hover:bg-[var(--panel-2)]" href={app.chat_url} target="_blank" rel="noreferrer" aria-label="Chat">
            💬
          </a>
        ) : (
          <span className="rounded-md px-1.5 py-1 text-[var(--muted)] opacity-50" aria-label="Chat">
            💬
          </span>
        )}
      </div>
    </section>
  );
}

export type { AppRow };
