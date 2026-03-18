'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

type ProblemStatus = 'todo' | 'in_progress' | 'done';
type Difficulty = 'easy' | 'medium' | 'hard' | '';
type PhaseId = 'phase_1' | 'phase_2' | 'phase_3';
type ChatRole = 'user' | 'coach';

type RoadmapProblem = {
  id: string;
  title: string;
  status: ProblemStatus;
  core: boolean;
  difficulty: Difficulty;
  docsUrl: string;
  solutionPath: string;
  notes: string;
  lastReviewedAt: string | null;
};

type RoadmapCategory = {
  id: string;
  title: string;
  phase: PhaseId;
  learningGoals: string[];
  problems: RoadmapProblem[];
};

type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  createdAt: string;
  source: 'manual' | 'proactive' | 'checkin';
};

type TrainerState = {
  schedule: Record<string, Array<[string, string]>>;
  categories: RoadmapCategory[];
  theory: Array<{ id: string; title: string; notes: string }>;
  chat: ChatMessage[];
  ui: {
    activeCategoryId: string;
    focusProblemId: string | null;
    showTheory: boolean;
  };
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
  reviewDays: number;
};

type CoachAction =
  | { type: 'focus_problem'; problemId: string }
  | { type: 'mark_problem'; problemId: string; status: ProblemStatus }
  | {
      type: 'update_problem_meta';
      problemId: string;
      difficulty?: Difficulty;
      docsUrl?: string;
      solutionPath?: string;
      notes?: string;
    };

type CoachChatResponse = {
  mode: 'openai' | 'local-fallback';
  reply: string;
  actions: CoachAction[];
};

type SeedCategory = {
  title: string;
  phase: PhaseId;
  learningGoals: string[];
  core: string[];
  optional?: string[];
};

const STORAGE_KEY = 'study-coach-algo-trainer-v1';
const TZ = 'Europe/Bucharest';

const PHASE_LABEL: Record<PhaseId, string> = {
  phase_1: 'Faza 1 · Fundatia',
  phase_2: 'Faza 2 · Pointeri + Arbori',
  phase_3: 'Faza 3 · Completare',
};

const ROADMAP_SEED: SeedCategory[] = [
  {
    title: 'Array',
    phase: 'phase_1',
    learningGoals: ['parcurgere simpla', 'prefix/sufix', 'intervale', 'mutare in-place', 'array + hashmap', 'greedy de baza'],
    core: [
      'Two Sum',
      'Best Time to Buy and Sell Stock',
      'Contains Duplicate',
      'Product of Array Except Self',
      'Maximum Subarray',
      'Merge Intervals',
      'Insert Interval',
      'Rotate Image',
      'Spiral Matrix',
      'Jump Game',
    ],
    optional: ['Remove Duplicates from Sorted Array', 'Remove Element', 'Group Anagrams', 'Longest Common Prefix'],
  },
  {
    title: 'Binary Search',
    phase: 'phase_1',
    learningGoals: ['exact find', 'first/last occurrence', 'answer space', 'first true / last false'],
    core: [
      'Binary Search',
      'Search Insert Position',
      'Find First and Last Position of Element in Sorted Array',
      'Search in Rotated Sorted Array',
      'Find Minimum in Rotated Sorted Array',
      'Search a 2D Matrix',
      'Sqrt(x)',
      'First Bad Version',
      'Find Peak Element',
    ],
    optional: ['Search in Rotated Sorted Array II', 'Kth Smallest Element in a Sorted Matrix', 'Time Based Key-Value Store'],
  },
  {
    title: 'Stack',
    phase: 'phase_1',
    learningGoals: ['stack de validare', 'monotonic stack', 'parsing simplu', 'last seen relevant thing'],
    core: [
      'Valid Parentheses',
      'Min Stack',
      'Evaluate Reverse Polish Notation',
      'Daily Temperatures',
      'Car Fleet',
      'Basic Calculator II',
      'Decode String',
      'Largest Rectangle in Histogram',
    ],
    optional: ['Simplify Path', 'Remove K Digits'],
  },
  {
    title: 'Linked List',
    phase: 'phase_2',
    learningGoals: ['dummy node', 'slow/fast pointers', 'reverse list', 'split + merge', 'cum nu pierzi referinte'],
    core: [
      'Reverse Linked List',
      'Merge Two Sorted Lists',
      'Linked List Cycle',
      'Linked List Cycle II',
      'Remove Nth Node From End of List',
      'Reorder List',
      'Copy List with Random Pointer',
      'Add Two Numbers',
      'LRU Cache',
    ],
    optional: ['Palindrome Linked List', 'Swap Nodes in Pairs'],
  },
  {
    title: 'Binary Tree',
    phase: 'phase_2',
    learningGoals: ['recursive DFS', 'iterative DFS', 'queue pentru BFS', 'pre/in/post order', 'BST rules', 'ce returnezi din recursie'],
    core: [
      'Maximum Depth of Binary Tree',
      'Same Tree',
      'Invert Binary Tree',
      'Binary Tree Inorder Traversal',
      'Binary Tree Level Order Traversal',
      'Validate Binary Search Tree',
      'Lowest Common Ancestor of a Binary Search Tree',
      'Binary Tree Right Side View',
      'Diameter of Binary Tree',
      'Kth Smallest Element in a BST',
    ],
    optional: [
      'Construct Binary Tree from Preorder and Inorder Traversal',
      'Binary Tree Maximum Path Sum',
      'Path Sum',
      'Serialize and Deserialize Binary Tree',
    ],
  },
  {
    title: 'Queue',
    phase: 'phase_3',
    learningGoals: ['FIFO real', 'simulare de coada', 'BFS support', 'stream processing simplu'],
    core: [
      'Implement Queue using Stacks',
      'Implement Stack using Queues',
      'Number of Recent Calls',
      'Moving Average from Data Stream',
      'Design Circular Queue',
      'Dota2 Senate',
      'Time Needed to Buy Tickets',
    ],
    optional: ['Design Hit Counter'],
  },
  {
    title: 'Recursion',
    phase: 'phase_3',
    learningGoals: ['cazul de baza', 'subproblema', 'ce returneaza apelul recursiv', 'cum eviti stack overflow logic'],
    core: [
      'Pow(x, n)',
      'Fibonacci Number',
      'Reverse Linked List',
      'Merge Two Sorted Lists',
      'Palindrome Linked List',
      'Decode String',
      'Different Ways to Add Parentheses',
    ],
    optional: ['K-th Symbol in Grammar'],
  },
  {
    title: 'Matrix',
    phase: 'phase_3',
    learningGoals: ['boundary traversal', 'row/col thinking', 'BFS/DFS pe grid', 'visited + in-bounds checks'],
    core: [
      'Valid Sudoku',
      'Rotate Image',
      'Spiral Matrix',
      'Set Matrix Zeroes',
      'Search a 2D Matrix',
      'Number of Islands',
      'Flood Fill',
      'Walls and Gates',
    ],
    optional: ['Surrounded Regions'],
  },
];

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function randomId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

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

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function buildDefaultState(): TrainerState {
  const categories: RoadmapCategory[] = ROADMAP_SEED.map((seed) => {
    const categoryId = slugify(seed.title);
    const coreProblems = seed.core.map((title) => ({
      id: `${categoryId}:${slugify(title)}`,
      title,
      status: 'todo' as ProblemStatus,
      core: true,
      difficulty: '' as Difficulty,
      docsUrl: '',
      solutionPath: '',
      notes: '',
      lastReviewedAt: null,
    }));

    const optionalProblems = (seed.optional ?? []).map((title) => ({
      id: `${categoryId}:${slugify(title)}`,
      title,
      status: 'todo' as ProblemStatus,
      core: false,
      difficulty: '' as Difficulty,
      docsUrl: '',
      solutionPath: '',
      notes: '',
      lastReviewedAt: null,
    }));

    return {
      id: categoryId,
      title: seed.title,
      phase: seed.phase,
      learningGoals: seed.learningGoals,
      problems: [...coreProblems, ...optionalProblems],
    };
  });

  const firstCategory = categories[0]?.id ?? '';
  const firstProblem = categories[0]?.problems[0]?.id ?? null;

  return {
    schedule: {
      monday: [['09:00', '21:30']],
      tuesday: [['16:00', '22:00']],
      wednesday: [['16:00', '22:00']],
      thursday: [['16:00', '22:00']],
      friday: [['18:00', '21:00']],
      saturday: [['10:00', '14:00']],
      sunday: [['10:00', '13:00']],
    },
    categories,
    theory: [
      { id: 'theory-1', title: 'DFS/BFS la graph', notes: 'Optional dupa ce stabilizezi tree + grid.' },
      { id: 'theory-2', title: 'Big-O si edge cases', notes: 'Pastreaza-le ca reference. Focus principal ramane pe problemele roadmap.' },
      { id: 'theory-3', title: 'Pattern notes', notes: 'while(left<=right) vs while(left<right), monotonic stack, dummy node.' },
    ],
    chat: [
      {
        id: 'boot-1',
        role: 'coach',
        text: 'Focus activ: roadmap de algoritmi pe probleme. Bifezi pe parcurs, iar eu te ghidez pe urmatorul task cu impact mare.',
        createdAt: new Date().toISOString(),
        source: 'manual',
      },
    ],
    ui: {
      activeCategoryId: firstCategory,
      focusProblemId: firstProblem,
      showTheory: false,
    },
    meta: {
      lastStudyAt: null,
      lastInteractionAt: null,
      lastNudgeAt: null,
    },
  };
}

const DEFAULT_STATE = buildDefaultState();

function flattenProblems(categories: RoadmapCategory[]) {
  return categories.flatMap((category) => category.problems.map((problem) => ({ ...problem, categoryId: category.id, categoryTitle: category.title, phase: category.phase })));
}

export default function StudyCoachTrainerPage() {
  const [state, setState] = useState<TrainerState>(DEFAULT_STATE);
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [checkinBusy, setCheckinBusy] = useState(false);
  const [confidence, setConfidence] = useState(65);
  const [checkinSummary, setCheckinSummary] = useState('');
  const [checkinBlockers, setCheckinBlockers] = useState('');

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<TrainerState>;
      if (!Array.isArray(parsed.categories)) return;
      setState({
        ...DEFAULT_STATE,
        ...parsed,
        categories: parsed.categories,
        chat: Array.isArray(parsed.chat) && parsed.chat.length ? parsed.chat : DEFAULT_STATE.chat,
        ui: {
          ...DEFAULT_STATE.ui,
          ...parsed.ui,
        },
        meta: {
          ...DEFAULT_STATE.meta,
          ...parsed.meta,
        },
      });
    } catch {
      // ignore corrupted cache
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const allProblems = useMemo(() => flattenProblems(state.categories), [state.categories]);

  const focusProblem = useMemo(
    () => allProblems.find((problem) => problem.id === state.ui.focusProblemId) ?? null,
    [allProblems, state.ui.focusProblemId]
  );

  const roadmapProgress = useMemo(() => {
    const total = allProblems.length;
    const done = allProblems.filter((problem) => problem.status === 'done').length;
    return total ? Math.round((done / total) * 100) : 0;
  }, [allProblems]);

  const foundationCoverage = useMemo(() => {
    const phase1 = allProblems.filter((problem) => problem.phase === 'phase_1' && problem.core);
    const done = phase1.filter((problem) => problem.status === 'done').length;
    return phase1.length ? Math.round((done / phase1.length) * 100) : 0;
  }, [allProblems]);

  const reviewsDue = useMemo(() => {
    const now = Date.now();
    return allProblems.filter((problem) => {
      if (!problem.lastReviewedAt || problem.status !== 'done') return false;
      const diffDays = (now - new Date(problem.lastReviewedAt).getTime()) / (1000 * 60 * 60 * 24);
      return diffDays >= 7;
    }).length;
  }, [allProblems]);

  const learningWindowOpen = useMemo(() => inLearningWindow(state.schedule), [state.schedule]);
  const hoursGap = useMemo(() => hoursSince(state.meta.lastStudyAt), [state.meta.lastStudyAt]);

  const reminders = useMemo(() => {
    const out: string[] = [];
    if (learningWindowOpen && hoursGap >= 2) {
      out.push(`Nu ai mai studiat de ${hoursGap.toFixed(1)} ore. Ia urmatoarea problema core.`);
    }

    const coreTodo = allProblems.filter((problem) => problem.core && problem.status !== 'done').length;
    if (coreTodo > 0) {
      out.push(`Probleme core ramase: ${coreTodo}. Prioritate: Faza 1 -> Faza 2 -> Faza 3.`);
    }

    if (reviewsDue > 0) {
      out.push(`Ai ${reviewsDue} probleme marcate done care necesita review.`);
    }

    return out;
  }, [allProblems, hoursGap, learningWindowOpen, reviewsDue]);

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

  const updateProblem = useCallback((problemId: string, updater: (problem: RoadmapProblem) => RoadmapProblem) => {
    setState((prev) => ({
      ...prev,
      categories: prev.categories.map((category) => ({
        ...category,
        problems: category.problems.map((problem) => (problem.id === problemId ? updater(problem) : problem)),
      })),
    }));
  }, []);

  const setProblemStatus = useCallback((problemId: string, status: ProblemStatus) => {
    const doneStamp = isoToday();
    setState((prev) => ({
      ...prev,
      categories: prev.categories.map((category) => ({
        ...category,
        problems: category.problems.map((problem) => {
          if (problem.id !== problemId) return problem;
          return {
            ...problem,
            status,
            lastReviewedAt: status === 'done' ? doneStamp : problem.lastReviewedAt,
          };
        }),
      })),
      meta: {
        ...prev.meta,
        lastStudyAt: new Date().toISOString(),
      },
    }));
  }, []);

  function setFocus(problemId: string, categoryId: string) {
    setState((prev) => ({
      ...prev,
      ui: {
        ...prev.ui,
        focusProblemId: problemId,
        activeCategoryId: categoryId,
      },
    }));
  }

  const applyCoachActions = useCallback((actions: CoachAction[]) => {
    if (!actions.length) return;

    setState((prev) => {
      let next = { ...prev };

      for (const action of actions) {
        if (action.type === 'focus_problem') {
          const found = flattenProblems(next.categories).find((problem) => problem.id === action.problemId);
          if (found) {
            next = {
              ...next,
              ui: {
                ...next.ui,
                focusProblemId: action.problemId,
                activeCategoryId: found.categoryId,
              },
            };
          }
          continue;
        }

        if (action.type === 'mark_problem') {
          next = {
            ...next,
            categories: next.categories.map((category) => ({
              ...category,
              problems: category.problems.map((problem) => {
                if (problem.id !== action.problemId) return problem;
                return {
                  ...problem,
                  status: action.status,
                  lastReviewedAt: action.status === 'done' ? isoToday() : problem.lastReviewedAt,
                };
              }),
            })),
            meta: {
              ...next.meta,
              lastStudyAt: new Date().toISOString(),
            },
          };
          continue;
        }

        if (action.type === 'update_problem_meta') {
          next = {
            ...next,
            categories: next.categories.map((category) => ({
              ...category,
              problems: category.problems.map((problem) => {
                if (problem.id !== action.problemId) return problem;
                return {
                  ...problem,
                  difficulty: action.difficulty ?? problem.difficulty,
                  docsUrl: action.docsUrl ?? problem.docsUrl,
                  solutionPath: action.solutionPath ?? problem.solutionPath,
                  notes: action.notes ?? problem.notes,
                };
              }),
            })),
          };
        }
      }

      return next;
    });
  }, []);

  const callCoach = useCallback(async (trigger: 'user_message' | 'proactive_nudge', userText?: string) => {
    const recentMessages = state.chat.slice(-10).map((m) => ({ role: m.role, text: m.text }));
    const payload = {
      nowIso: new Date().toISOString(),
      learningWindowOpen,
      kpis: {
        roadmapProgress,
        foundationCoverage,
        reviewsDue,
      },
      activeCategoryId: state.ui.activeCategoryId,
      focusProblemId: state.ui.focusProblemId,
      categories: state.categories.map((category) => ({
        id: category.id,
        title: category.title,
        phase: category.phase,
        problems: category.problems.map((problem) => ({
          id: problem.id,
          title: problem.title,
          status: problem.status,
          core: problem.core,
          difficulty: problem.difficulty,
        })),
      })),
      messages: userText ? [...recentMessages, { role: 'user' as const, text: userText }] : recentMessages,
      trigger,
    };

    const r = await fetch('/api/study-coach/trainer-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!r.ok) throw new Error(`Coach chat failed (${r.status})`);

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
    }
  }, [applyCoachActions, foundationCoverage, learningWindowOpen, reviewsDue, roadmapProgress, state.categories, state.chat, state.ui.activeCategoryId, state.ui.focusProblemId]);

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
    if (!state.ui.focusProblemId || checkinBusy) return;
    const problem = allProblems.find((item) => item.id === state.ui.focusProblemId);
    if (!problem) return;

    setCheckinBusy(true);
    try {
      const r = await fetch('/api/study-coach/trainer-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problemId: problem.id,
          problemTitle: problem.title,
          categoryTitle: problem.categoryTitle,
          confidence,
          summary: checkinSummary,
          blockers: checkinBlockers,
          notes: problem.notes,
          difficulty: problem.difficulty,
          core: problem.core,
        }),
      });

      if (!r.ok) throw new Error(`Feedback failed (${r.status})`);
      const ai = (await r.json()) as CheckinFeedback;

      appendChat(
        'coach',
        [`Check-in ${problem.title} (${confidence}%) -> ${ai.verdict}.`, ai.strengths[0] ? `Strength: ${ai.strengths[0]}.` : '', ai.gaps[0] ? `Gap: ${ai.gaps[0]}.` : '', ai.nextActions[0] ? `Next: ${ai.nextActions[0]}.` : ''].filter(Boolean).join(' '),
        'checkin'
      );

      setState((prev) => ({
        ...prev,
        categories: prev.categories.map((category) => ({
          ...category,
          problems: category.problems.map((p) => {
            if (p.id !== problem.id) return p;
            const status: ProblemStatus = confidence >= 75 ? 'done' : confidence >= 55 ? 'in_progress' : 'todo';
            return {
              ...p,
              status,
              lastReviewedAt: isoToday(),
            };
          }),
        })),
        meta: {
          ...prev.meta,
          lastStudyAt: new Date().toISOString(),
        },
      }));

      setCheckinSummary('');
      setCheckinBlockers('');
    } finally {
      setCheckinBusy(false);
    }
  }

  useEffect(() => {
    const id = window.setInterval(() => {
      const inWindow = inLearningWindow(state.schedule);
      const inactiveHours = hoursSince(state.meta.lastInteractionAt);
      const sinceLastNudge = hoursSince(state.meta.lastNudgeAt);
      if (inWindow && inactiveHours >= 2 && sinceLastNudge >= 1.5 && !chatBusy) {
        void callCoach('proactive_nudge');
      }
    }, 60_000);

    return () => window.clearInterval(id);
  }, [callCoach, chatBusy, state.meta.lastInteractionAt, state.meta.lastNudgeAt, state.schedule]);

  const nowLabel = new Intl.DateTimeFormat('ro-RO', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: TZ,
  }).format(new Date());

  const categoriesByPhase = useMemo(() => {
    const map: Record<PhaseId, RoadmapCategory[]> = {
      phase_1: [],
      phase_2: [],
      phase_3: [],
    };
    state.categories.forEach((category) => {
      map[category.phase].push(category);
    });
    return map;
  }, [state.categories]);

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
          </div>
          <h1 className="text-2xl font-bold">Study Coach · Algorithm Planner</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">Focus total pe lista de probleme pe categorii. {nowLabel}</p>
        </header>

        <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3"><div className="text-xs uppercase text-[var(--muted)]">Roadmap progress</div><div className="mt-1 text-xl font-bold">{roadmapProgress}%</div></div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3"><div className="text-xs uppercase text-[var(--muted)]">Foundation coverage</div><div className="mt-1 text-xl font-bold">{foundationCoverage}%</div></div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3"><div className="text-xs uppercase text-[var(--muted)]">Reviews due</div><div className="mt-1 text-xl font-bold">{reviewsDue}</div></div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3"><div className="text-xs uppercase text-[var(--muted)]">Learning window</div><div className="mt-1 text-xl font-bold">{learningWindowOpen ? 'OPEN' : 'CLOSED'}</div></div>
        </section>

        {reminders.length > 0 ? (
          <section className="space-y-2">
            {reminders.map((message) => (
              <div key={message} className="rounded-xl border border-amber-500/40 bg-amber-500/15 p-3 text-sm">{message}</div>
            ))}
          </section>
        ) : null}

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <article className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4 shadow-sm xl:col-span-2">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">Checklist pe categorii</h2>
              <button
                className="rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-3 py-1.5 text-sm font-semibold"
                onClick={() => setState((prev) => ({ ...prev, ui: { ...prev.ui, showTheory: !prev.ui.showTheory } }))}
              >
                {state.ui.showTheory ? 'Ascunde teorie' : 'Arata teorie separata'}
              </button>
            </div>

            <div className="space-y-4">
              {(['phase_1', 'phase_2', 'phase_3'] as PhaseId[]).map((phaseId) => (
                <div key={phaseId} className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-3">
                  <h3 className="text-sm font-semibold uppercase">{PHASE_LABEL[phaseId]}</h3>
                  <div className="mt-3 space-y-3">
                    {categoriesByPhase[phaseId].map((category) => {
                      const total = category.problems.length;
                      const done = category.problems.filter((problem) => problem.status === 'done').length;
                      return (
                        <details key={category.id} className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-3" open={state.ui.activeCategoryId === category.id}>
                          <summary className="cursor-pointer list-none">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <div className="font-semibold">{category.title}</div>
                                <div className="text-xs text-[var(--muted)]">{done}/{total} done</div>
                              </div>
                              <button
                                type="button"
                                className="rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-2 py-1 text-xs"
                                onClick={(event) => {
                                  event.preventDefault();
                                  setState((prev) => ({ ...prev, ui: { ...prev.ui, activeCategoryId: category.id } }));
                                }}
                              >
                                Active
                              </button>
                            </div>
                          </summary>

                          <div className="mt-2 text-xs text-[var(--muted)]">
                            {category.learningGoals.join(' • ')}
                          </div>

                          <div className="mt-3 space-y-2">
                            {category.problems.map((problem) => (
                              <div key={problem.id} className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] p-2">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div>
                                    <div className="text-sm font-semibold">{problem.title}</div>
                                    <div className="text-xs text-[var(--muted)]">
                                      {problem.core ? 'core' : 'optional'}
                                      {problem.lastReviewedAt ? ` • review ${problem.lastReviewedAt}` : ''}
                                    </div>
                                  </div>
                                  <div className="flex flex-wrap gap-1">
                                    <button className="rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-xs" onClick={() => setProblemStatus(problem.id, 'todo')}>todo</button>
                                    <button className="rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-xs" onClick={() => setProblemStatus(problem.id, 'in_progress')}>doing</button>
                                    <button className="rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-xs" onClick={() => setProblemStatus(problem.id, 'done')}>done</button>
                                    <button className="rounded-md border border-emerald-500/40 bg-emerald-500/20 px-2 py-1 text-xs" onClick={() => setFocus(problem.id, category.id)}>focus</button>
                                  </div>
                                </div>

                                <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                                  <label className="text-xs">
                                    Difficulty
                                    <select
                                      className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-xs"
                                      value={problem.difficulty}
                                      onChange={(event) => {
                                        const value = event.target.value as Difficulty;
                                        updateProblem(problem.id, (prev) => ({ ...prev, difficulty: value }));
                                      }}
                                    >
                                      <option value="">-</option>
                                      <option value="easy">easy</option>
                                      <option value="medium">medium</option>
                                      <option value="hard">hard</option>
                                    </select>
                                  </label>
                                  <label className="text-xs">
                                    Docs URL
                                    <input
                                      className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-xs"
                                      value={problem.docsUrl}
                                      onChange={(event) => updateProblem(problem.id, (prev) => ({ ...prev, docsUrl: event.target.value }))}
                                      placeholder="https://..."
                                    />
                                  </label>
                                  <label className="text-xs">
                                    Solution path
                                    <input
                                      className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-xs"
                                      value={problem.solutionPath}
                                      onChange={(event) => updateProblem(problem.id, (prev) => ({ ...prev, solutionPath: event.target.value }))}
                                      placeholder="/abs/path/file"
                                    />
                                  </label>
                                  <label className="text-xs md:col-span-2">
                                    Notes
                                    <textarea
                                      className="mt-1 min-h-[56px] w-full rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-xs"
                                      value={problem.notes}
                                      onChange={(event) => updateProblem(problem.id, (prev) => ({ ...prev, notes: event.target.value }))}
                                      placeholder="pitfalls, ideea, test cases"
                                    />
                                  </label>
                                </div>
                              </div>
                            ))}
                          </div>
                        </details>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {state.ui.showTheory ? (
              <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-3">
                <h3 className="text-sm font-semibold">Teorie (parcata separat)</h3>
                <div className="mt-2 space-y-2 text-xs text-[var(--muted)]">
                  {state.theory.map((item) => (
                    <div key={item.id} className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-2">
                      <div className="font-semibold text-[var(--fg)]">{item.title}</div>
                      <div>{item.notes}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </article>

          <article className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4 shadow-sm">
            <h2 className="text-lg font-semibold">AI Coach Focus</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">AI-ul prioritieaza problema focus + urmatorul pas din roadmap.</p>

            <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-3 text-sm">
              <div className="text-xs uppercase text-[var(--muted)]">Focus curent</div>
              <div className="mt-1 font-semibold">{focusProblem?.title ?? 'Alege o problema'}</div>
              <div className="text-xs text-[var(--muted)]">{focusProblem?.categoryTitle ?? '-'}</div>
            </div>

            <div className="mt-3 h-[260px] space-y-2 overflow-auto rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-3">
              {state.chat.map((message) => (
                <div
                  key={message.id}
                  className={`rounded-lg border px-3 py-2 text-sm ${message.role === 'coach' ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-sky-500/30 bg-sky-500/10'}`}
                >
                  <div className="mb-1 text-xs uppercase text-[var(--muted)]">{message.role} · {message.source}</div>
                  <div>{message.text}</div>
                </div>
              ))}
            </div>

            <div className="mt-3 flex gap-2">
              <input
                className="w-full rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-sm"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ex: am terminat Two Sum, ce urmeaza?"
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

            <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-3">
              <h3 className="text-sm font-semibold">Quick check-in pe problema focus</h3>
              <label className="mt-2 block text-xs">Confidence</label>
              <input className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-sm" type="number" min={0} max={100} value={confidence} onChange={(e) => setConfidence(Number(e.target.value || 0))} />

              <label className="mt-2 block text-xs">Ce ai rezolvat</label>
              <textarea className="mt-1 min-h-[64px] w-full rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-xs" value={checkinSummary} onChange={(e) => setCheckinSummary(e.target.value)} placeholder="pattern, complexitate, edge cases" />

              <label className="mt-2 block text-xs">Blocaje</label>
              <textarea className="mt-1 min-h-[56px] w-full rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-xs" value={checkinBlockers} onChange={(e) => setCheckinBlockers(e.target.value)} placeholder="unde te-ai blocat" />

              <button className="mt-3 rounded-md border border-emerald-500/40 bg-emerald-500/20 px-3 py-2 text-sm font-semibold" onClick={() => void sendCheckin()} disabled={checkinBusy || !focusProblem}>
                {checkinBusy ? 'Sending...' : 'Send check-in'}
              </button>
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}
