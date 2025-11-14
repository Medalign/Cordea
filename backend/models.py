from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Literal
from datetime import datetime

Sex = Literal["male", "female"]
QTcMethod = Literal["fridericia", "bazett", "auto"]


class IntervalSet(BaseModel):
    HR_bpm: Optional[float] = None
    PR_ms: Optional[float] = None
    QRS_ms: Optional[float] = None
    QT_ms: Optional[float] = None
    RR_ms: Optional[float] = None


class ScoreRequest(BaseModel):
    age_band: str
    sex: Sex
    # kept in API for forwards-compat; logic currently uses rate-aware primary selection
    qtc_method: QTcMethod = "auto"
    intervals: IntervalSet


class Assessment(BaseModel):
    metric: str
    status: Literal["GREEN", "AMBER", "RED"]
    rationale: str


# ---- QTc detail block (matches describe_qtc_for_patient/compute_qtc_multi) ----


class QtcInput(BaseModel):
    qt_ms: Optional[float] = None
    rr_ms: Optional[float] = None
    hr_bpm: Optional[float] = None


class QtcValues(BaseModel):
    fridericia_ms: Optional[float] = None
    bazett_ms: Optional[float] = None
    primary_method: Optional[QTcMethod] = None
    primary_qtc_ms: Optional[float] = None


class QtcRange(BaseModel):
    low_ms: Optional[float] = None
    high_ms: Optional[float] = None


class QtcPercentileDetail(BaseModel):
    label: Optional[str] = None
    p50_ms: Optional[float] = None
    p90_ms: Optional[float] = None
    p99_ms: Optional[float] = None


class QtcReference(BaseModel):
    range: Optional[QtcRange] = None
    percentile: Optional[QtcPercentileDetail] = None


class QtcClassification(BaseModel):
    category: Optional[str] = None  # e.g. "normal", "borderline", "prolonged_high_risk"
    risk_flag: bool = False         # True if QTc is in a clearly high-risk zone
    notes: List[str] = Field(default_factory=list)


class QtcDetail(BaseModel):
    input: QtcInput
    qtc: QtcValues
    reference: Optional[QtcReference] = None
    classification: Optional[QtcClassification] = None


class ScoreComputed(BaseModel):
    # Backwards-compatible fields
    QTc_ms: Optional[float] = None          # e.g. 404.0
    percentile: Optional[str] = None        # e.g. "<50th"
    ref_version: Optional[str] = None       # e.g. "1.0.0"
    # New structured detail block (used by upgraded backend/server)
    qtc_detail: Optional[QtcDetail] = None  # full context for UI / analytics


class ScoreResponse(BaseModel):
    computed: ScoreComputed
    assessments: List[Assessment]
    red_flags: List[str]
    disclaimer: str


class TrendReading(BaseModel):
    timestamp: datetime
    QT_ms: float
    RR_ms: float


class TrendSeriesRequest(BaseModel):
    age_band: str
    sex: Sex
    qtc_method: QTcMethod = "auto"
    readings: List[TrendReading]


class TrendPoint(BaseModel):
    timestamp: datetime
    QTc_ms: float
    percentile: Optional[str] = None
    # Added to expose classification per point (e.g. "normal", "borderline", "high_risk")
    category: Optional[str] = None


class TrendSeriesResponse(BaseModel):
    series: List[TrendPoint]
    bands: Dict[str, List[Dict[str, float]]]
    disclaimer: str


class ImportJob(BaseModel):
    job_id: str
    format: Literal["CSV", "JSON"]
    status: Literal["PENDING", "COMPLETED", "FAILED"]
    errors: List[str] = Field(default_factory=list)


class AuditEntry(BaseModel):
    event_id: str
    ts: datetime
    user_id: str
    action: str
    payload_hash: str
    prev_hash: str


class MetricsResponse(BaseModel):
    counters: Dict[str, int]
    timings_ms: Dict[str, float]
