# Receipts Desktop (Tauri)

Local macOS operator app for the receipts pipeline.

## Quick start

```bash
cd apps/receipts-desktop
npm install
npm run tauri dev
```

## Install / update / uninstall (local)

Scripts live in `apps/receipts-desktop/scripts/`:

```bash
./apps/receipts-desktop/scripts/install.receipts.operator
./apps/receipts-desktop/scripts/update.receipts.operator
./apps/receipts-desktop/scripts/uninstall.receipts.operator
```

Update checks the version in `src-tauri/tauri.conf.json` against the installed
app and only rebuilds if the version changed.

## Required env

Set these env vars before running the app:

- `RECEIPTS_ROOT=/Users/xan/Dropbox/bonuri`
- `WORKER_DIR=/Users/xan/Documents/Github repos/life-dashboard/apps/receipts-worker`
- `WORKER_RUN_CMD=/Users/xan/Documents/Github repos/life-dashboard/apps/receipts-worker/run.sh`

Optional:

- `RECEIPTS_STORES_PATH=/absolute/path/to/stores.json`
- `RECEIPTS_APP_SOURCE=/Users/xan/Documents/Github repos/life-dashboard/apps/receipts-desktop`

## Stores registry

Edit `config/stores.json` to enable or add stores. The app builds paths from
`RECEIPTS_ROOT` + `inbox/<store>` / `processed/<store>` / `failed/<store>`.

## What the app does

- Reads inbox counts per store.
- Shows last run summaries from `RECEIPTS_ROOT/_logs/runs/*.summary.json`.
- Tracks unread warnings/failures in `~/.life-dashboard/receipts-desktop/state.json`.
- Starts the worker via `WORKER_RUN_CMD` (or `python -m src.runner` fallback).

## Architecture (high level)

- UI: React/Vite frontend in `apps/receipts-desktop/src`.
- Backend: Tauri Rust commands in `apps/receipts-desktop/src-tauri/src/main.rs`.
- Worker: Python runner in `apps/receipts-worker` (source of truth for parsing + DB writes).

### Data flow

1) UI requests counts/status via Tauri commands.
2) Rust reads local folders in `RECEIPTS_ROOT` and local state.
3) When you click Process, Rust spawns the worker script.
4) Worker reads Dropbox inbox, OCRs, writes to DB, moves files, emits logs.
5) UI streams logs live from the worker process.

## Dependencies

Required:

- Node.js + npm (for Vite build).
- Rust + Cargo (for Tauri build).
- Python 3 (worker runtime).

Worker dependencies are installed in `apps/receipts-worker/.venv` via `run.sh`.

## Permissions / filesystem

- App reads from `RECEIPTS_ROOT` (Dropbox).
- App writes local state to `~/.life-dashboard/receipts-desktop/state.json`.
- macOS may ask for folder access on first run.

## Update mechanism (local)

Update is local-only and uses the repo on disk:

- App compares installed version with `src-tauri/tauri.conf.json`.
- If different, Update runs `scripts/update.receipts.operator`.
- That script builds, installs to `/Applications`, and relaunches.

If the repo is missing, Update shows "Source missing". Set:

```
RECEIPTS_APP_SOURCE=/path/to/life-dashboard/apps/receipts-desktop
```

## Versioning

Version is read from `apps/receipts-desktop/src-tauri/tauri.conf.json`.
Increment it when you want the app to detect a new update.

## Notes

- `WORKER_RUN_CMD` should point to a script and accept `--store` or `--stores` flags.
- The Tauri allowlist is permissive (`fs.all=true`) for now to read Dropbox and state files.
- For packaging, consider tightening scopes and using an app-owned config file.

## Troubleshooting

- Update fails with missing `npm` or `cargo`:
  - Set `RECEIPTS_NODE_BIN` or `RECEIPTS_CARGO_BIN` and relaunch the app.
  - Example:
    - `launchctl setenv RECEIPTS_NODE_BIN "/Users/xan/.nvm/versions/node/<ver>/bin/node"`
    - `launchctl setenv RECEIPTS_CARGO_BIN "/Users/xan/.cargo/bin/cargo"`
- "Source missing" in UI:
  - Set `RECEIPTS_APP_SOURCE` to the repo path.
