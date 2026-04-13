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
  metrics: {
    data?: {
      sector?: string | null;
      eta?: string | null;
      agent?: string | null;
      cause?: string | null;
      zone?: string | null;
    };
    service?: {
      hot_water?: string | null;
      heat?: string | null;
    };
    service_state?: AppRow['status'];
    source_url?: string | null;
  } | null;
};

const APP_SLUG = 'termo-alert';
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function fmt(ts: string | null) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('ro-RO');
}

export default function TermoPage() {
  const [app, setApp] = useState<AppRow | null>(null);
  const [run, setRun] = useState<RunRow | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pushSupported] = useState(
    () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  );
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission | null>(
    () => (typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : null)
  );
  const [pushError, setPushError] = useState<string | null>(null);
  const [pushLoading, setPushLoading] = useState(false);

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

      setApp(appData as AppRow);

      const { data: runData, error: runErr } = await supabase
        .from('app_runs')
        .select('id,created_at,started_at,ended_at,success,summary,metrics')
        .eq('app_id', appData.id)
        .order('created_at', { ascending: false })
        .limit(1);

      if (!alive) return;
      if (runErr) {
        setErr(runErr.message);
        return;
      }

      setRun(((runData ?? [])[0] as RunRow | undefined) ?? null);
    })();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!pushSupported) return;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        setPushEnabled(Boolean(sub));
      })
      .catch(() => {
        setPushEnabled(false);
      });
  }, [pushSupported]);

  async function enableNotifications() {
    if (!pushSupported) return;
    setPushLoading(true);
    setPushError(null);
    try {
      if (Notification.permission === 'denied') {
        setPushError('Notificările sunt blocate în browser.');
        setPushLoading(false);
        return;
      }

      const permission = await Notification.requestPermission();
      setPushPermission(permission);
      if (permission !== 'granted') {
        setPushError('Permisiunea pentru notificări nu a fost acordată.');
        setPushLoading(false);
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        if (!VAPID_PUBLIC_KEY) {
          setPushError('Lipsește cheia publică VAPID.');
          setPushLoading(false);
          return;
        }
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }

      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription,
          appSlug: APP_SLUG,
          userAgent: navigator.userAgent,
        }),
      });

      if (!res.ok) {
        setPushError('Nu am putut salva abonarea.');
        setPushLoading(false);
        return;
      }

      setPushEnabled(true);
      setPushLoading(false);
    } catch {
      setPushError('Nu am putut activa notificările.');
      setPushLoading(false);
    }
  }

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

  if (!app || run === null) {
    return (
      <main className="min-h-screen bg-[var(--bg)] p-4 sm:p-6">
        <div className="mx-auto max-w-4xl rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4 shadow-sm">
          <div className="text-sm text-[var(--muted)]">Se încarcă…</div>
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
    <main className="min-h-screen bg-[var(--bg)] p-4 sm:p-6">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center justify-between gap-4">
          <Link className="text-sm underline" href="/">
            ← Înapoi
          </Link>
          <StatusPill status={app.status} />
        </div>

        <div className="mt-3 overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--panel)] shadow-sm">
          <div className="border-b border-[var(--border)] bg-gradient-to-r from-slate-900/70 via-slate-900/40 to-slate-900/70 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xl font-bold">♨️ Termo alert</div>
                <div className="mt-2 text-sm text-[var(--muted)]">{app.description}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-[var(--muted)]">Last run</div>
                <div className="mt-1 text-sm font-semibold text-[var(--text)]/90">{fmt(app.last_run_at)}</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] p-4">
              <div className="text-xs text-[var(--muted)]">Status apa calda</div>
              <div className="mt-2 flex items-center gap-2 text-lg font-semibold">
                <span className={hotWaterOk ? 'text-emerald-300' : 'text-rose-300'}>
                  {hotWaterOk ? 'DA' : 'NU'}
                </span>
                <span className="text-base">{hotWaterOk ? '✅' : '❌'}</span>
              </div>
              <div className="mt-2 text-xs text-[var(--muted)]">ACC</div>
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] p-4">
              <div className="text-xs text-[var(--muted)]">Status incalzire</div>
              <div className="mt-2 flex items-center gap-2 text-lg font-semibold">
                <span className={heatOk ? 'text-emerald-300' : 'text-rose-300'}>
                  {heatOk ? 'DA' : 'NU'}
                </span>
                <span className="text-base">{heatOk ? '✅' : '❌'}</span>
              </div>
              <div className="mt-2 text-xs text-[var(--muted)]">INC</div>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="text-base font-semibold">🔎 Detalii complete</div>
            <div className="text-xs text-[var(--muted)]">adresa ta + status</div>
          </div>
          {!data ? (
            <div className="mt-2 text-sm text-[var(--muted)]">
              Nu avem detalii de avarie pentru adresa ta.
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-3">
                <div className="text-xs text-[var(--muted)]">Sector</div>
                <div className="mt-1 text-sm font-semibold">{data.sector ?? '—'}</div>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-3">
                <div className="text-xs text-[var(--muted)]">ETA repornire</div>
                <div className="mt-1 text-sm font-semibold">{data.eta ?? '—'}</div>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-3 sm:col-span-2">
                <div className="text-xs text-[var(--muted)]">Agent termic afectat</div>
                <div className="mt-1 text-sm font-semibold">{data.agent ?? '—'}</div>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-3 sm:col-span-2">
                <div className="text-xs text-[var(--muted)]">Cauza / descriere</div>
                <div className="mt-1 text-sm text-[var(--muted)]">{data.cause ?? '—'}</div>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-3 sm:col-span-2">
                <div className="text-xs text-[var(--muted)]">Zona afectata (exact cum apare pe site)</div>
                <pre className="mt-2 whitespace-pre-wrap text-sm text-[var(--muted)]">{data.zone ?? '—'}</pre>
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5 shadow-sm">
          <div className="text-base font-semibold">🔔 Notificări</div>
          {!pushSupported ? (
            <div className="mt-2 text-sm text-[var(--muted)]">
              Browserul nu suportă notificări push.
            </div>
          ) : (
            <div className="mt-2 text-sm text-[var(--muted)]">
              {pushEnabled ? 'Notificările sunt active.' : 'Primește alertă la schimbarea statusului.'}
            </div>
          )}
          {pushSupported && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                className="rounded-full border border-[var(--border)] bg-[var(--panel-2)] px-4 py-2 text-sm font-semibold transition hover:border-emerald-400/50 hover:text-emerald-200 disabled:opacity-60"
                onClick={enableNotifications}
                disabled={pushLoading || pushEnabled}
              >
                {pushEnabled ? 'Activat' : pushLoading ? 'Se activează…' : 'Activează notificările'}
              </button>
              {pushPermission === 'denied' ? (
                <span className="text-xs text-rose-300">Permisiune blocată în browser.</span>
              ) : null}
              {pushError ? <span className="text-xs text-rose-300">{pushError}</span> : null}
            </div>
          )}
          <div className="mt-3 text-xs text-[var(--muted)]">
            Pe iOS notificările funcționează doar după “Add to Home Screen”.
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5 shadow-sm">
          <div className="text-base font-semibold">🔗 Surse</div>
          <div className="mt-2 flex flex-wrap gap-3 text-sm">
            {metrics?.source_url ? (
              <a className="underline" href={metrics.source_url} target="_blank" rel="noreferrer">
                CMTEB
              </a>
            ) : (
              <span className="text-[var(--muted)]">CMTEB</span>
            )}
            {app.github_url ? (
              <a className="underline" href={app.github_url} target="_blank" rel="noreferrer">
                GitHub
              </a>
            ) : (
              <span className="text-[var(--muted)]">GitHub</span>
            )}
            {app.chat_url ? (
              <a className="underline" href={app.chat_url} target="_blank" rel="noreferrer">
                Chat
              </a>
            ) : (
              <span className="text-[var(--muted)]">Chat</span>
            )}
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4 shadow-sm">
          <div className="text-base font-semibold">🧪 Ultima rulare</div>
          <div className="mt-2 text-sm text-[var(--muted)]">{run?.summary ?? '—'}</div>
          <pre className="mt-2 overflow-auto rounded-lg bg-[var(--panel-2)] p-2 text-xs text-[var(--muted)]">
{JSON.stringify(run?.metrics ?? {}, null, 2)}
          </pre>
        </div>
      </div>
    </main>
  );
}
