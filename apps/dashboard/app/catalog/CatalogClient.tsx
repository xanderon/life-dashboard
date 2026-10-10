'use client';

import { ArrowLeft, GraduationCap, RefreshCw, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageShell } from '@/components/PageShell';

type Subject = {
  name: string;
  grades: number[];
  average: number | null;
  unexcusedAbsences: number;
  excusedAbsences: number;
};

type CatalogSummary = {
  catalogId: string;
  catalogLabel: string;
  catalogs: { id: string; label: string }[];
  studentName: string | null;
  subjects: Subject[];
  gradeCount: number;
  unexcusedAbsences: number;
  excusedAbsences: number;
  fetchedAt: string;
};

const APP_SLUG = 'scoala-noua';
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

function urlBase64ToUint8Array(value: string) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

function formatFetchedAt(value: string) {
  return new Intl.DateTimeFormat('ro-RO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function CatalogClient() {
  const [summary, setSummary] = useState<CatalogSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [catalogId, setCatalogId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = catalogId ? `?catalog=${encodeURIComponent(catalogId)}` : '';
      const response = await fetch(`/api/scoala-noua/summary${query}`, { cache: 'no-store' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error ?? 'Catalog indisponibil.');
      setSummary(payload as CatalogSummary);
    } catch (nextError) {
      setSummary(null);
      setError(nextError instanceof Error ? nextError.message : 'Catalog indisponibil.');
    } finally {
      setLoading(false);
    }
  }, [catalogId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPushSupported(
      'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window,
    );
  }, []);

  const gradedSubjects = useMemo(
    () => summary?.subjects.filter((subject) => subject.grades.length > 0).length ?? 0,
    [summary],
  );

  async function enableNotifications() {
    if (!pushSupported) return;
    setPushLoading(true);
    setPushError(null);
    try {
      if (Notification.permission === 'denied') {
        throw new Error('Notificările sunt blocate în browser. Activează-le din setările browserului.');
      }
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Permisiunea pentru notificări nu a fost acordată.');
      if (!VAPID_PUBLIC_KEY) throw new Error('Lipsește cheia publică pentru notificări.');

      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }

      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription, appSlug: APP_SLUG, userAgent: navigator.userAgent }),
      });
      if (!response.ok) throw new Error('Abonarea pentru notificări nu a putut fi salvată.');
      setPushEnabled(true);
    } catch (nextError) {
      setPushError(nextError instanceof Error ? nextError.message : 'Nu am putut activa notificările.');
    } finally {
      setPushLoading(false);
    }
  }

  return (
    <PageShell width="6xl">
      <div className="space-y-4 sm:space-y-6">
        <Link className="page-back-link" href="/">
          <ArrowLeft aria-hidden="true" size={16} /> Înapoi la dashboard
        </Link>

        <section className="hero-card hero-card--personal p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="eyebrow">Școală</div>
              <h1 className="display-title mt-3 text-3xl font-semibold tracking-[-0.06em] sm:text-5xl">
                Catalog virtual
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)] sm:text-base">
                Situația școlară este citită direct din ȘcoalaNouă. Datele de acces rămân doar pe server.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="app-card-icon !h-12 !w-12"><GraduationCap aria-hidden="true" /></span>
              <button className="btn-base btn-secondary" disabled={loading} onClick={() => void load()} type="button">
                <RefreshCw aria-hidden="true" className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Reîncarcă
              </button>
            </div>
          </div>
        </section>

        {loading ? (
          <section className="surface-card p-6 text-sm text-[var(--muted)]">Se încarcă sumarul catalogului…</section>
        ) : null}

        {error ? (
          <section className="surface-card surface-card--danger p-5">
            <div className="text-base font-semibold">Catalogul nu este pregătit</div>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{error}</p>
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-3 text-sm leading-6 text-[var(--muted)]">
              <ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Adaugă variabilele <code>SCOALA_NOUA_USERNAME</code> și <code>SCOALA_NOUA_PASSWORD</code> în <code>apps/dashboard/.env.local</code>, apoi repornește serverul local.</span>
            </div>
          </section>
        ) : null}

        {summary ? (
          <>
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ['Materii cu note', String(gradedSubjects)],
                ['Note', String(summary.gradeCount)],
                ['Absențe nemotivate', String(summary.unexcusedAbsences)],
                ['Absențe motivate', String(summary.excusedAbsences)],
              ].map(([label, value]) => (
                <div className="surface-card surface-card--subtle p-4" key={label}>
                  <div className="text-2xl font-semibold tracking-tight">{value}</div>
                  <div className="mt-1 text-xs leading-5 text-[var(--muted)]">{label}</div>
                </div>
              ))}
            </section>

            <section className="surface-card overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-4 sm:px-5">
                <div>
                  <h2 className="text-lg font-semibold">{summary.studentName ?? summary.catalogLabel}</h2>
                  <p className="mt-1 text-xs text-[var(--muted)]">Actualizat {formatFetchedAt(summary.fetchedAt)}</p>
                </div>
                <div className="flex items-center gap-2">
                  {summary.catalogs.length > 1 ? (
                    <select
                      aria-label="Alege catalogul"
                      className="rounded-full border border-[var(--border)] bg-[var(--panel-2)] px-3 py-1.5 text-xs text-[var(--text)] outline-none"
                      value={summary.catalogId}
                      onChange={(event) => setCatalogId(event.target.value)}
                    >
                      {summary.catalogs.map((catalog) => <option key={catalog.id} value={catalog.id}>{catalog.label}</option>)}
                    </select>
                  ) : null}
                  <span className="rounded-full border border-[var(--border)] bg-[var(--panel-2)] px-3 py-1 text-xs text-[var(--muted)]">{summary.subjects.length} materii</span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[44rem] text-left text-sm">
                  <thead className="bg-[var(--panel-2)] text-xs uppercase tracking-[0.08em] text-[var(--muted)]">
                    <tr>
                      <th className="px-4 py-3 font-medium sm:px-5">Materia</th>
                      <th className="px-4 py-3 font-medium">Note</th>
                      <th className="px-4 py-3 font-medium">Media</th>
                      <th className="px-4 py-3 font-medium">Nemotivate</th>
                      <th className="px-4 py-3 font-medium">Motivate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {summary.subjects.map((subject) => (
                      <tr key={subject.name}>
                        <td className="px-4 py-3 font-medium sm:px-5">{subject.name}</td>
                        <td className="px-4 py-3 text-[var(--muted)]">
                          {subject.grades.length ? (
                            <div className="flex flex-wrap gap-1.5">
                              {subject.grades.map((grade, index) => (
                                <span className="rounded-lg border border-[color-mix(in_srgb,var(--accent)_28%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_10%,var(--panel-2))] px-2 py-0.5 text-xs font-semibold text-[var(--text)]" key={`${grade}-${index}`}>{grade}</span>
                              ))}
                            </div>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3 text-[var(--muted)]">{subject.average ?? '—'}</td>
                        <td className="px-4 py-3 text-[var(--muted)]">{subject.unexcusedAbsences}</td>
                        <td className="px-4 py-3 text-[var(--muted)]">{subject.excusedAbsences}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="surface-card surface-card--subtle p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-semibold">Notificări pentru schimbări</h2>
                  <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
                    Primești Web Push când verificarea programată observă note sau absențe noi.
                  </p>
                </div>
                {pushSupported ? (
                  <button className="btn-base btn-secondary" disabled={pushLoading || pushEnabled} onClick={() => void enableNotifications()} type="button">
                    {pushEnabled ? 'Notificări active' : pushLoading ? 'Se activează…' : 'Activează notificările'}
                  </button>
                ) : (
                  <span className="text-sm text-[var(--muted)]">Acest browser nu suportă Web Push.</span>
                )}
              </div>
              {pushError ? <p className="mt-3 text-sm text-[var(--danger)]">{pushError}</p> : null}
            </section>
          </>
        ) : null}
      </div>
    </PageShell>
  );
}
