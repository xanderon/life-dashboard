'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { supabase } from '../../../lib/supabaseClient';
import { StatusPill } from '../../../components/StatusPill';

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
  metrics: any;
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

      setApp(appData as any);

      const { data: runData, error: runErr } = await supabase
        .from('app_runs')
        .select('id,created_at,started_at,ended_at,success,summary,metrics')
        .eq('app_id', (appData as any).id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (!alive) return;
      if (runErr) {
        setErr(runErr.message);
        return;
      }
      setRuns((runData as any) ?? []);
    })();

    return () => {
      alive = false;
    };
  }, [slug]);

  if (err) {
    return (
      <main className="min-h-screen bg-[var(--bg)] p-4 sm:p-6">
        <div className="mx-auto max-w-4xl rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4 shadow-sm">
          <div className="font-semibold text-rose-300">Eroare</div>
          <div className="mt-2 text-sm text-[var(--muted)]">{err}</div>
          <div className="mt-4">
            <Link className="text-sm underline" href="/">
              ← Înapoi
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (!app || runs === null) {
    return (
      <main className="min-h-screen bg-[var(--bg)] p-4 sm:p-6">
        <div className="mx-auto max-w-4xl rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4 shadow-sm">
          <div className="text-sm text-[var(--muted)]">Se încarcă…</div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--bg)] p-4 sm:p-6">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center justify-between gap-4">
          <Link className="text-sm underline" href="/">
            ← Înapoi
          </Link>
          <StatusPill status={app.status} />
        </div>

        <div className="mt-3 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4 shadow-sm">
          <div className="text-xl font-bold">{app.name}</div>
          <div className="mt-2 text-sm text-[var(--muted)]">{app.description}</div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-3">
              <div className="text-xs text-[var(--muted)]">Last run</div>
              <div className="mt-1 text-sm font-semibold">{fmt(app.last_run_at)}</div>
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-3">
              <div className="text-xs text-[var(--muted)]">Links</div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                {app.home_url ? <a className="underline" href={app.home_url}>Open UI</a> : <span className="text-[var(--muted)]">Open UI</span>}
                {app.github_url ? <a className="underline" href={app.github_url}>GitHub</a> : <span className="text-[var(--muted)]">GitHub</span>}
                {app.chat_url ? <a className="underline" href={app.chat_url}>Chat</a> : <span className="text-[var(--muted)]">Chat</span>}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4 shadow-sm">
          <div className="text-base font-semibold">🧪 Ultimele rulări</div>

          {runs.length === 0 ? (
            <div className="mt-2 text-sm text-[var(--muted)]">Nicio rulare încă.</div>
          ) : (
            <div className="mt-3 space-y-3">
              {runs.map((r) => (
                <div key={r.id} className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold">
                      {r.success === true ? '✅ Success' : r.success === false ? '❌ Failed' : '⏳ Unknown'}
                    </div>
                    <div className="text-xs text-[var(--muted)]">{fmt(r.created_at)}</div>
                  </div>
                  {r.summary ? <div className="mt-2 text-sm text-[var(--muted)]">{r.summary}</div> : null}
                  <pre className="mt-2 overflow-auto rounded-lg bg-[var(--panel)] p-2 text-xs text-[var(--muted)]">
{JSON.stringify(r.metrics ?? {}, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
