import { promises as fs } from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';

const DOCS_ROOT = path.join(process.cwd(), 'app', 'study-coach', 'htmldocs');
const THEORY_ROOT = path.join(process.cwd(), 'app', 'study-coach', 'htmldocstheory');
const REAL_LIFE_ROOT = path.join(process.cwd(), 'app', 'study-coach', 'htmlreallifequestions');

function sanitizeRelative(input: string) {
  const normalized = input.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized.includes('..')) return null;
  if (!normalized.toLowerCase().endsWith('.html')) return null;
  return normalized;
}

function resolveRootAndFile(safe: string) {
  if (safe.startsWith('theory/')) {
    return {
      root: THEORY_ROOT,
      rel: safe.slice('theory/'.length),
    };
  }
  if (safe.startsWith('real_life/')) {
    return {
      root: REAL_LIFE_ROOT,
      rel: safe.slice('real_life/'.length),
    };
  }

  return {
    root: DOCS_ROOT,
    rel: safe,
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const fileParam = searchParams.get('file') ?? '';
  const safe = sanitizeRelative(fileParam);
  if (!safe) {
    return new NextResponse('Invalid file path', { status: 400 });
  }

  const { root, rel } = resolveRootAndFile(safe);
  const fullPath = path.join(root, rel);
  const relativeBack = path.relative(root, fullPath);
  if (relativeBack.startsWith('..') || path.isAbsolute(relativeBack)) {
    return new NextResponse('Access denied', { status: 403 });
  }

  try {
    const html = await fs.readFile(fullPath, 'utf8');
    return new NextResponse(html, {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
      },
    });
  } catch {
    return new NextResponse('File not found', { status: 404 });
  }
}
