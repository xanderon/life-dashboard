'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { BackLink, PageShell } from '@/components/PageShell';
import { StatusPill } from '@/components/StatusPill';
import { ThemeToggle } from '@/components/ThemeToggle';
import { supabase } from '@/lib/supabaseClient';

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

type RunRow = {
  id: string;
  created_at: string;
  started_at: string;
  ended_at: string | null;
  success: boolean | null;
  summary: string | null;
  metrics: Record<string, unknown> | null;
};

function fmt(ts: string | null) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('ro-RO');
}

export default function AppDetailsPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const [app, setApp] = useState<AppRow | null>(null);
  const [runs, setRuns] = useState<RunRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: appData, error: appErr } = await supabase
        .from('apps')
        .select('id,slug,name,description,status,last_run_at,github_url,chat_url,home_url')
        .eq('slug', slug)
        .maybeSingle();

      if (!alive) return;
      if (appErr) {
        setErr(appErr.message);
        return;
      }
      if (!appData) {
        setErr('App not found');
        return;
      }

      setApp(appData as AppRow);

      const { data: runData, error: runErr } = await supabase
        .from('app_runs')
        .select('id,created_at,started_at,ended_at,success,summary,metrics')
        .eq('app_id', appData.id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (!alive) return;
      if (runErr) {
        setErr(runErr.message);
        return;
      }
      setRuns((runData ?? []) as RunRow[]);
    })();

    return () => {
      alive = false;
    };
  }, [slug]);

  if (err) {
    return (
      <PageShell width="4xl">
        <div className="surface-card surface-card--danger p-5">
          <div className="font-semibold">Eroare</div>
          <div className="mt-2 text-sm text-[var(--muted)]">{err}</div>
          <div className="mt-4">
            <BackLink href="/">Dashboard</BackLink>
          </div>
        </div>
      </PageShell>
    );
  }

  if (!app || runs === null) {
    return (
      <PageShell width="4xl">
        <div className="surface-card p-5">
          <div className="text-sm text-[var(--muted)]">Se încarcă…</div>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell width="4xl">
      <div className="space-y-6">
        <section className="hero-card p-5 sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <span className="eyebrow">App details</span>
              <h1 className="display-title mt-5 text-4xl font-semibold tracking-[-0.06em]">
                {app.name}
              </h1>
              <div className="mt-3 text-base leading-7 text-[var(--muted)]">{app.description}</div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <BackLink href="/">Dashboard</BackLink>
              <ThemeToggle />
              <StatusPill status={app.status} />
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="metric-tile">
              <div className="metric-tile__label">Last run</div>
              <div className="metric-tile__value">{fmt(app.last_run_at)}</div>
            </div>

            <div className="metric-tile">
              <div className="metric-tile__label">Links</div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {app.home_url ? (
                  <a className="page-back-link !px-3 !py-2 !text-[0.72rem]" href={app.home_url}>
                    Open UI
                  </a>
                ) : (
                  <span className="page-back-link !cursor-default !px-3 !py-2 !text-[0.72rem] opacity-40">
                    Open UI
                  </span>
                )}
                {app.github_url ? (
                  <a className="page-back-link !px-3 !py-2 !text-[0.72rem]" href={app.github_url}>
                    GitHub
                  </a>
                ) : (
                  <span className="page-back-link !cursor-default !px-3 !py-2 !text-[0.72rem] opacity-40">
                    GitHub
                  </span>
                )}
                {app.chat_url ? (
                  <a className="page-back-link !px-3 !py-2 !text-[0.72rem]" href={app.chat_url}>
                    Chat
                  </a>
                ) : (
                  <span className="page-back-link !cursor-default !px-3 !py-2 !text-[0.72rem] opacity-40">
                    Chat
                  </span>
                )}
              </div>
            </div>
          </div>
        </section>

        <div className="surface-card p-5">
          <div className="text-base font-semibold tracking-tight">Ultimele rulări</div>

          {runs.length === 0 ? (
            <div className="mt-2 text-sm text-[var(--muted)]">Nicio rulare încă.</div>
          ) : (
            <div className="mt-3 space-y-3">
              {runs.map((r) => (
                <div key={r.id} className="metric-tile">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold">
                      {r.success === true ? '✅ Success' : r.success === false ? '❌ Failed' : '⏳ Unknown'}
                    </div>
                    <div className="text-xs text-[var(--muted)]">{fmt(r.created_at)}</div>
                  </div>
                  {r.summary ? <div className="mt-2 text-sm text-[var(--muted)]">{r.summary}</div> : null}
                  <pre className="mt-2 overflow-auto rounded-2xl bg-[var(--panel)] p-3 text-xs text-[var(--muted)]">
{JSON.stringify(r.metrics ?? {}, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
