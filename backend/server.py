import io
from pathlib import Path
from typing import Any, Dict, List

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

from fastapi import FastAPI, Body
from fastapi.responses import StreamingResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.encoders import jsonable_encoder

from . import logic

APP_ROOT = Path(__file__).resolve().parents[1]
FRONTEND_DIR = APP_ROOT / "frontend"

app = FastAPI(title="ECG Assist Demo", version="0.1.0")
app.mount("/app", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="app")

@app.get("/")
def root():
    return RedirectResponse(url="/app/")

@app.get("/api/meta")
def meta():
    return {
        "ageBands": logic.age_bands["bands"],
        "sexes": logic.age_bands["sexes"],
        "qtcMethods": ["Bazett", "Fridericia"]
    }

@app.get("/api/cases")
def list_cases():
    out: List[Dict[str, Any]] = []
    for c in logic.cases:
        enc = c.get("encounter", {})
        qtc = logic.compute_qtc_ms(enc.get("QT_ms"), enc.get("RR_ms"), enc.get("QTc_method", "Bazett"))
        out.append({"id": c["id"], "ageBand": c["ageBand"], "sex": c["sex"], "qtc_ms": qtc})
    return {"cases": out}

@app.get("/api/case/{case_id}")
def case_detail(case_id: str):
    c = next((x for x in logic.cases if x["id"] == case_id), None)
    if not c:
        return {"error": "not_found"}
    enc = c.get("encounter", {})
    qtc = logic.compute_qtc_ms(enc.get("QT_ms"), enc.get("RR_ms"), enc.get("QTc_method", "Bazett"))
    return {
        "id": c["id"],
        "ageBand": c["ageBand"],
        "sex": c["sex"],
        "encounter": enc,
        "computed": {"QTc_ms": qtc}
    }

@app.post("/api/guardrail")
def guardrail(payload: Dict[str, Any] = Body(...)):
    age_band: str = payload["ageBand"]
    sex: str = payload["sex"]
    encounter: Dict[str, Any] = payload["encounter"]
    report = logic.guardrail_report(encounter, age_band, sex)
    safe_report = jsonable_encoder(report, exclude_none=True)
    qtc = logic.compute_qtc_ms(encounter.get("QT_ms"), encounter.get("RR_ms"), encounter.get("QTc_method", "Bazett"))
    return {"report": safe_report, "computed": {"QTc_ms": qtc}}

@app.get("/api/trend_plot/{case_id}.png")
def trend_png(case_id: str):
    case = next((c for c in logic.cases if c["id"] == case_id), None)
    if not case:
        buf = io.BytesIO()
        plt.figure(figsize=(1,1)); plt.axis("off"); plt.savefig(buf, format="png", bbox_inches="tight")
        buf.seek(0)
        return StreamingResponse(buf, media_type="image/png")

    age_band, sex = case["ageBand"], case["sex"]
    trend = case["trend"]["points"]
    p = logic.percentiles.get(age_band, {}).get(sex, {})

    dates = [logic.datetime.fromisoformat(pt["date"]) for pt in trend]
    values = [pt["value"] for pt in trend]

    fig = plt.figure(figsize=(8,4))
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

    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=120)
    plt.close(fig)
    buf.seek(0)
    return StreamingResponse(buf, media_type="image/png")
