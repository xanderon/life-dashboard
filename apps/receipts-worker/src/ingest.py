import datetime as dt
from pathlib import Path
from typing import Any, Dict

from tenacity import RetryError, retry, stop_after_attempt, wait_exponential

from .core import DbResult, FileResult, Settings, sha256_file
from .storage import move_file, write_json


def _build_items_payload(items: list, owner_id: str, receipt_id: str) -> list:
    normalized = []
    for item in items:
        if not isinstance(item, dict):
            continue
        meta = {}
        for key, value in item.items():
            if key in {
                "name",
                "quantity",
                "unit",
                "unit_price",
                "paid_amount",
                "discount",
                "needs_review",
                "is_food",
                "food_quality",
            }:
                continue
            meta[key] = value
        normalized.append(
            {
                "owner_id": owner_id,
                "receipt_id": receipt_id,
                "name": item.get("name"),
                "quantity": item.get("quantity"),
                "unit": item.get("unit"),
                "unit_price": item.get("unit_price"),
                "paid_amount": item.get("paid_amount"),
                "discount": item.get("discount") or 0.0,
                "needs_review": bool(item.get("needs_review")),
                "is_food": True if item.get("is_food") is None else bool(item.get("is_food")),
                "food_quality": None if item.get("is_food") is False else item.get("food_quality"),
                "meta": meta,
            }
        )
    return normalized


def _apply_food_hints(items: list, hints: dict) -> list:
    if not hints:
        return items
    enriched = []
    for item in items:
        if not isinstance(item, dict):
            enriched.append(item)
            continue
        name = item.get("name")
        if not isinstance(name, str):
            enriched.append(item)
            continue
        key = name.strip().lower()
        hint = hints.get(key)
        if not hint:
            enriched.append(item)
            continue

        updated = dict(item)
        if updated.get("is_food") is None and hint.get("is_food") is not None:
            updated["is_food"] = hint.get("is_food")

        if updated.get("is_food") is False:
            updated["food_quality"] = None
        elif updated.get("food_quality") is None and hint.get("food_quality") is not None:
            updated["food_quality"] = hint.get("food_quality")

        enriched.append(updated)
    return enriched


def _build_failure_payload(store: str, img_path: Path, error_code: str, message: str) -> Dict[str, Any]:
    return {
        "schema_version": 3,
        "store": store,
        "timestamp": None,
        "currency": "RON",
        "total": 0.0,
        "discount_total": 0.0,
        "sgr_bottle_charge": 0.0,
        "sgr_recovered_amount": 0.0,
        "items": [],
        "merchant": {},
        "processing": {
            "status": "fail",
            "warnings": [],
            "error": {"code": error_code, "message": message},
        },
        "source": {
            "file_name": img_path.name,
            "store_folder": store,
            "rel_path": str(Path("inbox") / store / img_path.name),
        },
    }


def _now_iso() -> str:
    return dt.datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=10))
def _parse_with_retry(parser, img_path: Path, store: str, rel_base: str) -> Dict[str, Any]:
    return parser.parse(img_path, store=store, rel_base=rel_base)


def process_image(
    img_path: Path,
    store: str,
    config: Settings,
    parser,
    db_client,
    dry_run: bool,
    no_db: bool,
    move_files: bool,
    write_json_files: bool,
) -> FileResult:
    source_hash = sha256_file(img_path)

    try:
        parsed = _parse_with_retry(parser, img_path, store=store, rel_base="inbox")
    except RetryError as exc:
        last_exc = exc.last_attempt.exception()
        parsed = _build_failure_payload(
            store,
            img_path,
            "PARSER_EXCEPTION",
            str(last_exc) if last_exc else str(exc),
        )
    except Exception as exc:
        parsed = _build_failure_payload(store, img_path, "PARSER_EXCEPTION", str(exc))

    processing = parsed.get("processing", {})
    processing_status = processing.get("status", "fail")

    db_result = DbResult(ok=True, skipped=True)
    if not dry_run and not no_db:
        if not (config.supabase_url and config.supabase_key and config.owner_id):
            db_result = DbResult(ok=False, skipped=False, error="Missing Supabase config")
        elif db_client is None:
            db_result = DbResult(ok=False, skipped=False, error="Supabase client unavailable")
        else:
            if processing_status == "fail":
                db_result = DbResult(ok=False, skipped=False, error="Processing status fail")
            else:
                merchant = parsed.get("merchant") or {}
                source = parsed.get("source") or {}
                receipt_date = parsed.get("timestamp")
                if not receipt_date:
                    db_result = DbResult(ok=False, skipped=False, error="Missing receipt timestamp")
                else:
                    receipt_payload = {
                        "owner_id": config.owner_id,
                        "store": store,
                        "receipt_date": receipt_date,
                        "currency": parsed.get("currency") or "RON",
                        "total_amount": parsed.get("total") or 0.0,
                        "discount_total": parsed.get("discount_total") or 0.0,
                        "sgr_bottle_charge": parsed.get("sgr_bottle_charge") or 0.0,
                        "sgr_recovered_amount": parsed.get("sgr_recovered_amount") or 0.0,
                        "merchant_name": merchant.get("name"),
                        "merchant_city": merchant.get("city"),
                        "merchant_cif": merchant.get("cif"),
                        "processing_status": "warn" if processing_status == "warn" else "ok",
                        "processing_warnings": processing.get("warnings") or [],
                        "source_file_name": source.get("file_name") or img_path.name,
                        "source_rel_path": source.get("rel_path") or str(Path("inbox") / store / img_path.name),
                        "source_hash": source_hash,
                        "schema_version": parsed.get("schema_version") or 3,
                    }
                    db_result = db_client.upsert_receipt(receipt_payload, config.owner_id, store, source_hash)
                    if db_result.ok and not db_result.skipped and db_result.receipt_id:
                        items_input = parsed.get("items") or []
                        names = [
                            item.get("name")
                            for item in items_input
                            if isinstance(item, dict) and item.get("name")
                        ]
                        hints = db_client.fetch_item_food_hints(config.owner_id, names)
                        items_payload = _build_items_payload(
                            _apply_food_hints(items_input, hints),
                            config.owner_id,
                            db_result.receipt_id,
                        )
                        items_result = db_client.insert_items(items_payload)
                        if not items_result.ok:
                            db_result = DbResult(ok=False, skipped=False, error=items_result.error, receipt_id=db_result.receipt_id)

    if processing_status == "fail" or not db_result.ok:
        outcome = "failed"
    else:
        outcome = "processed"

    message = ""
    if dry_run:
        message = "dry-run"
    elif no_db:
        message = "db skipped"
    elif db_result.skipped:
        message = "dedup"
    elif db_result.ok:
        message = "db ok"
    else:
        message = "db error"

    details = []
    if processing_status == "fail":
        err_msg = processing.get("error", {}).get("message")
        if err_msg:
            details.append(f"error={err_msg}")
    elif processing_status == "warn":
        warnings = processing.get("warnings") or []
        if warnings:
            details.append(f"warnings={len(warnings)}")

    if details:
        message = f"{message} | " + " ".join(details)

    if not dry_run:
        if move_files:
            dst_dir = config.receipts_root / ("failed" if outcome == "failed" else "processed") / store
            moved_path = move_file(img_path, dst_dir)
        else:
            moved_path = img_path

        if write_json_files:
            if outcome == "failed":
                error_payload = {
                    "runner_error": {
                        "code": "DB_ERROR" if not db_result.ok else "PARSER_FAIL",
                        "message": db_result.error or processing.get("error", {}).get("message"),
                        "at": _now_iso(),
                    },
                    "data": parsed,
                }
                write_json(moved_path.with_suffix(moved_path.suffix + ".error.json"), error_payload)
            else:
                write_json(moved_path.with_suffix(moved_path.suffix + ".json"), parsed)

    items_count = len(parsed.get("items", []) or [])
    total_value = parsed.get("total")
    discount_total = parsed.get("discount_total")

    return FileResult(
        file_name=img_path.name,
        status=processing_status,
        outcome=outcome,
        db_result=db_result,
        message=message,
        items_count=items_count,
        total=total_value,
        discount_total=discount_total,
    )
