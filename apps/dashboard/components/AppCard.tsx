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

export function AppCard({
  app,
}: {
  app: AppRow;
}) {
  const isTermo = app.slug === 'termo-alert';
  const isReceipts = app.slug === 'receipts';
  const wrapperClassName = isReceipts ? 'hero-card p-4 sm:p-5' : 'surface-card p-4 sm:p-5';
  const termoParts = isTermo
    ? app.description.split('|').map((part) => part.trim()).filter(Boolean)
    : [];
  const termoBadgeStyle = (part: string) => {
    if (part.includes('ETA')) {
      return {
        borderColor: 'var(--border)',
        background: 'var(--panel)',
        color: 'var(--muted)',
      };
    }
    if (part.includes('DA')) {
      return {
        borderColor: 'color-mix(in srgb, var(--success) 40%, transparent)',
        background: 'color-mix(in srgb, var(--success) 12%, transparent)',
        color: 'var(--success)',
      };
    }
    if (part.includes('NU')) {
      return {
        borderColor: 'color-mix(in srgb, var(--danger) 40%, transparent)',
        background: 'color-mix(in srgb, var(--danger) 12%, transparent)',
        color: 'var(--danger)',
      };
    }
    return {
      borderColor: 'var(--border)',
      background: 'var(--panel)',
      color: 'var(--muted)',
    };
  };

  return (
    <section className={wrapperClassName}>
      <div className="min-w-0">
        {isReceipts ? (
          <>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                  Finance
                </div>
                <div className="display-title truncate text-2xl font-semibold tracking-[-0.06em] sm:text-[2rem]">
                  {app.name}
                </div>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <Link className="btn-base btn-tonal" href="/receipts">
                <span className="truncate text-base font-semibold tracking-tight">
                  Open receipts
                </span>
                <span aria-hidden="true" className="btn-tonal__icon">
                  →
                </span>
              </Link>
              <Link className="btn-base btn-secondary" href="/receipts/charts">
                Charts
              </Link>
            </div>
          </>
        ) : isTermo ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                Infra
              </div>
              <div className="truncate text-lg font-semibold tracking-tight">{app.name}</div>
              <StatusPill status={app.status} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-sm">
              {termoParts.map((part) => (
                <span
                  key={part}
                  className="rounded-full border px-2.5 py-1 font-semibold"
                  style={termoBadgeStyle(part)}
                >
                  {part}
                </span>
              ))}
            </div>
            {app.home_url ? (
              app.home_url.startsWith('/') ? (
                <Link className="btn-base btn-secondary mt-4" href={app.home_url}>
                  Open termo alert
                </Link>
              ) : (
                <a
                  className="btn-base btn-secondary mt-4"
                  href={app.home_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open termo alert
                </a>
              )
            ) : null}
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                App
              </div>
              <div className="truncate text-lg font-semibold tracking-tight">{app.name}</div>
              <StatusPill status={app.status} />
            </div>
            <div className="mt-4 text-sm leading-6 text-[var(--muted)]">
              {app.description}
            </div>
            {app.home_url ? (
              app.home_url.startsWith('/') ? (
                <Link className="btn-base btn-secondary mt-4" href={app.home_url}>
                  Open
                </Link>
              ) : (
                <a
                  className="btn-base btn-secondary mt-4"
                  href={app.home_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open
                </a>
              )
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}

export type { AppRow };
