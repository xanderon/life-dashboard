'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

type LeetCategory =
  | 'study_guides'
  | 'theory'
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

const CATEGORY_LABEL: Record<LeetCategory, string> = {
  study_guides: 'Study Guides',
  theory: 'Theory',
  arrays: 'Arrays',
  binary_search: 'Binary Search',
  matrix: 'Matrix',
  stack: 'Stack',
  queue: 'Queue',
  recursion: 'Recursion',
  linked_list: 'Linked List',
  binary_tree: 'Binary Tree',
};

function previewUrl(file: string) {
  return `/api/study-coach/leetcode-solutions/preview?file=${encodeURIComponent(file)}`;
}

export default function StudyCoachSolutionsPage() {
  const [docs, setDocs] = useState<SolutionDoc[]>([]);
  const [search, setSearch] = useState('');
  const [selectedFile, setSelectedFile] = useState<string>('');
  const [showMenu, setShowMenu] = useState(true);
  const [headerExpanded, setHeaderExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const loadDocs = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch('/api/study-coach/leetcode-solutions', { cache: 'no-store' });
      if (!res.ok) {
        setErr(`Failed to load docs (${res.status})`);
        return;
      }
      const payload = (await res.json()) as { docs?: SolutionDoc[] };
      const next = Array.isArray(payload.docs) ? payload.docs : [];
      setDocs(next);
      setSelectedFile((prev) => prev || next[0]?.file || '');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setErr(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDocs();
  }, [loadDocs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter((doc) => {
      return doc.title.toLowerCase().includes(q)
        || doc.file.toLowerCase().includes(q)
        || CATEGORY_LABEL[doc.category].toLowerCase().includes(q)
        || doc.difficulty.includes(q);
    });
  }, [docs, search]);

  const grouped = useMemo(() => {
    const map = new Map<LeetCategory, SolutionDoc[]>();
    filtered.forEach((doc) => {
      const current = map.get(doc.category) ?? [];
      current.push(doc);
      map.set(doc.category, current);
    });
    return Array.from(map.entries()).sort((a, b) => CATEGORY_LABEL[a[0]].localeCompare(CATEGORY_LABEL[b[0]]));
  }, [filtered]);

  const selected = docs.find((doc) => doc.file === selectedFile) ?? null;

  return (
    <main className="min-h-screen bg-[var(--bg)] p-4 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <header className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4 shadow-sm">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              <Link className="rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-3 py-1.5 text-sm font-semibold" href="/">Dashboard</Link>
              <Link className="rounded-md border border-sky-500/40 bg-sky-500/20 px-3 py-1.5 text-sm font-semibold" href="/study-coach">Today</Link>
              <Link className="rounded-md border border-indigo-500/40 bg-indigo-500/20 px-3 py-1.5 text-sm font-semibold" href="/study-coach/roadmap">Roadmap</Link>
              <Link className="rounded-md border border-emerald-500/40 bg-emerald-500/20 px-3 py-1.5 text-sm font-semibold" href="/study-coach/trainer">Trainer</Link>
            </div>
            <button
              className="rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-3 py-1.5 text-sm font-semibold"
              onClick={() => setHeaderExpanded((prev) => !prev)}
            >
              {headerExpanded ? 'Collapse' : 'Expand'}
            </button>
          </div>
          {headerExpanded ? (
          <>
            <h1 className="text-2xl font-bold">LeetCode HTMLs</h1>
            <p className="mt-1 text-sm text-[var(--muted)]">Cuprins complet pentru fișierele din `study-coach/htmldocs`.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className="rounded-md border border-cyan-500/40 bg-cyan-500/20 px-3 py-1.5 text-sm font-semibold disabled:opacity-60"
                onClick={() => { void loadDocs(); }}
                disabled={loading}
              >
                {loading ? 'Loading...' : 'Refresh list'}
              </button>
              <input
                className="rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-2 py-1.5 text-sm"
                placeholder="Search by title / category / file"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <span className="self-center text-xs text-[var(--muted)]">{filtered.length} files</span>
            </div>
          </>
          ) : (
            <div className="text-xs text-[var(--muted)]">{filtered.length} files</div>
          )}
          {headerExpanded ? (
          <>
            {err ? <p className="mt-2 text-sm text-rose-200">{err}</p> : null}
          </>
          ) : null}
          {!headerExpanded && err ? (
            <p className="mt-2 text-sm text-rose-200">{err}</p>
          ) : null}
        </header>

        <section className="space-y-4">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Cuprins</h2>
              <button
                className="rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-3 py-1.5 text-sm font-semibold"
                onClick={() => setShowMenu((prev) => !prev)}
              >
                {showMenu ? 'Ascunde cuprins' : 'Arata cuprins'}
              </button>
            </div>
            {showMenu ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {grouped.map(([category, items]) => (
                  <div key={category} className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold">{CATEGORY_LABEL[category]}</h3>
                      <span className="text-xs text-[var(--muted)]">{items.length}</span>
                    </div>
                    <div className="mt-2 max-h-48 space-y-1 overflow-auto pr-1">
                      {items.map((doc) => (
                        <button
                          key={doc.file}
                          className={`w-full rounded-md border px-2 py-1.5 text-left text-xs ${selectedFile === doc.file ? 'border-sky-400 bg-sky-500/20' : 'border-[var(--border)] bg-[var(--panel)]'}`}
                          onClick={() => setSelectedFile(doc.file)}
                        >
                          <div className="font-semibold">{doc.title}</div>
                          <div className="text-[var(--muted)]">{doc.difficulty} · {doc.file}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            {!grouped.length && !loading ? (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-3 text-sm text-[var(--muted)]">
                No HTML files found. Add files in `apps/dashboard/app/study-coach/htmldocs` and press Refresh list.
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold">Preview mare</h3>
                <p className="text-xs text-[var(--muted)]">{selected?.file ?? 'Alege un fisier din cuprins.'}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {selected ? (
                  <a
                    className="rounded-md border border-cyan-500/40 bg-cyan-500/20 px-3 py-1.5 text-sm font-semibold"
                    href={previewUrl(selected.file)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open in new tab
                  </a>
                ) : null}
              </div>
            </div>
            {selected ? (
              <iframe
                title={selected.title}
                className="mt-3 h-[74vh] w-full rounded-lg border border-[var(--border)] bg-white sm:h-[78vh] lg:h-[84vh]"
                src={previewUrl(selected.file)}
              />
            ) : (
              <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] p-4 text-sm text-[var(--muted)]">
                Alege o soluție din cuprins ca să vezi preview.
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
