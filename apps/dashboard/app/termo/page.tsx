'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { StatusPill } from '@/components/StatusPill';

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

const APP_SLUG = 'termo-alert';

function fmt(ts: string | null) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('ro-RO');
}

export default function TermoPage() {
  const [app, setApp] = useState<AppRow | null>(null);
  const [run, setRun] = useState<RunRow | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: appData, error: appErr } = await supabase
        .from('apps')
        .select('id,slug,name,description,status,last_run_at,github_url,chat_url,home_url')
        .eq('slug', APP_SLUG)
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
        .limit(1);

      if (!alive) return;
      if (runErr) {
        setErr(runErr.message);
        return;
      }

      setRun((runData as any)?.[0] ?? null);
    })();

    return () => {
      alive = false;
    };
  }, []);

  if (err) {
    return (
      <main className="min-h-screen bg-gray-50 p-4 sm:p-6">
        <div className="mx-auto max-w-4xl rounded-2xl border bg-white p-4 shadow-sm">
          <div className="font-semibold text-red-600">Eroare</div>
          <div className="mt-2 text-sm text-gray-700">{err}</div>
          <div className="mt-4">
            <Link className="text-sm underline" href="/">
              ← Înapoi
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (!app || run === null) {
    return (
      <main className="min-h-screen bg-gray-50 p-4 sm:p-6">
        <div className="mx-auto max-w-4xl rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-sm text-gray-600">Se încarcă…</div>
        </div>
      </main>
    );
  }

  const metrics = run?.metrics ?? {};
  const data = metrics?.data ?? null;
  const service = metrics?.service ?? null;
  const hotWaterOk = service?.hot_water
    ? service.hot_water === 'ok'
    : (metrics?.service_state ?? app.status) === 'ok';
  const heatOk = service?.heat
    ? service.heat === 'ok'
    : (metrics?.service_state ?? app.status) === 'ok';

  return (
    <main className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center justify-between gap-4">
          <Link className="text-sm underline" href="/">
            ← Înapoi
          </Link>
          <StatusPill status={app.status} />
        </div>

        <div className="mt-3 overflow-hidden rounded-3xl border bg-white shadow-sm">
          <div className="border-b bg-gradient-to-r from-blue-50 via-white to-orange-50 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xl font-bold">🚿 Termo alert</div>
                <div className="mt-2 text-sm text-gray-700">{app.description}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-gray-500">Last run</div>
                <div className="mt-1 text-sm font-semibold">{fmt(app.last_run_at)}</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
            <div className="rounded-2xl border bg-white p-4">
              <div className="text-xs text-gray-500">Status apa calda</div>
              <div className="mt-2 flex items-center gap-2 text-lg font-semibold">
                <span className={hotWaterOk ? 'text-green-700' : 'text-red-700'}>
                  {hotWaterOk ? 'DA' : 'NU'}
                </span>
                <span className="text-base">{hotWaterOk ? '✅' : '❌'}</span>
              </div>
              <div className="mt-2 text-xs text-gray-500">ACC</div>
            </div>

            <div className="rounded-2xl border bg-white p-4">
              <div className="text-xs text-gray-500">Status incalzire</div>
              <div className="mt-2 flex items-center gap-2 text-lg font-semibold">
                <span className={heatOk ? 'text-green-700' : 'text-red-700'}>
                  {heatOk ? 'DA' : 'NU'}
                </span>
                <span className="text-base">{heatOk ? '✅' : '❌'}</span>
              </div>
              <div className="mt-2 text-xs text-gray-500">INC</div>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="text-base font-semibold">🔎 Detalii complete</div>
            <div className="text-xs text-gray-500">adresa ta + status</div>
          </div>
          {!data ? (
            <div className="mt-2 text-sm text-gray-600">
              Nu avem detalii de avarie pentru adresa ta.
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-xl border p-3">
                <div className="text-xs text-gray-500">Sector</div>
                <div className="mt-1 text-sm font-semibold">{data.sector ?? '—'}</div>
              </div>
              <div className="rounded-xl border p-3">
                <div className="text-xs text-gray-500">ETA repornire</div>
                <div className="mt-1 text-sm font-semibold">{data.eta ?? '—'}</div>
              </div>
              <div className="rounded-xl border p-3 sm:col-span-2">
                <div className="text-xs text-gray-500">Agent termic afectat</div>
                <div className="mt-1 text-sm font-semibold">{data.agent ?? '—'}</div>
              </div>
              <div className="rounded-xl border p-3 sm:col-span-2">
                <div className="text-xs text-gray-500">Cauza / descriere</div>
                <div className="mt-1 text-sm text-gray-700">{data.cause ?? '—'}</div>
              </div>
              <div className="rounded-xl border p-3 sm:col-span-2">
                <div className="text-xs text-gray-500">Zona afectata (exact cum apare pe site)</div>
                <pre className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{data.zone ?? '—'}</pre>
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-base font-semibold">🔗 Surse</div>
          <div className="mt-2 flex flex-wrap gap-3 text-sm">
            {metrics?.source_url ? (
              <a className="underline" href={metrics.source_url} target="_blank" rel="noreferrer">
                CMTEB
              </a>
            ) : (
              <span className="text-gray-400">CMTEB</span>
            )}
            {app.github_url ? (
              <a className="underline" href={app.github_url} target="_blank" rel="noreferrer">
                GitHub
              </a>
            ) : (
              <span className="text-gray-400">GitHub</span>
            )}
            {app.chat_url ? (
              <a className="underline" href={app.chat_url} target="_blank" rel="noreferrer">
                Chat
              </a>
            ) : (
              <span className="text-gray-400">Chat</span>
            )}
          </div>
        </div>

        <div className="mt-4 rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-base font-semibold">🧪 Ultima rulare</div>
          <div className="mt-2 text-sm text-gray-700">{run?.summary ?? '—'}</div>
          <pre className="mt-2 overflow-auto rounded-lg bg-gray-50 p-2 text-xs text-gray-700">
{JSON.stringify(run?.metrics ?? {}, null, 2)}
          </pre>
        </div>
      </div>
    </main>
  );
}
