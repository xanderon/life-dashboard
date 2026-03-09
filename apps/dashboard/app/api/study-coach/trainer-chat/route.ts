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

function localFallback(payload: ChatPayload): ChatResult {
  const userText = latestUserMessage(payload);
  const weakestDealBreaker = payload.stateSummary.concepts
    .filter((c) => c.dealBreaker)
    .sort((a, b) => a.mastery - b.mastery)[0];

  const srp = payload.stateSummary.concepts.find((c) => c.id === 'srp');

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
