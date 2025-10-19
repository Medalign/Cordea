import json
from pathlib import Path
from typing import Dict, Any, List, Optional
import matplotlib.pyplot as plt
from datetime import datetime

BASE = Path(__file__).resolve().parent.parent / "content"

def load_json(name: str) -> Dict[str, Any]:
    with open(BASE / f"{name}.json") as f:
        return json.load(f)

age_bands = load_json("age_bands")
norms = load_json("norms")
percentiles = load_json("percentiles")
cases: List[Dict[str, Any]] = json.load(open(BASE / "cases.json"))

SEV = {"green": 0, "amber": 1, "red": 2}

def compute_qtc_ms(qt_ms: Optional[float], rr_ms: Optional[float], method: str = "Bazett") -> Optional[int]:
    if qt_ms is None or rr_ms is None or rr_ms <= 0:
        return None
    rr_s = rr_ms / 1000.0
    m = method.lower()
    if m.startswith("baz"):
        qtc = qt_ms / (rr_s ** 0.5)
    elif m.startswith("fri"):  # Fridericia
        qtc = qt_ms / (rr_s ** (1/3))
    else:
        qtc = qt_ms / (rr_s ** 0.5)
    return int(round(qtc))

def classify_value(param: str, age_band: str, sex: str, value: float) -> Dict[str, str]:
    ref = norms[param][age_band][sex]
    low, high = ref["min"], ref["max"]
    if value < low or value > high:
        return {"status": "red", "rationale": f"{param} out of range ({value} outside {low}–{high})"}
    span = high - low
    margin = max(5, round(0.10 * span))
    if value <= low + margin or value >= high - margin:
        return {"status": "amber", "rationale": f"{param} near range limit ({value} close to {low}–{high})"}
    return {"status": "green", "rationale": f"{param} within range ({low}–{high})"}

def classify_qtc_percentile(age_band: str, sex: str, qtc_ms: int) -> Optional[Dict[str, str]]:
    p = percentiles.get(age_band, {}).get(sex)
    if not p:
        return None
    if qtc_ms >= p["p99"]:
        return {"status": "red", "rationale": f"QTc ≥99th percentile ({qtc_ms} ≥ {p['p99']})"}
    if qtc_ms >= p["p90"]:
        return {"status": "amber", "rationale": f"QTc ≥90th percentile ({qtc_ms} ≥ {p['p90']})"}
    return {"status": "green", "rationale": "QTc <90th percentile"}

def guardrail_report(encounter: Dict[str, Any], age_band: str, sex: str) -> Dict[str, Any]:
    results: Dict[str, Any] = {}
    params_with_refs = [k for k in norms.keys() if k != "notes"]

    # Compute QTc_ms if possible
    if "QTc_ms" in params_with_refs and "QTc_ms" not in encounter:
        qtc = compute_qtc_ms(encounter.get("QT_ms"), encounter.get("RR_ms"), encounter.get("QTc_method", "Bazett"))
        if qtc is not None:
            encounter = {**encounter, "QTc_ms": qtc}

    # Normative classification
    for param in params_with_refs:
        if param in encounter and age_band in norms[param] and sex in norms[param][age_band]:
            results[param] = classify_value(param, age_band, sex, encounter[param])

    # Percentile overlay for QTc_ms (avoid circular refs)
    if "QTc_ms" in encounter:
        pc = classify_qtc_percentile(age_band, sex, encounter["QTc_ms"])
        if pc:
            if "QTc_ms" in results:
                norm = results["QTc_ms"].copy()
                worst = pc if SEV[pc["status"]] > SEV[norm["status"]] else norm
                results["QTc_ms"] = {
                    **worst,
                    "detail": {
                        "norm_status": norm["status"],
                        "percentile_status": pc["status"]
                    }
                }
            else:
                results["QTc_ms"] = pc
    return results

def plot_trend(case_id: str):
    case = next(c for c in cases if c["id"] == case_id)
    age_band, sex = case["ageBand"], case["sex"]
    trend = case["trend"]["points"]
    p = percentiles.get(age_band, {}).get(sex, {})

    dates = [datetime.fromisoformat(pt["date"]) for pt in trend]
    values = [pt["value"] for pt in trend]

    plt.figure(figsize=(8, 4))
    plt.title(f"QTc TrendView — {case_id} ({sex}, {age_band})")
    plt.plot(dates, values, marker="o", label="QTc (ms)")
    if p:
        plt.axhline(p["p50"], linestyle="--", label="50th %ile")
        plt.axhline(p["p90"], linestyle="--", label="90th %ile")
        plt.axhline(p["p99"], linestyle="--", label="99th %ile")
    plt.ylabel("QTc (ms)")
    plt.xlabel("Date")
    plt.legend()
    plt.tight_layout()
    plt.show()

if __name__ == "__main__":
    for c in cases:
        print(f"\n=== {c['id']} ===")
        report = guardrail_report(c["encounter"], c["ageBand"], c["sex"])
        for k, v in report.items():
            print(f"{k}: {v['status'].upper()} — {v['rationale']}")
    plot_trend("prolonged_qtc_68y_m")
