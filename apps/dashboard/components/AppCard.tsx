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
  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="truncate text-lg font-semibold">{app.name}</div>
            <StatusPill status={app.status} />
          </div>
          <div className="mt-1 line-clamp-2 text-sm text-gray-700">
            {app.description}
          </div>
        </div>

        <div className="text-right">
          <div className="text-xs text-gray-500">Last run</div>
          <div className="mt-1 text-sm font-semibold">{fmt(app.last_run_at)}</div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link className="rounded-xl border bg-white px-3 py-2 text-sm hover:bg-gray-50" href={`/apps/${app.slug}`}>
          🔎 Details
        </Link>

        {app.home_url ? (
          <a className="rounded-xl border bg-white px-3 py-2 text-sm hover:bg-gray-50" href={app.home_url} target="_blank" rel="noreferrer">
            🚀 Open UI
          </a>
        ) : (
          <span className="rounded-xl border bg-gray-50 px-3 py-2 text-sm text-gray-400">🚀 Open UI</span>
        )}

        {app.github_url ? (
          <a className="rounded-xl border bg-white px-3 py-2 text-sm hover:bg-gray-50" href={app.github_url} target="_blank" rel="noreferrer">
            🧠 GitHub
          </a>
        ) : (
          <span className="rounded-xl border bg-gray-50 px-3 py-2 text-sm text-gray-400">🧠 GitHub</span>
        )}

        {app.chat_url ? (
          <a className="rounded-xl border bg-white px-3 py-2 text-sm hover:bg-gray-50" href={app.chat_url} target="_blank" rel="noreferrer">
            💬 Chat
          </a>
        ) : (
          <span className="rounded-xl border bg-gray-50 px-3 py-2 text-sm text-gray-400">💬 Chat</span>
        )}
      </div>
    </section>
  );
}

export type { AppRow };
