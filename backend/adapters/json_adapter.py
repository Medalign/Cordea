import json
from typing import Dict, Any

def load_json(content: str) -> Dict[str, Any]:
    try:
        data = json.loads(content)
        if not isinstance(data, list):
            return {"readings": [], "errors": ["payload must be a JSON array of readings"]}
        # minimal shape check
        readings = []
        errors = []
        for i, r in enumerate(data, start=1):
            try:
                readings.append({
                    "timestamp": r["timestamp"],
                    "QT_ms": float(r["QT_ms"]),
                    "RR_ms": float(r["RR_ms"]),
                    "HR_bpm": float(r.get("HR_bpm")) if r.get("HR_bpm") else None,
                    "PR_ms": float(r.get("PR_ms")) if r.get("PR_ms") else None,
                    "QRS_ms": float(r.get("QRS_ms")) if r.get("QRS_ms") else None
                })
            except Exception as e:
                errors.append(f"item {i}: {e}")
        return {"readings": readings, "errors": errors}
    except Exception as e:
        return {"readings": [], "errors": [str(e)]}
