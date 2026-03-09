import { NextResponse } from 'next/server';

type FeedbackPayload = {
  conceptId: string;
  conceptName: string;
  confidence: number;
  recallAnswer: string;
  summary: string;
  dealBreaker: boolean;
};

type FeedbackResult = {
  mode: 'openai' | 'local-fallback';
  verdict: 'all_good' | 'mixed' | 'needs_work';
  strengths: string[];
  gaps: string[];
  nextActions: string[];
};

function buildFallback(payload: FeedbackPayload): FeedbackResult {
  const confidence = Number(payload.confidence || 0);
  const strengths: string[] = [];
  const gaps: string[] = [];
  const nextActions: string[] = [];

  if (confidence >= 70) strengths.push('Ai raportat incredere buna pe concept.');
  if (payload.recallAnswer.trim().length >= 180) strengths.push('Active recall-ul este suficient de detaliat.');

  if (confidence < 60) gaps.push('Scor sub 60%. Conceptul nu e inca stabil.');
  if (payload.recallAnswer.trim().length < 120) gaps.push('Raspuns prea scurt: lipsesc definitia, exemplul si pitfalls.');
  if (payload.dealBreaker && confidence < 70) gaps.push('Deal-breaker topic sub prag. Tinta minima este 70%.');

  nextActions.push('Repeta definitie + exemplu in 10 minute, fara notite.');
  nextActions.push(confidence >= 75 ? 'Repetitie peste 3 zile.' : 'Repetitie maine.');

  return {
    mode: 'local-fallback',
    verdict: confidence >= 75 ? 'all_good' : confidence >= 60 ? 'mixed' : 'needs_work',
    strengths,
    gaps,
    nextActions,
  };
}

function normalizeVerdict(v: unknown): FeedbackResult['verdict'] {
  if (v === 'all_good' || v === 'mixed' || v === 'needs_work') return v;
  return 'mixed';
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as FeedbackPayload;

    if (!payload?.conceptId || !payload?.conceptName) {
      return NextResponse.json({ error: 'Missing concept.' }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(buildFallback(payload));
    }

    const systemPrompt = [
      'You are an interview theory trainer for software engineering.',
      'Return concise Romanian feedback in JSON only.',
      'Required keys: verdict, strengths, gaps, nextActions.',
      'verdict must be one of: all_good, mixed, needs_work.',
      'Focus on high-probability interview performance and active recall quality.',
    ].join(' ');

    const userPayload = {
      nowIso: new Date().toISOString(),
      submission: payload,
      goal: 'Top 20% most likely interview theory topics; deal-breakers first',
      outputRules: {
        strengthsMax: 3,
        gapsMax: 4,
        nextActionsMax: 4,
      },
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
            name: 'trainer_feedback',
            schema: {
              type: 'object',
              additionalProperties: false,
              required: ['verdict', 'strengths', 'gaps', 'nextActions'],
              properties: {
                verdict: { type: 'string', enum: ['all_good', 'mixed', 'needs_work'] },
                strengths: { type: 'array', items: { type: 'string' } },
                gaps: { type: 'array', items: { type: 'string' } },
                nextActions: { type: 'array', items: { type: 'string' } },
              },
            },
          },
        },
      }),
    });

    if (!r.ok) {
      return NextResponse.json(buildFallback(payload));
    }

    const data = (await r.json()) as { output_text?: string };
    const raw = data.output_text ?? '{}';
    const parsed = JSON.parse(raw) as {
      verdict?: unknown;
      strengths?: unknown;
      gaps?: unknown;
      nextActions?: unknown;
    };

    const result: FeedbackResult = {
      mode: 'openai',
      verdict: normalizeVerdict(parsed.verdict),
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths.map(String).slice(0, 3) : [],
      gaps: Array.isArray(parsed.gaps) ? parsed.gaps.map(String).slice(0, 4) : [],
      nextActions: Array.isArray(parsed.nextActions) ? parsed.nextActions.map(String).slice(0, 4) : [],
    };

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: 'Failed to generate feedback.' }, { status: 500 });
  }
}
