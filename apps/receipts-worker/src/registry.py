from typing import Dict

from .parsers.lidl import adapter as lidl_adapter


PARSERS: Dict[str, object] = {
    "lidl": lidl_adapter,
}


def get_parser(store: str):
    if store not in PARSERS:
        raise ValueError(f"Unknown store: {store}")
    return PARSERS[store]


def list_stores():
    return sorted(PARSERS.keys())
