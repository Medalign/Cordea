import json
import os
import logging
from typing import Dict, Any, List
from functools import lru_cache

logger = logging.getLogger(__name__)

# Allow override of where reference packs live (useful for tests / deployments)
DEFAULT_BASE_PATH = os.path.join(
    os.path.dirname(os.path.dirname(__file__)),
    "content",
    "references",
)
BASE_PATH = os.environ.get("ECG_REF_BASE_PATH", DEFAULT_BASE_PATH)


def _pack_dir(version: str) -> str:
    """
    Return the directory path for a given reference pack version.
    """
    return os.path.join(BASE_PATH, version)


@lru_cache(maxsize=16)
def load_ranges(version: str) -> Dict[str, Any]:
    """
    Load the ranges.json for a given reference version.

    Structure (per key) is expected to be:
        "<age_band>:<sex>:<metric>": {
            "low": float,
            "high": float,
            "percentiles": {
                "50": float,
                "90": float,
                "99": float
            }
        }

    This is what logic._range_for and logic._percentile_for expect.
    """
    path = os.path.join(_pack_dir(version), "ranges.json")
    if not os.path.exists(path):
        logger.error("ranges.json not found for version %s at %s", version, path)
        return {}
    try:
        with open(path, "r") as f:
            return json.load(f)
    except Exception as exc:
        logger.exception("Failed to load ranges for version %s: %s", version, exc)
        return {}


@lru_cache(maxsize=16)
def load_metadata(version: str) -> Dict[str, Any]:
    """
    Load the metadata.json for a given reference version.
    Used by the /references/ranges endpoint for transparency in the UI.
    """
    path = os.path.join(_pack_dir(version), "metadata.json")
    if not os.path.exists(path):
        logger.warning("metadata.json not found for version %s at %s", version, path)
        return {}
    try:
        with open(path, "r") as f:
            return json.load(f)
    except Exception as exc:
        logger.exception("Failed to load metadata for version %s: %s", version, exc)
        return {}


def list_versions() -> Dict[str, List[str]]:
    """
    Return all available reference-pack versions as a sorted list.
    """
    if not os.path.isdir(BASE_PATH):
        logger.warning("Reference BASE_PATH does not exist: %s", BASE_PATH)
        return {"versions": []}
    versions = sorted(
        d
        for d in os.listdir(BASE_PATH)
        if os.path.isdir(os.path.join(BASE_PATH, d))
    )
    return {"versions": versions}


def active_version() -> str:
    """
    Determine the active reference version.

    Priority:
      1) ECG_REF_VERSION env var, if it exists AND is a known version
      2) Latest available version on disk (highest sorted)
      3) Fallback hardcoded "1.0.0" (for early demo environments)

    This keeps you safe if someone sets a junk env var or if new
    reference packs are added over time.
    """
    env_ver = os.environ.get("ECG_REF_VERSION")
    versions_info = list_versions()
    versions = versions_info.get("versions", [])

    # If an env var is set and that version exists, honour it
    if env_ver and env_ver in versions:
        return env_ver

    # Otherwise, prefer "latest" version on disk if available
    if versions:
        return versions[-1]

    # Absolute fallback: keep old behaviour for very early/demo setups
    return env_ver or "1.0.0"
