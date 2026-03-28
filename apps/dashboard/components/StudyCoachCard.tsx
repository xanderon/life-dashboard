'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type SessionRow = {
  score: 'pass' | 'hard' | 'fail' | null;
};

export function StudyCoachCard() {
  const [done, setDone] = useState(0);
  const [passRate, setPassRate] = useState<number | null>(null);
  const [dueCount, setDueCount] = useState<number | null>(null);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!alive) return;

      const ownerId = user?.id ?? 'local';

      const { data: sessions } = await supabase
        .from('study_sessions')
        .select('score')
        .eq('owner_id', ownerId)
        .gte('actual_start', `${today}T00:00:00.000Z`)
        .lt('actual_start', `${today}T23:59:59.999Z`);

      if (!alive) return;
      const rows = (sessions ?? []) as SessionRow[];
      const graded = rows.filter((row) => row.score);
      const passed = graded.filter((row) => row.score === 'pass').length;

      setDone(rows.length);
      setPassRate(graded.length ? Math.round((passed / graded.length) * 100) : null);

      const { count } = await supabase
        .from('study_gap_cards')
        .select('id', { count: 'exact', head: true })
        .eq('owner_id', ownerId)
        .neq('status', 'mastered')
        .lte('next_due_date', today);

      if (!alive) return;
      setDueCount(count ?? 0);
    })();

    return () => {
      alive = false;
    };
  }, [today]);

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Warcraft III</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">Study Coach + JS Drill Trainer</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            className="rounded-md border border-sky-500/40 bg-sky-500/20 px-2 py-1 text-xs font-semibold hover:bg-sky-500/30"
            href="/study-coach"
          >
            Today
          </Link>
          <Link
            className="rounded-md border border-indigo-500/40 bg-indigo-500/20 px-2 py-1 text-xs font-semibold hover:bg-indigo-500/30"
            href="/study-coach/roadmap"
          >
            Roadmap
          </Link>
          <Link
            className="rounded-md border border-cyan-500/40 bg-cyan-500/20 px-2 py-1 text-xs font-semibold hover:bg-cyan-500/30"
            href="/study-coach/solutions"
          >
            LeetCode HTMLs
          </Link>
          <Link
            className="rounded-md border border-emerald-500/40 bg-emerald-500/20 px-2 py-1 text-xs font-semibold hover:bg-emerald-500/30"
            href="/js-syntax-drill-trainer.html"
          >
            JS Drill
          </Link>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-sm md:grid-cols-5">
        <Tile label="Done today" value={String(done)} />
        <Tile label="Pass rate" value={passRate === null ? '—' : `${passRate}%`} />
        <Tile label="Due reviews" value={dueCount === null ? '—' : String(dueCount)} />
        <Tile label="Drill focus" value="Run -> feedback -> next" />
        <Tile label="Drill set" value="82 micro" />
      </div>

      <div className="mt-3 space-y-2 text-xs text-[var(--muted)]">
        <p>Study flow: read -&gt; recall -&gt; check -&gt; mini-test.</p>
        <p>Drill flow: sintaxa, structuri de date, micro-operatii si repetitie adaptiva.</p>
      </div>
    </section>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2">
      <div className="text-[10px] uppercase text-[var(--muted)]">{label}</div>
      <div className="mt-1 text-sm font-semibold">{value}</div>
    </div>
  );
}
