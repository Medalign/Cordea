import type {
  ScoreRequest,
  ScoreResponse,
  TrendSeriesRequest,
  TrendSeriesResponse,
} from "./types";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8000";

async function postJSON<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e: any) {
    throw new Error(e?.message || "Failed to fetch");
  }

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      if (j?.detail) msg += `: ${JSON.stringify(j.detail)}`;
    } catch {
      try {
        msg += `: ${await res.text()}`;
      } catch {}
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export function scoreGuardRail(req: ScoreRequest) {
  // The UI sends a flat object, so we build the nested payload the backend expects.
  const payload = {
    age_band: req.age_band,
    sex: req.sex,
    intervals: {
      HR_bpm: req.intervals.HR_bpm,
      PR_ms: req.intervals.PR_ms,
      QRS_ms: req.intervals.QRS_ms,
      QT_ms: req.intervals.QT_ms,
      RR_ms: req.intervals.RR_ms,
    },
    qtc_method: req.qtc_method,
  };
  return postJSON<ScoreResponse>("/guardrail/score", payload);
}

type TrendUIInput = {
  ageBand?: string;
  sex: "male" | "female";
  series?: Array<{ date: string; qtc_ms: number }>;
  readingDate?: string;
  newValue?: number;
  age_band?: TrendSeriesRequest["age_band"];
  readings?: TrendSeriesRequest["readings"];
  new?: TrendSeriesRequest["new"];
};

export function evalTrend(req: TrendSeriesRequest | TrendUIInput) {
  const toISODate = (d: string | undefined) => {
    if (!d) return new Date().toISOString().slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d; // Already ISO
    const m = String(d).trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`; // Convert DD/MM/YYYY to ISO
    return d;
  };

  const mapAgeBandLabelToEnum = (label?: string) => {
    switch (label) {
      case "Adult 18–39 years": case "Adult 18-39 years": return "adult_18_39";
      case "Adult 40–64 years": case "Adult 40-64 years": return "adult_40_64";
      case "Adult 65+ years": return "adult_65_plus";
      case "Paediatric": return "paediatric";
      default: return label ?? "adult_18_39";
    }
  };

  const ui = req as TrendUIInput;
  const readings = (ui.series ?? []).map(p => ({
    timestamp: toISODate(p.date),
    QT_ms: p.qtc_ms,
    RR_ms: 1000, // Fabricate RR_ms as the UI only provides QTc
  }));

  const payload: TrendSeriesRequest = {
    age_band: mapAgeBandLabelToEnum(ui.ageBand ?? ui.age_band),
    sex: ui.sex,
    readings,
    new: {
      timestamp: toISODate(ui.readingDate),
      QT_ms: ui.newValue ?? 0,
      RR_ms: 1000, // Fabricate RR_ms for the new reading
    },
  };

  return postJSON<TrendSeriesResponse>("/trend/series", payload);
}

export async function healthz() {
  const res = await fetch(`${API_BASE}/healthz`);
  if (!res.ok) throw new Error("API not healthy");
  return res.json();
}
