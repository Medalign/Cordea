from typing import Dict, List, Tuple, Optional, Any
from math import pow, sqrt

from .references import load_ranges, active_version


# ============================================================
# Core QTc formulae and helpers
# ============================================================

def qtc_fridericia(qt_ms: float, rr_ms: float) -> float:
    """
    Historical function kept for backwards-compatibility.
    QTc (Fridericia) in ms:
        QTc_ms = QT_ms / (RR_s ** (1/3))
              = QT_ms / ((RR_ms / 1000) ** (1/3))
    """
    if not qt_ms or not rr_ms or rr_ms <= 0:
        return float("nan")
    return round(qt_ms / pow(rr_ms / 1000.0, 1.0 / 3.0), 0)


def qtc_bazett(qt_ms: float, rr_ms: float) -> float:
    """
    QTc (Bazett) in ms:
        QTc_s = QT_s / sqrt(RR_s)
        QTc_ms = QT_ms / sqrt(RR_ms / 1000)
    """
    if not qt_ms or not rr_ms or rr_ms <= 0:
        return float("nan")
    return round(qt_ms / sqrt(rr_ms / 1000.0), 0)


def qtc_framingham(qt_ms: float, rr_ms: float) -> float:
    """
    QTc (Framingham) in ms:
        QTc_s = QT_s + 0.154 * (1 - RR_s)
        QTc_ms = 1000 * QTc_s
    """
    if not qt_ms or not rr_ms or rr_ms <= 0:
        return float("nan")
    qt_s = qt_ms / 1000.0
    rr_s = rr_ms / 1000.0
    qtc_s = qt_s + 0.154 * (1.0 - rr_s)
    return round(qtc_s * 1000.0, 0)


def rr_from_hr(hr_bpm: float) -> float:
    """
    Convert heart rate (bpm) to RR interval (ms).
    """
    if not hr_bpm or hr_bpm <= 0:
        return float("nan")
    return 60000.0 / hr_bpm


def hr_from_rr(rr_ms: float) -> float:
    """
    Convert RR interval (ms) to heart rate (bpm).
    """
    if not rr_ms or rr_ms <= 0:
        return float("nan")
    return 60000.0 / rr_ms


def compute_qtc_multi(
    qt_ms: float,
    hr_bpm: Optional[float] = None,
    rr_ms: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Central QT/QTc computation block.

    - Accepts QT in ms and either HR (bpm) or RR (ms).
    - Computes Bazett, Fridericia, and Framingham where possible.
    - Chooses a primary formula based on heart rate:
        * HR 60–100: Bazett primary
        * HR <60 or >100: Fridericia primary
    - Returns a structured dict suitable for API responses.
    """
    result: Dict[str, Any] = {
        "input": {
            "qt_ms": qt_ms,
            "hr_bpm": hr_bpm,
            "rr_ms": rr_ms,
        },
        "derived": {},
        "qtc": {
            "primary_formula": None,
            "primary_qtc_ms": float("nan"),
            "bazett_ms": float("nan"),
            "fridericia_ms": float("nan"),
            "framingham_ms": float("nan"),
            "rate_warning": None,
        },
    }

    if not qt_ms or qt_ms <= 0:
        # Nothing meaningful to do
        return result

    # Normalise RR / HR
    if rr_ms and rr_ms > 0:
        rr = rr_ms
        hr = hr_from_rr(rr)
    elif hr_bpm and hr_bpm > 0:
        hr = hr_bpm
        rr = rr_from_hr(hr)
    else:
        # No rate information – we can’t correct properly
        return result

    result["derived"]["rr_ms"] = rr
    result["derived"]["hr_bpm"] = hr

    # Compute QTc variants
    bazett = qtc_bazett(qt_ms, rr)
    frid = qtc_fridericia(qt_ms, rr)
    fram = qtc_framingham(qt_ms, rr)

    result["qtc"]["bazett_ms"] = bazett
    result["qtc"]["fridericia_ms"] = frid
    result["qtc"]["framingham_ms"] = fram

    # Choose primary formula based on HR range
    primary_formula: Optional[str]
    rate_warning: Optional[str] = None

    if hr >= 60.0 and hr <= 100.0:
        primary_formula = "bazett"
        primary_qtc = bazett
        if str(bazett) == "nan":
            # Fallback if Bazett failed numerically
            primary_formula = "fridericia"
            primary_qtc = frid
    else:
        primary_formula = "fridericia"
        primary_qtc = frid
        rate_warning = (
            "Heart rate outside 60–100 bpm; using Fridericia as primary QTc. "
            "Bazett tends to over-correct at rate extremes."
        )

    result["qtc"]["primary_formula"] = primary_formula
    result["qtc"]["primary_qtc_ms"] = primary_qtc
    result["qtc"]["rate_warning"] = rate_warning

    return result


# ============================================================
# Reference ranges and percentiles
# ============================================================

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
    """
    Simple traffic-light assessment against reference range.

    Returns:
        (status, message)

        status ∈ {"GREEN", "AMBER", "RED"}
    """
    if (
        value is None
        or str(value) == "nan"
        or str(low) == "nan"
        or str(high) == "nan"
    ):
        return ("AMBER", "reference-range placeholder or missing")

    if value < low:
        return ("AMBER", f"{metric} below {low}")
    if value > high:
        return ("RED", f"{metric} out of range ({value} outside {low}–{high})")

    return ("GREEN", f"{metric} within {low}–{high}")


def percentile_label(qtc: float, age_band: str, sex: str) -> Optional[str]:
    """
    Very lightweight labelling of QTc percentile band based on stored percentiles.

    Uses 50th, 90th, and 99th centiles if available and returns one of:
        "<50th", "~50th+", "~95th+", ">=99th"
    """
    p = _percentile_for("QTc_ms", age_band, sex)
    if not p:
        return None

    p50 = p.get("50")
    p90 = p.get("90")
    p99 = p.get("99")

    if p99 is not None and str(p99) != "nan" and qtc >= p99:
        return ">=99th"
    if p90 is not None and str(p90) != "nan" and qtc >= p90:
        # We only have a 90th; we label it as “~95th+” to signal high-normal/abnormal
        return "~95th+"
    if p50 is not None and str(p50) != "nan" and qtc >= p50:
        return "~50th+"
    return "<50th"


def qtc_classification(qtc_ms: float, sex: Optional[str] = None) -> Dict[str, Any]:
    """
    Classify QTc into clinically meaningful buckets using sex-specific thresholds
    where possible.

    Categories:
        - "unknown"
        - "short_qt"
        - "normal"
        - "borderline_prolonged"
        - "prolonged"
        - "high_risk"

    Note: this is explicitly non-diagnostic and intended for risk-framing only.
    """
    if qtc_ms is None or str(qtc_ms) == "nan":
        return {
            "category": "unknown",
            "short_qt": False,
            "thresholds_used": None,
        }

    sex_norm = (sex or "").strip().lower()
    if sex_norm.startswith("m"):
        # Typical adult male thresholds
        short_qt_cutoff = 350.0
        normal_upper = 440.0
        borderline_upper = 449.0
        high_risk = 500.0
    elif sex_norm.startswith("f"):
        # Typical adult female thresholds
        short_qt_cutoff = 360.0
        normal_upper = 460.0
        borderline_upper = 469.0
        high_risk = 500.0
    else:
        # Generic thresholds if sex unknown
        short_qt_cutoff = 350.0
        normal_upper = 450.0
        borderline_upper = 479.0
        high_risk = 500.0

    short_qt = False
    category: str

    if qtc_ms <= short_qt_cutoff:
        category = "short_qt"
        short_qt = True
    elif qtc_ms < normal_upper:
        category = "normal"
    elif qtc_ms <= borderline_upper:
        category = "borderline_prolonged"
    elif qtc_ms < high_risk:
        category = "prolonged"
    else:
        category = "high_risk"

    return {
        "category": category,
        "short_qt": short_qt,
        "thresholds_used": {
            "short_qt_cutoff_ms": short_qt_cutoff,
            "normal_upper_ms": normal_upper,
            "borderline_upper_ms": borderline_upper,
            "high_risk_ms": high_risk,
        },
    }


def describe_qtc_for_patient(
    qt_ms: float,
    hr_bpm: Optional[float],
    rr_ms: Optional[float],
    age_band: str,
    sex: str,
) -> Dict[str, Any]:
    """
    High-level helper that pulls together:
        - multi-formula QTc,
        - reference range assessment,
        - percentile band,
        - categorical risk classification.

    This is the function you should be using in Tab 1 / Tab 2 rather than
    hand-rolling QTc logic in the API layer.
    """
    qtc_block = compute_qtc_multi(qt_ms=qt_ms, hr_bpm=hr_bpm, rr_ms=rr_ms)
    primary_qtc = qtc_block["qtc"]["primary_qtc_ms"]

    low, high = _range_for("QTc_ms", age_band, sex)
    status, range_msg = assess_interval("QTc_ms", primary_qtc, low, high)

    pct_label = percentile_label(primary_qtc, age_band, sex)
    classification = qtc_classification(primary_qtc, sex)

    return {
        "input": qtc_block["input"],
        "derived": qtc_block["derived"],
        "qtc": qtc_block["qtc"],
        "range_assessment": {
            "status": status,
            "message": range_msg,
            "reference_low_ms": low,
            "reference_high_ms": high,
        },
        "percentile": {
            "label": pct_label,
            "age_band": age_band,
            "sex": sex,
        },
        "classification": classification,
    }


# ============================================================
# Red-flag heuristics (educational, non-diagnostic)
# ============================================================

def red_flags(payload: Dict) -> List[str]:
    """
    Very simple, explicitly non-diagnostic red-flagging.

    Expects payload to contain at least:
        - "QTc_ms"
        - "PR_ms"
        - "QRS_ms"

    Optionally:
        - "sex" (used only indirectly via QTc thresholds if needed later)
    """
    flags: List[str] = []

    qtc = payload.get("QTc_ms")
    pr = payload.get("PR_ms")
    qrs = payload.get("QRS_ms")

    # Educational, non-diagnostic rules:

    # Legacy / baseline rule: prolonged QTc
    if qtc and qtc >= 470:
        flags.append("LQTS_possible_based_on_QTc_threshold_demo_only")

    # Explicit high-risk QTc band
    if qtc and qtc >= 500:
        flags.append("QTc_high_risk_500ms_plus_demo_only")

    # WPW heuristic without waveform confirmation
    if pr and qrs and pr < 120 and qrs >= 120:
        flags.append("WPW_pattern_suspected_placeholder_no_waveform_confirmation")

    return flags
