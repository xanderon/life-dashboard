import { promises as fs } from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';

type LeetCategory =
  | 'study_guides'
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
  { id: 'study_guides', hints: ['learning.method', 'learning method'] },
  // Keep more specific groups before generic "arrays" to avoid false matches.
  { id: 'linked_list', hints: ['linkedlist', 'linked_list', 'linked-list'] },
  { id: 'binary_search', hints: ['binarysearch', 'binary_search', 'binary-search'] },
  { id: 'binary_tree', hints: ['binarytree', 'binary_tree', 'binary-tree', 'tree'] },
  { id: 'matrix', hints: ['matrix', 'matrices'] },
  { id: 'stack', hints: ['stack', 'stacks'] },
  { id: 'queue', hints: ['queue', 'queues'] },
  { id: 'recursion', hints: ['recursion', 'recursive'] },
  { id: 'arrays', hints: ['array', 'arrays'] },
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

  // Strong guards for ambiguous names like "...mergetwosortedarrays" under linked list.
  if (joined.includes('linkedlist') || joined.includes('linked_list') || joined.includes('linked-list')) {
    return 'linked_list';
  }
  if (joined.includes('binarysearch') || joined.includes('binary_search') || joined.includes('binary-search')) {
    return 'binary_search';
  }
  if (joined.includes('learning.method') || joined.includes('learning method')) {
    return 'study_guides';
  }

  for (const category of CATEGORY_HINTS) {
    if (category.hints.some((hint) => joined.includes(hint))) return category.id;
  }
  return 'arrays';
}

function inferDifficulty(parts: string[]): LeetDifficulty {
  if (parts.some((part) => part.toLowerCase() === 'learning' || part.toLowerCase() === 'method')) return 'easy';
  if (parts.some((part) => part.toLowerCase() === 'medium')) return 'medium';
  return 'easy';
}

function inferNumber(parts: string[]): number | null {
  const found = parts.find((part) => /^\d+$/.test(part));
  return found ? Number(found) : null;
}

function prettifyTitle(parts: string[], num: number | null) {
  const REPLACEMENTS: Record<string, string> = {
    binarysearch: 'binary search',
    linkedlist: 'linked list',
    twosum: 'two sum',
    mergetwosortedarrays: 'merge two sorted arrays',
    transposematrix: 'transpose matrix',
    validparantheses: 'valid parentheses',
    learning: 'learning',
    method: 'method',
  };

  const filtered = parts.filter((part) => !/^\d+$/.test(part) && !['leetcode', 'easy', 'medium', 'html'].includes(part.toLowerCase()));
  const normalized = filtered
    .map((part) => {
      const key = part.toLowerCase();
      const replaced = REPLACEMENTS[key] ?? key;
      return replaced
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/[_-]+/g, ' ')
        .trim();
    })
    .join(' ');

  const raw = normalized.trim();
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
