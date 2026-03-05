'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { buildDeadlineSprintTopics, buildInterviewCorePlannerTopics, chapterConceptCount, flattenConcepts, getPrioritizedChapters, INTERVIEW_CORE_CHAPTER_IDS } from '@/lib/studySyllabus';

type EnergyMode = 'normal' | 'low' | 'focus';
type Score = 'pass' | 'hard' | 'fail';
type GapReason = 'concept_gap' | 'mixed_terms' | 'no_example' | 'no_code';
type BlockType = 'learn_concept' | 'learn_coding' | 'review_spaced' | 'interleave_drill';
type CardStatus = 'new' | 'reviewing' | 'mastered';

type PlannerInput = {
  date: string;
  day_window: {
    start: string;
    end: string;
    hard_stop: boolean;
  };
  break_policy: {
    work_min: number;
    break_min: number;
    long_break_every: number;
    long_break_min: number;
  };
  topics: Array<{
    id: string;
    name: string;
    weight: number;
    modes: string[];
    objectives: string[];
  }>;
  blocks: {
    target_count: number;
    templates: Array<{
      type: BlockType;
      min: number;
      max: number;
    }>;
  };
  spaced_review: {
    include_due_reviews: boolean;
    max_review_blocks: number;
  };
};

type PlanStage = {
  id: string;
  label: string;
  minutes: number;
  prompt: string;
  noNotes?: boolean;
};

type PlanBlock = {
  id: string;
  topicId: string;
  topicName: string;
  blockType: BlockType;
  objective: string;
  stages: PlanStage[];
  plannedStart: string;
  plannedEnd: string;
  totalMinutes: number;
  movedToTomorrow?: boolean;
};

type ConceptProgressStatus = 'new' | 'learning' | 'reviewing' | 'mastered';
type DaySummary = {
  endedAt: string;
  doneBlocks: PlanBlock[];
  movedBlocks: PlanBlock[];
};

type GapCard = {
  id: string;
  topic_id: string;
  prompt: string;
  gold_answer: string | null;
  example: string | null;
  status: CardStatus;
  next_due_date: string;
  last_result: 'pass' | 'fail' | null;
};

const DEFAULT_TOPICS = buildInterviewCorePlannerTopics(5);
const SNAPSHOT_KEY = 'study-coach-state-v2';
const PHASE1_CHAPTERS = ['oop', 'dsa'];
const PHASE2_CHAPTERS = ['core-cs-fundamentals', 'database-fundamentals', 'backend-system-basics'];
const PHASE3_CHAPTERS = ['networking-fundamentals', 'distributed-systems', 'containers-deployment', 'security-fundamentals', 'ai-llm-optional'];

const FALLBACK_PLAN: PlannerInput = {
  date: new Date().toISOString().slice(0, 10),
  day_window: { start: '09:00', end: '21:00', hard_stop: true },
  break_policy: { work_min: 50, break_min: 10, long_break_every: 3, long_break_min: 20 },
  topics: DEFAULT_TOPICS,
  blocks: {
    target_count: 8,
    templates: [
      { type: 'learn_concept', min: 3, max: 4 },
      { type: 'learn_coding', min: 1, max: 2 },
      { type: 'review_spaced', min: 1, max: 2 },
    ],
  },
  spaced_review: {
    include_due_reviews: true,
    max_review_blocks: 2,
  },
};

const STAGE_TEMPLATES: Record<BlockType, Array<Omit<PlanStage, 'id'>>> = {
  learn_concept: [
    { label: 'Primer (Read)', minutes: 8, prompt: 'Read focused notes for the objective.' },
    { label: 'Recall', minutes: 15, prompt: 'Explain without notes. Include definition, example, tradeoff.', noNotes: true },
    { label: 'Check & Fix', minutes: 7, prompt: 'Compare with source. Fix missing points.' },
    { label: 'Mini-test', minutes: 5, prompt: 'Answer 1-2 prompt questions from memory.', noNotes: true },
  ],
  learn_coding: [
    { label: 'Prompt', minutes: 5, prompt: 'Read the coding prompt and constraints.' },
    { label: 'Implement from memory', minutes: 25, prompt: 'Code without notes. Focus on core path.', noNotes: true },
    { label: 'Check & Fix', minutes: 10, prompt: 'Run mental checks and patch weak points.' },
    { label: 'Mistake Note', minutes: 2, prompt: 'Write one mistake to avoid next time.' },
  ],
  review_spaced: [
    { label: 'Recall prompts', minutes: 12, prompt: 'Run 2-4 flash prompts quickly.', noNotes: true },
    { label: 'Check', minutes: 6, prompt: 'Compare answers and mark misses.' },
    { label: 'Re-attempt', minutes: 6, prompt: 'Retry failed prompts without notes.', noNotes: true },
  ],
  interleave_drill: [
    { label: 'Prompt A', minutes: 8, prompt: 'Topic 1 quick recall.', noNotes: true },
    { label: 'Prompt B', minutes: 8, prompt: 'Topic 2 quick recall.', noNotes: true },
    { label: 'Prompt C', minutes: 8, prompt: 'Topic 3 quick recall.', noNotes: true },
  ],
};

function parseTime(baseDate: string, hhmm: string) {
  const [hh, mm] = hhmm.split(':').map((x) => Number(x));
  const dt = new Date(`${baseDate}T00:00:00`);
  dt.setHours(hh || 0, mm || 0, 0, 0);
  return dt;
}

function stageScale(energy: EnergyMode) {
  if (energy === 'low') return 0.5;
  if (energy === 'focus') return 1.7;
  return 1;
}

function weightedTopicPick(
  topics: PlannerInput['topics'],
  usedByTopic: Record<string, number>,
  prevTopicId: string | null,
  idx: number
) {
  const target = topics.reduce<Record<string, number>>((acc, topic) => {
    acc[topic.id] = topic.weight;
    return acc;
  }, {});

  const candidates = topics
    .map((topic) => {
      const used = usedByTopic[topic.id] ?? 0;
      const desired = target[topic.id] * (idx + 1);
      return { topic, score: desired - used };
    })
    .sort((a, b) => b.score - a.score);

  const nonRepeat = candidates.find((item) => item.topic.id !== prevTopicId);
  return (nonRepeat ?? candidates[0]).topic;
}

function chooseObjective(topic: PlannerInput['topics'][number], usedCount: number) {
  if (!topic.objectives.length) return topic.name;
  return topic.objectives[usedCount % topic.objectives.length];
}

function buildBlockTypes(input: PlannerInput) {
  const desired = input.blocks.target_count;
  const templates = input.blocks.templates;
  const counts = templates.reduce<Record<string, number>>((acc, tpl) => {
    acc[tpl.type] = tpl.min;
    return acc;
  }, {});

  let total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  while (total < desired) {
    let changed = false;
    for (const tpl of templates) {
      if (total >= desired) break;
      if ((counts[tpl.type] ?? 0) < tpl.max) {
        counts[tpl.type] += 1;
        total += 1;
        changed = true;
      }
    }
    if (!changed) break;
  }

  const pool: BlockType[] = [];
  templates.forEach((tpl) => {
    const c = counts[tpl.type] ?? 0;
    for (let i = 0; i < c; i += 1) pool.push(tpl.type);
  });

  return pool;
}

function generatePlan(
  input: PlannerInput,
  energy: EnergyMode,
  startAtIso?: string,
  topicOffsets: Record<string, number> = {}
) {
  const pool = buildBlockTypes(input);
  const byPriority = [...pool].sort((a, b) => {
    if (a === 'learn_concept' && b !== 'learn_concept') return -1;
    if (b === 'learn_concept' && a !== 'learn_concept') return 1;
    return 0;
  });

  const usedByTopic: Record<string, number> = {};
  const dayStart = parseTime(input.date, input.day_window.start);
  const explicitStart = startAtIso ? new Date(startAtIso) : dayStart;
  const start = explicitStart.getTime() > dayStart.getTime() ? explicitStart : dayStart;
  let cursor = new Date(start);
  let prevTopicId: string | null = null;

  const blocks: PlanBlock[] = byPriority.map((type, idx) => {
    const topic = weightedTopicPick(input.topics, usedByTopic, prevTopicId, idx);
    usedByTopic[topic.id] = (usedByTopic[topic.id] ?? 0) + 1;
    prevTopicId = topic.id;

    const offset = topicOffsets[topic.id] ?? 0;
    const objective = chooseObjective(topic, usedByTopic[topic.id] - 1 + offset);
    const stages = STAGE_TEMPLATES[type].map((stage, stageIdx) => ({
      ...stage,
      id: `${type}-${idx + 1}-stage-${stageIdx + 1}`,
      minutes: Math.max(2, Math.round(stage.minutes * stageScale(energy))),
    }));

    const totalMinutes = stages.reduce((sum, stage) => sum + stage.minutes, 0);
    const plannedStart = new Date(cursor);
    cursor = new Date(cursor.getTime() + totalMinutes * 60_000);
    const plannedEnd = new Date(cursor);

    const breakMins = (idx + 1) % input.break_policy.long_break_every === 0
      ? input.break_policy.long_break_min
      : input.break_policy.break_min;

    cursor = new Date(cursor.getTime() + breakMins * 60_000);

    return {
      id: `block-${idx + 1}`,
      topicId: topic.id,
      topicName: topic.name,
      blockType: type,
      objective,
      stages,
      plannedStart: plannedStart.toISOString(),
      plannedEnd: plannedEnd.toISOString(),
      totalMinutes,
    };
  });

  return blocks;
}

function blockLabel(type: BlockType) {
  if (type === 'learn_concept') return 'Learn Concept';
  if (type === 'learn_coding') return 'Learn Coding';
  if (type === 'review_spaced') return 'Review Spaced';
  return 'Interleave Drill';
}

function shortTime(iso: string) {
  return new Date(iso).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
}

function statusClass(status: CardStatus) {
  if (status === 'mastered') return 'border-emerald-500/40 bg-emerald-500/15 text-emerald-100';
  if (status === 'reviewing') return 'border-amber-500/40 bg-amber-500/15 text-amber-100';
  return 'border-slate-500/40 bg-slate-500/15 text-slate-100';
}

function stepInstruction(stage: PlanStage | null) {
  if (!stage) return 'Selecteaza un bloc ca sa incepi.';
  if (stage.label.toLowerCase().includes('read') || stage.label.toLowerCase().includes('primer')) {
    return 'Citeste strict pe obiectiv. Nu lua notite lungi.';
  }
  if (stage.noNotes) {
    return 'Active recall: inchide notitele si raspunde din memorie.';
  }
  if (stage.label.toLowerCase().includes('check')) {
    return 'Verifica raspunsul fata de sursa si corecteaza golurile.';
  }
  return 'Executa etapa curenta, apoi treci la urmatoarea etapa.';
}

function normalizeText(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export default function StudyCoachPage() {
  const todayIso = new Date().toISOString().slice(0, 10);
  const sprintCutoff = '2026-03-10';
  const [plannerInput, setPlannerInput] = useState<PlannerInput>(FALLBACK_PLAN);
  const [rawJson, setRawJson] = useState(() => JSON.stringify(FALLBACK_PLAN, null, 2));
  const [energyMode, setEnergyMode] = useState<EnergyMode>('normal');
  const [blocks, setBlocks] = useState<PlanBlock[]>(() => generatePlan(FALLBACK_PLAN, 'normal', new Date().toISOString()));
  const [tomorrowQueue, setTomorrowQueue] = useState<PlanBlock[]>([]);
  const [adjustNotice, setAdjustNotice] = useState<string>('');

  const [currentBlockIdx, setCurrentBlockIdx] = useState(0);
  const [currentStageIdx, setCurrentStageIdx] = useState(0);
  const [runState, setRunState] = useState<'idle' | 'running' | 'paused' | 'done'>('idle');
  const [stageSecondsLeft, setStageSecondsLeft] = useState(0);
  const [focusAssist, setFocusAssist] = useState(true);

  const [answerText, setAnswerText] = useState('');
  const [score, setScore] = useState<Score | null>(null);
  const [gapReasons, setGapReasons] = useState<GapReason[]>([]);
  const [gapCards, setGapCards] = useState<GapCard[]>([]);

  const [ownerId, setOwnerId] = useState('local');
  const [dayId, setDayId] = useState<string | null>(null);
  const [todayDone, setTodayDone] = useState(0);
  const [todayPassRate, setTodayPassRate] = useState<number>(0);
  const [todayCompletedMinutes, setTodayCompletedMinutes] = useState<number>(0);
  const [todayTopicSessions, setTodayTopicSessions] = useState<Record<string, number>>({});
  const [dbError, setDbError] = useState<string | null>(null);
  const [conceptProgress, setConceptProgress] = useState<Record<string, ConceptProgressStatus>>({});
  const [hardStopAutoMoved, setHardStopAutoMoved] = useState(false);
  const [daySummary, setDaySummary] = useState<DaySummary | null>(null);
  const [hydratedFromSnapshot, setHydratedFromSnapshot] = useState(false);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const [deadlineSprint, setDeadlineSprint] = useState(() => todayIso <= sprintCutoff);

  const activeBlock = blocks[currentBlockIdx] ?? null;
  const activeStage = activeBlock?.stages[currentStageIdx] ?? null;
  const allConcepts = useMemo(() => flattenConcepts(), []);

  const blocksRemaining = useMemo(() => Math.max(0, blocks.length - currentBlockIdx), [blocks.length, currentBlockIdx]);
  const hardStopMinutesLeft = useMemo(() => {
    const hardStopTs = parseTime(plannerInput.date, plannerInput.day_window.end).getTime();
    return Math.max(0, Math.ceil((hardStopTs - nowTs) / 60_000));
  }, [nowTs, plannerInput.date, plannerInput.day_window.end]);

  const planMinutesLeft = useMemo(() => {
    const left = blocks.slice(currentBlockIdx).reduce((sum, block, idx) => {
      if (idx === 0 && activeStage) {
        const nextStageMinutes = block.stages.slice(currentStageIdx + 1).reduce((s, stage) => s + stage.minutes, 0);
        return sum + Math.ceil(stageSecondsLeft / 60) + nextStageMinutes;
      }
      return sum + block.totalMinutes;
    }, 0);
    return Math.max(0, left);
  }, [activeStage, blocks, currentBlockIdx, currentStageIdx, stageSecondsLeft]);

  const projectedSpillover = useMemo(() => {
    let cursor = Math.max(nowTs, activeBlock ? new Date(activeBlock.plannedStart).getTime() : nowTs);
    let spilledBlocks = 0;
    let overflowMinutes = 0;
    const hardStopTs = parseTime(plannerInput.date, plannerInput.day_window.end).getTime();

    for (let i = currentBlockIdx; i < blocks.length; i += 1) {
      const block = blocks[i];
      const blockMinutes = i === currentBlockIdx && activeStage
        ? Math.ceil(stageSecondsLeft / 60) + block.stages.slice(currentStageIdx + 1).reduce((sum, stage) => sum + stage.minutes, 0)
        : block.totalMinutes;
      const endTs = cursor + blockMinutes * 60_000;
      if (endTs > hardStopTs) {
        spilledBlocks += 1;
        overflowMinutes += Math.ceil((endTs - hardStopTs) / 60_000);
      }
      const breakMinutes = (i + 1) % plannerInput.break_policy.long_break_every === 0
        ? plannerInput.break_policy.long_break_min
        : plannerInput.break_policy.break_min;
      cursor = endTs + breakMinutes * 60_000;
    }

    return { spilledBlocks, overflowMinutes };
  }, [activeBlock, activeStage, blocks, currentBlockIdx, currentStageIdx, nowTs, plannerInput.break_policy.break_min, plannerInput.break_policy.long_break_every, plannerInput.break_policy.long_break_min, plannerInput.date, plannerInput.day_window.end, stageSecondsLeft]);
  const recoverableToday = useMemo(
    () => projectedSpillover.spilledBlocks <= 1 && projectedSpillover.overflowMinutes <= 20,
    [projectedSpillover.overflowMinutes, projectedSpillover.spilledBlocks]
  );
  const aheadMinutes = useMemo(
    () => Math.max(0, hardStopMinutesLeft - planMinutesLeft),
    [hardStopMinutesLeft, planMinutesLeft]
  );
  const recoverableQueueCount = useMemo(() => {
    if (!tomorrowQueue.length) return 0;
    let budget = Math.max(0, aheadMinutes + 20);
    let count = 0;
    for (let i = 0; i < tomorrowQueue.length; i += 1) {
      const block = tomorrowQueue[i];
      const breakMinutes = (i + 1) % plannerInput.break_policy.long_break_every === 0
        ? plannerInput.break_policy.long_break_min
        : plannerInput.break_policy.break_min;
      const needed = block.totalMinutes + breakMinutes;
      if (budget < needed) break;
      budget -= needed;
      count += 1;
    }
    return count;
  }, [aheadMinutes, plannerInput.break_policy.break_min, plannerInput.break_policy.long_break_every, plannerInput.break_policy.long_break_min, tomorrowQueue]);
  const projectedTomorrowCount = useMemo(
    () => {
      const raw = recoverableToday ? tomorrowQueue.length : Math.max(tomorrowQueue.length, projectedSpillover.spilledBlocks);
      return Math.max(0, raw - recoverableQueueCount);
    },
    [projectedSpillover.spilledBlocks, recoverableQueueCount, recoverableToday, tomorrowQueue.length]
  );
  const whereGoingLabel = useMemo(() => {
    if (recoverableQueueCount > 0) {
      const stillTomorrow = Math.max(0, projectedTomorrowCount);
      if (stillTomorrow > 0) {
        return `${stillTomorrow} block(s) remain for tomorrow (${recoverableQueueCount} can still be recovered today)`;
      }
      return `Forward mode: all queued blocks are recoverable today`;
    }
    if (recoverableToday && tomorrowQueue.length === 0) {
      return `Forward mode: small overflow (~${projectedSpillover.overflowMinutes}m) can be recovered today`;
    }
    if (projectedTomorrowCount > 0) {
      return `${projectedTomorrowCount} block(s) projected for tomorrow`;
    }
    if (aheadMinutes >= 30) {
      return `Ahead by ~${aheadMinutes}m (you can add new blocks today)`;
    }
    return 'On track for today';
  }, [aheadMinutes, projectedSpillover.overflowMinutes, projectedTomorrowCount, recoverableQueueCount, recoverableToday, tomorrowQueue.length]);
  const focusMinutesInBlock = useMemo(() => {
    if (!activeBlock) return 0;
    return activeBlock.stages.filter((stage) => stage.noNotes).reduce((sum, stage) => sum + stage.minutes, 0);
  }, [activeBlock]);

  const focusMinutesLeftNow = useMemo(() => {
    if (!activeBlock) return 0;
    let mins = 0;
    activeBlock.stages.forEach((stage, idx) => {
      if (!stage.noNotes) return;
      if (idx < currentStageIdx) return;
      if (idx === currentStageIdx) {
        mins += Math.ceil(Math.max(0, stageSecondsLeft) / 60);
      } else {
        mins += stage.minutes;
      }
    });
    return mins;
  }, [activeBlock, currentStageIdx, stageSecondsLeft]);

  const inRecallFocus = Boolean(activeStage?.noNotes && runState === 'running' && focusAssist);
  const recommendedChapterIds = useMemo(() => {
    const prioritized = getPrioritizedChapters();
    const chapterMastery = (chapterId: string) => {
      const chapterConcepts = allConcepts.filter((concept) => concept.chapterId === chapterId);
      if (!chapterConcepts.length) return 0;
      const mastered = chapterConcepts.filter((concept) => conceptProgress[concept.conceptId] === 'mastered').length;
      return mastered / chapterConcepts.length;
    };

    const phase1Ready = PHASE1_CHAPTERS.every((chapterId) => chapterMastery(chapterId) >= 0.6);
    if (!phase1Ready) return PHASE1_CHAPTERS;

    const phase2Ready = PHASE2_CHAPTERS.every((chapterId) => chapterMastery(chapterId) >= 0.55);
    if (!phase2Ready) return [...PHASE1_CHAPTERS, ...PHASE2_CHAPTERS];

    const core = prioritized
      .filter((chapter) => INTERVIEW_CORE_CHAPTER_IDS.includes(chapter.id as (typeof INTERVIEW_CORE_CHAPTER_IDS)[number]))
      .map((chapter) => chapter.id);
    const phase3Top = PHASE3_CHAPTERS.slice(0, 2);
    return [...core, ...phase3Top];
  }, [allConcepts, conceptProgress]);

  const timelineRows = useMemo(() => {
    const rows: Array<{
      id: string;
      kind: 'block' | 'break';
      label: string;
      start: string;
      end: string;
      status: 'done' | 'now' | 'next';
    }> = [];

    blocks.forEach((block, idx) => {
      const status: 'done' | 'now' | 'next' = idx < currentBlockIdx ? 'done' : idx === currentBlockIdx ? 'now' : 'next';
      rows.push({
        id: block.id,
        kind: 'block',
        label: `${block.topicName} · ${block.objective}`,
        start: block.plannedStart,
        end: block.plannedEnd,
        status,
      });

      if (idx >= blocks.length - 1) return;
      const breakStart = new Date(block.plannedEnd);
      const breakMinutes = (idx + 1) % plannerInput.break_policy.long_break_every === 0
        ? plannerInput.break_policy.long_break_min
        : plannerInput.break_policy.break_min;
      const breakEnd = new Date(breakStart.getTime() + breakMinutes * 60_000);
      rows.push({
        id: `break-${idx + 1}`,
        kind: 'break',
        label: breakMinutes >= plannerInput.break_policy.long_break_min ? 'Long break' : 'Break',
        start: breakStart.toISOString(),
        end: breakEnd.toISOString(),
        status: status === 'done' ? 'done' : 'next',
      });
    });

    return rows;
  }, [blocks, currentBlockIdx, plannerInput.break_policy.break_min, plannerInput.break_policy.long_break_every, plannerInput.break_policy.long_break_min]);

  const loadDbState = useCallback(async (resolvedOwnerId: string, date: string) => {
    const { data: dayRow, error: dayErr } = await supabase
      .from('study_days')
      .upsert(
        {
          owner_id: resolvedOwnerId,
          date,
          planned_minutes: blocks.reduce((sum, block) => sum + block.totalMinutes, 0),
        },
        { onConflict: 'owner_id,date' }
      )
      .select('id,completed_minutes')
      .single();

    if (dayErr) {
      setDbError(dayErr.message);
      return;
    }

    const resolvedDayId = dayRow.id as string;
    setDayId(resolvedDayId);
    setTodayCompletedMinutes(Number(dayRow.completed_minutes ?? 0));

    const { data: sessionRows, error: sessionsErr } = await supabase
      .from('study_sessions')
      .select('score,topic_id')
      .eq('owner_id', resolvedOwnerId)
      .eq('day_id', resolvedDayId);

    if (sessionsErr) {
      setDbError(sessionsErr.message);
      return;
    }

    const rows = (sessionRows ?? []) as Array<{ score: Score | null; topic_id: string | null }>;
    const done = rows.length;
    const graded = rows.filter((row) => row.score);
    const passCount = graded.filter((row) => row.score === 'pass').length;
    const topicCounts = rows.reduce<Record<string, number>>((acc, row) => {
      if (!row.topic_id) return acc;
      acc[row.topic_id] = (acc[row.topic_id] ?? 0) + 1;
      return acc;
    }, {});
    setTodayDone(done);
    setTodayPassRate(graded.length ? Math.round((passCount / graded.length) * 100) : 0);
    setTodayTopicSessions(topicCounts);

    const { data: dueCards, error: gapErr } = await supabase
      .from('study_gap_cards')
      .select('id,topic_id,prompt,gold_answer,example,status,next_due_date,last_result')
      .eq('owner_id', resolvedOwnerId)
      .neq('status', 'mastered')
      .lte('next_due_date', date)
      .order('next_due_date', { ascending: true })
      .limit(12);

    if (gapErr) {
      setDbError(gapErr.message);
      return;
    }

    const { data: progressRows, error: progressErr } = await supabase
      .from('study_concept_progress')
      .select('concept_id,status')
      .eq('owner_id', resolvedOwnerId);

    if (progressErr) {
      setDbError(progressErr.message);
      return;
    }

    const mappedProgress: Record<string, ConceptProgressStatus> = {};
    (progressRows ?? []).forEach((row: { concept_id: string; status: ConceptProgressStatus }) => {
      mappedProgress[row.concept_id] = row.status as ConceptProgressStatus;
    });

    setConceptProgress(mappedProgress);
    setGapCards((dueCards ?? []) as GapCard[]);
    setDbError(null);
  }, [blocks]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!alive) return;

      const resolvedOwnerId = user?.id ?? 'local';
      setOwnerId(resolvedOwnerId);
      await loadDbState(resolvedOwnerId, plannerInput.date);
    })();

    return () => {
      alive = false;
    };
  }, [loadDbState, plannerInput.date]);

  useEffect(() => {
    const id = window.setInterval(() => setNowTs(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const raw = window.localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) {
      setHydratedFromSnapshot(true);
      return;
    }

    try {
      const parsed = JSON.parse(raw) as {
        savedAt: string;
        plannerInput: PlannerInput;
        rawJson: string;
        energyMode: EnergyMode;
        blocks: PlanBlock[];
        tomorrowQueue: PlanBlock[];
        currentBlockIdx: number;
        currentStageIdx: number;
        runState: 'idle' | 'running' | 'paused' | 'done';
        stageSecondsLeft: number;
        answerText: string;
        score: Score | null;
        gapReasons: GapReason[];
        adjustNotice: string;
        focusAssist: boolean;
        hardStopAutoMoved: boolean;
        daySummary: DaySummary | null;
        deadlineSprint: boolean;
      };

      if (parsed.plannerInput.date !== todayIso) {
        setHydratedFromSnapshot(true);
        return;
      }

      setPlannerInput(parsed.plannerInput);
      setRawJson(parsed.rawJson);
      setEnergyMode(parsed.energyMode);
      setBlocks(parsed.blocks);
      setTomorrowQueue(parsed.tomorrowQueue);
      setCurrentBlockIdx(parsed.currentBlockIdx);
      setCurrentStageIdx(parsed.currentStageIdx);
      setAnswerText(parsed.answerText);
      setScore(parsed.score);
      setGapReasons(parsed.gapReasons);
      setAdjustNotice(parsed.adjustNotice);
      setFocusAssist(parsed.focusAssist);
      setHardStopAutoMoved(parsed.hardStopAutoMoved);
      setDaySummary(parsed.daySummary);
      setDeadlineSprint(typeof parsed.deadlineSprint === 'boolean' ? parsed.deadlineSprint : todayIso <= sprintCutoff);

      const elapsed = Math.max(0, Math.floor((Date.now() - new Date(parsed.savedAt).getTime()) / 1000));
      const remaining = Math.max(0, parsed.stageSecondsLeft - elapsed);
      setStageSecondsLeft(remaining);
      setRunState(parsed.runState === 'running' ? 'paused' : parsed.runState);
    } catch {
      // ignore corrupted snapshot
    } finally {
      setHydratedFromSnapshot(true);
    }
  }, [todayIso]);

  useEffect(() => {
    if (!hydratedFromSnapshot) return;
    const snapshot = {
      savedAt: new Date().toISOString(),
      plannerInput,
      rawJson,
      energyMode,
      blocks,
      tomorrowQueue,
      currentBlockIdx,
      currentStageIdx,
      runState,
      stageSecondsLeft,
      answerText,
      score,
      gapReasons,
      adjustNotice,
      focusAssist,
      hardStopAutoMoved,
      daySummary,
      deadlineSprint,
    };
    window.localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
  }, [adjustNotice, answerText, blocks, currentBlockIdx, currentStageIdx, daySummary, deadlineSprint, energyMode, focusAssist, gapReasons, hardStopAutoMoved, hydratedFromSnapshot, plannerInput, rawJson, runState, score, stageSecondsLeft, tomorrowQueue]);

  useEffect(() => {
    if (!activeStage || runState !== 'running') return;

    if (stageSecondsLeft <= 0) {
      if (activeBlock && currentStageIdx < activeBlock.stages.length - 1) {
        const nextIdx = currentStageIdx + 1;
        setCurrentStageIdx(nextIdx);
        setStageSecondsLeft(activeBlock.stages[nextIdx].minutes * 60);
        return;
      }
      setRunState('paused');
      return;
    }

    const id = window.setInterval(() => {
      setStageSecondsLeft((prev) => prev - 1);
    }, 1000);

    return () => window.clearInterval(id);
  }, [activeBlock, activeStage, currentStageIdx, runState, stageSecondsLeft]);

  const resetTimerFromCurrentStage = useCallback(() => {
    if (!activeStage) return;
    setStageSecondsLeft(activeStage.minutes * 60);
  }, [activeStage]);

  useEffect(() => {
    resetTimerFromCurrentStage();
  }, [currentBlockIdx, currentStageIdx, resetTimerFromCurrentStage]);

  const applyAdaptiveReschedule = useCallback((extraMinutes: number) => {
    if (!blocks.length) return;

    const cloned = [...blocks];
    const baseDate = plannerInput.date;
    let cursor = new Date();
    let moved = 0;

    const hardStop = parseTime(baseDate, plannerInput.day_window.end);
    const workBreakMin = Math.max(5, plannerInput.break_policy.break_min - Math.ceil(extraMinutes / 10));

    for (let i = currentBlockIdx; i < cloned.length; i += 1) {
      const block = { ...cloned[i], stages: [...cloned[i].stages] };

      if (i === currentBlockIdx) {
        cursor = new Date(Date.now() + extraMinutes * 60_000);
      }

      const stageCopy = block.stages.map((stage) => ({ ...stage }));
      block.stages = stageCopy;

      let blockMinutes = stageCopy.reduce((sum, stage) => sum + stage.minutes, 0);
      let predictedEnd = new Date(cursor.getTime() + blockMinutes * 60_000);

      if (plannerInput.day_window.hard_stop && predictedEnd > hardStop) {
        for (let stageIdx = 0; stageIdx < stageCopy.length; stageIdx += 1) {
          const stage = stageCopy[stageIdx];
          if (stage.label.toLowerCase().includes('read') || stage.label.toLowerCase().includes('primer')) {
            stage.minutes = Math.max(2, Math.round(stage.minutes * 0.65));
          }
        }
        blockMinutes = stageCopy.reduce((sum, stage) => sum + stage.minutes, 0);
        predictedEnd = new Date(cursor.getTime() + blockMinutes * 60_000);
      }

      if (plannerInput.day_window.hard_stop && predictedEnd > hardStop) {
        block.movedToTomorrow = true;
        moved += 1;
      } else {
        block.movedToTomorrow = false;
        block.totalMinutes = blockMinutes;
        block.plannedStart = cursor.toISOString();
        block.plannedEnd = predictedEnd.toISOString();
        cursor = new Date(predictedEnd.getTime() + workBreakMin * 60_000);
      }

      cloned[i] = block;
    }

    const movedBlocks = cloned.filter((block) => block.movedToTomorrow);
    const keep = cloned.filter((block) => !block.movedToTomorrow);
    setBlocks(keep);
    setTomorrowQueue((prev) => [...prev, ...movedBlocks]);

    setAdjustNotice(
      moved
        ? `Today plan adjusted: ${moved} block${moved > 1 ? 's' : ''} moved to tomorrow.`
        : 'Today plan adjusted: breaks compressed and read stages shortened.'
    );
  }, [blocks, currentBlockIdx, plannerInput.break_policy.break_min, plannerInput.date, plannerInput.day_window.end, plannerInput.day_window.hard_stop]);

  const handleStart = () => {
    if (!activeStage) return;
    if (runState === 'idle') {
      setStageSecondsLeft(activeStage.minutes * 60);
    }
    setRunState('running');
  };

  const handlePause = () => setRunState('paused');

  const handleResume = () => {
    if (!activeStage) return;
    setRunState('running');
  };

  const handleSkip = () => {
    if (!activeBlock) return;
    const next = [...blocks];
    const [block] = next.splice(currentBlockIdx, 1);
    if (block) next.push(block);
    setBlocks(next);
    setCurrentStageIdx(0);
    setRunState('idle');
    setAdjustNotice('Current block moved to later.');
  };

  const handleLongBreak = () => {
    setRunState('paused');
    applyAdaptiveReschedule(15);
  };

  const handleEndDay = () => {
    const doneBlocks = blocks.slice(0, currentBlockIdx);
    const movedBlocks = blocks.slice(currentBlockIdx);
    setRunState('done');
    setCurrentStageIdx(0);
    setAdjustNotice('Day ended manually. Unfinished blocks moved to tomorrow.');
    if (movedBlocks.length) setTomorrowQueue((prev) => [...prev, ...movedBlocks]);
    setBlocks(doneBlocks);
    setDaySummary({
      endedAt: new Date().toISOString(),
      doneBlocks,
      movedBlocks,
    });
  };

  const finishStage = () => {
    if (!activeBlock) return;
    if (currentStageIdx < activeBlock.stages.length - 1) {
      const next = currentStageIdx + 1;
      setCurrentStageIdx(next);
      setStageSecondsLeft(activeBlock.stages[next].minutes * 60);
      setRunState('running');
      return;
    }
    setRunState('paused');
  };

  const goToPreviousStage = () => {
    if (!activeBlock) return;
    if (currentStageIdx <= 0) return;

    const prev = currentStageIdx - 1;
    setCurrentStageIdx(prev);
    setStageSecondsLeft(activeBlock.stages[prev].minutes * 60);
    setRunState('paused');
  };

  const ensureTopics = useCallback(async (topics: PlannerInput['topics']) => {
    const rows = topics.map((topic) => ({
      owner_id: ownerId,
      id: topic.id,
      name: topic.name,
    }));

    const { error } = await supabase
      .from('study_topics')
      .upsert(rows, { onConflict: 'id' });

    if (error) setDbError(error.message);
  }, [ownerId]);

  const persistSession = useCallback(async (sessionScore: Score | null) => {
    if (!activeBlock || !dayId) return;

    const nowIso = new Date().toISOString();

    const { error: sessionErr } = await supabase
      .from('study_sessions')
      .insert({
        owner_id: ownerId,
        day_id: dayId,
        topic_id: activeBlock.topicId,
        block_type: activeBlock.blockType,
        planned_start: activeBlock.plannedStart,
        actual_start: nowIso,
        actual_end: nowIso,
        score: sessionScore,
        energy: energyMode,
      });

    if (sessionErr) {
      setDbError(sessionErr.message);
      return;
    }

    const { error: dayErr } = await supabase
      .from('study_days')
      .update({ completed_minutes: Math.max(0, todayCompletedMinutes + activeBlock.totalMinutes) })
      .eq('id', dayId);

    if (dayErr) {
      setDbError(dayErr.message);
      return;
    }

    const chapterConcepts = allConcepts.filter((concept) => concept.chapterId === activeBlock.topicId);
    const normalizedObjective = normalizeText(activeBlock.objective);
    const matched = chapterConcepts.find((concept) => {
      const conceptNorm = normalizeText(concept.conceptLabel);
      return conceptNorm === normalizedObjective
        || conceptNorm.includes(normalizedObjective)
        || normalizedObjective.includes(conceptNorm);
    });

    if (matched) {
      const { data: existing } = await supabase
        .from('study_concept_progress')
        .select('mastery_score,status')
        .eq('owner_id', ownerId)
        .eq('concept_id', matched.conceptId)
        .maybeSingle();

      const prevScore = Number(existing?.mastery_score ?? 0);
      const delta = sessionScore === 'pass' ? 2 : sessionScore === 'hard' ? 1 : 0;
      const nextScore = Math.max(0, Math.min(10, prevScore + delta));
      const nextStatus: ConceptProgressStatus = nextScore >= 6
        ? 'mastered'
        : nextScore >= 3
          ? 'reviewing'
          : nextScore >= 1
            ? 'learning'
            : 'new';
      const due = new Date();
      due.setDate(due.getDate() + (sessionScore === 'pass' ? 7 : sessionScore === 'hard' ? 3 : 1));

      const { error: progressErr } = await supabase
        .from('study_concept_progress')
        .upsert(
          {
            owner_id: ownerId,
            concept_id: matched.conceptId,
            status: nextStatus,
            mastery_score: nextScore,
            last_result: sessionScore,
            last_reviewed_at: nowIso,
            next_due_date: due.toISOString().slice(0, 10),
          },
          { onConflict: 'owner_id,concept_id' }
        );

      if (progressErr) {
        setDbError(progressErr.message);
        return;
      }
    }

    await loadDbState(ownerId, plannerInput.date);
  }, [activeBlock, allConcepts, dayId, energyMode, loadDbState, ownerId, plannerInput.date, todayCompletedMinutes]);

  const addGapCard = useCallback(async () => {
    if (!activeBlock) return;

    const now = new Date();
    const due = new Date(now);
    due.setDate(due.getDate() + 1);

    const reasons = gapReasons.length ? gapReasons.join(', ') : 'general gap';
    const prompt = `I struggled with ${activeBlock.objective}: ${reasons}`;

    const { error } = await supabase
      .from('study_gap_cards')
      .insert({
        owner_id: ownerId,
        topic_id: activeBlock.topicId,
        prompt,
        gold_answer: null,
        example: answerText.trim() || null,
        status: 'new',
        next_due_date: due.toISOString().slice(0, 10),
        last_result: 'fail',
      });

    if (error) {
      setDbError(error.message);
      return;
    }

    await loadDbState(ownerId, plannerInput.date);
  }, [activeBlock, answerText, gapReasons, loadDbState, ownerId, plannerInput.date]);

  const submitBlockFeedback = async () => {
    if (!activeBlock || !score) return;

    if (score === 'fail') {
      await addGapCard();
    }

    await persistSession(score);

    setAnswerText('');
    setScore(null);
    setGapReasons([]);

    if (currentBlockIdx < blocks.length - 1) {
      setCurrentBlockIdx(currentBlockIdx + 1);
      setCurrentStageIdx(0);
      setRunState('idle');
      return;
    }

    setRunState('done');
    setAdjustNotice('Plan completed for today.');
  };

  const importJson = () => {
    try {
      const parsed = JSON.parse(rawJson) as PlannerInput;
      setPlannerInput(parsed);
      const startAt = parsed.date === todayIso ? new Date().toISOString() : undefined;
      const generated = generatePlan(parsed, energyMode, startAt, todayTopicSessions);
      setBlocks(generated);
      setCurrentBlockIdx(0);
      setCurrentStageIdx(0);
      setRunState('idle');
      setTomorrowQueue([]);
      setHardStopAutoMoved(false);
      setAdjustNotice('JSON imported and plan generated.');
      void ensureTopics(parsed.topics);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid JSON';
      setAdjustNotice(`JSON import failed: ${message}`);
    }
  };

  const regeneratePlan = () => {
    const startAt = plannerInput.date === todayIso ? new Date().toISOString() : undefined;
    const generated = generatePlan(plannerInput, energyMode, startAt, todayTopicSessions);
    setBlocks(generated);
    setCurrentBlockIdx(0);
    setCurrentStageIdx(0);
    setRunState('idle');
    setAdjustNotice('Plan regenerated.');
    setHardStopAutoMoved(false);
    void ensureTopics(plannerInput.topics);
  };

  const applyRoadmapAutoPlan = () => {
    const topicBase = deadlineSprint ? buildDeadlineSprintTopics() : buildInterviewCorePlannerTopics(5);
    const prioritized = topicBase.filter((topic) => recommendedChapterIds.includes(topic.id));
    const denominator = (prioritized.length * (prioritized.length + 1)) / 2 || 1;
    const topics = prioritized.map((topic, idx) => {
      const chapter = getPrioritizedChapters().find((item) => item.id === topic.id);
      if (!chapter) return topic;
      const chapterConcepts = allConcepts.filter((concept) => concept.chapterId === chapter.id);
      const weak = chapterConcepts.filter((concept) => {
        const status = conceptProgress[concept.conceptId] ?? 'new';
        return status === 'new' || status === 'learning';
      });
      const review = chapterConcepts.filter((concept) => {
        const status = conceptProgress[concept.conceptId] ?? 'new';
        return status === 'reviewing' || status === 'mastered';
      });
      const reviewTake = Math.min(review.length, Math.max(2, Math.ceil(weak.length * 0.35)));
      const mixed = [...weak.map((c) => c.conceptLabel), ...review.slice(0, reviewTake).map((c) => c.conceptLabel)];
      const objectives = [...new Set(mixed.length ? mixed : chapterConcepts.map((concept) => concept.conceptLabel))];

      return {
        id: topic.id,
        name: topic.name,
        weight: Number(((prioritized.length - idx) / denominator).toFixed(2)),
        modes: ['explain_like_interview', 'blank_page', 'flash_prompts'],
        objectives: [...objectives, ...topic.objectives.filter((objective) => !objectives.includes(objective))],
      };
    });
    const updated: PlannerInput = {
      ...plannerInput,
      day_window: {
        ...plannerInput.day_window,
        start: '09:00',
        end: '21:00',
        hard_stop: true,
      },
      topics,
      blocks: {
        ...plannerInput.blocks,
        target_count: Math.max(plannerInput.blocks.target_count, deadlineSprint ? 10 : 8),
        templates: deadlineSprint ? [
          { type: 'learn_concept', min: 4, max: 6 },
          { type: 'learn_coding', min: 1, max: 2 },
          { type: 'review_spaced', min: 3, max: 4 },
        ] : [
          { type: 'learn_concept', min: 3, max: 5 },
          { type: 'learn_coding', min: 1, max: 2 },
          { type: 'review_spaced', min: 2, max: 3 },
        ],
      },
    };
    setPlannerInput(updated);
    const generated = generatePlan(updated, energyMode, new Date().toISOString(), todayTopicSessions);
    setBlocks(generated);
    setCurrentBlockIdx(0);
    setCurrentStageIdx(0);
    setRunState('idle');
    setTomorrowQueue([]);
    setHardStopAutoMoved(false);
    setAdjustNotice(deadlineSprint
      ? 'Deadline sprint plan: heavy concepts first + spaced repetition interleaved.'
      : 'Auto-plan generated from roadmap priority and current mastery.');
  };

  useEffect(() => {
    if (!ownerId) return;
    void ensureTopics(plannerInput.topics);
  }, [ensureTopics, ownerId, plannerInput.topics]);

  useEffect(() => {
    if (!plannerInput.day_window.hard_stop || hardStopAutoMoved || runState === 'done') return;

    const id = window.setInterval(() => {
      const hardStopTs = parseTime(plannerInput.date, plannerInput.day_window.end).getTime();
      const nowTs = Date.now();
      if (nowTs <= hardStopTs) return;
      if (currentBlockIdx >= blocks.length) return;

      const remaining = blocks.slice(currentBlockIdx);
      if (!remaining.length) return;
      const doneBlocks = blocks.slice(0, currentBlockIdx);

      setTomorrowQueue((prev) => [...prev, ...remaining]);
      setBlocks(doneBlocks);
      setRunState('done');
      setHardStopAutoMoved(true);
      setAdjustNotice(`Hard stop reached. ${remaining.length} block(s) moved to tomorrow automatically.`);
      setDaySummary({
        endedAt: new Date().toISOString(),
        doneBlocks,
        movedBlocks: remaining,
      });
    }, 30_000);

    return () => window.clearInterval(id);
  }, [blocks, currentBlockIdx, hardStopAutoMoved, plannerInput.date, plannerInput.day_window.end, plannerInput.day_window.hard_stop, runState]);

  const nowBlock = activeBlock;
  const recommendedChapters = getPrioritizedChapters().filter((chapter) => recommendedChapterIds.includes(chapter.id));
  const focusPhaseLabel = useMemo(() => {
    const key = recommendedChapterIds.join('|');
    if (key === PHASE1_CHAPTERS.join('|')) return 'Phase 1: OOP + DSA (max priority)';
    if (recommendedChapterIds.includes('core-cs-fundamentals')) return 'Phase 2: OOP/DSA + Core CS/DB/Backend';
    return 'Phase 3: extend to remaining chapters';
  }, [recommendedChapterIds]);

  return (
    <main className="min-h-screen bg-[var(--bg)] p-4 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="mb-2 flex flex-wrap gap-2">
                <Link className="rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-2 py-1 text-xs font-semibold" href="/">
                  Dashboard
                </Link>
                <Link className="rounded-md border border-indigo-500/40 bg-indigo-500/20 px-2 py-1 text-xs font-semibold" href="/study-coach/roadmap">
                  Roadmap
                </Link>
              </div>
              <h1 className="text-2xl font-bold">Study Coach</h1>
              <p className="mt-1 text-sm text-[var(--muted)]">Ghid clar pe pasi: read → recall → check → feedback</p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Capitole active azi: {recommendedChapters.map((chapter) => chapter.title).join(' · ')}
              </p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Scope: interview core. Nice-to-have list: `apps/dashboard/data/study_nice_to_have.json`
            </p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Mode: {deadlineSprint ? 'Deadline sprint (greu + spaced repetition)' : 'Balanced progression'}
            </p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Priority phase: {focusPhaseLabel}
            </p>
          </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Metric label="Until hard stop" value={`${hardStopMinutesLeft}m`} />
              <Metric label="Blocks remaining" value={String(blocksRemaining)} />
              <Metric label="Recall left now" value={`${focusMinutesLeftNow}m`} />
              <Metric label="Plan left" value={`${planMinutesLeft}m`} />
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-3 text-sm">
            <div className="font-semibold">Cum functioneaza Start</div>
            <p className="mt-1 text-[var(--muted)]">
              `Start block` porneste blocul curent cap-coada si trece automat prin etape.
              In etapele de active recall intri in Focus Mode.
            </p>
            <p className="mt-2 text-xs text-[var(--muted)]">
              Acum: {new Date(nowTs).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })} · Program default: 09:00 - 21:00
            </p>
            {projectedSpillover.spilledBlocks > 0 ? (
              <p className="mt-2 text-sm text-amber-200">
                Daca mergi in ritmul curent, ~{projectedSpillover.spilledBlocks} bloc(uri) ({projectedSpillover.overflowMinutes} min) se muta in ziua urmatoare.
              </p>
            ) : (
              <p className="mt-2 text-sm text-emerald-200">Esti in grafic pentru azi.</p>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button className="rounded-md border border-emerald-500/40 bg-emerald-500/20 px-3 py-1.5 text-sm font-semibold" onClick={handleStart}>Start block</button>
            <button className="rounded-md border border-amber-500/40 bg-amber-500/20 px-3 py-1.5 text-sm font-semibold" onClick={handlePause}>Pause</button>
            <button className="rounded-md border border-sky-500/40 bg-sky-500/20 px-3 py-1.5 text-sm font-semibold" onClick={handleResume}>Resume</button>
            <button className="rounded-md border border-violet-500/40 bg-violet-500/20 px-3 py-1.5 text-sm font-semibold" onClick={handleLongBreak}>Long break</button>
            <button className="rounded-md border border-slate-500/40 bg-slate-500/20 px-3 py-1.5 text-sm font-semibold" onClick={handleSkip}>Move block later</button>
            <button className="rounded-md border border-rose-500/40 bg-rose-500/20 px-3 py-1.5 text-sm font-semibold" onClick={handleEndDay}>End day</button>
            <button
              className={`rounded-md border px-3 py-1.5 text-sm font-semibold ${focusAssist ? 'border-cyan-400/60 bg-cyan-500/20' : 'border-[var(--border)] bg-[var(--panel-2)]'}`}
              onClick={() => setFocusAssist((prev) => !prev)}
            >
              Focus mode {focusAssist ? 'ON' : 'OFF'}
            </button>
            <button className="rounded-md border border-indigo-500/40 bg-indigo-500/20 px-3 py-1.5 text-sm font-semibold" onClick={applyRoadmapAutoPlan}>
              Auto plan by progress
            </button>
            <button
              className={`rounded-md border px-3 py-1.5 text-sm font-semibold ${deadlineSprint ? 'border-rose-400/60 bg-rose-500/20' : 'border-[var(--border)] bg-[var(--panel-2)]'}`}
              onClick={() => setDeadlineSprint((prev) => !prev)}
            >
              Deadline sprint {deadlineSprint ? 'ON' : 'OFF'}
            </button>
            <Link className="rounded-md border border-sky-500/40 bg-sky-500/20 px-3 py-1.5 text-sm font-semibold" href="/study-coach/roadmap">
              Open roadmap
            </Link>
          </div>

          {adjustNotice ? <p className="mt-3 text-sm text-amber-200">{adjustNotice}</p> : null}
          {dbError ? <p className="mt-2 text-sm text-rose-200">DB: {dbError}</p> : null}
        </header>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-5">
          <div className="space-y-4 xl:col-span-3">
            <article className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4 shadow-sm">
              <div className="text-sm font-semibold uppercase text-emerald-200">Now</div>
              {nowBlock ? (
                <div className="mt-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-lg font-semibold">{nowBlock.topicName} · {blockLabel(nowBlock.blockType)}</h2>
                    <span className="text-sm text-[var(--muted)]">{shortTime(nowBlock.plannedStart)} - {shortTime(nowBlock.plannedEnd)}</span>
                  </div>
                  <p className="mt-2 text-sm text-[var(--muted)]">Objective: {nowBlock.objective}</p>
                  <p className="mt-1 text-sm text-[var(--muted)]">Focus work in this block: {focusMinutesInBlock} minutes</p>

                  {activeStage ? (
                    <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-xs uppercase text-[var(--muted)]">Stage {currentStageIdx + 1} / {nowBlock.stages.length}</div>
                          <div className="text-base font-semibold">{activeStage.label}</div>
                        </div>
                        <div className="text-2xl font-bold tabular-nums">{Math.floor(Math.max(0, stageSecondsLeft) / 60).toString().padStart(2, '0')}:{Math.max(0, stageSecondsLeft % 60).toString().padStart(2, '0')}</div>
                      </div>
                      <p className="mt-2 text-sm text-cyan-100">Ce faci acum: {stepInstruction(activeStage)}</p>
                      <p className="mt-1 text-sm text-[var(--muted)]">{activeStage.prompt}</p>
                      {activeStage.noNotes ? <p className="mt-1 text-xs text-amber-200">Active recall mode: fara notite.</p> : null}
                      <button
                        className="mt-3 rounded-md border border-sky-500/40 bg-sky-500/20 px-3 py-1.5 text-sm font-semibold"
                        onClick={finishStage}
                      >
                        Complete stage
                      </button>
                      <button
                        className="ml-2 mt-3 rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={goToPreviousStage}
                        disabled={currentStageIdx === 0}
                      >
                        Previous stage
                      </button>
                    </div>
                  ) : null}

                  <div className="mt-4">
                    <label className="text-sm font-semibold">Answer box (la final de bloc)</label>
                    <textarea
                      className="mt-1 min-h-28 w-full rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-3 text-sm outline-none disabled:opacity-60"
                      value={answerText}
                      onChange={(event) => setAnswerText(event.target.value)}
                      placeholder="Scrie din memorie..."
                      disabled={runState === 'running' && Boolean(activeStage?.noNotes)}
                    />
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      className={`rounded-md border px-3 py-1.5 text-sm font-semibold ${score === 'pass' ? 'border-emerald-400 bg-emerald-500/20' : 'border-[var(--border)] bg-[var(--panel-2)]'}`}
                      onClick={() => setScore('pass')}
                    >
                      Pass
                    </button>
                    <button
                      className={`rounded-md border px-3 py-1.5 text-sm font-semibold ${score === 'hard' ? 'border-amber-400 bg-amber-500/20' : 'border-[var(--border)] bg-[var(--panel-2)]'}`}
                      onClick={() => setScore('hard')}
                    >
                      Hard
                    </button>
                    <button
                      className={`rounded-md border px-3 py-1.5 text-sm font-semibold ${score === 'fail' ? 'border-rose-400 bg-rose-500/20' : 'border-[var(--border)] bg-[var(--panel-2)]'}`}
                      onClick={() => setScore('fail')}
                    >
                      Fail
                    </button>
                  </div>

                  {score === 'fail' ? (
                    <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm">
                      <div className="font-semibold">Why did I fail?</div>
                      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {[
                          { id: 'concept_gap', label: 'concept gap' },
                          { id: 'mixed_terms', label: 'mixed up terms' },
                          { id: 'no_example', label: 'could not produce example' },
                          { id: 'no_code', label: 'could not code it' },
                        ].map((item) => {
                          const checked = gapReasons.includes(item.id as GapReason);
                          return (
                            <label key={item.id} className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  setGapReasons((prev) => checked
                                    ? prev.filter((value) => value !== item.id)
                                    : [...prev, item.id as GapReason]);
                                }}
                              />
                              <span>{item.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  <button
                    className="mt-4 rounded-md border border-emerald-500/40 bg-emerald-500/20 px-3 py-1.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!score}
                    onClick={() => { void submitBlockFeedback(); }}
                  >
                    Submit feedback + next block
                  </button>
                </div>
              ) : (
                <p className="mt-2 text-sm text-[var(--muted)]">No active blocks.</p>
              )}
            </article>

            <article className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4 shadow-sm">
              <h3 className="text-sm font-semibold uppercase text-sky-200">Today Visual Timeline</h3>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Current time marker: {new Date(nowTs).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })}
              </p>
              <div className="mt-2 space-y-2">
                {timelineRows.map((row) => (
                  <div key={row.id} className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] p-2 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-block h-2.5 w-2.5 rounded-full ${
                            row.status === 'done'
                              ? 'bg-emerald-400'
                              : row.status === 'now'
                                ? 'bg-cyan-300'
                                : 'bg-slate-400'
                          }`}
                        />
                        <span className={row.kind === 'break' ? 'text-[var(--muted)]' : 'font-medium'}>{row.label}</span>
                      </div>
                      <span className="text-xs text-[var(--muted)]">{shortTime(row.start)} - {shortTime(row.end)}</span>
                    </div>
                    {new Date(row.end).getTime() < nowTs && row.status === 'next' ? (
                      <p className="mt-1 text-xs text-amber-200">In urma fata de plan (va fi decalat automat).</p>
                    ) : null}
                  </div>
                ))}
              </div>
              {tomorrowQueue.length ? (
                <p className="mt-3 text-sm text-amber-200">{tomorrowQueue.length} block(s) already moved to tomorrow.</p>
              ) : null}
            </article>

            <details className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4 shadow-sm">
              <summary className="cursor-pointer text-lg font-semibold">Planner (advanced)</summary>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <select
                  className="rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-2 py-1 text-sm"
                  value={energyMode}
                  onChange={(event) => setEnergyMode(event.target.value as EnergyMode)}
                >
                  <option value="normal">Normal 50/10</option>
                  <option value="low">Low energy 25/5</option>
                  <option value="focus">Focus sprint 90/15</option>
                </select>
                <button className="rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-3 py-1.5 text-sm font-semibold" onClick={importJson}>Import JSON</button>
                <button className="rounded-md border border-sky-500/40 bg-sky-500/20 px-3 py-1.5 text-sm font-semibold" onClick={regeneratePlan}>Generate plan</button>
              </div>
              <textarea
                className="mt-3 min-h-52 w-full rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-3 font-mono text-xs outline-none"
                value={rawJson}
                onChange={(event) => setRawJson(event.target.value)}
              />
            </details>
          </div>

          <aside className="space-y-4 xl:col-span-2">
            <article className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4 shadow-sm">
              <h3 className="text-lg font-semibold">Today summary</h3>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2">
                  <span>Blocks done today</span>
                  <strong>{todayDone}</strong>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2">
                  <span>Pass rate today</span>
                  <strong>{todayPassRate}%</strong>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2">
                  <span>Gap cards due</span>
                  <strong>{gapCards.length}</strong>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2">
                  <span>Where we are</span>
                  <strong>{plannerInput.topics.slice(0, 3).map((topic) => topic.name).join(', ')}</strong>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2">
                  <span>Where we are going</span>
                  <strong>{whereGoingLabel}</strong>
                </div>
              </div>
            </article>

            <article className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4 shadow-sm">
              <h3 className="text-lg font-semibold">Big Areas (today)</h3>
              <div className="mt-3 space-y-2 text-sm">
                {recommendedChapters.map((chapter) => (
                  <div key={chapter.id} className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2">
                    <span>#{chapter.priority} {chapter.title}</span>
                    <strong>{chapterConceptCount(chapter)} concepts</strong>
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4 shadow-sm">
              <h3 className="text-lg font-semibold">Gap Cards</h3>
              <div className="mt-3 space-y-2">
                {gapCards.length === 0 ? (
                  <p className="text-sm text-[var(--muted)]">No due cards. Good pace.</p>
                ) : (
                  gapCards.map((card) => (
                    <div key={card.id} className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-3 text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold">{card.prompt}</p>
                        <span className={`rounded-full border px-2 py-0.5 text-xs ${statusClass(card.status)}`}>{card.status}</span>
                      </div>
                      {card.gold_answer ? <p className="mt-2 text-[var(--muted)]">Gold: {card.gold_answer}</p> : null}
                      {card.example ? <p className="mt-1 text-[var(--muted)]">Example: {card.example}</p> : null}
                      <p className="mt-1 text-xs text-[var(--muted)]">Due: {card.next_due_date}</p>
                    </div>
                  ))
                )}
              </div>
            </article>
          </aside>
        </section>
      </div>
      {daySummary ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-3xl rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5 shadow-2xl">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xl font-bold">End of Day Summary</h2>
              <button
                className="rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-3 py-1 text-sm font-semibold"
                onClick={() => setDaySummary(null)}
              >
                Close
              </button>
            </div>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {new Date(daySummary.endedAt).toLocaleString('ro-RO')}
            </p>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                <h3 className="text-sm font-semibold uppercase text-emerald-100">Facut azi ({daySummary.doneBlocks.length})</h3>
                <div className="mt-2 space-y-1 text-sm">
                  {daySummary.doneBlocks.length ? daySummary.doneBlocks.map((block) => (
                    <p key={`done-${block.id}`}>{block.topicName} · {block.objective}</p>
                  )) : <p className="text-[var(--muted)]">Niciun bloc completat.</p>}
                </div>
              </div>
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                <h3 className="text-sm font-semibold uppercase text-amber-100">Urmeaza maine ({daySummary.movedBlocks.length})</h3>
                <div className="mt-2 space-y-1 text-sm">
                  {daySummary.movedBlocks.length ? daySummary.movedBlocks.map((block) => (
                    <p key={`next-${block.id}`}>{block.topicName} · {block.objective}</p>
                  )) : <p className="text-[var(--muted)]">Nu sunt blocuri mutate.</p>}
                </div>
                <p className="mt-3 text-xs text-[var(--muted)]">
                  Plus roadmap backlog in ordine de prioritate: {recommendedChapters.map((chapter) => `#${chapter.priority} ${chapter.title}`).join(' · ')}
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {inRecallFocus ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#001216]/90 p-6">
          <div className="w-full max-w-xl rounded-2xl border border-cyan-400/30 bg-[#04252d] p-6 text-center shadow-2xl">
            <p className="text-xs uppercase tracking-wide text-cyan-200">Focus Mode · Active Recall</p>
            <h2 className="mt-2 text-2xl font-bold">{activeStage?.label}</h2>
            <p className="mt-2 text-sm text-cyan-100">{stepInstruction(activeStage ?? null)}</p>
            <p className="mt-5 text-6xl font-bold tabular-nums">{Math.floor(Math.max(0, stageSecondsLeft) / 60).toString().padStart(2, '0')}:{Math.max(0, stageSecondsLeft % 60).toString().padStart(2, '0')}</p>
            <p className="mt-3 text-sm text-cyan-100">Ideal: fara browsing aici, doar recall.</p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              <button className="rounded-md border border-amber-500/40 bg-amber-500/20 px-3 py-1.5 text-sm font-semibold" onClick={handlePause}>Pause</button>
              <button className="rounded-md border border-sky-500/40 bg-sky-500/20 px-3 py-1.5 text-sm font-semibold" onClick={finishStage}>Complete stage</button>
              <button
                className="rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-3 py-1.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                onClick={goToPreviousStage}
                disabled={currentStageIdx === 0}
              >
                Previous stage
              </button>
              <button className="rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-3 py-1.5 text-sm font-semibold" onClick={() => setFocusAssist(false)}>Exit focus overlay</button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2">
      <div className="text-[10px] uppercase text-[var(--muted)]">{label}</div>
      <div className="mt-1 text-sm font-semibold">{value}</div>
    </div>
  );
}
