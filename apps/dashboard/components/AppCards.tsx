'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { AppCard, type AppRow } from './AppCard';

type AppCardsProps = {
  slugs?: string[];
  excludeSlugs?: string[];
};

type ReceiptSummaryRow = {
  total_amount: number | null;
  receipt_date: string | null;
  currency: string | null;
};

export function AppCards({ slugs, excludeSlugs }: AppCardsProps) {
  const [apps, setApps] = useState<AppRow[] | null>(null);
  const [receiptsSummary, setReceiptsSummary] = useState<{
    count: number;
    totalMonth: number;
    totalPrevMonth: number;
    hasPrevMonth: boolean;
    currency: string;
  } | null>(null);
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

  useEffect(() => {
    if (!apps?.length) return;
    const hasReceipts = apps.some((app) => app.slug === 'receipts');
    if (!hasReceipts) return;

    let alive = true;
    (async () => {
      const { count, error: countErr } = await supabase
        .from('receipts')
        .select('id', { count: 'exact', head: true });

      if (!alive) return;
      if (countErr) {
        setReceiptsSummary(null);
        return;
      }

      const { data: latest, error: latestErr } = await supabase
        .from('receipts')
        .select('total_amount,receipt_date,currency')
        .order('receipt_date', { ascending: false })
        .limit(1000);

      if (!alive) return;
      if (latestErr) {
        setReceiptsSummary(null);
        return;
      }

      const now = new Date();
      const month = now.getMonth();
      const year = now.getFullYear();
      const startOfMonth = new Date(year, month, 1).getTime();
      const startOfPrevMonth = new Date(year, month - 1, 1).getTime();
      const endOfPrevMonth = startOfMonth - 1;

      let totalMonth = 0;
      let totalPrevMonth = 0;

      ((latest as ReceiptSummaryRow[] | null) ?? []).forEach((row) => {
        const ts = row.receipt_date ? new Date(row.receipt_date).getTime() : null;
        if (!ts) return;
        const amount = row.total_amount ?? 0;
        if (ts >= startOfMonth) totalMonth += amount;
        if (ts >= startOfPrevMonth && ts <= endOfPrevMonth) totalPrevMonth += amount;
      });

      setReceiptsSummary({
        count: count ?? 0,
        totalMonth,
        totalPrevMonth,
        hasPrevMonth: totalPrevMonth > 0,
        currency: latest?.[0]?.currency ?? 'RON',
      });
    })();

    return () => {
      alive = false;
    };
  }, [apps]);

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

  const filteredApps = apps.filter((app) => {
    if (slugs?.length) return slugs.includes(app.slug);
    if (excludeSlugs?.length) return !excludeSlugs.includes(app.slug);
    return true;
  });

  const orderedApps = slugs?.length
    ? [...filteredApps].sort((a, b) => slugs.indexOf(a.slug) - slugs.indexOf(b.slug))
    : filteredApps;

  // IMPORTANT: fără wrapper “Apps”. Returnăm direct cardurile.
  return (
    <>
      {orderedApps.map((a) => (
        <AppCard
          key={a.id}
          app={a}
          receiptsSummary={a.slug === 'receipts' ? receiptsSummary : null}
        />
      ))}
    </>
  );
}
