'use client';

import {
  ArrowUpRight,
  FileText,
  Flame,
  Radio,
  Sparkles,
  Waves,
} from 'lucide-react';
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

function variantForSlug(slug: string) {
  if (slug === 'receipts') {
    return {
      family: 'finance',
      kicker: 'Finance',
      icon: <FileText aria-hidden="true" />,
    };
  }
  if (slug === 'termo-alert') {
    return {
      family: 'infra',
      kicker: 'Infra',
      icon: <Waves aria-hidden="true" />,
    };
  }
  if (slug === 'cut-coach' || slug === 'nutrition') {
    return {
      family: 'nutrition',
      kicker: 'Nutrition',
      icon: <Flame aria-hidden="true" />,
    };
  }
  if (slug === 'tricorder') {
    return {
      family: 'tools',
      kicker: 'Tools',
      icon: <Radio aria-hidden="true" />,
    };
  }
  return {
    family: 'personal',
    kicker: 'App',
    icon: <Sparkles aria-hidden="true" />,
  };
}

export function AppCard({
  app,
}: {
  app: AppRow;
}) {
  const isTermo = app.slug === 'termo-alert';
  const isReceipts = app.slug === 'receipts';
  const variant = variantForSlug(app.slug);
  const wrapperClassName = `surface-card surface-card--${variant.family} ${isReceipts ? 'surface-card--subtle' : ''} p-4 sm:p-5`;
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
      <div className="app-card-shell min-w-0">
        {isReceipts ? (
          <>
            <div className="app-card-head">
              <div className="app-card-meta">
                <div className="app-card-kicker">{variant.kicker}</div>
                <div className="display-title app-card-title truncate text-2xl sm:text-[2rem]">
                  {app.name}
                </div>
                <div className="app-card-description max-w-xl">
                  All receipts, charts, export and cleanup in one place.
                </div>
              </div>
              <span className="app-card-icon">{variant.icon}</span>
            </div>
            <div className="app-card-footer mt-1 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <Link className="app-open-button app-open-button--wide" href="/receipts">
                <span className="app-open-button__icon">{variant.icon}</span>
                <span className="truncate">Open receipts</span>
                <ArrowUpRight aria-hidden="true" className="h-4 w-4 text-[var(--muted)]" />
              </Link>
              <Link className="btn-base btn-secondary" href="/receipts/charts">
                Charts
              </Link>
            </div>
          </>
        ) : isTermo ? (
          <>
            <div className="app-card-head">
              <div className="app-card-meta">
                <div className="app-card-kicker">{variant.kicker}</div>
                <div className="app-card-title truncate text-lg">{app.name}</div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <StatusPill status={app.status} />
                </div>
              </div>
              <span className="app-card-icon">{variant.icon}</span>
            </div>
            <div className="app-card-pills text-sm">
              {termoParts.map((part) => (
                <span
                  key={part}
                  className="app-card-pill"
                  style={termoBadgeStyle(part)}
                >
                  {part}
                </span>
              ))}
            </div>
            {app.home_url ? (
              app.home_url.startsWith('/') ? (
                <Link className="app-open-button app-card-footer" href={app.home_url}>
                  <span className="app-open-button__icon">{variant.icon}</span>
                  <span>Open termo alert</span>
                  <ArrowUpRight aria-hidden="true" className="h-4 w-4 text-[var(--muted)]" />
                </Link>
              ) : (
                <a
                  className="app-open-button app-card-footer"
                  href={app.home_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span className="app-open-button__icon">{variant.icon}</span>
                  <span>Open termo alert</span>
                  <ArrowUpRight aria-hidden="true" className="h-4 w-4 text-[var(--muted)]" />
                </a>
              )
            ) : null}
          </>
        ) : (
          <>
            <div className="app-card-head">
              <div className="app-card-meta">
                <div className="app-card-kicker">{variant.kicker}</div>
                <div className="app-card-title truncate text-lg">{app.name}</div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <StatusPill status={app.status} />
                </div>
              </div>
              <span className="app-card-icon">{variant.icon}</span>
            </div>
            <div className="app-card-description">
              {app.description}
            </div>
            {app.home_url ? (
              app.home_url.startsWith('/') ? (
                <Link className="app-open-button app-card-footer" href={app.home_url}>
                  <span className="app-open-button__icon">{variant.icon}</span>
                  <span>Open</span>
                  <ArrowUpRight aria-hidden="true" className="h-4 w-4 text-[var(--muted)]" />
                </Link>
              ) : (
                <a
                  className="app-open-button app-card-footer"
                  href={app.home_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span className="app-open-button__icon">{variant.icon}</span>
                  <span>Open</span>
                  <ArrowUpRight aria-hidden="true" className="h-4 w-4 text-[var(--muted)]" />
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
