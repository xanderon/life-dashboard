import datetime as dt
import json
import shutil
from pathlib import Path
from typing import List, Optional

from .core import DbResult


IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".tif", ".tiff", ".heic"}


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def list_images(folder: Path) -> List[Path]:
    if not folder.exists():
        return []
    return sorted(
        p for p in folder.iterdir()
        if p.is_file() and p.suffix.lower() in IMAGE_EXTS
    )


def move_file(src: Path, dst_dir: Path) -> Path:
    ensure_dir(dst_dir)
    dst = dst_dir / src.name
    return Path(shutil.move(str(src), str(dst)))


def write_json(path: Path, payload: dict) -> None:
    ensure_dir(path.parent)
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=True, indent=2, sort_keys=True)
        f.write("\n")


def compact_relpath(path: Path, base: Path) -> str:
    try:
        return str(path.relative_to(base))
    except ValueError:
        return str(path)


class SupabaseClient:
    def __init__(self, url: str, key: str, receipts_table: str, receipt_items_table: str, apps_table: str):
        try:
            from supabase import create_client
        except Exception as exc:  # pragma: no cover - runtime dependency
            raise RuntimeError("Missing supabase dependency") from exc

        self.client = create_client(url, key)
        self.receipts_table = receipts_table
        self.receipt_items_table = receipt_items_table
        self.apps_table = apps_table

    def receipt_exists(self, owner_id: str, store: str, source_hash: str) -> bool:
        resp = (
            self.client.table(self.receipts_table)
            .select("id")
            .eq("owner_id", owner_id)
            .eq("store", store)
            .eq("source_hash", source_hash)
            .limit(1)
            .execute()
        )
        return bool(resp.data)

    def insert_receipt(self, payload: dict) -> DbResult:
        try:
            resp = self.client.table(self.receipts_table).insert(payload).execute()
            receipt_id = None
            if resp.data:
                receipt_id = resp.data[0].get("id")
            return DbResult(ok=True, skipped=False, receipt_id=receipt_id)
        except Exception as exc:
            return DbResult(ok=False, skipped=False, error=str(exc))

    def upsert_receipt(self, payload: dict, owner_id: str, store: str, source_hash: str) -> DbResult:
        try:
            if self.receipt_exists(owner_id, store, source_hash):
                return DbResult(ok=True, skipped=True)
            return self.insert_receipt(payload)
        except Exception as exc:
            return DbResult(ok=False, skipped=False, error=str(exc))

    def insert_items(self, items: list) -> DbResult:
        if not items:
            return DbResult(ok=True, skipped=False)
        try:
            self.client.table(self.receipt_items_table).insert(items).execute()
            return DbResult(ok=True, skipped=False)
        except Exception as exc:
            return DbResult(ok=False, skipped=False, error=str(exc))

    def update_app_status(self, slug: str, status: str, last_error: Optional[str]) -> DbResult:
        update = {"status": status}
        update["last_run_at"] = dt.datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
        if last_error:
            update["last_error"] = last_error
        try:
            self.client.table(self.apps_table).update(update).eq("slug", slug).execute()
            return DbResult(ok=True, skipped=False)
        except Exception as exc:
            return DbResult(ok=False, skipped=False, error=str(exc))

    def fetch_item_food_hints(self, owner_id: str, names: List[str]) -> dict:
        if not names:
            return {}
        cleaned = [name.strip() for name in names if isinstance(name, str) and name.strip()]
        if not cleaned:
            return {}

        hints: dict = {}
        batch_size = 200
        for i in range(0, len(cleaned), batch_size):
            batch = cleaned[i : i + batch_size]
            resp = (
                self.client.table(self.receipt_items_table)
                .select("name,is_food,food_quality,created_at")
                .eq("owner_id", owner_id)
                .in_("name", batch)
                .order("created_at", desc=True)
                .limit(2000)
                .execute()
            )
            for row in resp.data or []:
                name = row.get("name")
                if not isinstance(name, str):
                    continue
                key = name.strip().lower()
                if not key or key in hints:
                    continue
                hints[key] = {
                    "is_food": row.get("is_food"),
                    "food_quality": row.get("food_quality"),
                }
        return hints
