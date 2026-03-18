import { NextResponse } from 'next/server';

type Difficulty = 'easy' | 'medium' | 'hard' | '';

type FeedbackPayload = {
  problemId: string;
  problemTitle: string;
  categoryTitle: string;
  confidence: number;
  summary: string;
  blockers: string;
  notes: string;
  difficulty: Difficulty;
  core: boolean;
};

type FeedbackResult = {
  mode: 'openai' | 'local-fallback';
  verdict: 'all_good' | 'mixed' | 'needs_work';
  strengths: string[];
  gaps: string[];
  nextActions: string[];
  reviewDays: number;
};

function buildFallback(payload: FeedbackPayload): FeedbackResult {
  const confidence = Math.max(0, Math.min(100, Number(payload.confidence || 0)));
  const summaryLength = payload.summary.trim().length;
  const blockersLength = payload.blockers.trim().length;

  const strengths: string[] = [];
  const gaps: string[] = [];
  const nextActions: string[] = [];

  if (confidence >= 75) strengths.push('Confidence bun pentru problema selectata.');
  if (summaryLength >= 120) strengths.push('Rezumat suficient de detaliat (pattern + complexitate + edge cases).');
  if (blockersLength > 0) strengths.push('Ai documentat clar blocajele, bun pentru iteratia urmatoare.');

  if (confidence < 60) gaps.push('Confidence sub pragul minim. Solutia nu este inca stabila.');
  if (summaryLength < 90) gaps.push('Rezumat prea scurt. Lipsesc detalii despre abordare si tradeoff-uri.');
  if (payload.core && confidence < 70) gaps.push('Problema core ramane sub prag, trebuie inca un sprint ghidat.');

  nextActions.push('Rescrie solutia fara notes in 15 minute.');
  nextActions.push('Explica verbal complexitatea timp/spatiu in 2 fraze.');
  nextActions.push('Adauga 2 edge cases in notes la problema.');

  const reviewDays = confidence >= 80 ? 3 : confidence >= 65 ? 2 : 1;

  return {
    mode: 'local-fallback',
    verdict: confidence >= 75 ? 'all_good' : confidence >= 60 ? 'mixed' : 'needs_work',
    strengths,
    gaps,
    nextActions,
    reviewDays,
  };
}

function normalizeVerdict(value: unknown): FeedbackResult['verdict'] {
  if (value === 'all_good' || value === 'mixed' || value === 'needs_work') return value;
  return 'mixed';
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as FeedbackPayload;

    if (!payload?.problemId || !payload?.problemTitle) {
      return NextResponse.json({ error: 'Missing problem.' }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json(buildFallback(payload));

    const systemPrompt = [
      'You are an algorithm interview trainer.',
      'Return concise Romanian feedback as JSON only.',
      'Required keys: verdict, strengths, gaps, nextActions, reviewDays.',
      'verdict must be one of: all_good, mixed, needs_work.',
      'reviewDays must be an integer between 1 and 4.',
      'Prioritize practical next steps for problem-solving interviews.',
    ].join(' ');

    const userPayload = {
      nowIso: new Date().toISOString(),
      submission: payload,
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
            name: 'algo_trainer_feedback',
            schema: {
              type: 'object',
              additionalProperties: false,
              required: ['verdict', 'strengths', 'gaps', 'nextActions', 'reviewDays'],
              properties: {
                verdict: { type: 'string', enum: ['all_good', 'mixed', 'needs_work'] },
                strengths: { type: 'array', items: { type: 'string' } },
                gaps: { type: 'array', items: { type: 'string' } },
                nextActions: { type: 'array', items: { type: 'string' } },
                reviewDays: { type: 'integer', minimum: 1, maximum: 4 },
              },
            },
          },
        },
      }),
    });

    if (!r.ok) return NextResponse.json(buildFallback(payload));

    const data = (await r.json()) as { output_text?: string };
    const raw = data.output_text ?? '{}';
    const parsed = JSON.parse(raw) as {
      verdict?: unknown;
      strengths?: unknown;
      gaps?: unknown;
      nextActions?: unknown;
      reviewDays?: unknown;
    };

    const result: FeedbackResult = {
      mode: 'openai',
      verdict: normalizeVerdict(parsed.verdict),
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths.map(String).slice(0, 3) : [],
      gaps: Array.isArray(parsed.gaps) ? parsed.gaps.map(String).slice(0, 4) : [],
      nextActions: Array.isArray(parsed.nextActions) ? parsed.nextActions.map(String).slice(0, 4) : [],
      reviewDays: Number.isFinite(parsed.reviewDays) ? Math.max(1, Math.min(4, Number(parsed.reviewDays))) : 2,
    };

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: 'Failed to generate feedback.' }, { status: 500 });
  }
}
