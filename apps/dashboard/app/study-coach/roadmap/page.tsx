'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { chapterConceptCount, flattenConcepts, getPrioritizedChapters } from '@/lib/studySyllabus';

type ConceptStatus = 'new' | 'learning' | 'reviewing' | 'mastered';

type ProgressRow = {
  concept_id: string;
  status: ConceptStatus;
  mastery_score: number;
  last_result: 'pass' | 'hard' | 'fail' | null;
  next_due_date: string | null;
  last_reviewed_at: string | null;
};

const STATUS_ORDER: ConceptStatus[] = ['new', 'learning', 'reviewing', 'mastered'];

function statusClass(status: ConceptStatus) {
  if (status === 'mastered') return 'border-emerald-500/40 bg-emerald-500/15 text-emerald-100';
  if (status === 'reviewing') return 'border-cyan-500/40 bg-cyan-500/15 text-cyan-100';
  if (status === 'learning') return 'border-amber-500/40 bg-amber-500/15 text-amber-100';
  return 'border-slate-500/40 bg-slate-500/15 text-slate-100';
}

export default function StudyRoadmapPage() {
  const [ownerId, setOwnerId] = useState('local');
  const [rows, setRows] = useState<Record<string, ProgressRow>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const concepts = useMemo(() => flattenConcepts(), []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!alive) return;

      const resolvedOwner = user?.id ?? 'local';
      setOwnerId(resolvedOwner);

      const { data, error } = await supabase
        .from('study_concept_progress')
        .select('concept_id,status,mastery_score,last_result,next_due_date,last_reviewed_at')
        .eq('owner_id', resolvedOwner);

      if (!alive) return;
      if (error) {
        setErr(error.message);
        return;
      }

      const mapped: Record<string, ProgressRow> = {};
      (data ?? []).forEach((row: ProgressRow) => {
        mapped[row.concept_id] = row as ProgressRow;
      });
      setRows(mapped);
    })();

    return () => {
      alive = false;
    };
  }, []);

  const overall = useMemo(() => {
    const total = concepts.length;
    const mastered = concepts.filter((c) => rows[c.conceptId]?.status === 'mastered').length;
    const learning = concepts.filter((c) => rows[c.conceptId]?.status === 'learning').length;
    const reviewing = concepts.filter((c) => rows[c.conceptId]?.status === 'reviewing').length;
    const fresh = total - mastered - learning - reviewing;
    return {
      total,
      mastered,
      learning,
      reviewing,
      fresh,
      completion: total ? Math.round((mastered / total) * 100) : 0,
    };
  }, [concepts, rows]);

  const chapterStats = useMemo(() => {
    return getPrioritizedChapters().map((chapter) => {
      const chapterConcepts = concepts.filter((concept) => concept.chapterId === chapter.id);
      const done = chapterConcepts.filter((concept) => rows[concept.conceptId]?.status === 'mastered').length;
      const reviewing = chapterConcepts.filter((concept) => rows[concept.conceptId]?.status === 'reviewing').length;
      const learning = chapterConcepts.filter((concept) => rows[concept.conceptId]?.status === 'learning').length;
      return {
        chapter,
        total: chapterConcepts.length,
        done,
        reviewing,
        learning,
        completion: chapterConcepts.length ? Math.round((done / chapterConcepts.length) * 100) : 0,
      };
    });
  }, [concepts, rows]);

  async function setStatus(conceptId: string, status: ConceptStatus) {
    setSavingId(conceptId);
    setErr(null);

    const row = rows[conceptId];
    const previousScore = row?.mastery_score ?? 0;
    const nextScore = status === 'mastered' ? Math.max(previousScore, 4) : status === 'reviewing' ? Math.max(previousScore, 2) : status === 'learning' ? 1 : 0;
    const dueDate = new Date();
    if (status === 'mastered') dueDate.setDate(dueDate.getDate() + 14);
    if (status === 'reviewing') dueDate.setDate(dueDate.getDate() + 3);
    if (status === 'learning') dueDate.setDate(dueDate.getDate() + 1);

    const { error } = await supabase
      .from('study_concept_progress')
      .upsert(
        {
          owner_id: ownerId,
          concept_id: conceptId,
          status,
          mastery_score: nextScore,
          last_result: status === 'mastered' ? 'pass' : status === 'reviewing' ? 'hard' : 'fail',
          last_reviewed_at: new Date().toISOString(),
          next_due_date: dueDate.toISOString().slice(0, 10),
        },
        { onConflict: 'owner_id,concept_id' }
      );

    if (error) {
      setErr(error.message);
      setSavingId(null);
      return;
    }

    setRows((prev) => ({
      ...prev,
      [conceptId]: {
        concept_id: conceptId,
        status,
        mastery_score: nextScore,
        last_result: status === 'mastered' ? 'pass' : status === 'reviewing' ? 'hard' : 'fail',
        last_reviewed_at: new Date().toISOString(),
        next_due_date: dueDate.toISOString().slice(0, 10),
      },
    }));
    setSavingId(null);
  }

  return (
    <main className="min-h-screen bg-[var(--bg)] p-4 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <header className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="mb-2 flex gap-2">
                <Link className="rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-3 py-1.5 text-sm font-semibold" href="/">
                  Dashboard
                </Link>
                <Link className="rounded-md border border-sky-500/40 bg-sky-500/20 px-3 py-1.5 text-sm font-semibold" href="/study-coach">
                  Today
                </Link>
              </div>
              <h1 className="text-2xl font-bold">Study Roadmap</h1>
              <p className="mt-1 text-sm text-[var(--muted)]">Capitole ordonate dupa probabilitate de interviu</p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Tile label="Total concepts" value={String(overall.total)} />
            <Tile label="Mastered" value={String(overall.mastered)} />
            <Tile label="Reviewing" value={String(overall.reviewing)} />
            <Tile label="Learning" value={String(overall.learning)} />
            <Tile label="Overall done" value={`${overall.completion}%`} />
          </div>
          {err ? <p className="mt-3 text-sm text-rose-200">DB: {err}</p> : null}
        </header>

        <section className="space-y-3">
          {chapterStats.map((entry) => {
            const chapterConcepts = concepts.filter((concept) => concept.chapterId === entry.chapter.id);
            const grouped = entry.chapter.subchapters.map((subchapter) => ({
              subchapter,
              concepts: chapterConcepts.filter((concept) => concept.subchapterId === subchapter.id),
            }));

            return (
              <details key={entry.chapter.id} className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4 shadow-sm" open={entry.chapter.priority <= 4}>
                <summary className="cursor-pointer list-none">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="text-lg font-semibold">#{entry.chapter.priority} {entry.chapter.title}</h2>
                      <p className="text-xs text-[var(--muted)]">{chapterConceptCount(entry.chapter)} concepts total</p>
                    </div>
                    <div className="text-sm text-[var(--muted)]">{entry.done}/{entry.total} mastered ({entry.completion}%)</div>
                  </div>
                </summary>

                <div className="mt-3 space-y-3">
                  {grouped.map((group) => (
                    <div key={group.subchapter.id} className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-3">
                      <h3 className="text-sm font-semibold">{group.subchapter.title}</h3>
                      <div className="mt-2 space-y-2">
                        {group.concepts.map((concept) => {
                          const row = rows[concept.conceptId];
                          const status: ConceptStatus = row?.status ?? 'new';
                          return (
                            <div key={concept.conceptId} className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-2">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-sm font-medium">{concept.conceptLabel}</p>
                                <span className={`rounded-full border px-2 py-0.5 text-xs ${statusClass(status)}`}>{status}</span>
                              </div>
                              <div className="mt-2 flex flex-wrap gap-1">
                                {STATUS_ORDER.map((option) => (
                                  <button
                                    key={option}
                                    className={`rounded-md border px-2 py-1 text-xs ${option === status ? 'border-sky-400 bg-sky-500/20' : 'border-[var(--border)] bg-[var(--panel-2)]'}`}
                                    disabled={savingId === concept.conceptId}
                                    onClick={() => { void setStatus(concept.conceptId, option); }}
                                  >
                                    {option}
                                  </button>
                                ))}
                              </div>
                              <p className="mt-1 text-xs text-[var(--muted)]">Due: {row?.next_due_date ?? 'not scheduled yet'}</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            );
          })}
        </section>
      </div>
    </main>
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
