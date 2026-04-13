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

type ReceiptsSummary = {
  count: number;
  totalMonth: number;
  totalPrevMonth: number;
  hasPrevMonth: boolean;
  currency: string;
} | null;

export function AppCard({
  app,
  receiptsSummary,
}: {
  app: AppRow;
  receiptsSummary?: ReceiptsSummary;
}) {
  const isTermo = app.slug === 'termo-alert';
  const isReceipts = app.slug === 'receipts';
  const accentToneStyle = isReceipts
    ? {
        borderColor: 'color-mix(in srgb, var(--accent) 38%, transparent)',
        background:
          'color-mix(in srgb, var(--accent-soft) 72%, transparent)',
      }
    : isTermo
      ? {
          borderColor: 'color-mix(in srgb, var(--accent-warm) 32%, transparent)',
          background:
            'color-mix(in srgb, var(--accent-warm) 12%, transparent)',
        }
      : {
          borderColor: 'var(--border)',
          background:
            'color-mix(in srgb, var(--panel-2) 84%, transparent)',
        };
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
    <section className="surface-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <span
              className="rounded-full border px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]"
              style={accentToneStyle}
            >
              {isReceipts ? 'Finance' : isTermo ? 'Infra' : 'App'}
            </span>
            <div className="truncate text-lg font-semibold tracking-tight">{app.name}</div>
            <StatusPill status={app.status} />
          </div>
          {isReceipts && receiptsSummary ? (
            <div className="mt-4 space-y-3 text-sm">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="metric-tile">
                  <div className="metric-tile__label">Bonuri</div>
                  <div className="metric-tile__value">{receiptsSummary.count}</div>
                </div>
                <div className="metric-tile">
                  <div className="metric-tile__label">Luna curentă</div>
                  <div className="metric-tile__value">
                    {receiptsSummary.totalMonth.toFixed(2)} {receiptsSummary.currency}
                  </div>
                </div>
                <div className="metric-tile">
                  <div className="metric-tile__label">Luna trecută</div>
                  <div className="metric-tile__value">
                    {receiptsSummary.hasPrevMonth
                      ? `${receiptsSummary.totalPrevMonth.toFixed(2)} ${receiptsSummary.currency}`
                      : '—'}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Link
                  className="btn-base btn-primary"
                  href="/receipts"
                >
                  Open receipts
                </Link>
                <Link
                  className="btn-base btn-secondary"
                  href="/receipts/charts"
                >
                  View charts
                </Link>
              </div>
            </div>
          ) : isTermo ? (
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
          ) : (
            <div className="mt-4 text-sm leading-6 text-[var(--muted)]">
              {app.description}
            </div>
          )}
        </div>

        <div className="text-right">
          <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">Last run</div>
          <div className="mt-1 text-xs font-semibold text-[var(--text)]/80">{fmt(app.last_run_at)}</div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
        <span className="text-[0.68rem] font-semibold uppercase tracking-[0.18em]">Quick actions</span>
        <Link className="page-back-link !px-3 !py-2 !text-[0.72rem]" href={`/apps/${app.slug}`} aria-label="Details">
          Details
        </Link>
        {isReceipts ? (
          <Link
            className="page-back-link !px-3 !py-2 !text-[0.72rem]"
            href="/receipts/charts"
            aria-label="Charts"
          >
            Charts
          </Link>
        ) : null}
        {app.home_url ? (
          app.home_url.startsWith('/') ? (
            <Link
              className="page-back-link !px-3 !py-2 !text-[0.72rem]"
              href={app.home_url}
              aria-label="Open UI"
            >
              Open
            </Link>
          ) : (
            <a
              className="page-back-link !px-3 !py-2 !text-[0.72rem]"
              href={app.home_url}
              target="_blank"
              rel="noreferrer"
              aria-label="Open UI"
            >
              Open
            </a>
          )
        ) : (
          <span className="page-back-link !cursor-default !px-3 !py-2 !text-[0.72rem] opacity-40" aria-label="Open UI">
            Open
          </span>
        )}
        {app.github_url ? (
          <a className="page-back-link !px-3 !py-2 !text-[0.72rem]" href={app.github_url} target="_blank" rel="noreferrer" aria-label="GitHub">
            GitHub
          </a>
        ) : (
          <span className="page-back-link !cursor-default !px-3 !py-2 !text-[0.72rem] opacity-40" aria-label="GitHub">
            GitHub
          </span>
        )}
        {app.chat_url ? (
          <a className="page-back-link !px-3 !py-2 !text-[0.72rem]" href={app.chat_url} target="_blank" rel="noreferrer" aria-label="Chat">
            Chat
          </a>
        ) : (
          <span className="page-back-link !cursor-default !px-3 !py-2 !text-[0.72rem] opacity-40" aria-label="Chat">
            Chat
          </span>
        )}
      </div>
    </section>
  );
}

export type { AppRow };
