import csv, io
from typing import List, Dict, Any

REQUIRED = ["timestamp","QT_ms","RR_ms"]

def load_csv(content: str) -> Dict[str, Any]:
    reader = csv.DictReader(io.StringIO(content))
    readings, errors = [], []
    for i, row in enumerate(reader, start=1):
        try:
            readings.append({
                "timestamp": row["timestamp"],
                "QT_ms": float(row["QT_ms"]),
                "RR_ms": float(row["RR_ms"]),
                "HR_bpm": float(row.get("HR_bpm")) if row.get("HR_bpm") else None,
                "PR_ms": float(row.get("PR_ms")) if row.get("PR_ms") else None,
                "QRS_ms": float(row.get("QRS_ms")) if row.get("QRS_ms") else None
            })
        except Exception as e:
            errors.append(f"row {i}: {e}")
    return {"readings": readings, "errors": errors}
