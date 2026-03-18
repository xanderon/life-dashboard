import { NextResponse } from 'next/server';

type ProblemStatus = 'todo' | 'in_progress' | 'done';
type Difficulty = 'easy' | 'medium' | 'hard' | '';
type PhaseId = 'phase_1' | 'phase_2' | 'phase_3';

type Action =
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

type ChatPayload = {
  nowIso: string;
  learningWindowOpen: boolean;
  kpis: {
    roadmapProgress: number;
    foundationCoverage: number;
    reviewsDue: number;
  };
  activeCategoryId: string;
  focusProblemId: string | null;
  categories: Array<{
    id: string;
    title: string;
    phase: PhaseId;
    problems: Array<{
      id: string;
      title: string;
      status: ProblemStatus;
      core: boolean;
      difficulty: Difficulty;
    }>;
  }>;
  messages: Array<{ role: 'user' | 'coach'; text: string }>;
  trigger?: 'user_message' | 'proactive_nudge';
};

type ChatResult = {
  mode: 'openai' | 'local-fallback';
  reply: string;
  actions: Action[];
};

type FlatProblem = {
  id: string;
  title: string;
  status: ProblemStatus;
  core: boolean;
  difficulty: Difficulty;
  categoryTitle: string;
  phase: PhaseId;
};

function flattenProblems(payload: ChatPayload): FlatProblem[] {
  return payload.categories.flatMap((category) =>
    category.problems.map((problem) => ({
      ...problem,
      categoryTitle: category.title,
      phase: category.phase,
    }))
  );
}

function latestUserMessage(payload: ChatPayload) {
  for (let i = payload.messages.length - 1; i >= 0; i -= 1) {
    if (payload.messages[i].role === 'user') return payload.messages[i].text.toLowerCase();
  }
  return '';
}

function phaseRank(phase: PhaseId) {
  if (phase === 'phase_1') return 1;
  if (phase === 'phase_2') return 2;
  return 3;
}

function nextPriorityProblem(problems: FlatProblem[]) {
  return [...problems]
    .filter((problem) => problem.status !== 'done' && problem.core)
    .sort((a, b) => phaseRank(a.phase) - phaseRank(b.phase))[0];
}

function parseDifficulty(text: string): Difficulty | null {
  if (text.includes(' easy')) return 'easy';
  if (text.includes(' medium')) return 'medium';
  if (text.includes(' hard')) return 'hard';
  return null;
}

function inferMentionedProblem(text: string, problems: FlatProblem[]) {
  const norm = text.replace(/[^a-z0-9 ]+/g, ' ').trim();
  let best: { p: FlatProblem; score: number } | null = null;

  for (const p of problems) {
    const title = p.title.toLowerCase();
    if (norm.includes(title)) return p;

    const tokens = title.split(' ').filter((token) => token.length >= 4);
    const score = tokens.reduce((acc, token) => (norm.includes(token) ? acc + 1 : acc), 0);
    if (!best || score > best.score) {
      best = { p, score };
    }
  }

  if (best && best.score >= 2) return best.p;
  return null;
}

function buildFallback(payload: ChatPayload): ChatResult {
  const userText = latestUserMessage(payload);
  const problems = flattenProblems(payload);
  const focused = problems.find((problem) => problem.id === payload.focusProblemId) ?? null;
  const suggested = nextPriorityProblem(problems);
  const mentioned = inferMentionedProblem(userText, problems);

  if (payload.trigger === 'proactive_nudge') {
    if (suggested) {
      return {
        mode: 'local-fallback',
        reply: `Reminder: continua cu ${suggested.title} (${suggested.categoryTitle}). Tinta: 25 min + un check-in scurt.`,
        actions: [{ type: 'focus_problem', problemId: suggested.id }],
      };
    }
    return {
      mode: 'local-fallback',
      reply: 'Toate problemele core sunt done. Fa un review pe cele vechi sau ataca optionalele.',
      actions: [],
    };
  }

  const asksNext = userText.includes('ce urmeaza') || userText.includes('what next') || userText.includes('next');
  if (asksNext && suggested) {
    return {
      mode: 'local-fallback',
      reply: `Urmatoarea problema prioritara: ${suggested.title} (${suggested.categoryTitle}, ${suggested.phase.replace('_', ' ')}).`,
      actions: [{ type: 'focus_problem', problemId: suggested.id }],
    };
  }

  const doneTone = userText.includes('am terminat') || userText.includes('gata') || userText.includes('done') || userText.includes('rezolvat');
  if (doneTone) {
    const target = mentioned ?? focused;
    if (target) {
      const after = nextPriorityProblem(problems.filter((problem) => problem.id !== target.id));
      return {
        mode: 'local-fallback',
        reply: after
          ? `Perfect. Marcam ${target.title} ca done. Dupa asta continua cu ${after.title}.`
          : `Perfect. Marcam ${target.title} ca done. Ai terminat lista core.`,
        actions: [
          { type: 'mark_problem', problemId: target.id, status: 'done' },
          ...(after ? [{ type: 'focus_problem' as const, problemId: after.id }] : []),
        ],
      };
    }
  }

  const diff = parseDifficulty(userText);
  if (diff) {
    const target = mentioned ?? focused;
    if (target) {
      return {
        mode: 'local-fallback',
        reply: `Setez ${target.title} la difficulty ${diff}.`,
        actions: [{ type: 'update_problem_meta', problemId: target.id, difficulty: diff }],
      };
    }
  }

  const urlMatch = userText.match(/https?:\/\/\S+/i);
  if (urlMatch) {
    const target = mentioned ?? focused;
    if (target) {
      return {
        mode: 'local-fallback',
        reply: `Am atasat link-ul de docs pe ${target.title}.`,
        actions: [{ type: 'update_problem_meta', problemId: target.id, docsUrl: urlMatch[0] }],
      };
    }
  }

  if (focused) {
    return {
      mode: 'local-fallback',
      reply: `Ramai pe ${focused.title}. Spune-mi cand il termini sau cere direct "ce urmeaza" pentru urmatorul pas din roadmap.`,
      actions: [],
    };
  }

  if (suggested) {
    return {
      mode: 'local-fallback',
      reply: `Pornim cu ${suggested.title}.`,
      actions: [{ type: 'focus_problem', problemId: suggested.id }],
    };
  }

  return {
    mode: 'local-fallback',
    reply: 'Roadmap-ul este complet. Poti continua pe optionale sau review.',
    actions: [],
  };
}

function normalizeStatus(value: unknown): ProblemStatus {
  if (value === 'todo' || value === 'in_progress' || value === 'done') return value;
  return 'todo';
}

function normalizeDifficulty(value: unknown): Difficulty | undefined {
  if (value === '' || value === 'easy' || value === 'medium' || value === 'hard') return value;
  return undefined;
}

function normalizeActions(raw: unknown): Action[] {
  if (!Array.isArray(raw)) return [];
  const out: Action[] = [];

  raw.forEach((item) => {
    if (!item || typeof item !== 'object') return;
    const action = item as Record<string, unknown>;
    const type = action.type;

    if (type === 'focus_problem' && typeof action.problemId === 'string') {
      out.push({ type, problemId: action.problemId });
      return;
    }

    if (type === 'mark_problem' && typeof action.problemId === 'string') {
      out.push({ type, problemId: action.problemId, status: normalizeStatus(action.status) });
      return;
    }

    if (type === 'update_problem_meta' && typeof action.problemId === 'string') {
      const next: Action = { type, problemId: action.problemId };
      if (typeof action.docsUrl === 'string') next.docsUrl = action.docsUrl;
      if (typeof action.solutionPath === 'string') next.solutionPath = action.solutionPath;
      if (typeof action.notes === 'string') next.notes = action.notes;
      const diff = normalizeDifficulty(action.difficulty);
      if (diff !== undefined) next.difficulty = diff;
      out.push(next);
    }
  });

  return out;
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as ChatPayload;
    if (!Array.isArray(payload?.categories)) {
      return NextResponse.json({ error: 'Missing categories.' }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json(buildFallback(payload));

    const systemPrompt = [
      'You are a strict algorithm study coach.',
      'Main objective: keep user focused on listed roadmap problems, phase order first.',
      'Respond in Romanian and return JSON only.',
      'Allowed action types: focus_problem, mark_problem, update_problem_meta.',
      'Keep reply concise and actionable.',
    ].join(' ');

    const userPayload = {
      nowIso: payload.nowIso,
      trigger: payload.trigger,
      learningWindowOpen: payload.learningWindowOpen,
      kpis: payload.kpis,
      activeCategoryId: payload.activeCategoryId,
      focusProblemId: payload.focusProblemId,
      categories: payload.categories,
      messages: payload.messages,
    };

    const r = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        input: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: JSON.stringify(userPayload) },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'algo_trainer_chat',
            schema: {
              type: 'object',
              additionalProperties: false,
              required: ['reply', 'actions'],
              properties: {
                reply: { type: 'string' },
                actions: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: true,
                  },
                },
              },
            },
          },
        },
      }),
    });

    if (!r.ok) return NextResponse.json(buildFallback(payload));

    const data = (await r.json()) as { output_text?: string };
    const raw = data.output_text ?? '{}';
    const parsed = JSON.parse(raw) as { reply?: unknown; actions?: unknown };

    const reply = typeof parsed.reply === 'string' && parsed.reply.trim().length
      ? parsed.reply
      : buildFallback(payload).reply;

    return NextResponse.json({
      mode: 'openai',
      reply,
      actions: normalizeActions(parsed.actions),
    });
  } catch {
    return NextResponse.json({ error: 'Failed to run trainer chat.' }, { status: 500 });
  }
}
