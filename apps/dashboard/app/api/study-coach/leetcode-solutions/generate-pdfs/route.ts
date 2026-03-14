import { spawnSync } from 'child_process';
import path from 'path';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PdfSummary = {
  ok: boolean;
  chromeBinary: string;
  scannedHtmlCount: number;
  createdCount: number;
  skippedCount: number;
  failedCount: number;
  created: string[];
  skipped: string[];
  failed: Array<{ htmlPath: string; pdfPath: string; error: string }>;
  error?: string;
};

export async function POST() {
  const repoRoot = path.resolve(process.cwd(), '..', '..');
  const scriptPath = path.join(repoRoot, 'scripts', 'generate_study_coach_pdfs.mjs');

  const proc = spawnSync(process.execPath, [scriptPath, '--json'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  const output = (proc.stdout || '').trim();
  if (!output) {
    return NextResponse.json(
      { ok: false, error: proc.stderr?.trim() || 'No output from PDF generator script' },
      { status: 500 },
    );
  }

  let parsed: PdfSummary | null = null;
  try {
    parsed = JSON.parse(output) as PdfSummary;
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Invalid JSON from PDF generator script', output },
      { status: 500 },
    );
  }

  if (proc.status !== 0 || !parsed.ok) {
    return NextResponse.json(parsed, { status: 500 });
  }

  return NextResponse.json(parsed);
}
