import Link from 'next/link';
import TermoPageClient from './TermoPageClient';
import type { AppRow, PeriodRow, RunRow } from './types';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

const APP_SLUG = 'termo-alert';

async function loadTermoData() {
  try {
    const supabase = await createSupabaseServerClient();

    const { data: appData, error: appErr } = await supabase
      .from('apps')
      .select('id,slug,name,description,status,last_run_at,github_url,chat_url,home_url')
      .eq('slug', APP_SLUG)
      .maybeSingle();

    if (appErr) {
      return { error: appErr.message } as const;
    }

    if (!appData) {
      return {
        app: null,
        run: null,
        periods: [],
        error: null,
      } as const;
    }

    const [runResult, periodsResult] = await Promise.all([
      supabase
        .from('app_runs')
        .select('id,created_at,started_at,ended_at,success,summary,metrics')
        .eq('app_id', appData.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('termo_status_periods')
        .select('id,started_at,ended_at,hot_water_status,heat_status,eta,details')
        .eq('app_id', appData.id)
        .order('started_at', { ascending: true }),
    ]);

    if (runResult.error) {
      return { error: runResult.error.message } as const;
    }

    if (periodsResult.error) {
      return { error: periodsResult.error.message } as const;
    }

    return {
      app: appData as AppRow,
      run: (runResult.data as RunRow | null) ?? null,
      periods: (periodsResult.data as PeriodRow[] | null) ?? [],
      error: null,
    } as const;
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Nu am putut încărca pagina Termo.',
    } as const;
  }
}

export default async function TermoPage() {
  const { app, run, periods, error } = await loadTermoData();

  if (error) {
    return (
      <main className="min-h-screen bg-[var(--bg)] p-4 sm:p-6">
        <div className="mx-auto max-w-4xl rounded-3xl border border-[var(--border)] bg-[var(--panel)] p-5 shadow-sm">
          <div className="font-semibold text-rose-300">Eroare</div>
          <div className="mt-2 text-sm text-[var(--muted)]">{error}</div>
          <div className="mt-4">
            <Link className="page-back-link" href="/">
              ← Înapoi
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (!app) {
    return (
      <main className="min-h-screen bg-[var(--bg)] p-4 sm:p-6">
        <div className="mx-auto max-w-4xl rounded-3xl border border-[var(--border)] bg-[var(--panel)] p-5 shadow-sm">
          <div className="font-semibold text-rose-300">Termo alert lipsește</div>
          <div className="mt-2 text-sm text-[var(--muted)]">
            App-ul nu există încă în Supabase. Rulează checker-ul o dată și revino aici.
          </div>
          <div className="mt-4">
            <Link className="page-back-link" href="/">
              ← Înapoi
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return <TermoPageClient app={app} run={run} periods={periods} />;
}
