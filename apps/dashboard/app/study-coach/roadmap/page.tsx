'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { chapterConceptCount, flattenConcepts, getPrioritizedChapters, INTERVIEW_CORE_CHAPTER_IDS } from '@/lib/studySyllabus';

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

type LeetDifficulty = 'easy' | 'medium';
type PerceivedDifficulty = 'easy' | 'medium' | 'hard';
type LeetCategory =
  | 'arrays'
  | 'binary_search'
  | 'matrix'
  | 'stack'
  | 'queue'
  | 'recursion'
  | 'linked_list'
  | 'binary_tree';

type LeetEntryRow = {
  id: string;
  category: LeetCategory;
  problem_title: string;
  problem_url: string | null;
  solution_file: string | null;
  difficulty: LeetDifficulty;
  perceived_difficulty: PerceivedDifficulty;
  solved_at: string;
  notes: string | null;
};

type SolutionDoc = {
  file: string;
  title: string;
  category: LeetCategory;
  difficulty: LeetDifficulty;
  problemNumber: number | null;
};

const STATUS_ORDER: ConceptStatus[] = ['new', 'learning', 'reviewing', 'mastered'];
const SNAPSHOT_KEY = 'study-coach-state-v2';
const SYNCED_SESSIONS_KEY_PREFIX = 'study-roadmap-synced-sessions-v1';
const INTERVIEW_DEADLINE = '2026-03-16';
const LEET_CATEGORIES: Array<{ id: LeetCategory; label: string }> = [
  { id: 'arrays', label: 'Arrays' },
  { id: 'binary_search', label: 'Binary Search' },
  { id: 'matrix', label: 'Matrix' },
  { id: 'stack', label: 'Stack' },
  { id: 'queue', label: 'Queue' },
  { id: 'recursion', label: 'Recursion' },
  { id: 'linked_list', label: 'Linked List' },
  { id: 'binary_tree', label: 'Binary Tree' },
];

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
  const [leetEntries, setLeetEntries] = useState<LeetEntryRow[]>([]);
  const [solutionDocs, setSolutionDocs] = useState<SolutionDoc[]>([]);
  const [leetSaving, setLeetSaving] = useState(false);
  const [leetForm, setLeetForm] = useState<{
    category: LeetCategory;
    problemTitle: string;
    problemUrl: string;
    solutionFile: string;
    difficulty: LeetDifficulty;
    perceivedDifficulty: PerceivedDifficulty;
    notes: string;
  }>({
    category: 'arrays',
    problemTitle: '',
    problemUrl: '',
    solutionFile: '',
    difficulty: 'easy',
    perceivedDifficulty: 'medium',
    notes: '',
  });
  const [editingLeetId, setEditingLeetId] = useState<string | null>(null);
  const [editLeetForm, setEditLeetForm] = useState<{
    category: LeetCategory;
    problemTitle: string;
    problemUrl: string;
    solutionFile: string;
    difficulty: LeetDifficulty;
    perceivedDifficulty: PerceivedDifficulty;
    notes: string;
  } | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sessionsPerDay, setSessionsPerDay] = useState<number>(0);
  const [scope, setScope] = useState<'core' | 'all'>('core');

  const allConcepts = useMemo(() => flattenConcepts(), []);
  const coreChapterSet = useMemo(
    () => new Set<string>(INTERVIEW_CORE_CHAPTER_IDS),
    []
  );
  const concepts = useMemo(
    () => (scope === 'core' ? allConcepts.filter((concept) => coreChapterSet.has(concept.chapterId)) : allConcepts),
    [allConcepts, coreChapterSet, scope]
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/study-coach/leetcode-solutions', { cache: 'no-store' });
        if (!res.ok) return;
        const payload = (await res.json()) as { docs?: SolutionDoc[] };
        if (!alive) return;
        setSolutionDocs(Array.isArray(payload.docs) ? payload.docs : []);
      } catch {
        // optional feature; ignore
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

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

      const { data: leetData, error: leetErr } = await supabase
        .from('study_leetcode_entries')
        .select('id,category,problem_title,problem_url,solution_file,difficulty,perceived_difficulty,solved_at,notes')
        .eq('owner_id', resolvedOwner)
        .order('solved_at', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(400);
      if (leetErr) {
        setErr(leetErr.message);
      } else {
        setLeetEntries((leetData ?? []) as LeetEntryRow[]);
      }

      window.localStorage.setItem(syncKey, JSON.stringify([...syncedIds]));
      setRows(merged);
    })();

    return () => {
      alive = false;
    };
  }, [allConcepts, concepts]);

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
    return `${eta.toLocaleDateString('ro-RO')} (in ~${daysNeeded} zile, daca mentii ritmul actual)`;
  }, [overall.mastered, overall.total, sessionsPerDay]);
  const deadlineModel = useMemo(() => {
    const now = new Date();
    const deadline = new Date(`${INTERVIEW_DEADLINE}T23:59:59`);
    const msLeft = Math.max(0, deadline.getTime() - now.getTime());
    const daysLeft = Math.max(1, Math.ceil(msLeft / (24 * 3600 * 1000)));
    const covered = overall.mastered + overall.reviewing + overall.learning;
    const remainingFirstPass = Math.max(0, overall.total - covered);
    const requiredNewPerDay = remainingFirstPass / daysLeft;
    const newMinutesPerDay = requiredNewPerDay * 30;
    const srMinutesPerDay = (covered * 2 * 12) / daysLeft;
    const totalMinutesPerDay = Math.round(newMinutesPerDay + srMinutesPerDay);
    const currentConceptsPerDay = Math.max(0.4, sessionsPerDay / 2.5);
    const deltaConcepts = Number((currentConceptsPerDay - requiredNewPerDay).toFixed(1));
    const paceBand = totalMinutesPerDay <= 180 ? 'steady' : totalMinutesPerDay <= 240 ? 'tight' : 'stretch';
    return {
      daysLeft,
      covered,
      remainingFirstPass,
      requiredNewPerDay: requiredNewPerDay.toFixed(1),
      currentConceptsPerDay: currentConceptsPerDay.toFixed(1),
      deltaConcepts,
      totalMinutesPerDay,
      paceBand,
    };
  }, [overall.learning, overall.mastered, overall.reviewing, overall.total, sessionsPerDay]);

  const chapterStats = useMemo(() => {
    return getPrioritizedChapters()
      .filter((chapter) => scope === 'all' || coreChapterSet.has(chapter.id))
      .map((chapter) => {
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
  }, [concepts, coreChapterSet, rows, scope]);

  const leetStats = useMemo(() => {
    const score = (value: LeetDifficulty | PerceivedDifficulty) => (value === 'easy' ? 1 : value === 'medium' ? 2 : 3);
    const byCategory = LEET_CATEGORIES.map((cat) => {
      const entries = leetEntries.filter((entry) => entry.category === cat.id);
      const total = entries.length;
      const easyCount = entries.filter((entry) => entry.difficulty === 'easy').length;
      const mediumCount = entries.filter((entry) => entry.difficulty === 'medium').length;
      const feltHard = entries.filter((entry) => entry.perceived_difficulty === 'hard').length;
      const feltEasyOnMedium = entries.filter((entry) => entry.difficulty === 'medium' && entry.perceived_difficulty === 'easy').length;
      const avgDelta = total
        ? entries.reduce((sum, entry) => sum + (score(entry.perceived_difficulty) - score(entry.difficulty)), 0) / total
        : 0;
      return {
        ...cat,
        total,
        easyCount,
        mediumCount,
        feltHard,
        feltEasyOnMedium,
        avgDelta,
      };
    });

    const total = leetEntries.length;
    const hardFeelingRate = total
      ? Math.round((leetEntries.filter((entry) => entry.perceived_difficulty === 'hard').length / total) * 100)
      : 0;
    const mediumFeltEasyRate = leetEntries.filter((entry) => entry.difficulty === 'medium').length
      ? Math.round(
        (leetEntries.filter((entry) => entry.difficulty === 'medium' && entry.perceived_difficulty === 'easy').length
          / leetEntries.filter((entry) => entry.difficulty === 'medium').length) * 100
      )
      : 0;
    return { byCategory, total, hardFeelingRate, mediumFeltEasyRate };
  }, [leetEntries]);

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

  async function addLeetEntry() {
    const title = leetForm.problemTitle.trim();
    if (!title) {
      setErr('LeetCode: problem title is required.');
      return;
    }
    setLeetSaving(true);
    setErr(null);
    const nowIso = new Date().toISOString();
    const payload = {
      owner_id: ownerId,
      category: leetForm.category,
      problem_title: title,
      problem_url: leetForm.problemUrl.trim() || null,
      solution_file: leetForm.solutionFile || null,
      difficulty: leetForm.difficulty,
      perceived_difficulty: leetForm.perceivedDifficulty,
      notes: leetForm.notes.trim() || null,
      solved_at: nowIso.slice(0, 10),
    };
    const { data, error } = await supabase
      .from('study_leetcode_entries')
      .insert(payload)
      .select('id,category,problem_title,problem_url,solution_file,difficulty,perceived_difficulty,solved_at,notes')
      .single();
    if (error) {
      setErr(error.message);
      setLeetSaving(false);
      return;
    }
    setLeetEntries((prev) => [data as LeetEntryRow, ...prev]);
    setLeetForm((prev) => ({
      ...prev,
      problemTitle: '',
      problemUrl: '',
      solutionFile: '',
      notes: '',
    }));
    setLeetSaving(false);
  }

  function startEditLeet(entry: LeetEntryRow) {
    setEditingLeetId(entry.id);
    setEditLeetForm({
      category: entry.category,
      problemTitle: entry.problem_title,
      problemUrl: entry.problem_url ?? '',
      solutionFile: entry.solution_file ?? '',
      difficulty: entry.difficulty,
      perceivedDifficulty: entry.perceived_difficulty,
      notes: entry.notes ?? '',
    });
  }

  async function saveEditLeetEntry(id: string) {
    if (!editLeetForm) return;
    const title = editLeetForm.problemTitle.trim();
    if (!title) {
      setErr('LeetCode edit: problem title is required.');
      return;
    }

    setLeetSaving(true);
    setErr(null);
    const payload = {
      category: editLeetForm.category,
      problem_title: title,
      problem_url: editLeetForm.problemUrl.trim() || null,
      solution_file: editLeetForm.solutionFile || null,
      difficulty: editLeetForm.difficulty,
      perceived_difficulty: editLeetForm.perceivedDifficulty,
      notes: editLeetForm.notes.trim() || null,
    };

    const { error } = await supabase
      .from('study_leetcode_entries')
      .update(payload)
      .eq('owner_id', ownerId)
      .eq('id', id);
    if (error) {
      setErr(error.message);
      setLeetSaving(false);
      return;
    }

    setLeetEntries((prev) => prev.map((entry) => (entry.id === id ? { ...entry, ...payload } : entry)));
    setEditingLeetId(null);
    setEditLeetForm(null);
    setLeetSaving(false);
  }

  async function importDetectedSolutions() {
    if (!solutionDocs.length) return;
    setLeetSaving(true);
    setErr(null);

    const linked = new Set(leetEntries.map((entry) => entry.solution_file).filter(Boolean) as string[]);
    const now = new Date().toISOString();
    const toInsert = solutionDocs
      .filter((doc) => !linked.has(doc.file))
      .map((doc) => ({
        owner_id: ownerId,
        category: doc.category,
        problem_title: doc.title,
        problem_url: null as string | null,
        solution_file: doc.file,
        difficulty: doc.difficulty,
        perceived_difficulty: 'medium' as PerceivedDifficulty,
        notes: 'Imported from htmldocs',
        solved_at: now.slice(0, 10),
      }));

    if (!toInsert.length) {
      setLeetSaving(false);
      return;
    }

    const { data, error } = await supabase
      .from('study_leetcode_entries')
      .insert(toInsert)
      .select('id,category,problem_title,problem_url,solution_file,difficulty,perceived_difficulty,solved_at,notes');
    if (error) {
      setErr(error.message);
      setLeetSaving(false);
      return;
    }

    setLeetEntries((prev) => ([...((data ?? []) as LeetEntryRow[]), ...prev]));
    setLeetSaving(false);
  }

  function solutionPreviewUrl(file: string) {
    return `/api/study-coach/leetcode-solutions/preview?file=${encodeURIComponent(file)}`;
  }

  async function deleteLeetEntry(id: string) {
    setLeetSaving(true);
    setErr(null);
    const { error } = await supabase
      .from('study_leetcode_entries')
      .delete()
      .eq('owner_id', ownerId)
      .eq('id', id);
    if (error) {
      setErr(error.message);
      setLeetSaving(false);
      return;
    }
    setLeetEntries((prev) => prev.filter((entry) => entry.id !== id));
    setLeetSaving(false);
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
                <Link className="rounded-md border border-cyan-500/40 bg-cyan-500/20 px-3 py-1.5 text-sm font-semibold" href="/study-coach/solutions">
                  LeetCode HTMLs
                </Link>
              </div>
              <h1 className="text-2xl font-bold">Study Roadmap</h1>
              <p className="mt-1 text-sm text-[var(--muted)]">Capitole ordonate dupa probabilitate de interviu</p>
              <p className="mt-1 text-xs text-[var(--muted)]">Focus curent: interview core. Nice-to-have este separat in JSON.</p>
              <div className="mt-2 flex gap-2">
                <button
                  className={`rounded-md border px-2 py-1 text-xs font-semibold ${scope === 'core' ? 'border-sky-400 bg-sky-500/20' : 'border-[var(--border)] bg-[var(--panel-2)]'}`}
                  onClick={() => setScope('core')}
                >
                  Interview core
                </button>
                <button
                  className={`rounded-md border px-2 py-1 text-xs font-semibold ${scope === 'all' ? 'border-sky-400 bg-sky-500/20' : 'border-[var(--border)] bg-[var(--panel-2)]'}`}
                  onClick={() => setScope('all')}
                >
                  All concepts
                </button>
              </div>
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
          <details className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-3">
            <summary className="cursor-pointer text-sm font-semibold">Deadline tracker (explicat simplu)</summary>
            <div className="mt-2 space-y-1 text-sm text-[var(--muted)]">
              <p>1) Deadline: {INTERVIEW_DEADLINE} (mai ai {deadlineModel.daysLeft} zile).</p>
              <p>2) Mai ai {deadlineModel.remainingFirstPass} concepte de trecut prima data.</p>
              <p>3) Ca sa prinzi deadline-ul: ~{deadlineModel.requiredNewPerDay} concepte/zi.</p>
              <p>4) Ritmul tau actual estimat: ~{deadlineModel.currentConceptsPerDay} concepte/zi.</p>
              <p>
                5) Diferenta fata de necesar: {deadlineModel.deltaConcepts >= 0 ? '+' : ''}
                {deadlineModel.deltaConcepts} concepte/zi.
              </p>
              <p>6) Timp recomandat/zi (new + spaced repetition): ~{deadlineModel.totalMinutesPerDay} minute.</p>
              <p>7) Semnal ritm: {deadlineModel.paceBand === 'steady' ? 'ok' : deadlineModel.paceBand === 'tight' ? 'strans' : 'agresiv'}.</p>
            </div>
          </details>
          {err ? <p className="mt-3 text-sm text-rose-200">DB: {err}</p> : null}
        </header>

        <section className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">LeetCode Progress Tracker</h2>
              <p className="text-sm text-[var(--muted)]">Easy + Medium, pe categoriile cheie de interviu.</p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
              <Tile label="Solved total" value={String(leetStats.total)} />
              <Tile label="Felt hard rate" value={`${leetStats.hardFeelingRate}%`} />
              <Tile label="Medium felt easy" value={`${leetStats.mediumFeltEasyRate}%`} />
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-6">
            <select
              className="rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-2 py-2 text-sm"
              value={leetForm.category}
              onChange={(event) => setLeetForm((prev) => ({ ...prev, category: event.target.value as LeetCategory }))}
            >
              {LEET_CATEGORIES.map((category) => (
                <option key={category.id} value={category.id}>{category.label}</option>
              ))}
            </select>
            <input
              className="rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-2 py-2 text-sm md:col-span-2"
              placeholder="Problem title"
              value={leetForm.problemTitle}
              onChange={(event) => setLeetForm((prev) => ({ ...prev, problemTitle: event.target.value }))}
            />
            <select
              className="rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-2 py-2 text-sm"
              value={leetForm.difficulty}
              onChange={(event) => setLeetForm((prev) => ({ ...prev, difficulty: event.target.value as LeetDifficulty }))}
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
            </select>
            <select
              className="rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-2 py-2 text-sm"
              value={leetForm.perceivedDifficulty}
              onChange={(event) => setLeetForm((prev) => ({ ...prev, perceivedDifficulty: event.target.value as PerceivedDifficulty }))}
            >
              <option value="easy">Felt easy</option>
              <option value="medium">Felt medium</option>
              <option value="hard">Felt hard</option>
            </select>
            <button
              className="rounded-md border border-emerald-500/40 bg-emerald-500/20 px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => { void addLeetEntry(); }}
              disabled={leetSaving}
            >
              Add solved problem
            </button>
          </div>

          <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-6">
            <input
              className="rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-2 py-2 text-sm md:col-span-3"
              placeholder="LeetCode link (optional)"
              value={leetForm.problemUrl}
              onChange={(event) => setLeetForm((prev) => ({ ...prev, problemUrl: event.target.value }))}
            />
            <input
              className="rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-2 py-2 text-sm md:col-span-3"
              placeholder="How it felt / notes (optional)"
              value={leetForm.notes}
              onChange={(event) => setLeetForm((prev) => ({ ...prev, notes: event.target.value }))}
            />
          </div>
          <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-6">
            <select
              className="rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-2 py-2 text-sm md:col-span-4"
              value={leetForm.solutionFile}
              onChange={(event) => {
                const selected = event.target.value;
                const doc = solutionDocs.find((item) => item.file === selected);
                setLeetForm((prev) => ({
                  ...prev,
                  solutionFile: selected,
                  category: doc?.category ?? prev.category,
                  difficulty: doc?.difficulty ?? prev.difficulty,
                  problemTitle: prev.problemTitle || doc?.title || prev.problemTitle,
                }));
              }}
            >
              <option value="">Attach HTML solution (optional)</option>
              {solutionDocs.map((doc) => (
                <option key={doc.file} value={doc.file}>{doc.file}</option>
              ))}
            </select>
            <button
              className="rounded-md border border-cyan-500/40 bg-cyan-500/20 px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60 md:col-span-2"
              onClick={() => { void importDetectedSolutions(); }}
              disabled={leetSaving || !solutionDocs.length}
            >
              Import detected HTML as solved
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-2 lg:grid-cols-2">
            {leetStats.byCategory.map((stat) => {
              const signal = stat.avgDelta >= 0.6
                ? 'Needs repetition'
                : stat.avgDelta <= -0.3
                  ? 'Strong zone'
                  : 'In progress';
              return (
                <div key={stat.id} className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold">{stat.label}</div>
                    <span className="text-xs text-[var(--muted)]">{stat.total} solved</span>
                  </div>
                  <div className="mt-2 grid grid-cols-4 gap-2 text-xs">
                    <Tile label="Easy" value={String(stat.easyCount)} />
                    <Tile label="Medium" value={String(stat.mediumCount)} />
                    <Tile label="Felt hard" value={String(stat.feltHard)} />
                    <Tile label="Med->easy" value={String(stat.feltEasyOnMedium)} />
                  </div>
                  <p className="mt-2 text-xs text-[var(--muted)]">Signal: {signal}</p>
                </div>
              );
            })}
          </div>

          <div className="mt-4 space-y-2">
            <div className="text-sm font-semibold">Recent solved problems</div>
            {leetEntries.slice(0, 12).map((entry) => (
              <div key={entry.id} className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] p-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-medium">{entry.problem_title}</span>
                    <span className="ml-2 text-xs text-[var(--muted)]">[{LEET_CATEGORIES.find((item) => item.id === entry.category)?.label}]</span>
                  </div>
                  <div className="text-xs text-[var(--muted)]">{entry.solved_at}</div>
                </div>
                <div className="mt-1 text-xs text-[var(--muted)]">
                  Difficulty: {entry.difficulty} · Felt: {entry.perceived_difficulty}
                </div>
                {entry.problem_url ? (
                  <a className="mt-1 inline-block text-xs text-sky-300 underline" href={entry.problem_url} target="_blank" rel="noreferrer">
                    Open problem
                  </a>
                ) : null}
                {entry.solution_file ? (
                  <a
                    className="ml-3 mt-1 inline-block text-xs text-cyan-300 underline"
                    href={solutionPreviewUrl(entry.solution_file)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Preview solution HTML
                  </a>
                ) : null}
                {entry.notes ? <p className="mt-1 text-xs text-[var(--muted)]">{entry.notes}</p> : null}
                {editingLeetId === entry.id && editLeetForm ? (
                  <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-6">
                    <input
                      className="rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-xs md:col-span-2"
                      value={editLeetForm.problemTitle}
                      onChange={(event) => setEditLeetForm((prev) => (prev ? { ...prev, problemTitle: event.target.value } : prev))}
                    />
                    <select
                      className="rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-xs"
                      value={editLeetForm.category}
                      onChange={(event) => setEditLeetForm((prev) => (prev ? { ...prev, category: event.target.value as LeetCategory } : prev))}
                    >
                      {LEET_CATEGORIES.map((category) => (
                        <option key={category.id} value={category.id}>{category.label}</option>
                      ))}
                    </select>
                    <select
                      className="rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-xs"
                      value={editLeetForm.difficulty}
                      onChange={(event) => setEditLeetForm((prev) => (prev ? { ...prev, difficulty: event.target.value as LeetDifficulty } : prev))}
                    >
                      <option value="easy">easy</option>
                      <option value="medium">medium</option>
                    </select>
                    <select
                      className="rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-xs"
                      value={editLeetForm.perceivedDifficulty}
                      onChange={(event) => setEditLeetForm((prev) => (prev ? { ...prev, perceivedDifficulty: event.target.value as PerceivedDifficulty } : prev))}
                    >
                      <option value="easy">felt easy</option>
                      <option value="medium">felt medium</option>
                      <option value="hard">felt hard</option>
                    </select>
                    <input
                      className="rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-xs"
                      placeholder="Link"
                      value={editLeetForm.problemUrl}
                      onChange={(event) => setEditLeetForm((prev) => (prev ? { ...prev, problemUrl: event.target.value } : prev))}
                    />
                    <select
                      className="rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-xs md:col-span-3"
                      value={editLeetForm.solutionFile}
                      onChange={(event) => setEditLeetForm((prev) => (prev ? { ...prev, solutionFile: event.target.value } : prev))}
                    >
                      <option value="">No HTML solution</option>
                      {solutionDocs.map((doc) => (
                        <option key={doc.file} value={doc.file}>{doc.file}</option>
                      ))}
                    </select>
                    <input
                      className="rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-xs md:col-span-3"
                      placeholder="Notes"
                      value={editLeetForm.notes}
                      onChange={(event) => setEditLeetForm((prev) => (prev ? { ...prev, notes: event.target.value } : prev))}
                    />
                    <button
                      className="rounded-md border border-emerald-500/40 bg-emerald-500/20 px-2 py-1 text-xs font-semibold"
                      onClick={() => { void saveEditLeetEntry(entry.id); }}
                    >
                      Save edit
                    </button>
                    <button
                      className="rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-xs font-semibold"
                      onClick={() => { setEditingLeetId(null); setEditLeetForm(null); }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    className="mt-2 rounded-md border border-sky-500/40 bg-sky-500/20 px-2 py-1 text-xs font-semibold"
                    onClick={() => startEditLeet(entry)}
                  >
                    Edit
                  </button>
                )}
                <button
                  className="ml-2 mt-2 rounded-md border border-rose-500/40 bg-rose-500/20 px-2 py-1 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => { void deleteLeetEntry(entry.id); }}
                  disabled={leetSaving}
                >
                  Delete
                </button>
              </div>
            ))}
            {!leetEntries.length ? <p className="text-sm text-[var(--muted)]">No LeetCode entries yet.</p> : null}
          </div>
        </section>

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
