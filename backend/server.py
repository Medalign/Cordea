from fastapi import FastAPI, Header, HTTPException, UploadFile, File, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from typing import Optional
import os

# --- Models ---
from .models import (
    ScoreRequest, ScoreResponse,
    TrendSeriesRequest, TrendSeriesResponse,
    MetricsResponse,
    NarrativeRequest, NarrativeResponse,
)

# --- RBAC, Audit, Telemetry ---
from .rbac import role_from_token
from .audit import write_event
from .telemetry import incr, time_block, snapshot

# --- Core Logic ---
from .logic import (
    qtc_fridericia,
    _range_for,
    assess_interval,
    red_flags,
    percentile_label,
    _percentile_for,
    compute_qtc_multi,
    describe_qtc_for_patient,
    qtc_classification,
)

# --- References ---
from .references import active_version, load_ranges, load_metadata, list_versions

# --- Adapters ---
from .adapters.csv_adapter import load_csv
from .adapters.json_adapter import load_json

# --- LLM Client ---
from .llm_client import generate_qtc_narrative, is_llm_configured


AGE_BAND_LABELS = {
    "adult_65_plus": "65+ years",
    "adult_18_39": "18–39 years",
    "adult_40_64": "40–64 years",
    "child_6_12": "6–12 years",
    "adolescent": "13–17 years",
}


def _qtc_reliability_note(hr_bpm: Optional[float]) -> Optional[str]:
    """
    Very simple meta-logic about QTc formula reliability at rate extremes.

    We do NOT change the numeric QTc result. We only surface a caution flag
    when heart rate is very low or very high, to acknowledge that correction
    formulae are less reliable in those ranges.
    """
    if hr_bpm is None:
        return None

    try:
        hr = float(hr_bpm)
    except (TypeError, ValueError):
        return None

    # You can tune these thresholds if you want, but this is a sensible start.
    if hr < 50.0:
        return (
            "QTc values at very low heart rates may be less reliable and "
            "should be interpreted with caution."
        )
    if hr > 120.0:
        return (
            "QTc values at very high heart rates may be less reliable and "
            "should be interpreted with caution."
        )

    return None


app = FastAPI(title="ECG-Assist Platform API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

DEMO_DISCLAIMER = "DEMONSTRATION ONLY — SYNTHETIC DATA — NOT FOR CLINICAL USE."


@app.exception_handler(Exception)
async def unhandled_exc(_: Request, exc: Exception):
    return JSONResponse(status_code=500, content={"detail": str(exc)})


def require_role(token: Optional[str], allowed):
    role = role_from_token(token or "")
    if role not in allowed:
        raise HTTPException(status_code=403, detail="Insufficient role")
    return role


@app.get("/healthz")
def healthz():
    return {"ok": True, "version": app.version}


# ============================================================
#   /guardrail/score
# ============================================================
@app.post("/guardrail/score", response_model=ScoreResponse)
def score(req: ScoreRequest, authorization: Optional[str] = Header(default=None)):
    role = require_role(authorization, ["admin", "clinician", "observer"])

    with time_block("score_ms"):
        vr = active_version()

        # --- QTc summary ---
        qtc_summary = describe_qtc_for_patient(
            qt_ms=req.intervals.QT_ms,
            hr_bpm=None,
            rr_ms=req.intervals.RR_ms,
            age_band=req.age_band,
            sex=req.sex,
        )
        primary_qtc = qtc_summary["qtc"]["primary_qtc_ms"]

        # --- HR / PR / QRS / QTc assessments ---
        assessments = []

        for metric in ["HR_bpm", "PR_ms", "QRS_ms"]:
            val = getattr(req.intervals, metric, None)
            low, high = _range_for(metric, req.age_band, req.sex)
            status, rationale = assess_interval(metric, val, low, high)
            assessments.append({"metric": metric, "status": status, "rationale": rationale})

        if primary_qtc and str(primary_qtc) != "nan":
            low, high = _range_for("QTc_ms", req.age_band, req.sex)
            status, rationale = assess_interval("QTc_ms", primary_qtc, low, high)
            qt_class = qtc_classification(primary_qtc, req.sex)
            class_label = qt_class.get("category")
            if class_label and status != "GREEN":
                rationale = f"{rationale} (classification: {class_label})"

            assessments.append({"metric": "QTc_ms", "status": status, "rationale": rationale})

        payload = {
            "QTc_ms": primary_qtc,
            "PR_ms": req.intervals.PR_ms,
            "QRS_ms": req.intervals.QRS_ms,
        }
        flags = red_flags(payload)

        pct_label = (
            qtc_summary["percentile"]["label"]
            if qtc_summary.get("percentile")
            else None
        )

        write_event(
            user_id=role,
            action="guardrail_score",
            payload={"age_band": req.age_band, "sex": req.sex},
        )
        incr("score_requests")

        return {
            "computed": {
                "QTc_ms": primary_qtc,
                "percentile": pct_label,
                "ref_version": vr,
                "qtc_detail": qtc_summary,
            },
            "assessments": assessments,
            "red_flags": flags,
            "disclaimer": DEMO_DISCLAIMER,
        }


# ============================================================
#   /trend/series
# ============================================================
@app.post("/trend/series", response_model=TrendSeriesResponse)
def trend(req: TrendSeriesRequest, authorization: Optional[str] = Header(default=None)):
    role = require_role(authorization, ["admin", "clinician", "observer"])

    with time_block("trend_ms"):
        points = []

        for r in sorted(req.readings, key=lambda x: x.timestamp):
            qtc_block = compute_qtc_multi(
                qt_ms=r.QT_ms,
                hr_bpm=None,
                rr_ms=r.RR_ms,
            )
            primary_qtc = qtc_block["qtc"]["primary_qtc_ms"]

            pct = percentile_label(primary_qtc, req.age_band, req.sex)
            classification = qtc_classification(primary_qtc, req.sex)

            points.append({
                "timestamp": r.timestamp,
                "QTc_ms": primary_qtc,
                "percentile": pct,
                "category": classification["category"],
            })

        p = _percentile_for("QTc_ms", req.age_band, req.sex)
        bands = {"p50": [], "p90": [], "p99": []}
        if p:
            for key in ["50", "90", "99"]:
                if key in p:
                    bands[f"p{key}"] = [{"y": p[key]}]

        write_event(
            user_id=role,
            action="trend_series",
            payload={"n": len(points)},
        )
        incr("trend_requests")

        return {
            "series": points,
            "bands": bands,
            "disclaimer": DEMO_DISCLAIMER,
        }


# ============================================================
#  References
# ============================================================
@app.get("/references/ranges")
def get_ranges(
    age_band: str,
    sex: str,
    version: Optional[str] = None,
    authorization: Optional[str] = Header(default=None),
):
    require_role(authorization, ["admin", "clinician", "observer"])
    v = version or active_version()
    return {"version": v, "ranges": load_ranges(v), "metadata": load_metadata(v)}


@app.get("/references/versions")
def versions(authorization: Optional[str] = Header(default=None)):
    require_role(authorization, ["admin", "clinician", "observer"])
    return list_versions()


# ============================================================
#   Imports (CSV / JSON)
# ============================================================
@app.post("/imports/csv")
async def import_csv(
    file: UploadFile = File(...),
    authorization: Optional[str] = Header(default=None)
):
    role = require_role(authorization, ["admin", "clinician"])
    content = (await file.read()).decode("utf-8")
    out = load_csv(content)

    write_event(
        user_id=role,
        action="import_csv",
        payload={"rows": len(out["readings"]), "errors": len(out["errors"])},
    )
    incr("imports_csv")
    return out


@app.post("/imports/json")
async def import_json(
    file: UploadFile = File(...),
    authorization: Optional[str] = Header(default=None)
):
    role = require_role(authorization, ["admin", "clinician"])
    content = (await file.read()).decode("utf-8")
    out = load_json(content)

    write_event(
        user_id=role,
        action="import_json",
        payload={"rows": len(out["readings"]), "errors": len(out["errors"])},
    )
    incr("imports_json")
    return out


# ============================================================
#  Audit
# ============================================================
@app.get("/audit/events")
def audit_dump(authorization: Optional[str] = Header(default=None)):
    require_role(authorization, ["admin"])
    try:
        with open("audit.jsonl", "r") as f:
            return JSONResponse(
                content={"events": [json_line.strip() for json_line in f.readlines()]}
            )
    except FileNotFoundError:
        return {"events": []}


# ============================================================
#   NEW ENDPOINT — /ai/narrative (UPDATED)
# ============================================================
@app.post("/ai/narrative", response_model=NarrativeResponse)
def ai_narrative(
    req: NarrativeRequest,
    authorization: Optional[str] = Header(default=None),
):
    """
    Generate a non-diagnostic narrative summary of the QT/QTc / interval context
    using an LLM (GPT-5.1), strictly for demonstration.

    This endpoint expects that Tab 1/2 have already computed intervals and QTc.
    """
    role = require_role(authorization, ["admin", "clinician", "observer"])

    qtc = req.qtc_ms
    if qtc is None and req.intervals.QT_ms and req.intervals.RR_ms:
        qtc = qtc_fridericia(req.intervals.QT_ms, req.intervals.RR_ms)

    metrics = {
        "HR_bpm": req.intervals.HR_bpm,
        "PR_ms": req.intervals.PR_ms,
        "QRS_ms": req.intervals.QRS_ms,
        "QTc_ms": qtc,
    }

    reference_ranges = {}
    reference_flags = {}

    for metric_name, value in metrics.items():
        low, high = _range_for(metric_name, req.age_band, req.sex)
        reference_ranges[metric_name] = {"low": low, "high": high}

        status, message = assess_interval(metric_name, value, low, high)

        if (
            value is None
            or str(value) == "nan"
            or str(low) == "nan"
            or str(high) == "nan"
        ):
            position = "unknown"
        elif value < low:
            position = "below"
        elif value > high:
            position = "above"
        else:
            position = "within"

        reference_flags[metric_name] = {
            "status": status,
            "position": position,
            "message": message,
        }

    age_label = AGE_BAND_LABELS.get(req.age_band, req.age_band)

    # Deterministic meta-caution about QTc reliability at rate extremes
    reliability_note = _qtc_reliability_note(req.intervals.HR_bpm)

    payload_for_llm = {
        "age_band_enum": req.age_band,
        "sex": req.sex,
        "age_band_label": age_label,
        "sex_label": req.sex,
        "intervals_ms": {
            "HR_bpm": req.intervals.HR_bpm,
            "PR_ms": req.intervals.PR_ms,
            "QRS_ms": req.intervals.QRS_ms,
            "QT_ms": req.intervals.QT_ms,
            "RR_ms": req.intervals.RR_ms,
        },
        "qtc_ms": qtc,
        "percentile_band": req.percentile_band,
        "red_flags": req.red_flags or [],
        "trend_comment": req.trend_comment,
        "reference_ranges": reference_ranges,
        "reference_flags": reference_flags,
        "llm_model": os.environ.get("OPENAI_MODEL", "gpt-5.1-2025-11-13"),
        "llm_enabled": is_llm_configured(),
    }

    write_event(
        user_id=role,
        action="ai_narrative_request",
        payload={
            "age_band": req.age_band,
            "sex": req.sex,
            "llm_enabled": is_llm_configured(),
        },
    )
    incr("ai_narrative_requests")

    out = generate_qtc_narrative(payload_for_llm)

    narrative = out.get("narrative") or "Narrative unavailable."
    key_points = out.get("key_points") or []
    caution_flags = out.get("caution_flags") or []

    # Always append the rate-extreme reliability note if applicable
    if reliability_note and reliability_note not in caution_flags:
        caution_flags.append(reliability_note)

    disclaimer = out.get("disclaimer") or DEMO_DISCLAIMER

    return {
        "narrative": narrative,
        "key_points": key_points,
        "caution_flags": caution_flags,
        "disclaimer": disclaimer,
    }


# ============================================================
#   Metrics
# ============================================================
@app.get("/metrics/usage", response_model=MetricsResponse)
def metrics(authorization: Optional[str] = Header(default=None)):
    require_role(authorization, ["admin", "clinician"])
    return snapshot()