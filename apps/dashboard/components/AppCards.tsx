'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { AppCard, type AppRow } from './AppCard';

export function AppCards() {
  const [apps, setApps] = useState<AppRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await supabase
        .from('apps')
        .select('id,slug,name,description,status,last_run_at,github_url,chat_url,home_url')
        .order('position', { ascending: true })
        .order('created_at', { ascending: true });


      if (!alive) return;
      if (error) {
        setErr(error.message);
        setApps([]);
        return;
      }
      setApps((data as any) ?? []);
    })();

    return () => {
      alive = false;
    };
  }, []);

  if (err) {
    return (
      <section className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 shadow-sm">
        <div className="text-sm font-semibold text-rose-200">Eroare DB</div>
        <div className="mt-1 text-sm text-rose-200/80">{err}</div>
      </section>
    );
  }


  if (apps === null) {
    // un card placeholder cât se încarcă, ca să nu fie “gol”
    return (
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5 shadow-sm">
        <div className="text-lg font-semibold">🧩 Apps</div>
        <div className="mt-2 text-sm text-[var(--muted)]">Loading…</div>
      </section>
    );
  }

  // IMPORTANT: fără wrapper “Apps”. Returnăm direct cardurile.
  return (
    <>
      {apps.map((a) => (
        <AppCard key={a.id} app={a} />
      ))}
    </>
  );
}
