import argparse
import datetime as dt
import json
import os
from pathlib import Path

try:
    from dotenv import load_dotenv
except Exception:
    load_dotenv = None

from pydantic import ValidationError

from .core import Settings
from .storage import ensure_dir, list_images, SupabaseClient
from .ingest import process_image
from .registry import get_parser, list_stores


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Receipts worker")
    parser.add_argument("--store", help="Store key (e.g. lidl)")
    parser.add_argument("--all", action="store_true", help="Process all registered stores")
    parser.add_argument("--dry-run", action="store_true", help="Parse + log only")
    parser.add_argument("--no-db", action="store_true", help="Skip DB upsert")
    parser.add_argument("--no-move", action="store_true", help="Do not move files")
    parser.add_argument("--no-json", action="store_true", help="Do not write JSON artifacts")
    parser.add_argument("--root", help="Override receipts root path")
    parser.add_argument("--batch-size", type=int, default=10, help="Files per batch")
    return parser.parse_args()


def _log_line(logs_root: Path, message: str) -> None:
    print(message)
    ensure_dir(logs_root)
    log_file = logs_root / f"{dt.date.today().isoformat()}.log"
    with log_file.open("a", encoding="utf-8") as f:
        f.write(message + "\n")


def _app_slug(store: str) -> str:
    return f"{store}-receipts"


def _status_summary(results) -> str:
    total = len(results)
    ok = len([r for r in results if r.status == "ok"])
    warn = len([r for r in results if r.status == "warn"])
    fail = len([r for r in results if r.status == "fail"])
    return f"total={total} ok={ok} warn={warn} fail={fail}"


def process_store(store: str, args: argparse.Namespace) -> int:
    if args.root:
        os.environ["RECEIPTS_ROOT"] = args.root
    try:
        settings = Settings()
    except ValidationError as exc:
        raise SystemExit(str(exc)) from exc

    inbox_dir = settings.receipts_root / "inbox" / store
    processed_dir = settings.receipts_root / "processed" / store
    failed_dir = settings.receipts_root / "failed" / store

    ensure_dir(inbox_dir)
    ensure_dir(processed_dir)
    ensure_dir(failed_dir)

    images = list_images(inbox_dir)
    if not images:
        _log_line(settings.logs_root, f"[INFO] {store} | no images")
        return 0

    parser = get_parser(store)

    db_client = None
    if not args.dry_run and not args.no_db:
        if settings.supabase_url and settings.supabase_key:
            db_client = SupabaseClient(
                settings.supabase_url,
                settings.supabase_key,
                settings.receipts_table,
                settings.receipt_items_table,
                settings.apps_table,
            )

    results = []
    db_errors = []
    metrics = {
        "success": 0,
        "warn": 0,
        "failed": 0,
        "duplicates": 0,
        "total_items": 0,
        "total_value": 0.0,
        "total_discount": 0.0,
    }

    for i in range(0, len(images), max(1, args.batch_size)):
        batch = images[i : i + max(1, args.batch_size)]
        for img in batch:
            result = process_image(
                img,
                store,
                settings,
                parser,
                db_client,
                dry_run=args.dry_run,
                no_db=args.no_db,
                move_files=not args.no_move,
                write_json_files=not args.no_json,
            )
            results.append(result)
            if not result.db_result.ok:
                db_errors.append(result.db_result.error or "unknown db error")

            if result.outcome == "processed":
                if result.status == "warn":
                    metrics["warn"] += 1
                else:
                    metrics["success"] += 1
            else:
                metrics["failed"] += 1

            if result.db_result.skipped and not (args.dry_run or args.no_db):
                metrics["duplicates"] += 1

            metrics["total_items"] += result.items_count
            if result.total:
                metrics["total_value"] += float(result.total)
            if result.discount_total:
                metrics["total_discount"] += float(result.discount_total)

            _log_line(
                settings.logs_root,
                f"[FILE] {store} | {result.file_name} | parse={result.status} | {result.message}",
            )

    run_status = "ok"
    if db_errors:
        run_status = "fail"
    elif any(r.status in {"warn", "fail"} for r in results):
        run_status = "warn"

    _log_line(settings.logs_root, f"[DONE] {store} | {run_status} | {_status_summary(results)}")
    _log_line(settings.logs_root, f"[METRICS] {store} | {json.dumps(metrics, sort_keys=True)}")

    if db_client and not args.dry_run and not args.no_db:
        last_error = db_errors[0] if db_errors else None
        db_client.update_app_status(_app_slug(store), run_status, last_error)

    return 1 if run_status == "fail" else 0


def main() -> int:
    if load_dotenv:
        load_dotenv()

    args = _parse_args()
    if not args.store and not args.all:
        raise SystemExit("Use --store <name> or --all")

    stores = list_stores() if args.all else [args.store]
    exit_code = 0
    for store in stores:
        exit_code = max(exit_code, process_store(store, args))
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
