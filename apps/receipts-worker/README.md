# Receipts Worker

Runner for receipt OCR parsers (LIDL now, others later). It watches a Dropbox-style inbox, parses receipts, optionally upserts to Supabase, and moves files into processed/failed with JSON audit artifacts.

## Layout

```
apps/receipts-worker/
  README.md
  requirements.txt
  .env.example
  run.sh
  src/
    runner.py
    registry.py
    core.py
    storage.py
    ingest.py
    parsers/
      lidl/
        __init__.py
        adapter.py
```

## Quick start

```bash
cd apps/receipts-worker
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python -m src.runner --store lidl --dry-run
```

## Required folder layout (Dropbox)

`RECEIPTS_ROOT` points to your Dropbox receipts folder. Example:

```
/Users/xan/Dropbox/bonuri
  inbox/
    lidl/
    kaufland/
    carrefour/
    mega/
  processed/
    lidl/
    ...
  failed/
    lidl/
    ...
  _logs/
```

## Commands

- Single store:

```bash
python -m src.runner --store lidl
```

- All stores (registered):

```bash
python -m src.runner --all
```

- Dry run (parse + log only):

```bash
python -m src.runner --store lidl --dry-run
```

- Skip DB but still move files and write JSON:

```bash
python -m src.runner --store lidl --no-db
```

- DB + JSON without moving files:

```bash
python -m src.runner --store lidl --no-move
```

- Process in batches:

```bash
python -m src.runner --store lidl --batch-size 10
```

## Notes

- The LIDL parser lives at repo root: `lidl_receipt_ocr.py`. The adapter adds the repo root to `sys.path` and calls `parse_file()`.
- JSON files are written next to the moved image:
  - processed: `file.png.json`
  - failed: `file.png.error.json`
- App status updates target `apps.slug = "<store>-receipts"` by default.
- `RECEIPTS_ROOT` must exist on disk (config validation).
- Metrics are printed/logged as `[METRICS]` JSON per run.

## How it works (flow)

1) Reads images from `inbox/<store>/` under `RECEIPTS_ROOT`.
2) Computes `source_hash` from file bytes (dedup key).
3) Parses with the store adapter (LIDL uses `parse_file()` from `lidl_receipt_ocr.py`).
4) If DB enabled: inserts into `receipts` + `receipt_items` with unique `(owner_id, store, source_hash)`.
5) Moves file to:
   - `processed/<store>/` if parse ok/warn and DB ok (or DB skipped)
   - `failed/<store>/` if parse fail or DB error
6) Writes audit JSON next to the moved file (canonical on success, `.error.json` on failure).
7) Logs per-file status + run metrics to `_logs/receipts_worker/YYYY-MM-DD.log`.

## DB schema expectations

Runner writes to two tables:

- `receipts` (header + totals + processing + source)
- `receipt_items` (one row per product line)

Raw OCR text is not stored in DB. Any extra per-item fields are stored in `receipt_items.meta`.

Set table names with:

```
RECEIPTS_TABLE=receipts
RECEIPT_ITEMS_TABLE=receipt_items
```

### Schema (recommended)

Minimal columns used by the worker and the dashboard UI.

`receipts`:

```sql
create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  store text not null,
  receipt_date timestamptz not null,
  currency text not null default 'RON',
  total_amount numeric not null default 0,
  discount_total numeric not null default 0,
  sgr_bottle_charge numeric not null default 0,
  sgr_recovered_amount numeric not null default 0,
  merchant_name text,
  merchant_city text,
  merchant_cif text,
  processing_status text not null default 'ok',
  processing_warnings jsonb not null default '[]'::jsonb,
  source_file_name text,
  source_rel_path text,
  source_hash text not null,
  schema_version int not null default 3,
  created_at timestamptz not null default now()
);
create index if not exists receipts_owner_store_idx on public.receipts (owner_id, store);
create index if not exists receipts_owner_date_idx on public.receipts (owner_id, receipt_date desc);
create unique index if not exists receipts_owner_source_idx on public.receipts (owner_id, store, source_hash);
```

`receipt_items`:

```sql
create table if not exists public.receipt_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  receipt_id uuid not null references public.receipts(id) on delete cascade,
  name text,
  quantity numeric,
  unit text,
  unit_price numeric,
  paid_amount numeric,
  discount numeric not null default 0,
  needs_review boolean not null default false,
  is_food boolean not null default true,
  food_quality text check (food_quality in ('healthy', 'balanced', 'junk')),
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists receipt_items_owner_idx on public.receipt_items (owner_id);
create index if not exists receipt_items_receipt_idx on public.receipt_items (receipt_id);
```

RLS policy (simplu, per user):

```sql
alter table public.receipts enable row level security;
alter table public.receipt_items enable row level security;

create policy "receipts_rw" on public.receipts
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "receipt_items_rw" on public.receipt_items
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
```

### Dashboard viewer

UI-ul din `apps/dashboard/app/receipts/page.tsx` face:

- listă bonuri cu filter by `store`
- editor pentru câmpurile din `receipts`
- editor pentru `receipt_items`

Pentru cardul din dashboard, creează un app în tabela `apps`:

```
slug = "receipts"
name = "🧾 Receipts"
home_url = "/receipts"
```
