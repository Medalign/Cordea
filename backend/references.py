import json, os
from typing import Dict, Any
from functools import lru_cache

BASE_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "content", "references")

def _pack_dir(version: str) -> str:
    return os.path.join(BASE_PATH, version)

@lru_cache(maxsize=16)
def load_ranges(version: str) -> Dict[str, Any]:
    path = os.path.join(_pack_dir(version), "ranges.json")
    with open(path, "r") as f:
        return json.load(f)

@lru_cache(maxsize=16)
def load_metadata(version: str) -> Dict[str, Any]:
    path = os.path.join(_pack_dir(version), "metadata.json")
    with open(path, "r") as f:
        return json.load(f)

def list_versions() -> Dict[str, Any]:
    if not os.path.isdir(BASE_PATH):
        return {"versions": []}
    versions = sorted([d for d in os.listdir(BASE_PATH) if os.path.isdir(os.path.join(BASE_PATH, d))])
    return {"versions": versions}

def active_version() -> str:
    # Demo: fixed to 1.0.0; allow switch via env or simple file
    return os.environ.get("ECG_REF_VERSION", "1.0.0")
