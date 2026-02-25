/* eslint-disable react-hooks/set-state-in-effect */
'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

type SprintStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED';
type Priority = 'P0' | 'P1' | 'P2' | 'P3';

type Sprint = {
  id: string;
  name: string | null;
  start_date: string;
  end_date: string;
  duration_days: number;
  created_at: string;
};

type Template = {
  id: string;
  title: string;
  category: string;
  cadence_type: 'ONCE_PER_SPRINT' | 'MULTI_PER_SPRINT';
  reminder_rules: unknown;
  is_active: boolean;
};

type RecurringTask = {
  id: string;
  sprint_id: string;
  template_id: string | null;
  title_snapshot: string;
  category_snapshot: string;
  owner_name: string | null;
  status: SprintStatus;
  priority: Priority | null;
  notes: string | null;
  due_hint: string | null;
  updated_at: string;
  completed_at: string | null;
};

type AdhocTask = {
  id: string;
  sprint_id: string;
  title: string;
  note: string | null;
  owner_name: string | null;
  status: SprintStatus;
  priority: Priority;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

type Summary = {
  recurringTotal: number;
  recurringDone: number;
  recurringPercent: number;
  adhocTotal: number;
  adhocCompleted: number;
  adhocLeftover: number;
};

type ReminderHit = {
  instanceId: string;
  title: string;
  category: string;
  status: SprintStatus;
  dayOfSprint: number;
  matchedRule: string;
};

const STATUS_LABELS: Record<SprintStatus, string> = {
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'In progress',
  DONE: 'Done',
  BLOCKED: 'Blocked',
};

const STATUS_CLASSES: Record<SprintStatus, string> = {
  NOT_STARTED: 'border-rose-500/50 bg-rose-500/20 text-rose-100',
  IN_PROGRESS: 'border-amber-500/50 bg-amber-500/20 text-amber-100',
  DONE: 'border-emerald-500/50 bg-emerald-500/20 text-emerald-100',
  BLOCKED: 'border-violet-500/50 bg-violet-500/20 text-violet-100',
};

const PRIORITY_CLASSES: Record<Priority, string> = {
  P0: 'border-rose-500/50 bg-rose-500/20 text-rose-100',
  P1: 'border-orange-500/50 bg-orange-500/20 text-orange-100',
  P2: 'border-sky-500/50 bg-sky-500/20 text-sky-100',
  P3: 'border-slate-500/50 bg-slate-500/20 text-slate-100',
};

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ro-RO');
}

function statusSort(status: SprintStatus) {
  if (status === 'NOT_STARTED') return 0;
  if (status === 'IN_PROGRESS') return 1;
  if (status === 'BLOCKED') return 2;
  return 3;
}

function prioritySort(priority: Priority) {
  if (priority === 'P0') return 0;
  if (priority === 'P1') return 1;
  if (priority === 'P2') return 2;
  return 3;
}

function daysBetween(startDate: string) {
  const start = new Date(`${startDate}T00:00:00.000Z`).getTime();
  return Math.max(1, Math.floor((Date.now() - start) / (24 * 3600 * 1000)) + 1);
}

export default function SprintPulsePage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [selectedSprint, setSelectedSprint] = useState<Sprint | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [recurring, setRecurring] = useState<RecurringTask[]>([]);
  const [adhoc, setAdhoc] = useState<AdhocTask[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);

  const [search, setSearch] = useState('');
  const [showAddAdhoc, setShowAddAdhoc] = useState(false);
  const [addTitle, setAddTitle] = useState('');
  const [addNote, setAddNote] = useState('');
  const [addPriority, setAddPriority] = useState<Priority>('P2');

  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [durationDays, setDurationDays] = useState(14);
  const [carryMode, setCarryMode] = useState<'carry_unfinished' | 'keep_old' | 'convert_to_template'>('carry_unfinished');
  const [convertTaskIds, setConvertTaskIds] = useState<string[]>([]);

  const [selectedItem, setSelectedItem] = useState<{ kind: 'recurring' | 'adhoc'; id: string } | null>(null);
  const [activeReminderHits, setActiveReminderHits] = useState<ReminderHit[]>([]);

  const loadBootstrap = useCallback(async (sprintId?: string) => {
    setLoading(true);
    setError(null);
    const query = sprintId ? `?sprintId=${encodeURIComponent(sprintId)}` : '';

    const res = await fetch(`/api/sprintpulse/bootstrap${query}`, { cache: 'no-store' });
    const payload = await res.json();
    if (!res.ok) {
      throw new Error(payload.error ?? 'Failed to load SprintPulse');
    }

    setSprints(payload.sprints ?? []);
    setSelectedSprint(payload.selectedSprint ?? payload.currentSprint ?? null);
    setTemplates(payload.templates ?? []);
    setRecurring(payload.recurring ?? []);
    setAdhoc(payload.adhoc ?? []);
    setSummary(payload.summary ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadBootstrap().catch((err) => {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setLoading(false);
    });
  }, [loadBootstrap]);

  const refreshSummary = useCallback(async (sprintId: string) => {
    const res = await fetch(`/api/sprintpulse/summary?sprintId=${encodeURIComponent(sprintId)}`, {
      cache: 'no-store',
    });
    const payload = await res.json();
    if (!res.ok) return;
    setSummary(payload.summary ?? null);
  }, []);

  const filteredRecurring = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = !q
      ? recurring
      : recurring.filter((task) => {
          const text = `${task.title_snapshot} ${task.category_snapshot} ${task.notes ?? ''}`.toLowerCase();
          return text.includes(q);
        });

    const start = rows.filter((task) => task.category_snapshot === 'StartOfSprint');
    const highCadence = rows.filter(
      (task) => task.due_hint?.toLowerCase().includes('multiple') || task.category_snapshot === 'Logs'
    );
    const middle = rows.filter(
      (task) => !start.some((s) => s.id === task.id) && !highCadence.some((h) => h.id === task.id)
    );

    const byStatus = (a: RecurringTask, b: RecurringTask) => statusSort(a.status) - statusSort(b.status);

    return {
      start: [...start].sort(byStatus),
      middle: [...middle].sort(byStatus),
      highCadence: [...highCadence].sort(byStatus),
    };
  }, [recurring, search]);

  const filteredAdhoc = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = !q
      ? adhoc
      : adhoc.filter((task) => {
          const text = `${task.title} ${task.note ?? ''}`.toLowerCase();
          return text.includes(q);
        });

    return [...rows].sort((a, b) => {
      const p = prioritySort(a.priority) - prioritySort(b.priority);
      if (p !== 0) return p;
      const s = statusSort(a.status) - statusSort(b.status);
      if (s !== 0) return s;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [adhoc, search]);

  const incompleteAdhoc = useMemo(() => adhoc.filter((task) => task.status !== 'DONE'), [adhoc]);

  const changeRecurringStatus = useCallback(async (taskId: string, status: SprintStatus, action: string) => {
    const previous = recurring;
    setRecurring((rows) => rows.map((row) => (row.id === taskId ? { ...row, status } : row)));

    const res = await fetch(`/api/sprintpulse/instances/${taskId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status, action }),
    });

    if (!res.ok) {
      setRecurring(previous);
      const payload = await res.json().catch(() => null);
      setError(payload?.error ?? 'Failed updating recurring task.');
      return;
    }

    const payload = await res.json();
    const nextTask = payload.task as RecurringTask;
    setRecurring((rows) => rows.map((row) => (row.id === taskId ? nextTask : row)));
    if (selectedSprint?.id) refreshSummary(selectedSprint.id);
  }, [recurring, refreshSummary, selectedSprint]);

  const saveRecurringNote = useCallback(async (task: RecurringTask, note: string) => {
    const res = await fetch(`/api/sprintpulse/instances/${task.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ notes: note, action: 'NOTE_UPDATED' }),
    });

    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      setError(payload?.error ?? 'Failed saving note.');
      return;
    }

    const payload = await res.json();
    const nextTask = payload.task as RecurringTask;
    setRecurring((rows) => rows.map((row) => (row.id === task.id ? nextTask : row)));
  }, []);

  async function addAdhocTask() {
    if (!selectedSprint || !addTitle.trim()) return;

    const res = await fetch('/api/sprintpulse/adhoc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sprintId: selectedSprint.id,
        title: addTitle,
        note: addNote || null,
        priority: addPriority,
        ownerName: 'Me',
      }),
    });

    const payload = await res.json();
    if (!res.ok) {
      setError(payload.error ?? 'Failed creating ad-hoc task.');
      return;
    }

    setAdhoc((rows) => [payload.task as AdhocTask, ...rows]);
    setAddTitle('');
    setAddNote('');
    setAddPriority('P2');
    setShowAddAdhoc(false);
    if (selectedSprint?.id) refreshSummary(selectedSprint.id);
  }

  const patchAdhoc = useCallback(async (taskId: string, patch: Partial<AdhocTask>) => {
    const res = await fetch(`/api/sprintpulse/adhoc/${taskId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: patch.title,
        note: patch.note,
        ownerName: patch.owner_name,
        status: patch.status,
        priority: patch.priority,
      }),
    });

    const payload = await res.json();
    if (!res.ok) {
      setError(payload.error ?? 'Failed updating ad-hoc task.');
      return;
    }

    const next = payload.task as AdhocTask;
    setAdhoc((rows) => rows.map((row) => (row.id === next.id ? next : row)));
    if (selectedSprint?.id) refreshSummary(selectedSprint.id);
  }, [refreshSummary, selectedSprint]);

  async function startNewSprint() {
    const res = await fetch('/api/sprintpulse/sprints/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        startDate,
        durationDays,
        carryOverMode: carryMode,
        convertTaskIds,
      }),
    });

    const payload = await res.json();
    if (!res.ok) {
      setError(payload.error ?? 'Failed to start sprint.');
      return;
    }

    setSprints(payload.sprints ?? []);
    setSelectedSprint(payload.sprint ?? null);
    setRecurring(payload.recurring ?? []);
    setAdhoc(payload.adhoc ?? []);
    setSummary(payload.summary ?? null);
    setConvertTaskIds([]);
  }

  async function checkReminders() {
    const res = await fetch('/api/sprintpulse/reminders/check', { method: 'POST' });
    const payload = await res.json();
    if (!res.ok) {
      setError(payload.error ?? 'Failed to check reminders.');
      return;
    }
    setActiveReminderHits(payload.reminders ?? []);
  }

  async function exportSummaryMarkdown() {
    if (!selectedSprint || !summary) return;

    const doneRecurring = recurring.filter((task) => task.status === 'DONE');
    const openRecurring = recurring.filter((task) => task.status !== 'DONE');
    const doneAdhoc = adhoc.filter((task) => task.status === 'DONE');
    const openAdhoc = adhoc.filter((task) => task.status !== 'DONE');

    const md = [
      `# Sprint Review - ${selectedSprint.name ?? selectedSprint.start_date}`,
      '',
      `- Range: ${selectedSprint.start_date} -> ${selectedSprint.end_date}`,
      `- Recurring completion: ${summary.recurringDone}/${summary.recurringTotal} (${summary.recurringPercent}%)`,
      `- Ad-hoc completion: ${summary.adhocCompleted}/${summary.adhocTotal}`,
      `- Leftover ad-hoc: ${summary.adhocLeftover}`,
      '',
      '## Recurring Done',
      ...doneRecurring.map((task) => `- [x] ${task.title_snapshot}`),
      '',
      '## Recurring Not Done',
      ...openRecurring.map((task) => `- [ ] ${task.title_snapshot} (${STATUS_LABELS[task.status]})`),
      '',
      '## Ad-hoc Done',
      ...doneAdhoc.map((task) => `- [x] [${task.priority}] ${task.title}`),
      '',
      '## Ad-hoc Not Done',
      ...openAdhoc.map((task) => `- [ ] [${task.priority}] ${task.title} (${STATUS_LABELS[task.status]})`),
      '',
    ].join('\n');

    await navigator.clipboard.writeText(md);
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isInput =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.getAttribute('contenteditable') === 'true';
      if (isInput) return;

      if (event.key.toLowerCase() === 'n') {
        event.preventDefault();
        setShowAddAdhoc(true);
      }

      if (!selectedItem) return;

      if (event.key.toLowerCase() === 'd') {
        event.preventDefault();
        if (selectedItem.kind === 'recurring') {
          changeRecurringStatus(selectedItem.id, 'DONE', 'SHORTCUT_DONE');
        } else {
          patchAdhoc(selectedItem.id, { status: 'DONE' });
        }
      }

      if (event.key.toLowerCase() === 'i') {
        event.preventDefault();
        if (selectedItem.kind === 'recurring') {
          changeRecurringStatus(selectedItem.id, 'IN_PROGRESS', 'SHORTCUT_PROGRESS');
        } else {
          patchAdhoc(selectedItem.id, { status: 'IN_PROGRESS' });
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedItem, patchAdhoc, changeRecurringStatus]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[var(--bg)] p-4 sm:p-6">
        <div className="mx-auto max-w-7xl rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-6">
          Loading SprintPulse...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--bg)] p-4 sm:p-6">
      <div className="mx-auto max-w-7xl">
        <header className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold">SprintPulse</h1>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Rosu = te doare, portocaliu = e pe teava, verde = ai scapat.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                className="rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-sm font-semibold hover:bg-black/10"
                href="/"
              >
                ← Dashboard
              </Link>
              <button
                className="rounded-md border border-emerald-500/40 bg-emerald-500/20 px-3 py-2 text-sm font-semibold hover:bg-emerald-500/30"
                onClick={() => setShowAddAdhoc(true)}
              >
                + Add ad-hoc
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-5">
            <label className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-sm lg:col-span-2">
              <div className="text-[11px] uppercase text-[var(--muted)]">Sprint</div>
              <select
                className="mt-1 w-full bg-transparent outline-none"
                value={selectedSprint?.id ?? ''}
                onChange={(event) => {
                  const nextId = event.target.value;
                  const nextSprint = sprints.find((row) => row.id === nextId) ?? null;
                  setSelectedSprint(nextSprint);
                  loadBootstrap(nextId).catch((err) => {
                    setError(err instanceof Error ? err.message : 'Failed loading sprint');
                  });
                }}
              >
                {sprints.map((sprint) => (
                  <option key={sprint.id} value={sprint.id}>
                    {sprint.name ?? sprint.start_date}
                  </option>
                ))}
              </select>
            </label>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-sm">
              <div className="text-[11px] uppercase text-[var(--muted)]">Range</div>
              <div className="mt-1 font-semibold">
                {selectedSprint?.start_date ?? '—'} → {selectedSprint?.end_date ?? '—'}
              </div>
            </div>

            <label className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-sm">
              <div className="text-[11px] uppercase text-[var(--muted)]">Search</div>
              <input
                className="mt-1 w-full bg-transparent outline-none"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="title, notes..."
              />
            </label>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-sm">
              <div className="text-[11px] uppercase text-[var(--muted)]">Day of sprint</div>
              <div className="mt-1 font-semibold">
                {selectedSprint ? daysBetween(selectedSprint.start_date) : '—'}
              </div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-5">
            <label className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-sm">
              <div className="text-[11px] uppercase text-[var(--muted)]">Start date</div>
              <input
                className="mt-1 w-full bg-transparent outline-none"
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </label>

            <label className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-sm">
              <div className="text-[11px] uppercase text-[var(--muted)]">Duration days</div>
              <input
                className="mt-1 w-full bg-transparent outline-none"
                type="number"
                min={1}
                max={60}
                value={durationDays}
                onChange={(event) => setDurationDays(Number(event.target.value || 14))}
              />
            </label>

            <label className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-sm lg:col-span-2">
              <div className="text-[11px] uppercase text-[var(--muted)]">Carry-over unfinished ad-hoc</div>
              <select
                className="mt-1 w-full bg-transparent outline-none"
                value={carryMode}
                onChange={(event) => setCarryMode(event.target.value as typeof carryMode)}
              >
                <option value="carry_unfinished">Carry over unfinished (default)</option>
                <option value="keep_old">Keep in old sprint</option>
                <option value="convert_to_template">Convert selected to recurring template</option>
              </select>
            </label>

            <button
              className="rounded-xl border border-sky-500/40 bg-sky-500/20 px-3 py-2 text-sm font-semibold hover:bg-sky-500/30"
              onClick={startNewSprint}
            >
              Start New Sprint
            </button>
          </div>

          {carryMode === 'convert_to_template' && incompleteAdhoc.length ? (
            <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-3 text-sm">
              <div className="text-[11px] uppercase text-[var(--muted)]">Select unfinished ad-hoc to convert</div>
              <div className="mt-2 grid grid-cols-1 gap-2 lg:grid-cols-2">
                {incompleteAdhoc.map((task) => {
                  const checked = convertTaskIds.includes(task.id);
                  return (
                    <label key={task.id} className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-2 py-1">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                          const isChecked = event.target.checked;
                          setConvertTaskIds((ids) =>
                            isChecked ? [...ids, task.id] : ids.filter((id) => id !== task.id)
                          );
                        }}
                      />
                      <span>
                        [{task.priority}] {task.title}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              className="rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-3 py-1.5 text-xs font-semibold hover:bg-black/10"
              onClick={checkReminders}
            >
              Check reminders
            </button>
            <button
              className="rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-3 py-1.5 text-xs font-semibold hover:bg-black/10"
              onClick={exportSummaryMarkdown}
            >
              Copy review markdown
            </button>
            <div className="text-xs text-[var(--muted)]">Shortcuts: N (new), D (done), I (in progress)</div>
          </div>

          {activeReminderHits.length ? (
            <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/15 p-3 text-sm text-amber-100">
              <div className="font-semibold">Reminder hits ({activeReminderHits.length})</div>
              <div className="mt-1 space-y-1">
                {activeReminderHits.map((hit) => (
                  <div key={`${hit.instanceId}-${hit.matchedRule}`}>
                    • Day {hit.dayOfSprint}: {hit.title} ({hit.matchedRule})
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="mt-3 rounded-xl border border-rose-500/40 bg-rose-500/20 p-3 text-sm text-rose-100">
              {error}
            </div>
          ) : null}
        </header>

        {showAddAdhoc ? (
          <section className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4 shadow-sm">
            <div className="text-lg font-semibold">Quick add ad-hoc</div>
            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-4">
              <input
                className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 outline-none lg:col-span-2"
                placeholder="Task title"
                value={addTitle}
                onChange={(event) => setAddTitle(event.target.value)}
              />
              <input
                className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 outline-none"
                placeholder="Optional note"
                value={addNote}
                onChange={(event) => setAddNote(event.target.value)}
              />
              <select
                className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 outline-none"
                value={addPriority}
                onChange={(event) => setAddPriority(event.target.value as Priority)}
              >
                <option value="P0">P0</option>
                <option value="P1">P1</option>
                <option value="P2">P2</option>
                <option value="P3">P3</option>
              </select>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button
                className="rounded-md border border-emerald-500/40 bg-emerald-500/20 px-3 py-2 text-sm font-semibold hover:bg-emerald-500/30"
                onClick={addAdhocTask}
              >
                Save
              </button>
              <button
                className="rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-sm font-semibold hover:bg-black/10"
                onClick={() => setShowAddAdhoc(false)}
              >
                Cancel
              </button>
            </div>
          </section>
        ) : null}

        <section className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="space-y-3 lg:col-span-2">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4 shadow-sm">
              <h2 className="text-lg font-semibold">Recurring Sprint Checklist</h2>
              <p className="mt-1 text-xs text-[var(--muted)]">Start of Sprint</p>
              <div className="mt-3 space-y-3">
                {filteredRecurring.start.map((task) => (
                  <RecurringCard
                    key={task.id}
                    task={task}
                    selected={selectedItem?.kind === 'recurring' && selectedItem.id === task.id}
                    onSelect={() => setSelectedItem({ kind: 'recurring', id: task.id })}
                    onStatusChange={changeRecurringStatus}
                    onSaveNote={saveRecurringNote}
                  />
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4 shadow-sm">
              <h2 className="text-lg font-semibold">Weekly / Once per sprint</h2>
              <div className="mt-3 space-y-3">
                {filteredRecurring.middle.map((task) => (
                  <RecurringCard
                    key={task.id}
                    task={task}
                    selected={selectedItem?.kind === 'recurring' && selectedItem.id === task.id}
                    onSelect={() => setSelectedItem({ kind: 'recurring', id: task.id })}
                    onStatusChange={changeRecurringStatus}
                    onSaveNote={saveRecurringNote}
                  />
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4 shadow-sm">
              <h2 className="text-lg font-semibold">Higher cadence near release</h2>
              <div className="mt-3 space-y-3">
                {filteredRecurring.highCadence.map((task) => (
                  <RecurringCard
                    key={task.id}
                    task={task}
                    selected={selectedItem?.kind === 'recurring' && selectedItem.id === task.id}
                    onSelect={() => setSelectedItem({ kind: 'recurring', id: task.id })}
                    onStatusChange={changeRecurringStatus}
                    onSaveNote={saveRecurringNote}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4 shadow-sm">
              <h2 className="text-lg font-semibold">Ad-hoc & Notes</h2>
              <div className="mt-3 space-y-2">
                {filteredAdhoc.map((task) => (
                  <button
                    key={task.id}
                    className={`w-full rounded-xl border p-3 text-left ${
                      selectedItem?.kind === 'adhoc' && selectedItem.id === task.id
                        ? 'border-sky-500/60 bg-sky-500/10'
                        : 'border-[var(--border)] bg-[var(--panel-2)]'
                    }`}
                    onClick={() => setSelectedItem({ kind: 'adhoc', id: task.id })}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${PRIORITY_CLASSES[task.priority]}`}>
                        {task.priority}
                      </span>
                      <span className="text-sm font-semibold">{task.title}</span>
                    </div>
                    <div className="mt-1 text-xs text-[var(--muted)]">{task.note || '—'}</div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <StatusPill status={task.status} />
                      <button
                        className="rounded-md border border-emerald-500/40 bg-emerald-500/20 px-2 py-1 text-[11px] font-semibold hover:bg-emerald-500/30"
                        onClick={(event) => {
                          event.stopPropagation();
                          patchAdhoc(task.id, { status: task.status === 'DONE' ? 'NOT_STARTED' : 'DONE' });
                        }}
                      >
                        {task.status === 'DONE' ? 'Reset' : 'Quick done'}
                      </button>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4 shadow-sm">
              <h2 className="text-lg font-semibold">Sprint Review</h2>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <Metric label="Recurring %" value={`${summary?.recurringPercent ?? 0}%`} />
                <Metric label="Recurring done" value={`${summary?.recurringDone ?? 0}/${summary?.recurringTotal ?? 0}`} />
                <Metric label="Ad-hoc done" value={`${summary?.adhocCompleted ?? 0}/${summary?.adhocTotal ?? 0}`} />
                <Metric label="Leftover" value={`${summary?.adhocLeftover ?? 0}`} />
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4 shadow-sm text-xs text-[var(--muted)]">
              <div>Templates active: {templates.filter((template) => template.is_active).length}</div>
              <div className="mt-1">Total templates: {templates.length}</div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function StatusPill({ status }: { status: SprintStatus }) {
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATUS_CLASSES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2">
      <div className="text-[11px] uppercase text-[var(--muted)]">{label}</div>
      <div className="mt-1 text-base font-semibold text-[var(--text)]">{value}</div>
    </div>
  );
}

function RecurringCard({
  task,
  selected,
  onSelect,
  onStatusChange,
  onSaveNote,
}: {
  task: RecurringTask;
  selected: boolean;
  onSelect: () => void;
  onStatusChange: (id: string, status: SprintStatus, action: string) => Promise<void>;
  onSaveNote: (task: RecurringTask, note: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState(() => task.notes ?? '');

  return (
    <article
      className={`rounded-xl border p-3 ${
        selected ? 'border-sky-500/60 bg-sky-500/10' : 'border-[var(--border)] bg-[var(--panel-2)]'
      }`}
      onClick={onSelect}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-semibold">{task.title_snapshot}</div>
            <StatusPill status={task.status} />
          </div>
          <div className="mt-1 text-xs text-[var(--muted)]">
            Owner: {task.owner_name ?? '—'} · Due: {task.due_hint ?? '—'} · Updated: {fmtDate(task.updated_at)}
          </div>
        </div>
        <button
          className="rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:bg-black/10"
          onClick={(event) => {
            event.stopPropagation();
            setExpanded((v) => !v);
          }}
        >
          {expanded ? 'Hide' : 'Notes'}
        </button>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <button
          className="rounded-md border border-emerald-500/40 bg-emerald-500/20 px-2 py-1 text-xs font-semibold hover:bg-emerald-500/30"
          onClick={(event) => {
            event.stopPropagation();
            onStatusChange(task.id, 'DONE', 'QUICK_DONE');
          }}
        >
          Done
        </button>
        <button
          className="rounded-md border border-amber-500/40 bg-amber-500/20 px-2 py-1 text-xs font-semibold hover:bg-amber-500/30"
          onClick={(event) => {
            event.stopPropagation();
            onStatusChange(task.id, 'IN_PROGRESS', 'QUICK_PROGRESS');
          }}
        >
          In progress
        </button>
        <button
          className="rounded-md border border-rose-500/40 bg-rose-500/20 px-2 py-1 text-xs font-semibold hover:bg-rose-500/30"
          onClick={(event) => {
            event.stopPropagation();
            onStatusChange(task.id, 'NOT_STARTED', 'QUICK_RESET');
          }}
        >
          Reset
        </button>
        <button
          className="rounded-md border border-violet-500/40 bg-violet-500/20 px-2 py-1 text-xs font-semibold hover:bg-violet-500/30"
          onClick={(event) => {
            event.stopPropagation();
            onStatusChange(task.id, 'BLOCKED', 'QUICK_BLOCKED');
          }}
        >
          Blocked
        </button>
      </div>

      {expanded ? (
        <div className="mt-3" onClick={(event) => event.stopPropagation()}>
          <textarea
            className="h-20 w-full rounded-lg border border-[var(--border)] bg-[var(--panel)] p-2 text-sm outline-none"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Add note..."
          />
          <button
            className="mt-2 rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-xs font-semibold hover:bg-black/10"
            onClick={() => onSaveNote(task, note)}
          >
            Save note
          </button>
        </div>
      ) : null}
    </article>
  );
}
