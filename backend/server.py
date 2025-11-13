from fastapi import FastAPI, Header, HTTPException, UploadFile, File, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from typing import Optional
from .models import ScoreRequest, ScoreResponse, TrendSeriesRequest, TrendSeriesResponse
from .models import MetricsResponse
from .rbac import role_from_token
from .audit import write_event
from .telemetry import incr, time_block, snapshot
from .logic import (
    _range_for,
    assess_interval,
    red_flags,
    percentile_label,
    _percentile_for,
    compute_qtc_multi,
    describe_qtc_for_patient,
    qtc_classification,
)
from .references import active_version, load_ranges, load_metadata, list_versions
from .adapters.csv_adapter import load_csv
from .adapters.json_adapter import load_json

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


@app.post("/guardrail/score", response_model=ScoreResponse)
def score(req: ScoreRequest, authorization: Optional[str] = Header(default=None)):
    """
    Core single-reading guardrail endpoint.

    Upgraded to:
    - use multi-formula QTc with rate-aware primary selection,
    - use sex/age-band reference ranges and percentiles,
    - expose classification while preserving the original response shape.
    """
    role = require_role(authorization, ["admin", "clinician", "observer"])

    with time_block("score_ms"):
        vr = active_version()

        # --- QT / QTc summary (rate-aware, multi-formula) ---
        qtc_summary = describe_qtc_for_patient(
            qt_ms=req.intervals.QT_ms,
            hr_bpm=None,                 # we currently rely on RR; add HR here later if available
            rr_ms=req.intervals.RR_ms,
            age_band=req.age_band,
            sex=req.sex,
        )
        primary_qtc = qtc_summary["qtc"]["primary_qtc_ms"]

        # --- Interval assessments (HR, PR, QRS, QTc) ---
        assessments = []

        for metric in ["HR_bpm", "PR_ms", "QRS_ms"]:
            val = getattr(req.intervals, metric, None)
            low, high = _range_for(metric, req.age_band, req.sex)
            status, rationale = assess_interval(metric, val, low, high)
            assessments.append(
                {"metric": metric, "status": status, "rationale": rationale}
            )

        if primary_qtc and str(primary_qtc) != "nan":
            low, high = _range_for("QTc_ms", req.age_band, req.sex)
            status, rationale = assess_interval("QTc_ms", primary_qtc, low, high)
            # Enrich QTc rationale with classification label
            qt_class = qtc_classification(primary_qtc, req.sex)
            class_label = qt_class.get("category")
            if class_label and status != "GREEN":
                rationale = f"{rationale} (classification: {class_label})"
            assessments.append(
                {"metric": "QTc_ms", "status": status, "rationale": rationale}
            )

        # --- Red flags (explicitly non-diagnostic) ---
        payload = {
            "QTc_ms": primary_qtc,
            "PR_ms": req.intervals.PR_ms,
            "QRS_ms": req.intervals.QRS_ms,
        }
        flags = red_flags(payload)

        # Backwards-compatible percentile string
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

        # Preserve original shape but add richer detail under `qtc_detail`
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


@app.post("/trend/series", response_model=TrendSeriesResponse)
def trend(req: TrendSeriesRequest, authorization: Optional[str] = Header(default=None)):
    """
    QTc trend endpoint.

    Upgraded to:
    - use the same multi-formula QTc logic as /guardrail/score (RR-based),
    - provide classification per point while keeping existing fields.
    """
    role = require_role(authorization, ["admin", "clinician", "observer"])

    with time_block("trend_ms"):
        points = []

        # Sort by timestamp and compute QTc per reading
        for r in sorted(req.readings, key=lambda x: x.timestamp):
            qtc_block = compute_qtc_multi(
                qt_ms=r.QT_ms,
                hr_bpm=None,        # if/when HR is available in the model, wire it here
                rr_ms=r.RR_ms,
            )
            primary_qtc = qtc_block["qtc"]["primary_qtc_ms"]
            pct = percentile_label(primary_qtc, req.age_band, req.sex)
            classification = qtc_classification(primary_qtc, req.sex)

            points.append(
                {
                    "timestamp": r.timestamp,
                    "QTc_ms": primary_qtc,
                    "percentile": pct,
                    "category": classification["category"],
                }
            )

        # Percentile bands remain as before for horizontal reference lines
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


@app.get("/references/ranges")
def get_ranges(
    age_band: str,
    sex: str,
    version: Optional[str] = None,
    authorization: Optional[str] = Header(default=None),
):
    """
    Exposes the full normative range/percentile table for the active (or requested) version.

    Note: age_band/sex are currently accepted for interface symmetry with the
    rest of the system; the underlying ranges file is version-wide.
    """
    require_role(authorization, ["admin", "clinician", "observer"])
    v = version or active_version()
    return {"version": v, "ranges": load_ranges(v), "metadata": load_metadata(v)}


@app.get("/references/versions")
def versions(authorization: Optional[str] = Header(default=None)):
    require_role(authorization, ["admin", "clinician", "observer"])
    return list_versions()


@app.post("/imports/csv")
async def import_csv(
    file: UploadFile = File(...), authorization: Optional[str] = Header(default=None)
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
    file: UploadFile = File(...), authorization: Optional[str] = Header(default=None)
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


@app.get("/audit/events")
def audit_dump(authorization: Optional[str] = Header(default=None)):
    require_role(authorization, ["admin"])
    # Stream file
    try:
        with open("audit.jsonl", "r") as f:
            return JSONResponse(
                content={"events": [json_line.strip() for json_line in f.readlines()]}
            )
    except FileNotFoundError:
        return {"events": []}


@app.get("/metrics/usage", response_model=MetricsResponse)
def metrics(authorization: Optional[str] = Header(default=None)):
    require_role(authorization, ["admin", "clinician"])
    return snapshot()
