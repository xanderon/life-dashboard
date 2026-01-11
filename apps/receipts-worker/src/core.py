import hashlib
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from pydantic import BaseSettings, validator


class Settings(BaseSettings):
    receipts_root: Path = Path("~/Dropbox/bonuri")
    logs_root: Optional[Path] = None
    supabase_url: Optional[str] = None
    supabase_key: Optional[str] = None
    owner_id: Optional[str] = None
    receipts_table: str = "receipts"
    receipt_items_table: str = "receipt_items"
    apps_table: str = "apps"

    @validator("receipts_root", pre=True)
    def _expand_root(cls, v):
        path = Path(os.path.expandvars(os.path.expanduser(str(v)))).resolve()
        return path

    @validator("logs_root", pre=True, always=True)
    def _default_logs_root(cls, v, values):
        if v:
            return Path(os.path.expandvars(os.path.expanduser(str(v)))).resolve()
        root = values.get("receipts_root")
        if root:
            return root / "_logs" / "receipts_worker"
        return None

    @validator("supabase_key", pre=True, always=True)
    def _fallback_supabase_key(cls, v):
        if v:
            return v
        return os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

    @validator("owner_id", pre=True, always=True)
    def _fallback_owner_id(cls, v):
        if v:
            return v
        return os.environ.get("SUPABASE_OWNER_ID") or os.environ.get("RECEIPTS_OWNER_ID")

    @validator("receipts_root")
    def _root_exists(cls, v):
        if not v.exists():
            raise ValueError(f"RECEIPTS_ROOT does not exist: {v}")
        return v

    class Config:
        env_prefix = ""


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


@dataclass
class DbResult:
    ok: bool
    skipped: bool
    error: Optional[str] = None
    receipt_id: Optional[str] = None


@dataclass
class FileResult:
    file_name: str
    status: str
    outcome: str
    db_result: DbResult
    message: str
    items_count: int = 0
    total: Optional[float] = None
    discount_total: Optional[float] = None
