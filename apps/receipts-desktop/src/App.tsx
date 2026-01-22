import { useCallback, useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';

type StoreConfig = {
  id: string;
  name: string;
  enabled: boolean;
};

type AppConfig = {
  receipts_root: string;
  worker_dir: string | null;
  worker_run_cmd: string | null;
  stores: StoreConfig[];
  config_ready: boolean;
};

type InboxCount = {
  store_id: string;
  count: number;
};

type RunSummary = {
  run_id: string;
  stores: string[];
  started_at?: string;
  finished_at?: string;
  duration_ms?: number;
  result?: string;
  counts?: {
    files_seen?: number;
    processed_ok?: number;
    processed_warn?: number;
    processed_fail?: number;
  };
  artifacts?: {
    log_file?: string;
  };
  failures?: Array<{ store?: string; file?: string; error_json?: string }>;
  warnings?: Array<{ store?: string; file?: string; warning_codes?: string[] }>;
};

type UnreadBadge = {
  store_id: string;
  warnings_unread: boolean;
  failures_unread: boolean;
  last_warning_run_id?: string | null;
  last_failure_run_id?: string | null;
};

type RunWorkerResult = {
  status: string;
  exit_code: number | null;
  stdout: string;
  stderr: string;
};

type WorkerLogEvent = {
  stream: 'stdout' | 'stderr';
  line: string;
  stores: string[];
};

type UpdateStatus = {
  status: 'up_to_date' | 'update_available' | 'source_missing' | 'error';
  installed_version: string;
  source_version?: string | null;
  source_path?: string | null;
  message?: string | null;
};

const AUTO_INTERVAL_MS = 3 * 60 * 1000;
const MAX_RUNS = 5;
const DEFAULT_RECEIPTS_ROOT = '/Users/xan/Dropbox/bonuri';
const DEFAULT_WORKER_DIR =
  '/Users/xan/Documents/Github repos/life-dashboard/apps/receipts-worker';
const DEFAULT_WORKER_CMD =
  '/Users/xan/Documents/Github repos/life-dashboard/apps/receipts-worker/run.sh';

function fmtDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ro-RO');
}

function fmtDuration(ms?: number) {
  if (!ms && ms !== 0) return '—';
  if (ms < 1000) return `${ms}ms`;
  const secs = Math.round(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const rem = secs % 60;
  return `${mins}m ${rem}s`;
}

function buildStoreRunMap(runs: RunSummary[]) {
  const map = new Map<string, RunSummary>();
  for (const run of runs) {
    for (const store of run.stores || []) {
      if (!map.has(store)) {
        map.set(store, run);
      }
    }
  }
  return map;
}

function readAutoPrefs() {
  try {
    const raw = localStorage.getItem('receipts:autoStores');
    if (!raw) return {} as Record<string, boolean>;
    return JSON.parse(raw) as Record<string, boolean>;
  } catch {
    return {} as Record<string, boolean>;
  }
}

function writeAutoPrefs(next: Record<string, boolean>) {
  localStorage.setItem('receipts:autoStores', JSON.stringify(next));
}

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [inboxCounts, setInboxCounts] = useState<Record<string, number>>({});
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [badges, setBadges] = useState<Record<string, UnreadBadge>>({});
  const [selectedStores, setSelectedStores] = useState<Record<string, boolean>>({});
  const [autoStores, setAutoStores] = useState<Record<string, boolean>>(() => readAutoPrefs());
  const [busyStores, setBusyStores] = useState<Record<string, boolean>>({});
  const [lastRunOutput, setLastRunOutput] = useState<RunWorkerResult | null>(null);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [receiptsRootInput, setReceiptsRootInput] = useState('');
  const [workerDirInput, setWorkerDirInput] = useState('');
  const [workerCmdInput, setWorkerCmdInput] = useState('');

  const enabledStores = useMemo(() => {
    return (config?.stores ?? []).filter((store) => store.enabled);
  }, [config]);

  const storeRunMap = useMemo(() => buildStoreRunMap(runs), [runs]);

  const refreshUpdateStatus = useCallback(async () => {
    try {
      const update = await invoke<UpdateStatus>('get_update_status');
      setUpdateStatus(update);
    } catch (err) {
      setUpdateStatus({
        status: 'error',
        installed_version: 'unknown',
        message: err instanceof Error ? err.message : 'Failed to read update status.'
      });
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setError(null);
    setNotice(null);
    await refreshUpdateStatus();

    const errors: string[] = [];

    try {
      const counts = await invoke<InboxCount[]>('get_inbox_counts');
      const countsMap: Record<string, number> = {};
      counts.forEach((entry) => {
        countsMap[entry.store_id] = entry.count;
      });
      setInboxCounts(countsMap);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : 'Failed to read inbox counts.');
    }

    try {
      const summaries = await invoke<RunSummary[]>('get_last_runs', { limit: MAX_RUNS });
      setRuns(summaries);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : 'Failed to read run summaries.');
    }

    try {
      const unread = await invoke<UnreadBadge[]>('get_unread_badges');
      const badgeMap: Record<string, UnreadBadge> = {};
      unread.forEach((entry) => {
        badgeMap[entry.store_id] = entry;
      });
      setBadges(badgeMap);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : 'Failed to read badges.');
    }

    if (errors.length) {
      setError(errors.join(' | '));
    }
  }, [refreshUpdateStatus]);

  useEffect(() => {
    (async () => {
      try {
        const nextConfig = await invoke<AppConfig>('get_config');
        setConfig(nextConfig);
        const nextSelected: Record<string, boolean> = {};
        nextConfig.stores.forEach((store) => {
          nextSelected[store.id] = store.enabled;
        });
        setSelectedStores(nextSelected);
        setReceiptsRootInput(nextConfig.receipts_root || DEFAULT_RECEIPTS_ROOT);
        setWorkerDirInput(nextConfig.worker_dir || DEFAULT_WORKER_DIR);
        setWorkerCmdInput(nextConfig.worker_run_cmd || DEFAULT_WORKER_CMD);
        if (!nextConfig.config_ready) {
          setSettingsOpen(true);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load config.');
      }
    })();
  }, []);

  useEffect(() => {
    if (!config) return;
    refreshAll();
  }, [config, refreshAll]);

  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === 'visible') {
        refreshUpdateStatus();
      }
    }
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [refreshUpdateStatus]);

  useEffect(() => {
    writeAutoPrefs(autoStores);
  }, [autoStores]);

  useEffect(() => {
    if (!config) return;
    const interval = window.setInterval(() => {
      const targets = Object.entries(autoStores)
        .filter(([, enabled]) => enabled)
        .map(([storeId]) => storeId);
      if (!targets.length) return;
      targets.forEach((storeId) => {
        if (busyStores[storeId]) return;
        runWorker([storeId], 'auto');
      });
    }, AUTO_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [autoStores, busyStores, config]);

  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | null = null;

    listen<WorkerLogEvent>('worker-log', (event) => {
      const payload = event.payload;
      const prefix = payload.stream === 'stderr' ? '[err] ' : '';
      const storesLabel = payload.stores.length ? `(${payload.stores.join(', ')}) ` : '';
      setLogLines((prev) => {
        const next = [...prev, `${prefix}${storesLabel}${payload.line}`];
        if (next.length > 500) {
          next.splice(0, next.length - 500);
        }
        return next;
      });
    }).then((stop) => {
      if (!active) {
        stop();
        return;
      }
      unlisten = stop;
    });

    return () => {
      active = false;
      if (unlisten) unlisten();
    };
  }, []);

  async function runWorker(stores: string[], mode: 'once' | 'auto') {
    setError(null);
    setNotice(null);
    setLogLines([]);
    setLastRunOutput(null);
    if (!config?.config_ready) {
      setNotice('Missing config. Open Settings and save paths first.');
      setSettingsOpen(true);
      return;
    }
    const working = { ...busyStores };
    stores.forEach((store) => {
      working[store] = true;
    });
    setBusyStores(working);

    try {
      const result = await invoke<RunWorkerResult>('run_worker', { stores, mode });
      setLastRunOutput(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run worker.');
    } finally {
      const cleared = { ...working };
      stores.forEach((store) => {
        cleared[store] = false;
      });
      setBusyStores(cleared);
      refreshAll();
    }
  }

  async function openPath(pathType: string, storeId?: string, filePath?: string) {
    setError(null);
    try {
      await invoke('open_path', { pathType, storeId, filePath });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function markSeen(storeId: string) {
    setError(null);
    setNotice(null);
    try {
      await invoke('mark_store_badges_seen', { storeId });
      refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark seen.');
    }
  }

  async function runUpdate() {
    setError(null);
    setNotice(null);
    setUpdateBusy(true);
    try {
      const result = await invoke<RunWorkerResult>('run_update');
      setLastRunOutput(result);
      if (result.status === 'ok') {
        setNotice('Update completed. If the app did not relaunch, close and open it from the Dock.');
      }
      refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUpdateBusy(false);
    }
  }

  async function saveConfig() {
    setError(null);
    setNotice(null);
    try {
      await invoke('set_config', {
        receiptsRoot: receiptsRootInput.trim() || DEFAULT_RECEIPTS_ROOT,
        workerDir: workerDirInput.trim() || DEFAULT_WORKER_DIR,
        workerRunCmd: workerCmdInput.trim() || DEFAULT_WORKER_CMD
      });
      const nextConfig = await invoke<AppConfig>('get_config');
      setConfig(nextConfig);
      setSettingsOpen(false);
      setNotice('Settings saved.');
      refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function closeSettings() {
    if (!config?.config_ready) {
      setNotice('Please save settings before closing.');
      setSettingsOpen(true);
      return;
    }
    setSettingsOpen(false);
  }

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>Receipts Operator</h1>
          <p className="muted">
            Local pipeline console{' '}
            {updateStatus && (
              <span
                className={`update-pill ${updateStatus.status}`}
                title={
                  updateStatus.status === 'source_missing'
                    ? updateStatus.message ?? 'Source code not found'
                    : updateStatus.status === 'update_available'
                      ? `Installed ${updateStatus.installed_version} / Source ${updateStatus.source_version ?? '?'}`
                      : updateStatus.status === 'up_to_date'
                        ? `Installed ${updateStatus.installed_version}`
                        : updateStatus.message ?? 'Update status error'
                }
              >
                {updateStatus.status === 'up_to_date' && 'Up to date'}
                {updateStatus.status === 'update_available' && 'Update available'}
                {updateStatus.status === 'source_missing' && 'Source missing'}
                {updateStatus.status === 'error' && 'Update error'}
              </span>
            )}
          </p>
        </div>
        <div className="topbar-actions">
          <button className="ghost" onClick={() => setSettingsOpen((prev) => !prev)}>
            {settingsOpen ? 'Close settings' : 'Settings'}
          </button>
          <button
            className="ghost"
            disabled={updateBusy || updateStatus?.status !== 'update_available'}
            onClick={() => runUpdate()}
            title={
              updateStatus?.status === 'source_missing'
                ? updateStatus.message ?? 'Source code not found'
                : updateStatus?.status === 'up_to_date'
                  ? 'Already up to date'
                  : updateStatus?.status === 'update_available'
                    ? `Install ${updateStatus.source_version}`
                    : 'Update not available'
            }
          >
            {updateBusy ? 'Updating...' : 'Update'}
          </button>
          <button
            className="primary"
            disabled={!config?.config_ready}
            onClick={() =>
              runWorker(
                Object.entries(selectedStores)
                  .filter(([, selected]) => selected)
                  .map(([storeId]) => storeId),
                'once'
              )
            }
            title={!config?.config_ready ? 'Set paths in Settings first' : undefined}
          >
            Process selected
          </button>
          <button onClick={() => refreshAll()}>Refresh</button>
          <button onClick={() => openPath('logs')}>Open logs folder</button>
          <span className="version-text">Version {updateStatus?.installed_version ?? '1.0.1'}</span>
        </div>
      </header>

      {error && <div className="alert error">{error}</div>}
      {notice && <div className="alert success">{notice}</div>}

      {!config?.config_ready || settingsOpen ? (
        <section className="panel settings">
          <div className="section-title">
            <h3>Setup</h3>
            <p>Set paths to run the worker.</p>
          </div>
          <div className="text-[11px] text-[var(--muted)]">
            Required: Receipts root + Worker dir or Worker run cmd.
          </div>
          <div className="settings-grid">
            <label className="field">
              <span>Receipts root</span>
              <input
                value={receiptsRootInput}
                onChange={(e) => setReceiptsRootInput(e.target.value)}
                placeholder="/Users/xan/Dropbox/bonuri"
              />
            </label>
            <label className="field">
              <span>Worker dir</span>
              <input
                value={workerDirInput}
                onChange={(e) => setWorkerDirInput(e.target.value)}
                placeholder="/Users/xan/Documents/Github repos/life-dashboard/apps/receipts-worker"
              />
            </label>
            <label className="field">
              <span>Worker run cmd</span>
              <input
                value={workerCmdInput}
                onChange={(e) => setWorkerCmdInput(e.target.value)}
                placeholder="/Users/xan/Documents/Github repos/life-dashboard/apps/receipts-worker/run.sh"
              />
            </label>
          </div>
          <div className="settings-actions">
            <button className="primary" onClick={saveConfig}>
              Save settings
            </button>
            <button
              className="ghost"
              onClick={() => {
                setReceiptsRootInput(DEFAULT_RECEIPTS_ROOT);
                setWorkerDirInput(DEFAULT_WORKER_DIR);
                setWorkerCmdInput(DEFAULT_WORKER_CMD);
                saveConfig();
              }}
            >
              Use defaults
            </button>
            <button onClick={closeSettings}>Close</button>
          </div>
        </section>
      ) : null}

      <section className="content-grid">
        <div className="stack">
          <section className="panel">
            <div className="section-title">
              <h3>Stores</h3>
              <p>{enabledStores.length} active</p>
            </div>
            <div className="grid">
              {(config?.stores ?? []).map((store) => {
                const unread = badges[store.id];
                const lastRun = storeRunMap.get(store.id);
                const inboxCount = inboxCounts[store.id] ?? 0;
                const isBusy = busyStores[store.id];

                return (
                  <div className={`store-card ${store.enabled ? '' : 'disabled'}`} key={store.id}>
                    <div className="store-header">
                      <div>
                        <h2>{store.name}</h2>
                        <p className="muted">{store.id}</p>
                      </div>
                      <div className="badges">
                        <span className={`badge ${inboxCount ? 'info' : ''}`}>
                          Inbox {inboxCount}
                        </span>
                        <span className={`badge ${unread?.warnings_unread ? 'warn' : ''}`}>
                          Warn {unread?.warnings_unread ? 'new' : 'seen'}
                        </span>
                        <span className={`badge ${unread?.failures_unread ? 'fail' : ''}`}>
                          Fail {unread?.failures_unread ? 'new' : 'seen'}
                        </span>
                      </div>
                    </div>

                    <div className="store-meta">
                      <div>
                        <span className="label">Last result</span>
                        <strong>{lastRun?.result ?? '—'}</strong>
                      </div>
                      <div>
                        <span className="label">Finished</span>
                        <strong>{fmtDate(lastRun?.finished_at ?? lastRun?.started_at)}</strong>
                      </div>
                      <div>
                        <span className="label">Duration</span>
                        <strong>{fmtDuration(lastRun?.duration_ms)}</strong>
                      </div>
                    </div>

                    <div className="store-actions">
                      <label className="checkbox">
                        <input
                          type="checkbox"
                          checked={Boolean(selectedStores[store.id])}
                          onChange={(event) =>
                            setSelectedStores({
                              ...selectedStores,
                              [store.id]: event.target.checked
                            })
                          }
                        />
                        Select
                      </label>

                      <label className="toggle">
                        <input
                          type="checkbox"
                          checked={Boolean(autoStores[store.id])}
                          onChange={(event) =>
                            setAutoStores({ ...autoStores, [store.id]: event.target.checked })
                          }
                        />
                        <span>Auto</span>
                      </label>

                      <button
                        className="primary"
                        disabled={!store.enabled || isBusy}
                        onClick={() => runWorker([store.id], 'once')}
                      >
                        {isBusy ? 'Running...' : 'Process'}
                      </button>
                    </div>

                    <div className="store-links">
                      <button onClick={() => openPath('inbox', store.id)}>Open inbox</button>
                      <button onClick={() => openPath('processed', store.id)}>Open processed</button>
                      <button onClick={() => openPath('failed', store.id)}>Open failed</button>
                      <button onClick={() => markSeen(store.id)}>Mark warnings seen</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="panel runs">
            <div className="section-title">
              <h3>Recent activity</h3>
              <p>{runs.length} runs</p>
            </div>
            <div className="runs-grid">
              {runs.map((run) => (
                <div className="run-card" key={run.run_id}>
                  <div>
                    <h4>{run.result ?? 'unknown'}</h4>
                    <p className="muted">{run.stores?.join(', ') || '—'}</p>
                  </div>
                  <div className="run-meta">
                    <span>{fmtDate(run.finished_at ?? run.started_at)}</span>
                    <span>{fmtDuration(run.duration_ms)}</span>
                  </div>
                  <div className="run-counts">
                    <div>
                      <span className="label">Seen</span>
                      <strong>{run.counts?.files_seen ?? 0}</strong>
                    </div>
                    <div>
                      <span className="label">OK</span>
                      <strong>{run.counts?.processed_ok ?? 0}</strong>
                    </div>
                    <div>
                      <span className="label">Warn</span>
                      <strong>{run.counts?.processed_warn ?? 0}</strong>
                    </div>
                    <div>
                      <span className="label">Fail</span>
                      <strong>{run.counts?.processed_fail ?? 0}</strong>
                    </div>
                  </div>
                  <div className="run-actions">
                    <button
                      onClick={() =>
                        run.artifacts?.log_file
                          ? openPath('logFile', undefined, run.artifacts.log_file)
                          : openPath('logs')
                      }
                    >
                      Open log
                    </button>
                    {run.failures?.[0]?.error_json && (
                      <button onClick={() => openPath('errorFile', undefined, run.failures?.[0]?.error_json)}>
                        Open error
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="stack">
          <section className="panel console">
            <div className="section-title">
              <h3>Live logs</h3>
              <p>{logLines.length ? `${logLines.length} lines` : 'Waiting for run...'}</p>
            </div>
            <pre>{logLines.length ? logLines.join('\n') : 'No logs yet. Run a store to stream output.'}</pre>
          </section>

          <section className="panel console secondary">
            <div className="section-title">
              <h3>Last run output</h3>
              <p>{lastRunOutput?.status ?? 'idle'}</p>
            </div>
            <pre>
              {lastRunOutput
                ? lastRunOutput.stdout || lastRunOutput.stderr || 'No output.'
                : 'No completed runs yet.'}
            </pre>
          </section>
        </div>
      </section>
    </div>
  );
}
