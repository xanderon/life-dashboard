import { promises as fs } from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';

type LeetCategory =
  | 'arrays'
  | 'binary_search'
  | 'matrix'
  | 'stack'
  | 'queue'
  | 'recursion'
  | 'linked_list'
  | 'binary_tree';

type LeetDifficulty = 'easy' | 'medium';

type SolutionDoc = {
  file: string;
  title: string;
  category: LeetCategory;
  difficulty: LeetDifficulty;
  problemNumber: number | null;
};

const DOCS_ROOT = path.join(process.cwd(), 'app', 'study-coach', 'htmldocs');

const CATEGORY_HINTS: Array<{ id: LeetCategory; hints: string[] }> = [
  { id: 'arrays', hints: ['array', 'arrays'] },
  { id: 'binary_search', hints: ['binarysearch', 'binary_search', 'binary-search'] },
  { id: 'matrix', hints: ['matrix', 'matrices'] },
  { id: 'stack', hints: ['stack', 'stacks'] },
  { id: 'queue', hints: ['queue', 'queues'] },
  { id: 'recursion', hints: ['recursion', 'recursive'] },
  { id: 'linked_list', hints: ['linkedlist', 'linked_list', 'linked-list'] },
  { id: 'binary_tree', hints: ['binarytree', 'binary_tree', 'binary-tree', 'tree'] },
];

async function walkHtmlFiles(root: string, current = ''): Promise<string[]> {
  const dir = path.join(root, current);
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out: string[] = [];

  for (const entry of entries) {
    const rel = path.join(current, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walkHtmlFiles(root, rel)));
      continue;
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.html')) {
      out.push(rel);
    }
  }

  return out;
}

function inferCategory(parts: string[]): LeetCategory {
  const joined = parts.join('.').toLowerCase();
  for (const category of CATEGORY_HINTS) {
    if (category.hints.some((hint) => joined.includes(hint))) return category.id;
  }
  return 'arrays';
}

function inferDifficulty(parts: string[]): LeetDifficulty {
  if (parts.some((part) => part.toLowerCase() === 'medium')) return 'medium';
  return 'easy';
}

function inferNumber(parts: string[]): number | null {
  const found = parts.find((part) => /^\d+$/.test(part));
  return found ? Number(found) : null;
}

function prettifyTitle(parts: string[], num: number | null) {
  const filtered = parts.filter((part) => !/^\d+$/.test(part) && !['leetcode', 'easy', 'medium', 'html'].includes(part.toLowerCase()));
  const raw = filtered.join(' ').replace(/[_-]+/g, ' ').trim();
  const title = raw
    .split(' ')
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
  if (title) return num ? `#${num} ${title}` : title;
  return num ? `LeetCode #${num}` : 'LeetCode Solution';
}

function parseDoc(file: string): SolutionDoc {
  const base = path.basename(file, '.html');
  const parts = base.split('.').filter(Boolean);
  const category = inferCategory(parts);
  const difficulty = inferDifficulty(parts);
  const problemNumber = inferNumber(parts);
  const title = prettifyTitle(parts, problemNumber);

  return {
    file,
    title,
    category,
    difficulty,
    problemNumber,
  };
}

export async function GET() {
  try {
    const stat = await fs.stat(DOCS_ROOT).catch(() => null);
    if (!stat || !stat.isDirectory()) {
      return NextResponse.json({ docs: [] as SolutionDoc[] });
    }

    const files = await walkHtmlFiles(DOCS_ROOT);
    const docs = files
      .map((file) => file.replace(/\\/g, '/'))
      .sort((a, b) => a.localeCompare(b))
      .map(parseDoc);

    return NextResponse.json({ docs });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list HTML docs';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
