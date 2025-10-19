import json, os, hashlib, time
from datetime import datetime
from typing import Optional

AUDIT_PATH = os.environ.get("ECG_AUDIT_PATH", "audit.jsonl")

def _last_hash() -> str:
    if not os.path.exists(AUDIT_PATH):
        return "GENESIS"
    with open(AUDIT_PATH, "rb") as f:
        last = None
        for line in f:
            last = line
        if not last:
            return "GENESIS"
        obj = json.loads(last.decode("utf-8"))
        return obj.get("payload_hash", "GENESIS")

def _hash_payload(payload: dict, prev_hash: str) -> str:
    h = hashlib.sha256()
    h.update(json.dumps(payload, sort_keys=True).encode("utf-8"))
    h.update(prev_hash.encode("utf-8"))
    return h.hexdigest()

def write_event(user_id: str, action: str, payload: dict):
    prev = _last_hash()
    payload_hash = _hash_payload(payload, prev)
    evt = {
        "event_id": f"{int(time.time()*1000)}",
        "ts": datetime.utcnow().isoformat() + "Z",
        "user_id": user_id,
        "action": action,
        "payload_hash": payload_hash,
        "prev_hash": prev
    }
    with open(AUDIT_PATH, "ab") as f:
        f.write((json.dumps(evt) + "\n").encode("utf-8"))
    return evt
