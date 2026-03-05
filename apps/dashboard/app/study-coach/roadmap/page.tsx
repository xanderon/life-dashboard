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

type SessionRow = {
  id: string;
  topic_id: string | null;
  score: 'pass' | 'hard' | 'fail' | null;
  actual_start: string | null;
};

const STATUS_ORDER: ConceptStatus[] = ['new', 'learning', 'reviewing', 'mastered'];
const SNAPSHOT_KEY = 'study-coach-state-v2';
const SYNCED_SESSIONS_KEY_PREFIX = 'study-roadmap-synced-sessions-v1';

function normalizeText(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

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
  const [sessionsPerDay, setSessionsPerDay] = useState<number>(0);

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
      const merged = { ...mapped };

      // Best-effort sync for already completed blocks from Today snapshot.
      const rawSnapshot = window.localStorage.getItem(SNAPSHOT_KEY);
      if (rawSnapshot) {
        try {
          const snapshot = JSON.parse(rawSnapshot) as {
            plannerInput?: { date?: string };
            blocks?: Array<{ topicId: string; objective: string }>;
            currentBlockIdx?: number;
          };
          const snapshotDate = snapshot.plannerInput?.date;
          const today = new Date().toISOString().slice(0, 10);
          const completedBlocks = (snapshot.blocks ?? []).slice(0, snapshot.currentBlockIdx ?? 0);

          if (snapshotDate === today && completedBlocks.length) {
            const { data: sessions } = await supabase
              .from('study_sessions')
              .select('score,topic_id,actual_start')
              .eq('owner_id', resolvedOwner)
              .gte('actual_start', `${today}T00:00:00.000Z`)
              .lt('actual_start', `${today}T23:59:59.999Z`)
              .order('actual_start', { ascending: true });

            const updates: Array<{
              owner_id: string;
              concept_id: string;
              status: ConceptStatus;
              mastery_score: number;
              last_result: 'pass' | 'hard' | 'fail';
              last_reviewed_at: string;
              next_due_date: string;
            }> = [];

            const usable = Math.min(completedBlocks.length, sessions?.length ?? 0);
            for (let i = 0; i < usable; i += 1) {
              const block = completedBlocks[i];
              const session = sessions?.[i] as { score: 'pass' | 'hard' | 'fail' | null } | undefined;
              if (!session?.score) continue;

              const chapterConcepts = concepts.filter((concept) => concept.chapterId === block.topicId);
              const objectiveNorm = normalizeText(block.objective ?? '');
              const concept = chapterConcepts.find((item) => {
                const conceptNorm = normalizeText(item.conceptLabel);
                return conceptNorm === objectiveNorm
                  || conceptNorm.includes(objectiveNorm)
                  || objectiveNorm.includes(conceptNorm);
              });
              if (!concept) continue;

              const prev = merged[concept.conceptId];
              const prevScore = Number(prev?.mastery_score ?? 0);
              const delta = session.score === 'pass' ? 2 : session.score === 'hard' ? 1 : 0;
              const nextScore = Math.max(0, Math.min(10, prevScore + delta));
              const nextStatus: ConceptStatus = nextScore >= 6
                ? 'mastered'
                : nextScore >= 3
                  ? 'reviewing'
                  : nextScore >= 1
                    ? 'learning'
                    : 'new';
              const due = new Date();
              due.setDate(due.getDate() + (session.score === 'pass' ? 7 : session.score === 'hard' ? 3 : 1));

              const nextRow: ProgressRow = {
                concept_id: concept.conceptId,
                status: nextStatus,
                mastery_score: nextScore,
                last_result: session.score,
                last_reviewed_at: new Date().toISOString(),
                next_due_date: due.toISOString().slice(0, 10),
              };
              merged[concept.conceptId] = nextRow;
              updates.push({
                owner_id: resolvedOwner,
                concept_id: concept.conceptId,
                status: nextStatus,
                mastery_score: nextScore,
                last_result: session.score,
                last_reviewed_at: new Date().toISOString(),
                next_due_date: due.toISOString().slice(0, 10),
              });
            }

            if (updates.length) {
              await supabase
                .from('study_concept_progress')
                .upsert(updates, { onConflict: 'owner_id,concept_id' });
            }
          }
        } catch {
          // ignore malformed snapshot
        }
      }

      // Strong sync: consume study_sessions that were not yet mapped into concept progress.
      const syncKey = `${SYNCED_SESSIONS_KEY_PREFIX}:${resolvedOwner}`;
      const syncedIds = new Set<string>(JSON.parse(window.localStorage.getItem(syncKey) ?? '[]') as string[]);
      const { data: sessions, error: sessionsErr } = await supabase
        .from('study_sessions')
        .select('id,topic_id,score,actual_start')
        .eq('owner_id', resolvedOwner)
        .not('score', 'is', null)
        .order('actual_start', { ascending: true })
        .limit(2000);

      if (sessionsErr) {
        setErr(sessionsErr.message);
        setRows(merged);
        return;
      }

      const updates: Array<{
        owner_id: string;
        concept_id: string;
        status: ConceptStatus;
        mastery_score: number;
        last_result: 'pass' | 'hard' | 'fail';
        last_reviewed_at: string;
        next_due_date: string;
      }> = [];

      const pointerByChapter: Record<string, number> = {};
      (sessions ?? []).forEach((sessionRow: SessionRow) => {
        if (syncedIds.has(sessionRow.id)) return;
        if (!sessionRow.topic_id || !sessionRow.score) return;

        const chapterConcepts = concepts.filter((concept) => concept.chapterId === sessionRow.topic_id);
        if (!chapterConcepts.length) return;

        const pointer = pointerByChapter[sessionRow.topic_id] ?? 0;
        const concept = chapterConcepts[pointer % chapterConcepts.length];
        pointerByChapter[sessionRow.topic_id] = pointer + 1;

        const prev = merged[concept.conceptId];
        const prevScore = Number(prev?.mastery_score ?? 0);
        const delta = sessionRow.score === 'pass' ? 2 : sessionRow.score === 'hard' ? 1 : 0;
        const nextScore = Math.max(0, Math.min(10, prevScore + delta));
        const nextStatus: ConceptStatus = nextScore >= 6
          ? 'mastered'
          : nextScore >= 3
            ? 'reviewing'
            : nextScore >= 1
              ? 'learning'
              : 'new';
        const due = new Date();
        due.setDate(due.getDate() + (sessionRow.score === 'pass' ? 7 : sessionRow.score === 'hard' ? 3 : 1));

        merged[concept.conceptId] = {
          concept_id: concept.conceptId,
          status: nextStatus,
          mastery_score: nextScore,
          last_result: sessionRow.score,
          last_reviewed_at: sessionRow.actual_start ?? new Date().toISOString(),
          next_due_date: due.toISOString().slice(0, 10),
        };
        updates.push({
          owner_id: resolvedOwner,
          concept_id: concept.conceptId,
          status: nextStatus,
          mastery_score: nextScore,
          last_result: sessionRow.score,
          last_reviewed_at: sessionRow.actual_start ?? new Date().toISOString(),
          next_due_date: due.toISOString().slice(0, 10),
        });
        syncedIds.add(sessionRow.id);
      });

      if (updates.length) {
        const { error: upsertErr } = await supabase
          .from('study_concept_progress')
          .upsert(updates, { onConflict: 'owner_id,concept_id' });
        if (upsertErr) {
          setErr(upsertErr.message);
        }
      }

      const since = new Date();
      since.setDate(since.getDate() - 14);
      const { data: velocityRows } = await supabase
        .from('study_sessions')
        .select('actual_start')
        .eq('owner_id', resolvedOwner)
        .gte('actual_start', since.toISOString())
        .order('actual_start', { ascending: true });
      const perDay: Record<string, number> = {};
      (velocityRows ?? []).forEach((row: { actual_start: string | null }) => {
        if (!row.actual_start) return;
        const day = row.actual_start.slice(0, 10);
        perDay[day] = (perDay[day] ?? 0) + 1;
      });
      const days = Object.keys(perDay);
      const avg = days.length
        ? Object.values(perDay).reduce((sum, value) => sum + value, 0) / days.length
        : 0;
      setSessionsPerDay(avg);

      window.localStorage.setItem(syncKey, JSON.stringify([...syncedIds]));
      setRows(merged);
    })();

    return () => {
      alive = false;
    };
  }, [concepts]);

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
  const projectedFinish = useMemo(() => {
    const remaining = Math.max(0, overall.total - overall.mastered);
    if (!remaining) return 'Done';
    const conceptPerDay = Math.max(0.4, sessionsPerDay / 2.5);
    const daysNeeded = Math.ceil(remaining / conceptPerDay);
    const eta = new Date();
    eta.setDate(eta.getDate() + daysNeeded);
    return `${eta.toLocaleDateString('ro-RO')} (~${daysNeeded} days)`;
  }, [overall.mastered, overall.total, sessionsPerDay]);

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
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Tile label="Recent pace" value={`${sessionsPerDay.toFixed(1)} sessions/day`} />
            <Tile label="Projected finish" value={projectedFinish} />
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
