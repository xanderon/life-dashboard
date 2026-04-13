'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { AppCard, type AppRow } from './AppCard';

type AppCardsProps = {
  slugs?: string[];
  excludeSlugs?: string[];
};

const HIDDEN_APP_SLUGS = new Set(['sprintpulse', 'study-coach']);

export function AppCards({ slugs, excludeSlugs }: AppCardsProps) {
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
      setApps((data as AppRow[] | null) ?? []);
    })();

    return () => {
      alive = false;
    };
  }, []);

  if (err) {
    return (
      <section className="surface-card surface-card--danger p-5">
        <div className="text-sm font-semibold">Eroare DB</div>
        <div className="mt-1 text-sm text-[var(--muted)]">{err}</div>
      </section>
    );
  }


  if (apps === null) {
    return (
      <section className="surface-card p-5">
        <div className="text-lg font-semibold tracking-tight">Apps</div>
        <div className="mt-2 text-sm text-[var(--muted)]">Loading…</div>
      </section>
    );
  }

  const filteredApps = apps.filter((app) => {
    if (HIDDEN_APP_SLUGS.has(app.slug)) return false;
    if (slugs?.length) return slugs.includes(app.slug);
    if (excludeSlugs?.length) return !excludeSlugs.includes(app.slug);
    return true;
  });

  const orderedApps = slugs?.length
    ? [...filteredApps].sort((a, b) => slugs.indexOf(a.slug) - slugs.indexOf(b.slug))
    : filteredApps;

  return (
    <>
      {orderedApps.map((a) => (
        <AppCard key={a.id} app={a} />
      ))}
    </>
  );
}
