import sys
from pathlib import Path
from typing import Any, Dict


def _ensure_repo_root_on_path() -> None:
    root = Path(__file__).resolve()
    receipts_src = root.parents[2]
    if str(receipts_src) not in sys.path:
        sys.path.insert(0, str(receipts_src))


def parse(img_path: Path, store: str, rel_base: str) -> Dict[str, Any]:
    _ensure_repo_root_on_path()
    from lidl_receipt_ocr import parse_file

    return parse_file(Path(img_path), store=store, rel_base=rel_base)
