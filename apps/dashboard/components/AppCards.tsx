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
    <section className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm">
      <div className="text-sm font-semibold text-red-800">Eroare DB</div>
      <div className="mt-1 text-sm text-red-700">{err}</div>
    </section>
  );
}


  if (apps === null) {
    // un card placeholder cât se încarcă, ca să nu fie “gol”
    return (
      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="text-lg font-semibold">🧩 Apps</div>
        <div className="mt-2 text-sm text-gray-600">Loading…</div>
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
