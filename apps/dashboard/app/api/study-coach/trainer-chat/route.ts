import { NextResponse } from 'next/server';

type Action =
  | { type: 'focus_concept'; conceptId: string }
  | { type: 'create_task'; title: string; conceptId: string; estimateMin: number; taskType: 'new' | 'recall' | 'deal-breaker' | 'nice' }
  | { type: 'mark_task'; taskId: string; status: 'todo' | 'in_progress' | 'done' }
  | { type: 'schedule_review'; conceptId: string; daysAhead: number };

type ChatPayload = {
  nowIso: string;
  learningWindowOpen: boolean;
  readiness: number;
  dealBreakerCoverage: number;
  stateSummary: {
    concepts: Array<{ id: string; name: string; mastery: number; dealBreaker: boolean; nextReview: string }>;
    tasks: Array<{ id: string; title: string; conceptId: string; status: 'todo' | 'in_progress' | 'done'; estimateMin: number; type: 'new' | 'recall' | 'deal-breaker' | 'nice' }>;
  };
  messages: Array<{ role: 'user' | 'coach'; text: string }>;
  todayContext?: {
    completedBlocks: number;
    totalBlocks: number;
    currentObjective: string | null;
    doneTodayConceptIds: string[];
  };
  trigger?: 'user_message' | 'proactive_nudge';
};

type ChatResult = {
  mode: 'openai' | 'local-fallback';
  reply: string;
  actions: Action[];
};

function latestUserMessage(payload: ChatPayload) {
  for (let i = payload.messages.length - 1; i >= 0; i -= 1) {
    if (payload.messages[i].role === 'user') return payload.messages[i].text.toLowerCase();
  }
  return '';
}

function detectConfidence(userText: string): number | null {
  const numMatch = userText.match(/\b(\d{1,3})\b/);
  if (numMatch) {
    const n = Number(numMatch[1]);
    if (Number.isFinite(n)) return Math.max(0, Math.min(100, n));
  }
  if (userText.includes('confidence high') || userText.includes('incredere mare') || userText.includes('high confidence')) {
    return 85;
  }
  if (userText.includes('confidence medium') || userText.includes('incredere medie')) {
    return 65;
  }
  if (userText.includes('confidence low') || userText.includes('incredere mica')) {
    return 40;
  }
  return null;
}

function isCompletionMessage(userText: string) {
  const completionTerms = ['am facut', 'gata', 'am terminat', 'done', 'rezolvat', 'finished'];
  return completionTerms.some((t) => userText.includes(t));
}

function mentionsSrpDone(userText: string) {
  const mentionsSrp = userText.includes('srp') || userText.includes('single responsibility');
  const doneTone = userText.includes('am facut') || userText.includes('am terminat') || userText.includes('azi');
  return mentionsSrp && doneTone;
}

function localFallback(payload: ChatPayload): ChatResult {
  const userText = latestUserMessage(payload);
  const lastCoachText = [...payload.messages].reverse().find((m) => m.role === 'coach')?.text.toLowerCase() ?? '';
  const weakestDealBreaker = payload.stateSummary.concepts
    .filter((c) => c.dealBreaker)
    .sort((a, b) => a.mastery - b.mastery)[0];

  const srp = payload.stateSummary.concepts.find((c) => c.id === 'srp');
  const doneTodaySet = new Set(payload.todayContext?.doneTodayConceptIds ?? []);
  const activeTask = payload.stateSummary.tasks.find((t) => t.status === 'in_progress');
  const topTodoDealBreaker = payload.stateSummary.tasks.find((t) => t.status === 'todo' && t.type === 'deal-breaker');
  const confidence = detectConfidence(userText);

  if (mentionsSrpDone(userText) && srp) {
    const srpPendingTasks = payload.stateSummary.tasks.filter(
      (t) => t.conceptId === srp.id && t.status !== 'done'
    );
    const nextDealBreaker = payload.stateSummary.concepts
      .filter((c) => c.dealBreaker && c.id !== srp.id)
      .sort((a, b) => a.mastery - b.mastery)[0];

    const actions: Action[] = [
      ...srpPendingTasks.map((t) => ({ type: 'mark_task', taskId: t.id, status: 'done' as const })),
      { type: 'schedule_review', conceptId: srp.id, daysAhead: 2 },
    ];

    if (nextDealBreaker) {
      actions.push({ type: 'focus_concept', conceptId: nextDealBreaker.id });
      const hasTaskOnNext = payload.stateSummary.tasks.some(
        (t) => t.conceptId === nextDealBreaker.id && t.status !== 'done'
      );
      if (!hasTaskOnNext) {
        actions.push({
          type: 'create_task',
          title: `Active recall sprint: ${nextDealBreaker.name}`,
          conceptId: nextDealBreaker.id,
          estimateMin: 20,
          taskType: 'deal-breaker',
        });
      }
    }

    return {
      mode: 'local-fallback',
      reply: nextDealBreaker
        ? `Perfect, marcam SRP ca facut azi si il punem la review peste 2 zile. Urmatorul focus: ${nextDealBreaker.name}, sprint 20-25 min.`
        : 'Perfect, marcam SRP ca facut azi si il punem la review peste 2 zile. Esti ok pe deal-breakers pentru moment.',
      actions,
    };
  }

  if (isCompletionMessage(userText) && activeTask) {
    const actions: Action[] = [{ type: 'mark_task', taskId: activeTask.id, status: 'done' }];
    if (topTodoDealBreaker && topTodoDealBreaker.id !== activeTask.id) {
      actions.push({ type: 'mark_task', taskId: topTodoDealBreaker.id, status: 'in_progress' });
    }
    return {
      mode: 'local-fallback',
      reply: topTodoDealBreaker
        ? `Perfect, am marcat \"${activeTask.title}\" ca done. Urmatorul pas: intra pe \"${topTodoDealBreaker.title}\" pentru 20-25 min.`
        : `Perfect, am marcat \"${activeTask.title}\" ca done. Urmatorul pas: da-mi urmatorul concept pe care vrei sa-l atacam.`,
      actions,
    };
  }

  if (confidence !== null && confidence >= 75 && activeTask) {
    return {
      mode: 'local-fallback',
      reply: `Confidence ${confidence}% e bun. Confirmi sa marchez \"${activeTask.title}\" ca done? Scrie: \"da, marcheaza done\".`,
      actions: [],
    };
  }

  if (userText.includes('marcheaza done') || userText.includes('mark done')) {
    if (activeTask) {
      return {
        mode: 'local-fallback',
        reply: `Done. Am marcat \"${activeTask.title}\" si te mut pe urmatorul task relevant.`,
        actions: [
          { type: 'mark_task', taskId: activeTask.id, status: 'done' },
          ...(topTodoDealBreaker ? [{ type: 'mark_task' as const, taskId: topTodoDealBreaker.id, status: 'in_progress' as const }] : []),
        ],
      };
    }
  }

  if (userText.includes('ce urmeaza') || userText.includes('what next') || userText.includes('next?')) {
    const done = payload.todayContext?.completedBlocks ?? 0;
    const total = payload.todayContext?.totalBlocks ?? 0;
    if (topTodoDealBreaker) {
      return {
        mode: 'local-fallback',
        reply: `Progres Today: ${done}/${total} blocuri. Urmatorul pas: \"${topTodoDealBreaker.title}\" (20-25 min), apoi check-in cu definitie + exemplu + confidence.`,
        actions: [{ type: 'mark_task', taskId: topTodoDealBreaker.id, status: 'in_progress' }],
      };
    }
  }

  const asksAlgorithms = userText.includes('algoritm') || userText.includes('algorithm') || userText.includes('leetcode') || userText.includes('dsa');
  if (asksAlgorithms) {
    const hasAlgoTask = payload.stateSummary.tasks.some((t) => t.title.toLowerCase().includes('linked list') || t.title.toLowerCase().includes('two pointers') || t.title.toLowerCase().includes('binary search'));
    return {
      mode: 'local-fallback',
      reply: hasAlgoTask
        ? 'Da, dupa DIP intram pe algoritmi. Plan concret: 1) termini DIP acum, 2) 25 min Linked List, 3) 20 min recap patterns, 4) check-in scurt.'
        : 'Da, dupa DIP incepem algoritmi. Plan concret: 1) termini DIP (20-25 min), 2) sprint Linked List 25 min, 3) sprint Binary Search 20 min, 4) recap 10 min.',
      actions: hasAlgoTask
        ? []
        : [
          {
            type: 'create_task',
            title: 'Algorithms sprint: Linked List (1 problem + explain)',
            conceptId: 'polymorphism',
            estimateMin: 25,
            taskType: 'new',
          },
          {
            type: 'create_task',
            title: 'Algorithms sprint: Binary Search recap',
            conceptId: 'polymorphism',
            estimateMin: 20,
            taskType: 'new',
          },
        ],
    };
  }

  if (userText.includes('ce sa fac') && (userText.includes('srp') || userText.includes('single responsibility'))) {
    return {
      mode: 'local-fallback',
      reply: [
        'Bun, pentru SRP fa asa in 20 minute:',
        '1) Defineste SRP in 2 fraze.',
        '2) Da un exemplu prost (o clasa care face SQL + email + business).',
        '3) Refactor mental in 3 componente (repo, service, notifier).',
        '4) Spune un pitfall: \"SRP nu inseamna o metoda per clasa\".',
        'Dupa sprint, trimite-mi confidence + un exemplu concret din codul tau.'
      ].join(' '),
      actions: [
        ...(srp ? [{ type: 'focus_concept', conceptId: srp.id } as const] : []),
        ...(srp ? [{
          type: 'create_task' as const,
          title: 'SRP 20m: definitie + exemplu prost + refactor',
          conceptId: srp.id,
          estimateMin: 20,
          taskType: 'deal-breaker' as const,
        }] : []),
      ],
    };
  }

  if (doneTodaySet.has('srp') && srp && (userText.includes('srp') || userText.includes('single responsibility'))) {
    const nextDealBreaker = payload.stateSummary.concepts
      .filter((c) => c.dealBreaker && c.id !== srp.id)
      .sort((a, b) => a.mastery - b.mastery)[0];

    return {
      mode: 'local-fallback',
      reply: nextDealBreaker
        ? `Confirm, SRP apare deja ca facut in Today. Nu mai insistam pe el acum. Trecem pe ${nextDealBreaker.name}.`
        : 'Confirm, SRP apare facut in Today. Trecem pe algoritmi ca next focus.',
      actions: nextDealBreaker ? [{ type: 'focus_concept', conceptId: nextDealBreaker.id }] : [],
    };
  }

  if (userText.includes('stai') || userText.includes('termin') || userText.includes('acum')) {
    return {
      mode: 'local-fallback',
      reply: 'Perfect, termina problema curenta. Cand ai inchis-o, da-mi \"gata\" si intram imediat pe un sprint SRP de 20 minute.',
      actions: [],
    };
  }

  if (!payload.learningWindowOpen) {
    return {
      mode: 'local-fallback',
      reply: 'Acum esti in afara ferestrei de invatare. Ia o pauza scurta si revino in urmatoarea fereastra cu un sprint de 20 min.',
      actions: [],
    };
  }

    if (payload.trigger === 'proactive_nudge' && weakestDealBreaker) {
    return {
      mode: 'local-fallback',
      reply: `Ping de la trainer: esti in fereastra de invatare. Propun acum un sprint scurt pe ${weakestDealBreaker.name} (deal-breaker).`,
      actions: [
        { type: 'focus_concept', conceptId: weakestDealBreaker.id },
        {
          type: 'create_task',
          title: `Active recall sprint: ${weakestDealBreaker.name}`,
          conceptId: weakestDealBreaker.id,
          estimateMin: 20,
          taskType: 'deal-breaker',
        },
      ],
    };
  }

  const todoDealBreaker = payload.stateSummary.tasks.find(
    (t) => t.status !== 'done' && t.type === 'deal-breaker'
  );

  if (todoDealBreaker) {
    if (lastCoachText.includes(todoDealBreaker.title.toLowerCase())) {
      return {
        mode: 'local-fallback',
        reply: `Ca sa nu stam blocati: fie incepi acum \"${todoDealBreaker.title}\", fie imi spui explicit \"skip\" si iti dau alternativa pe algoritmi.`,
        actions: [],
      };
    }
    return {
      mode: 'local-fallback',
      reply: `Plan concret: ia task-ul \"${todoDealBreaker.title}\", lucreaza 20-25 min, apoi da-mi: definitie + exemplu + confidence.`,
      actions: [
        { type: 'mark_task', taskId: todoDealBreaker.id, status: 'in_progress' },
      ],
    };
  }

  if (weakestDealBreaker) {
    return {
      mode: 'local-fallback',
      reply: `Prioritatea ta acum este ${weakestDealBreaker.name}. Tinta minima: 70% mastery.`,
      actions: [
        { type: 'focus_concept', conceptId: weakestDealBreaker.id },
        { type: 'schedule_review', conceptId: weakestDealBreaker.id, daysAhead: 1 },
      ],
    };
  }

  return {
    mode: 'local-fallback',
    reply: 'Arata bine. Fa un sprint nou pe un topic core si trimite-mi un check-in scurt dupa.',
    actions: [],
  };
}

function isValidAction(v: unknown): v is Action {
  if (!v || typeof v !== 'object') return false;
  const x = v as { type?: string };
  return ['focus_concept', 'create_task', 'mark_task', 'schedule_review'].includes(String(x.type));
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as ChatPayload;
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(localFallback(payload));
    }

    const systemPrompt = [
      'You are a proactive Romanian study coach for SWE interviews.',
      'Be concise and directive. Push deal-breaker topics first.',
      'Always react directly to the latest user message in your first sentence.',
      'If user says they want to finish another task first, acknowledge and set a follow-up checkpoint.',
      'If user asks what to do for a concept, give concrete numbered steps, not generic advice.',
      'If user says they finished a task or gives high confidence, propose marking task done and move to next concrete task.',
      'If user asks "ce urmeaza", answer with one concrete next sprint and expected output.',
      'If user asks about algorithms timing, provide a sequence (after current task) with exact durations.',
      'Avoid repeating the exact previous coach message; if repeated context, offer two options.',
      'If user is behind, say it directly and propose one concrete sprint now.',
      'Return strict JSON with keys: reply (string), actions (array).',
      'Action types allowed: focus_concept, create_task, mark_task, schedule_review.',
    ].join(' ');

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
          { role: 'user', content: JSON.stringify(payload) },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'trainer_chat',
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
                    required: ['type'],
                    properties: {
                      type: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      }),
    });

    if (!r.ok) {
      return NextResponse.json(localFallback(payload));
    }

    const data = (await r.json()) as { output_text?: string };
    const raw = data.output_text ?? '{}';
    const parsed = JSON.parse(raw) as { reply?: unknown; actions?: unknown };

    const actions = Array.isArray(parsed.actions)
      ? parsed.actions.filter(isValidAction).slice(0, 4)
      : [];

    const result: ChatResult = {
      mode: 'openai',
      reply: typeof parsed.reply === 'string' && parsed.reply.trim().length > 0
        ? parsed.reply.trim()
        : 'Plan: alege un deal-breaker si fa un sprint de 20 minute acum.',
      actions,
    };

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: 'Failed to produce coach chat response.' }, { status: 500 });
  }
}
