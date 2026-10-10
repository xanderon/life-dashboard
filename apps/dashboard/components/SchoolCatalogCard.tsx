'use client';

import { ArrowUpRight, GraduationCap, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

type CatalogSnapshot = {
  studentName: string | null;
  subjects: { name: string; grades: number[] }[];
  gradeCount: number;
  unexcusedAbsences: number;
  excusedAbsences: number;
  fetchedAt: string;
};

type LoadState = 'loading' | 'ready' | 'error';

export function SchoolCatalogCard() {
  const [state, setState] = useState<LoadState>('loading');
  const [snapshot, setSnapshot] = useState<CatalogSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState('loading');
    setError(null);
    try {
      const response = await fetch('/api/scoala-noua/summary', { cache: 'no-store' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error ?? 'Catalog indisponibil.');
      setSnapshot(payload as CatalogSnapshot);
      setState('ready');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Catalog indisponibil.');
      setState('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const recentGrades = snapshot?.subjects.flatMap((subject) => subject.grades).slice(-5) ?? [];

  return (
    <section className="surface-card surface-card--personal p-4 sm:p-5">
      <div className="app-card-shell min-w-0">
        <div className="app-card-head">
          <div className="app-card-meta">
            <div className="app-card-kicker">Școală</div>
            <div className="app-card-title truncate text-lg">Catalog virtual</div>
            <div className="mt-2 text-sm text-[var(--muted)]">
              {state === 'loading'
                ? 'Se conectează în siguranță la ȘcoalaNouă…'
                : state === 'error'
                  ? error
                  : snapshot?.studentName ?? 'Situația școlară'}
            </div>
          </div>
          <span className="app-card-icon"><GraduationCap aria-hidden="true" /></span>
        </div>

        {state === 'ready' && snapshot ? (
          <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] px-2 py-2.5">
              <div className="text-lg font-semibold text-[var(--text)]">{snapshot.gradeCount}</div>
              <div className="mt-0.5 text-[var(--muted)]">note</div>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] px-2 py-2.5">
              <div className="text-lg font-semibold text-[var(--text)]">{snapshot.unexcusedAbsences}</div>
              <div className="mt-0.5 text-[var(--muted)]">nemotivate</div>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] px-2 py-2.5">
              <div className="text-lg font-semibold text-[var(--text)]">{snapshot.excusedAbsences}</div>
              <div className="mt-0.5 text-[var(--muted)]">motivate</div>
            </div>
          </div>
        ) : null}

        {state === 'ready' && recentGrades.length ? (
          <div className="mt-3 text-xs text-[var(--muted)]">
            <span>Note înregistrate:</span>
            <span className="ml-1 inline-flex flex-wrap gap-1 align-middle">
              {recentGrades.map((grade, index) => (
                <span className="rounded-md border border-[color-mix(in_srgb,var(--accent)_28%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_10%,var(--panel-2))] px-1.5 py-0.5 font-semibold text-[var(--text)]" key={`${grade}-${index}`}>{grade}</span>
              ))}
            </span>
          </div>
        ) : null}

        <div className="app-card-footer mt-4 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <Link className="app-open-button" href="/catalog">
            <span className="app-open-button__icon"><GraduationCap aria-hidden="true" /></span>
            <span>Deschide catalogul</span>
            <ArrowUpRight aria-hidden="true" className="h-4 w-4 text-[var(--muted)]" />
          </Link>
          <button
            aria-label="Reîncarcă catalogul"
            className="btn-base btn-secondary !min-h-0 !px-3"
            disabled={state === 'loading'}
            onClick={() => void load()}
            type="button"
          >
            <RefreshCw aria-hidden="true" className={`h-4 w-4 ${state === 'loading' ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
    </section>
  );
}
