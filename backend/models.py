from pydantic import BaseModel, Field, validator
from typing import List, Optional, Dict, Literal
from datetime import datetime

Sex = Literal["male", "female"]
QTcMethod = Literal["fridericia"]

class IntervalSet(BaseModel):
    HR_bpm: Optional[float] = None
    PR_ms: Optional[float] = None
    QRS_ms: Optional[float] = None
    QT_ms: Optional[float] = None
    RR_ms: Optional[float] = None

class ScoreRequest(BaseModel):
    age_band: str
    sex: Sex
    qtc_method: QTcMethod = "fridericia"
    intervals: IntervalSet

class Assessment(BaseModel):
    metric: str
    status: Literal["GREEN", "AMBER", "RED"]
    rationale: str

class ScoreResponse(BaseModel):
    computed: Dict[str, Optional[str]]
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
    qtc_method: QTcMethod = "fridericia"
    readings: List[TrendReading]

class TrendPoint(BaseModel):
    timestamp: datetime
    QTc_ms: float
    percentile: Optional[str] = None

class TrendSeriesResponse(BaseModel):
    series: List[TrendPoint]
    bands: Dict[str, List[Dict[str, float]]]
    disclaimer: str

class ImportJob(BaseModel):
    job_id: str
    format: Literal["CSV", "JSON"]
    status: Literal["PENDING", "COMPLETED", "FAILED"]
    errors: List[str] = []

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
