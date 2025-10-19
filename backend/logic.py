from typing import Dict, List, Tuple
from math import pow
from .references import load_ranges, active_version

def qtc_fridericia(qt_ms: float, rr_ms: float) -> float:
    # QTc = QT / (RR/1000)^(1/3)
    if not qt_ms or not rr_ms or rr_ms <= 0:
        return float("nan")
    return round(qt_ms / pow(rr_ms / 1000.0, 1/3), 0)

def _range_for(metric: str, age_band: str, sex: str) -> Tuple[float, float]:
    data = load_ranges(active_version())
    key = f"{age_band}:{sex}:{metric}"
    rng = data.get(key)
    if not rng:
        return (float("nan"), float("nan"))
    return (rng.get("low"), rng.get("high"))

def _percentile_for(metric: str, age_band: str, sex: str) -> Dict[str, float]:
    data = load_ranges(active_version())
    key = f"{age_band}:{sex}:{metric}"
    rng = data.get(key, {})
    return rng.get("percentiles", {})

def assess_interval(metric: str, value: float, low: float, high: float) -> Tuple[str, str]:
    if value is None or str(value) == "nan" or str(low) == "nan" or str(high) == "nan":
        return ("AMBER", "reference-range placeholder or missing")
    if value < low:
        return ("AMBER", f"{metric} below {low}")
    if value > high:
        return ("RED", f"{metric} out of range ({value} outside {low}–{high})")
    return ("GREEN", f"{metric} within {low}–{high}")

def red_flags(payload: Dict) -> List[str]:
    flags = []
    qtc = payload.get("QTc_ms")
    pr = payload.get("PR_ms")
    qrs = payload.get("QRS_ms")
    # Educational, non-diagnostic rules:
    if qtc and qtc >= 470:
        flags.append("LQTS_possible_based_on_QTc_threshold_demo_only")
    # WPW heuristic without waveforms (placeholder note):
    if pr and qrs and pr < 120 and qrs >= 120:
        flags.append("WPW_pattern_suspected_placeholder_no_waveform_confirmation")
    return flags

def percentile_label(qtc: float, age_band: str, sex: str) -> str:
    p = _percentile_for("QTc_ms", age_band, sex)
    if not p:
        return None
    p50 = p.get("50"); p90 = p.get("90"); p99 = p.get("99")
    if p99 and qtc >= p99: return ">=99th"
    if p90 and qtc >= p90: return "~95th+"
    if p50 and qtc >= p50: return "~50th+"
    return "<50th"
