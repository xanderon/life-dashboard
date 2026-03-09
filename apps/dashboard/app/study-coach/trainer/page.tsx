'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

type TaskStatus = 'todo' | 'in_progress' | 'done';

type Concept = {
  id: string;
  name: string;
  mastery: number;
  dealBreaker: boolean;
  lastReviewedAt: string | null;
  nextReview: string;
};

type Task = {
  id: string;
  title: string;
  conceptId: string;
  status: TaskStatus;
  estimateMin: number;
  type: 'new' | 'recall' | 'deal-breaker' | 'nice';
  source: 'trainer' | 'today';
  todayBlockIdx?: number;
};

type ChatRole = 'user' | 'coach';

type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  createdAt: string;
  source: 'manual' | 'proactive' | 'checkin';
};

type TrainerState = {
  schedule: Record<string, Array<[string, string]>>;
  concepts: Concept[];
  tasks: Task[];
  chat: ChatMessage[];
  meta: {
    lastStudyAt: string | null;
    lastInteractionAt: string | null;
    lastNudgeAt: string | null;
  };
};

type CheckinFeedback = {
  mode: 'openai' | 'local-fallback';
  verdict: 'all_good' | 'mixed' | 'needs_work';
  strengths: string[];
  gaps: string[];
  nextActions: string[];
};

type CoachAction =
  | { type: 'focus_concept'; conceptId: string }
  | { type: 'create_task'; title: string; conceptId: string; estimateMin: number; taskType: 'new' | 'recall' | 'deal-breaker' | 'nice' }
  | { type: 'mark_task'; taskId: string; status: TaskStatus }
  | { type: 'schedule_review'; conceptId: string; daysAhead: number };

type CoachChatResponse = {
  mode: 'openai' | 'local-fallback';
  reply: string;
  actions: CoachAction[];
};

type TodaySnapshotBlock = {
  id: string;
  topicId: string;
  topicName: string;
  objective: string;
  blockType: string;
  totalMinutes?: number;
};

type TodaySnapshot = {
  blocks?: TodaySnapshotBlock[];
  currentBlockIdx?: number;
  runState?: 'running' | 'paused' | 'idle' | string;
};

const STORAGE_KEY = 'study-coach-trainer-v2';
const TODAY_SNAPSHOT_KEY = 'study-coach-state-v2';
const TZ = 'Europe/Bucharest';

const DEFAULT_STATE: TrainerState = {
  schedule: {
    monday: [['09:00', '21:30']],
    tuesday: [['16:00', '22:00']],
    wednesday: [['16:00', '22:00']],
    thursday: [['16:00', '22:00']],
    friday: [['18:00', '21:00']],
    saturday: [['10:00', '14:00']],
    sunday: [['10:00', '13:00']],
  },
  concepts: [
    { id: 'inheritance', name: 'Inheritance', mastery: 62, dealBreaker: true, lastReviewedAt: '2026-03-03', nextReview: '2026-03-10' },
    { id: 'composition-di', name: 'Composition vs DI', mastery: 68, dealBreaker: true, lastReviewedAt: '2026-03-04', nextReview: '2026-03-09' },
    { id: 'encapsulation', name: 'Encapsulation', mastery: 64, dealBreaker: true, lastReviewedAt: '2026-03-03', nextReview: '2026-03-10' },
    { id: 'abstraction', name: 'Abstraction', mastery: 65, dealBreaker: true, lastReviewedAt: '2026-03-03', nextReview: '2026-03-10' },
    { id: 'polymorphism', name: 'Polymorphism', mastery: 61, dealBreaker: true, lastReviewedAt: '2026-03-03', nextReview: '2026-03-09' },
    { id: 'di-dip', name: 'DI vs DIP', mastery: 72, dealBreaker: true, lastReviewedAt: '2026-03-04', nextReview: '2026-03-11' },
    { id: 'srp', name: 'Single Responsibility Principle', mastery: 35, dealBreaker: true, lastReviewedAt: null, nextReview: '2026-03-09' },
    { id: 'singleton', name: 'Singleton', mastery: 28, dealBreaker: false, lastReviewedAt: null, nextReview: '2026-03-09' },
  ],
  tasks: [
    { id: 't1', title: 'Active recall: Composition vs DI', conceptId: 'composition-di', status: 'todo', estimateMin: 20, type: 'recall', source: 'trainer' },
    { id: 't2', title: 'Explain DIP in 2 practical examples', conceptId: 'di-dip', status: 'todo', estimateMin: 25, type: 'deal-breaker', source: 'trainer' },
    { id: 't3', title: 'SRP first pass', conceptId: 'srp', status: 'todo', estimateMin: 25, type: 'new', source: 'trainer' },
    { id: 't4', title: 'Singleton pitfalls', conceptId: 'singleton', status: 'todo', estimateMin: 15, type: 'nice', source: 'trainer' },
  ],
  chat: [
    {
      id: 'boot-1',
      role: 'coach',
      text: 'Salut. Azi te duc pe high-probability topics. Incepem cu un sprint de 20 min pe un deal-breaker, apoi imi dai active recall.',
      createdAt: new Date().toISOString(),
      source: 'manual',
    },
  ],
  meta: {
    lastStudyAt: null,
    lastInteractionAt: null,
    lastNudgeAt: null,
  },
};

function parseHm(hm: string) {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
}

function dayAndMinutesNow() {
  const now = new Date();
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: TZ }).format(now).toLowerCase();
  const parts = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ,
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return { weekday, minutes: hour * 60 + minute };
}

function inLearningWindow(schedule: TrainerState['schedule']) {
  const { weekday, minutes } = dayAndMinutesNow();
  const windows = schedule[weekday] || [];
  return windows.some(([s, e]) => minutes >= parseHm(s) && minutes <= parseHm(e));
}

function hoursSince(iso: string | null) {
  if (!iso) return Number.POSITIVE_INFINITY;
  return (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60);
}

function addDaysYmd(daysAhead: number) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}

function randomId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function readTodaySnapshot(): TodaySnapshot | null {
  const raw = window.localStorage.getItem(TODAY_SNAPSHOT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TodaySnapshot;
  } catch {
    return null;
  }
}

function inferConceptId(block: TodaySnapshotBlock, concepts: Concept[]): string {
  const hay = `${block.topicId} ${block.topicName} ${block.objective}`.toLowerCase();
  const checks: Array<{ id: string; terms: string[] }> = [
    { id: 'inheritance', terms: ['inherit', 'mostenir'] },
    { id: 'composition-di', terms: ['compoz', 'composition', 'dependency injection', 'di '] },
    { id: 'encapsulation', terms: ['encaps'] },
    { id: 'abstraction', terms: ['abstract'] },
    { id: 'polymorphism', terms: ['polymorph', 'polimorf'] },
    { id: 'di-dip', terms: ['dip', 'dependency inversion'] },
    { id: 'srp', terms: ['single responsibility', 'srp', 'solid'] },
    { id: 'singleton', terms: ['singleton'] },
  ];

  for (const c of checks) {
    if (c.terms.some((t) => hay.includes(t))) return c.id;
  }

  const fallback = concepts.find((c) => c.id === 'srp') ?? concepts[0];
  return fallback?.id ?? 'srp';
}

function statusFromTodayIndex(blockIdx: number, currentIdx: number, runState: string): TaskStatus {
  if (blockIdx < currentIdx) return 'done';
  if (blockIdx === currentIdx && runState === 'running') return 'in_progress';
  return 'todo';
}

function buildTodayTasks(snapshot: TodaySnapshot, concepts: Concept[]): Task[] {
  const blocks = snapshot.blocks ?? [];
  const currentIdx = Math.max(0, Number(snapshot.currentBlockIdx ?? 0));
  const runState = String(snapshot.runState ?? 'idle');

  return blocks.map((b, idx) => ({
    id: `today:${b.id || idx}`,
    title: `Today: ${b.topicName} · ${b.objective}`,
    conceptId: inferConceptId(b, concepts),
    status: statusFromTodayIndex(idx, currentIdx, runState),
    estimateMin: Math.max(5, Math.min(90, Number(b.totalMinutes || 25))),
    type: b.blockType === 'review_spaced' ? 'recall' : 'new',
    source: 'today',
    todayBlockIdx: idx,
  }));
}

function mergeTasksWithToday(baseTasks: Task[], todayTasks: Task[]): Task[] {
  const trainerTasks = baseTasks.filter((t) => t.source !== 'today');
  return [...todayTasks, ...trainerTasks];
}

function todayContextFromSnapshot(snapshot: TodaySnapshot | null, concepts: Concept[]) {
  if (!snapshot?.blocks?.length) {
    return {
      completedBlocks: 0,
      totalBlocks: 0,
      currentObjective: null as string | null,
      doneTodayConceptIds: [] as string[],
    };
  }

  const blocks = snapshot.blocks;
  const currentBlockIdx = Math.max(0, Number(snapshot.currentBlockIdx ?? 0));
  const completed = Math.min(currentBlockIdx, blocks.length);
  const currentObjective = blocks[currentBlockIdx]?.objective ?? null;

  const doneConceptIds = blocks
    .slice(0, completed)
    .map((b) => inferConceptId(b, concepts));

  return {
    completedBlocks: completed,
    totalBlocks: blocks.length,
    currentObjective,
    doneTodayConceptIds: Array.from(new Set(doneConceptIds)),
  };
}

export default function StudyCoachTrainerPage() {
  const [state, setState] = useState<TrainerState>(DEFAULT_STATE);
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);

  const [conceptId, setConceptId] = useState<string>(DEFAULT_STATE.concepts[0]?.id ?? '');
  const [confidence, setConfidence] = useState<number>(60);
  const [recallAnswer, setRecallAnswer] = useState('');
  const [summary, setSummary] = useState('');
  const [checkinBusy, setCheckinBusy] = useState(false);

  const syncTodayIntoTrainer = useCallback(() => {
    const snapshot = readTodaySnapshot();
    if (!snapshot?.blocks?.length) return;

    setState((prev) => {
      const todayTasks = buildTodayTasks(snapshot, prev.concepts);
      return {
        ...prev,
        tasks: mergeTasksWithToday(prev.tasks, todayTasks),
      };
    });
  }, []);

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as TrainerState;
        setState(parsed);
        if (parsed.concepts[0]?.id) setConceptId(parsed.concepts[0].id);
      } catch {
        // keep defaults
      }
    }

    syncTodayIntoTrainer();
  }, [syncTodayIntoTrainer]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === TODAY_SNAPSHOT_KEY) syncTodayIntoTrainer();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [syncTodayIntoTrainer]);

  const readiness = useMemo(() => {
    const core = state.concepts.filter((c) => c.id !== 'singleton');
    if (!core.length) return 0;
    return Math.round(core.reduce((sum, c) => sum + c.mastery, 0) / core.length);
  }, [state.concepts]);

  const dealBreakerCoverage = useMemo(() => {
    const db = state.concepts.filter((c) => c.dealBreaker);
    if (!db.length) return 0;
    const mastered = db.filter((c) => c.mastery >= 70).length;
    return Math.round((mastered / db.length) * 100);
  }, [state.concepts]);

  const learningWindowOpen = useMemo(() => inLearningWindow(state.schedule), [state.schedule]);
  const hoursGap = useMemo(() => hoursSince(state.meta.lastStudyAt), [state.meta.lastStudyAt]);

  const reminders = useMemo(() => {
    const out: string[] = [];
    if (learningWindowOpen && hoursGap >= 2) {
      out.push(`Nu ai mai studiat de ${hoursGap.toFixed(1)} ore. Intra pe un sprint de 20-25 min.`);
    }
    const weak = state.concepts.filter((c) => c.dealBreaker && c.mastery < 70);
    if (weak.length) {
      out.push(`Deal-breakers sub 70%: ${weak.map((c) => c.name).join(', ')}`);
    }
    return out;
  }, [learningWindowOpen, hoursGap, state.concepts]);

  function notify(message: string) {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    const n = new Notification('Study Coach Trainer', { body: message });
    setTimeout(() => n.close(), 4500);
  }

  function appendChat(role: ChatRole, text: string, source: ChatMessage['source']) {
    const msg: ChatMessage = {
      id: randomId('msg'),
      role,
      text,
      createdAt: new Date().toISOString(),
      source,
    };

    setState((prev) => ({
      ...prev,
      chat: [...prev.chat, msg].slice(-120),
      meta: {
        ...prev.meta,
        lastInteractionAt: new Date().toISOString(),
      },
    }));
  }

  function moveTask(task: Task, status: TaskStatus) {
    setState((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) => (t.id === task.id ? { ...t, status } : t)),
    }));

    if (task.source !== 'today' || typeof task.todayBlockIdx !== 'number') return;

    const snapshot = readTodaySnapshot();
    if (!snapshot || !Array.isArray(snapshot.blocks)) return;

    const currentIdx = Math.max(0, Number(snapshot.currentBlockIdx ?? 0));
    let nextIdx = currentIdx;

    if (status === 'done') nextIdx = Math.max(currentIdx, task.todayBlockIdx + 1);
    if (status === 'in_progress') nextIdx = task.todayBlockIdx;
    if (status === 'todo' && task.todayBlockIdx < currentIdx) nextIdx = task.todayBlockIdx;

    const nextRunState = status === 'in_progress' ? 'running' : snapshot.runState;

    const nextSnapshot: TodaySnapshot = {
      ...snapshot,
      currentBlockIdx: nextIdx,
      runState: nextRunState,
    };

    window.localStorage.setItem(TODAY_SNAPSHOT_KEY, JSON.stringify(nextSnapshot));
    syncTodayIntoTrainer();
  }

  function applyCoachActions(actions: CoachAction[]) {
    if (!actions.length) return;

    setState((prev) => {
      const next = { ...prev, concepts: [...prev.concepts], tasks: [...prev.tasks] };

      for (const action of actions) {
        if (action.type === 'focus_concept') {
          setConceptId(action.conceptId);
          continue;
        }

        if (action.type === 'create_task') {
          const exists = next.tasks.some(
            (t) => t.title.toLowerCase() === action.title.toLowerCase() && t.status !== 'done'
          );
          if (!exists) {
            next.tasks = [
              {
                id: randomId('task'),
                title: action.title,
                conceptId: action.conceptId,
                status: 'todo',
                estimateMin: Math.max(5, Math.min(90, Math.round(action.estimateMin || 20))),
                type: action.taskType,
                source: 'trainer',
              },
              ...next.tasks,
            ];
          }
          continue;
        }

        if (action.type === 'mark_task') {
          next.tasks = next.tasks.map((t) => (t.id === action.taskId ? { ...t, status: action.status } : t));
          continue;
        }

        if (action.type === 'schedule_review') {
          next.concepts = next.concepts.map((c) =>
            c.id === action.conceptId ? { ...c, nextReview: addDaysYmd(Math.max(1, action.daysAhead)) } : c
          );
        }
      }

      return next;
    });
  }

  const callCoach = useCallback(async (trigger: 'user_message' | 'proactive_nudge', userText?: string) => {
    const recentMessages = state.chat.slice(-10).map((m) => ({ role: m.role, text: m.text }));
    const todaySnapshot = readTodaySnapshot();
    const todayContext = todayContextFromSnapshot(todaySnapshot, state.concepts);
    const payload = {
      nowIso: new Date().toISOString(),
      learningWindowOpen,
      readiness,
      dealBreakerCoverage,
      stateSummary: {
        concepts: state.concepts,
        tasks: state.tasks,
      },
      todayContext,
      messages: userText ? [...recentMessages, { role: 'user' as const, text: userText }] : recentMessages,
      trigger,
    };

    const r = await fetch('/api/study-coach/trainer-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!r.ok) {
      throw new Error(`Coach chat failed (${r.status})`);
    }

    const data = (await r.json()) as CoachChatResponse;
    appendChat('coach', data.reply, trigger === 'proactive_nudge' ? 'proactive' : 'manual');
    applyCoachActions(data.actions || []);

    if (trigger === 'proactive_nudge') {
      setState((prev) => ({
        ...prev,
        meta: {
          ...prev.meta,
          lastNudgeAt: new Date().toISOString(),
        },
      }));
      notify(data.reply);
    }
  }, [state.chat, state.concepts, state.tasks, learningWindowOpen, readiness, dealBreakerCoverage]);

  async function sendChatMessage() {
    const text = chatInput.trim();
    if (!text || chatBusy) return;

    setChatInput('');
    appendChat('user', text, 'manual');
    setChatBusy(true);
    try {
      await callCoach('user_message', text);
    } finally {
      setChatBusy(false);
    }
  }

  async function sendCheckin() {
    const concept = state.concepts.find((c) => c.id === conceptId);
    if (!concept || checkinBusy) return;

    setCheckinBusy(true);
    try {
      const r = await fetch('/api/study-coach/trainer-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conceptId,
          conceptName: concept.name,
          confidence,
          recallAnswer,
          summary,
          dealBreaker: concept.dealBreaker,
        }),
      });

      if (!r.ok) throw new Error(`Feedback failed (${r.status})`);
      const ai = (await r.json()) as CheckinFeedback;

      const recap = [
        `Check-in ${concept.name} (${confidence}%) -> ${ai.verdict}`,
        ai.strengths.length ? `Strength: ${ai.strengths[0]}` : '',
        ai.gaps.length ? `Gap: ${ai.gaps[0]}` : '',
        ai.nextActions.length ? `Next: ${ai.nextActions[0]}` : '',
      ].filter(Boolean).join(' | ');

      appendChat('coach', recap, 'checkin');

      setState((prev) => {
        const repeatDays = confidence >= 75 ? 3 : confidence >= 60 ? 2 : 1;
        return {
          ...prev,
          concepts: prev.concepts.map((c) => {
            if (c.id !== conceptId) return c;
            const mastery = Math.max(0, Math.min(100, Math.round(c.mastery * 0.7 + confidence * 0.3)));
            return {
              ...c,
              mastery,
              lastReviewedAt: new Date().toISOString().slice(0, 10),
              nextReview: addDaysYmd(repeatDays),
            };
          }),
          tasks: prev.tasks.map((t) => {
            if (t.conceptId === conceptId && t.status !== 'done' && confidence >= 70) {
              return { ...t, status: 'done' };
            }
            return t;
          }),
          meta: {
            ...prev.meta,
            lastStudyAt: new Date().toISOString(),
          },
        };
      });

      setRecallAnswer('');
      setSummary('');
    } finally {
      setCheckinBusy(false);
    }
  }

  useEffect(() => {
    const id = window.setInterval(() => {
      syncTodayIntoTrainer();

      const inWindow = inLearningWindow(state.schedule);
      const inactiveHours = hoursSince(state.meta.lastInteractionAt);
      const sinceLastNudge = hoursSince(state.meta.lastNudgeAt);

      if (inWindow && inactiveHours >= 2 && sinceLastNudge >= 1.5 && !chatBusy) {
        void callCoach('proactive_nudge');
      }
    }, 60_000);

    return () => window.clearInterval(id);
  }, [state.schedule, state.meta.lastInteractionAt, state.meta.lastNudgeAt, chatBusy, callCoach, syncTodayIntoTrainer]);

  const nowLabel = new Intl.DateTimeFormat('ro-RO', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: TZ,
  }).format(new Date());

  const byStatus = (status: TaskStatus) => state.tasks.filter((t) => t.status === status);

  return (
    <main className="min-h-screen bg-[var(--bg)] p-4 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <header className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4 shadow-sm">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              <Link className="rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-3 py-1.5 text-sm font-semibold" href="/">Dashboard</Link>
              <Link className="rounded-md border border-sky-500/40 bg-sky-500/20 px-3 py-1.5 text-sm font-semibold" href="/study-coach">Today</Link>
              <Link className="rounded-md border border-indigo-500/40 bg-indigo-500/20 px-3 py-1.5 text-sm font-semibold" href="/study-coach/roadmap">Roadmap</Link>
              <Link className="rounded-md border border-cyan-500/40 bg-cyan-500/20 px-3 py-1.5 text-sm font-semibold" href="/study-coach/solutions">LeetCode HTMLs</Link>
            </div>
            <button
              className="rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-3 py-1.5 text-sm font-semibold"
              onClick={() => {
                if (!('Notification' in window)) return;
                void Notification.requestPermission();
              }}
            >
              Enable notifications
            </button>
          </div>
          <h1 className="text-2xl font-bold">Study Coach · Trainer Mode</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">{nowLabel} · chat coach + sync cu Today.</p>
        </header>

        <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3"><div className="text-xs uppercase text-[var(--muted)]">Readiness</div><div className="mt-1 text-xl font-bold">{readiness}%</div></div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3"><div className="text-xs uppercase text-[var(--muted)]">Deal-breaker coverage</div><div className="mt-1 text-xl font-bold">{dealBreakerCoverage}%</div></div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3"><div className="text-xs uppercase text-[var(--muted)]">Hours since study</div><div className="mt-1 text-xl font-bold">{Number.isFinite(hoursGap) ? hoursGap.toFixed(1) : 'N/A'}</div></div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3"><div className="text-xs uppercase text-[var(--muted)]">Learning window</div><div className="mt-1 text-xl font-bold">{learningWindowOpen ? 'OPEN' : 'CLOSED'}</div></div>
        </section>

        {reminders.length > 0 ? (
          <section className="space-y-2">
            {reminders.map((r) => (
              <div key={r} className="rounded-xl border border-amber-500/40 bg-amber-500/15 p-3 text-sm">{r}</div>
            ))}
          </section>
        ) : null}

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <article className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4 shadow-sm">
            <h2 className="text-lg font-semibold">Coach Chat</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Conversație + inițiative automate dacă lipsești în learning window.</p>

            <div className="mt-3 h-[360px] space-y-2 overflow-auto rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-3">
              {state.chat.map((m) => (
                <div
                  key={m.id}
                  className={`rounded-lg border px-3 py-2 text-sm ${m.role === 'coach' ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-sky-500/30 bg-sky-500/10'}`}
                >
                  <div className="mb-1 text-xs uppercase text-[var(--muted)]">{m.role} · {m.source}</div>
                  <div>{m.text}</div>
                </div>
              ))}
            </div>

            <div className="mt-3 flex gap-2">
              <input
                className="w-full rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-sm"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ex: termin linked list si apoi vreau plan SRP"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void sendChatMessage();
                  }
                }}
              />
              <button className="rounded-md border border-emerald-500/40 bg-emerald-500/20 px-3 py-2 text-sm font-semibold" onClick={() => void sendChatMessage()} disabled={chatBusy}>
                {chatBusy ? 'Thinking...' : 'Send'}
              </button>
            </div>
          </article>

          <article className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4 shadow-sm">
            <h2 className="text-lg font-semibold">Plan board (synced with Today)</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Task-urile din Today apar aici (badge SYNC). Mutările se propagă în Today snapshot.</p>

            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
              {(['todo', 'in_progress', 'done'] as TaskStatus[]).map((status) => (
                <div key={status} className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-3">
                  <div className="mb-2 text-sm font-semibold uppercase">{status.replace('_', ' ')}</div>
                  <div className="space-y-2">
                    {byStatus(status).map((task) => (
                      <div key={task.id} className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-2 text-sm">
                        <div className="font-semibold">{task.title}</div>
                        <div className="mt-1 text-xs text-[var(--muted)]">
                          {task.type} · {task.estimateMin} min {task.source === 'today' ? '· SYNC' : ''}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          <button className="rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-2 py-1 text-xs" onClick={() => moveTask(task, 'todo')}>todo</button>
                          <button className="rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-2 py-1 text-xs" onClick={() => moveTask(task, 'in_progress')}>doing</button>
                          <button className="rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-2 py-1 text-xs" onClick={() => moveTask(task, 'done')}>done</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-3">
              <label className="block text-sm">Concept</label>
              <select className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 py-2 text-sm" value={conceptId} onChange={(e) => setConceptId(e.target.value)}>
                {state.concepts.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({c.mastery}%) {c.dealBreaker ? '• deal-breaker' : ''}</option>
                ))}
              </select>

              <label className="mt-3 block text-sm">Confidence</label>
              <input className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 py-2 text-sm" type="number" min={0} max={100} value={confidence} onChange={(e) => setConfidence(Number(e.target.value || 0))} />

              <label className="mt-3 block text-sm">Recall</label>
              <textarea className="mt-1 min-h-[80px] w-full rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 py-2 text-sm" value={recallAnswer} onChange={(e) => setRecallAnswer(e.target.value)} placeholder="definitie + exemplu + tradeoff" />

              <label className="mt-3 block text-sm">Session summary</label>
              <textarea className="mt-1 min-h-[80px] w-full rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 py-2 text-sm" value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="ce ai facut si unde ai blocaje" />

              <button className="mt-3 rounded-md border border-emerald-500/40 bg-emerald-500/20 px-3 py-2 text-sm font-semibold" onClick={() => void sendCheckin()} disabled={checkinBusy}>
                {checkinBusy ? 'Sending...' : 'Send quick check-in'}
              </button>
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}
