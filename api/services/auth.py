"""API key management (open-beta optional auth)."""

import json
import secrets
from pathlib import Path

_DATA_DIR = Path(__file__).resolve().parent.parent / "data"
_KEYS_FILE = _DATA_DIR / "api_keys.json"


def _load_keys() -> dict:
    if not _KEYS_FILE.exists():
        return {}
    with open(_KEYS_FILE) as f:
        return json.load(f)


def _save_keys(keys: dict) -> None:
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(_KEYS_FILE, "w") as f:
        json.dump(keys, f, indent=2)


def generate_key(name: str) -> str:
    """Generate a new API key and persist it."""
    key = "sk-" + secrets.token_hex(24)
    keys = _load_keys()
    keys[key] = {"name": name, "credits_used": 0}
    _save_keys(keys)
    return key


def validate_key(key: str) -> dict | None:
    """Return key metadata if valid, else None."""
    keys = _load_keys()
    if key not in keys:
        return None
    meta = keys[key]
    return {"key": key, "name": meta["name"], "credits_used": meta.get("credits_used", 0)}


def track_usage(key: str) -> None:
    """Increment credits_used for the given key (fire-and-forget)."""
    keys = _load_keys()
    if key in keys:
        keys[key]["credits_used"] = keys[key].get("credits_used", 0) + 1
        _save_keys(keys)
