import json
import secrets
import os

KEYS_FILE = "api/data/api_keys.json"


def _load():
    if not os.path.exists(KEYS_FILE):
        return {}
    return json.load(open(KEYS_FILE))


def _save(d):
    json.dump(d, open(KEYS_FILE, "w"))


def generate_key(name):
    d = _load()
    key = "sk-" + secrets.token_hex(24)
    d[key] = {"name": name, "credits_used": 0}
    _save(d)
    return key


def validate_key(key):
    d = _load()
    return d.get(key)
