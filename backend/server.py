from fastapi import FastAPI, Header, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from typing import Optional
from .models import ScoreRequest, ScoreResponse, TrendSeriesRequest, TrendSeriesResponse
from .models import MetricsResponse
from .rbac import role_from_token
from .audit import write_event
from .telemetry import incr, time_block, snapshot
from .logic import qtc_fridericia, _range_for, assess_interval, red_flags, percentile_label, _percentile_for
from .references import active_version, load_ranges, load_metadata, list_versions
from .adapters.csv_adapter import load_csv
from .adapters.json_adapter import load_json
from datetime import datetime

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
    role = require_role(authorization, ["admin", "clinician", "observer"])
    with time_block("score_ms"):
        vr = active_version()
        QTc = None
        if req.intervals.QT_ms and req.intervals.RR_ms:
            QTc = qtc_fridericia(req.intervals.QT_ms, req.intervals.RR_ms)
        assessments = []
        for metric in ["HR_bpm", "PR_ms", "QRS_ms"]:
            val = getattr(req.intervals, metric, None)
            low, high = _range_for(metric, req.age_band, req.sex)
            status, rationale = assess_interval(metric, val, low, high)
            assessments.append({"metric": metric, "status": status, "rationale": rationale})
        if QTc:
            low, high = _range_for("QTc_ms", req.age_band, req.sex)
            status, rationale = assess_interval("QTc_ms", QTc, low, high)
            assessments.append({"metric": "QTc_ms", "status": status, "rationale": rationale})
        payload = {
            "QTc_ms": QTc,
            "PR_ms": req.intervals.PR_ms,
            "QRS_ms": req.intervals.QRS_ms
        }
        flags = red_flags(payload)
        pct = percentile_label(QTc, req.age_band, req.sex) if QTc else None
        write_event(user_id=role, action="guardrail_score", payload={"age_band": req.age_band, "sex": req.sex})
        incr("score_requests")
        return {
            "computed": {"QTc_ms": QTc, "percentile": pct, "ref_version": vr},
            "assessments": assessments,
            "red_flags": flags,
            "disclaimer": DEMO_DISCLAIMER
        }

@app.post("/trend/series", response_model=TrendSeriesResponse)
def trend(req: TrendSeriesRequest, authorization: Optional[str] = Header(default=None)):
    role = require_role(authorization, ["admin", "clinician", "observer"])
    with time_block("trend_ms"):
        points = []
        for r in sorted(req.readings, key=lambda x: x.timestamp):
            QTc = qtc_fridericia(r.QT_ms, r.RR_ms)
            pct = percentile_label(QTc, req.age_band, req.sex)
            points.append({"timestamp": r.timestamp, "QTc_ms": QTc, "percentile": pct})
        p = _percentile_for("QTc_ms", req.age_band, req.sex)
        bands = {"p50": [], "p90": [], "p99": []}
        if p:
            # return flat bands for client to draw as horizontal reference lines
            for key in ["50","90","99"]:
                if key in p:
                    bands[f"p{key}"] = [{"y": p[key]}]
        write_event(user_id=role, action="trend_series", payload={"n": len(points)})
        incr("trend_requests")
        return {"series": points, "bands": bands, "disclaimer": DEMO_DISCLAIMER}

@app.get("/references/ranges")
def get_ranges(age_band: str, sex: str, version: Optional[str] = None, authorization: Optional[str] = Header(default=None)):
    require_role(authorization, ["admin", "clinician", "observer"])
    v = version or active_version()
    return {"version": v, "ranges": load_ranges(v), "metadata": load_metadata(v)}

@app.get("/references/versions")
def versions(authorization: Optional[str] = Header(default=None)):
    require_role(authorization, ["admin", "clinician", "observer"])
    return list_versions()

@app.post("/imports/csv")
async def import_csv(file: UploadFile = File(...), authorization: Optional[str] = Header(default=None)):
    role = require_role(authorization, ["admin", "clinician"])
    content = (await file.read()).decode("utf-8")
    out = load_csv(content)
    write_event(user_id=role, action="import_csv", payload={"rows": len(out["readings"]), "errors": len(out["errors"])})
    incr("imports_csv")
    return out

@app.post("/imports/json")
async def import_json(file: UploadFile = File(...), authorization: Optional[str] = Header(default=None)):
    role = require_role(authorization, ["admin", "clinician"])
    content = (await file.read()).decode("utf-8")
    out = load_json(content)
    write_event(user_id=role, action="import_json", payload={"rows": len(out["readings"]), "errors": len(out["errors"])})
    incr("imports_json")
    return out

@app.get("/audit/events")
def audit_dump(authorization: Optional[str] = Header(default=None)):
    require_role(authorization, ["admin"])
    # Stream file
    try:
        with open("audit.jsonl", "r") as f:
            return JSONResponse(content={"events": [json_line.strip() for json_line in f.readlines()]})
    except FileNotFoundError:
        return {"events": []}

@app.get("/metrics/usage", response_model=MetricsResponse)
def metrics(authorization: Optional[str] = Header(default=None)):
    require_role(authorization, ["admin", "clinician"])
    return snapshot()
