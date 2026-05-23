'use client';

import { ChevronDown, ChevronUp, GripHorizontal } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { AppCard, type AppRow } from './AppCard';
import { ClockCard } from './ClockCard';
import { CutCoachCard } from './CutCoachCard';
import { DevicesCard } from './DevicesCard';
import { TricorderCard } from './TricorderCard';

const DASHBOARD_CARD_ORDER_KEY = 'life-dashboard:dashboard-card-order:v1';
const HIDDEN_APP_SLUGS = new Set(['sprintpulse', 'study-coach', 'cut-coach', 'tricorder']);

type DashboardTile = {
  id: string;
  label: string;
  node: ReactNode;
};

const CUSTOM_TILE_ORDER = [
  'widget:cut-coach',
  'widget:clock',
  'app:receipts',
  'widget:devices',
  'app:termo-alert',
  'widget:tricorder',
] as const;

function mergeStoredOrder(nextIds: string[], storedIds: string[] | null) {
  if (!storedIds?.length) return nextIds;
  const known = new Set(nextIds);
  const merged = storedIds.filter((id) => known.has(id));
  for (const id of nextIds) {
    if (!merged.includes(id)) merged.push(id);
  }
  return merged;
}

function moveIndex<T>(items: T[], index: number, delta: -1 | 1) {
  const nextIndex = index + delta;
  if (nextIndex < 0 || nextIndex >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(index, 1);
  next.splice(nextIndex, 0, item);
  return next;
}

function getStoredDashboardOrder() {
  if (typeof window === 'undefined') return null;
  try {
    const stored = JSON.parse(window.localStorage.getItem(DASHBOARD_CARD_ORDER_KEY) ?? 'null');
    return Array.isArray(stored) ? stored.filter((item): item is string => typeof item === 'string') : null;
  } catch {
    return null;
  }
}

export function DashboardGrid() {
  const [apps, setApps] = useState<AppRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [arrangeMode, setArrangeMode] = useState(false);
  const [customOrderedIds, setCustomOrderedIds] = useState<string[] | null>(() => getStoredDashboardOrder());

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await supabase
        .from('apps')
        .select('id,slug,name,description,status,last_run_at,github_url,chat_url,home_url')
        .order('position', { ascending: true })
        .order('created_at', { ascending: true });

      if (!alive) return;
      if (error) {
        setErr(error.message);
        setApps([]);
        return;
      }
      setApps((data as AppRow[] | null) ?? []);
    })();

    return () => {
      alive = false;
    };
  }, []);

  const tiles = useMemo(() => {
    const appsBySlug = new Map((apps ?? []).map((app) => [app.slug, app]));
    const appTiles = (apps ?? [])
      .filter((app) => !HIDDEN_APP_SLUGS.has(app.slug) && app.slug !== 'receipts' && app.slug !== 'termo-alert')
      .map((app) => ({
        id: `app:${app.slug}`,
        label: app.name,
        node: <AppCard app={app} />,
      }));

    const staticTiles: DashboardTile[] = [
      { id: 'widget:cut-coach', label: 'Cut Coach', node: <CutCoachCard /> },
      { id: 'widget:clock', label: 'Clock', node: <ClockCard /> },
      ...(appsBySlug.get('receipts')
        ? [{ id: 'app:receipts', label: 'Receipts', node: <AppCard app={appsBySlug.get('receipts')!} /> }]
        : []),
      { id: 'widget:devices', label: 'Devices', node: <DevicesCard /> },
      ...(appsBySlug.get('termo-alert')
        ? [{ id: 'app:termo-alert', label: 'Termo Alert', node: <AppCard app={appsBySlug.get('termo-alert')!} /> }]
        : []),
      { id: 'widget:tricorder', label: 'Tricorder', node: <TricorderCard /> },
    ];

    const nextTiles = [...staticTiles, ...appTiles];
    const smartDefaults = [
      ...CUSTOM_TILE_ORDER.filter((id) => nextTiles.some((tile) => tile.id === id)),
      ...nextTiles.map((tile) => tile.id).filter((id) => !CUSTOM_TILE_ORDER.includes(id as (typeof CUSTOM_TILE_ORDER)[number])),
    ];

    return {
      all: nextTiles,
      defaultOrder: smartDefaults,
    };
  }, [apps]);

  useEffect(() => {
    if (!customOrderedIds || typeof window === 'undefined') return;
    window.localStorage.setItem(DASHBOARD_CARD_ORDER_KEY, JSON.stringify(customOrderedIds));
  }, [customOrderedIds]);

  const orderedIds = useMemo(
    () => mergeStoredOrder(tiles.defaultOrder, customOrderedIds),
    [customOrderedIds, tiles.defaultOrder]
  );

  const orderedTiles = useMemo(() => {
    const byId = new Map(tiles.all.map((tile) => [tile.id, tile]));
    return orderedIds.map((id) => byId.get(id)).filter((tile): tile is DashboardTile => Boolean(tile));
  }, [orderedIds, tiles]);

  function moveTile(id: string, delta: -1 | 1) {
    setCustomOrderedIds((current) => {
      const base = current ?? orderedIds;
      const index = base.indexOf(id);
      if (index === -1) return base;
      return moveIndex(base, index, delta);
    });
  }

  function resetOrder() {
    setCustomOrderedIds(tiles.defaultOrder);
  }

  return (
    <div className="space-y-4">
      <section className="surface-card surface-card--personal surface-card--subtle p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-[var(--text)]">Dashboard cards</div>
            <div className="mt-1 text-xs leading-5 text-[var(--muted)]">
              Turn on arrange mode, move cards earlier or later, then exit. Order is saved on this device.
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {arrangeMode ? (
              <>
                <button className="btn-base btn-ghost" onClick={resetOrder} type="button">
                  Reset
                </button>
                <button className="btn-base btn-primary" onClick={() => setArrangeMode(false)} type="button">
                  Done arranging
                </button>
              </>
            ) : (
              <button className="btn-base btn-secondary" onClick={() => setArrangeMode(true)} type="button">
                <GripHorizontal size={16} />
                Arrange cards
              </button>
            )}
          </div>
        </div>
      </section>

      {err ? (
        <section className="surface-card surface-card--danger p-5">
          <div className="text-sm font-semibold">Eroare DB</div>
          <div className="mt-1 text-sm text-[var(--muted)]">{err}</div>
        </section>
      ) : null}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {orderedTiles.map((tile, index) => (
          <div key={tile.id} className="relative">
            {arrangeMode ? (
              <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex items-start justify-between gap-2">
                <div className="rounded-full border border-[var(--border)] bg-[color:color-mix(in_srgb,var(--panel)_92%,transparent)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)] shadow-sm">
                  {tile.label}
                </div>
                <div className="pointer-events-auto flex gap-1">
                  <button
                    aria-label={`Move ${tile.label} earlier`}
                    className="btn-base btn-ghost !min-h-9 !px-3 disabled:opacity-40"
                    disabled={index === 0}
                    onClick={() => moveTile(tile.id, -1)}
                    type="button"
                  >
                    <ChevronUp size={16} />
                  </button>
                  <button
                    aria-label={`Move ${tile.label} later`}
                    className="btn-base btn-ghost !min-h-9 !px-3 disabled:opacity-40"
                    disabled={index === orderedTiles.length - 1}
                    onClick={() => moveTile(tile.id, 1)}
                    type="button"
                  >
                    <ChevronDown size={16} />
                  </button>
                </div>
              </div>
            ) : null}
            <div className={arrangeMode ? 'pt-10' : ''}>{tile.node}</div>
          </div>
        ))}
      </section>
    </div>
  );
}
