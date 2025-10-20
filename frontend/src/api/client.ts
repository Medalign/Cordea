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
  // If your UI passes label-cased methods, normalize here:
  // (keep if needed; otherwise pass-through)
  const norm = { ...req } as any;
  if (typeof (norm.qtc_method) === "string") {
    const s = norm.qtc_method.toLowerCase();
    if (s.includes("bazett")) norm.qtc_method = "bazett";
    if (s.includes("fridericia")) norm.qtc_method = "fridericia";
  }
  return postJSON<ScoreResponse>("/guardrail/score", norm);
}

/** UI shape accepted too (no component changes needed):
 * {
 * ageBand?: string; // e.g. "Adult 65+ years"
 * sex: "male" | "female";
 * series?: Array<{ date: string; qtc_ms: number }>;
 * readingDate?: string; // dd/mm/yyyy or yyyy-mm-dd
 * newValue?: number;    // QTc (ms) in UI
 * }
 * or already-API-shaped TrendSeriesRequest.
 */
type TrendUIInput = {
  ageBand?: string;
  sex: "male" | "female";
  series?: Array<{ date: string; qtc_ms: number }>;
  readingDate?: string;
  newValue?: number;
  // allow API-shaped too so this is a drop-in
  age_band?: TrendSeriesRequest["age_band"];
  readings?: TrendSeriesRequest["readings"];
  new?: TrendSeriesRequest["new"];
};

export function evalTrend(req: TrendSeriesRequest | TrendUIInput) {
  const isApiShape = (r: any) =>
    r && "age_band" in r && "new" in r && Array.isArray(r.readings);

  const toISODate = (d: string) => {
    if (!d) return new Date().toISOString().slice(0, 10);
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(d)) {
      const [dd, mm, yyyy] = d.split("/");
      return `${yyyy}-${mm}-${dd}`;
    }
    return d; // assume already ISO
  };

  const mapAgeBandLabelToEnum = (label?: string) => {
    switch (label) {
      case "Adult 18–39 years":
      case "Adult 18-39 years":
        return "adult_18_39";
      case "Adult 40–64 years":
      case "Adult 40-64 years":
        return "adult_40_64";
      case "Adult 65+ years":
        return "adult_65_plus";
      case "Paediatric":
        return "paediatric";
      default:
        return label ?? "adult_18_39";
    }
  };

  if (isApiShape(req)) {
    // Normalize dates just in case
    const r = req as TrendSeriesRequest;
    const payload: TrendSeriesRequest = {
      age_band: r.age_band,
      sex: r.sex,
      readings: (r.readings ?? []).map(p => ({
        timestamp: toISODate(p.timestamp),
        QT_ms: p.QT_ms,
        RR_ms: p.RR_ms,
      })),
      new: {
        timestamp: toISODate(r.new.timestamp),
        QT_ms: r.new.QT_ms,
        RR_ms: r.new.RR_ms,
      },
    };
    return postJSON<TrendSeriesResponse>("/trend/series", payload);
  }

  // Build from UI-friendly shape (QTc only) – use RR=1000 so QT≈QTc
  const ui = req as TrendUIInput;
  const readings = (ui.series ?? []).map(p => ({
    timestamp: toISODate(p.date),
    QT_ms: p.qtc_ms,
    RR_ms: 1000,
  }));

  const payload: TrendSeriesRequest = {
    age_band: mapAgeBandLabelToEnum(ui.ageBand) as any,
    sex: ui.sex,
    readings,
    new: {
      timestamp: toISODate(ui.readingDate ?? ""),
      QT_ms: ui.newValue ?? 0,
      RR_ms: 1000,
    },
  };

  return postJSON<TrendSeriesResponse>("/trend/series", payload);
}

// Optional health check
export async function healthz() {
  const res = await fetch(`${API_BASE}/healthz`);
  if (!res.ok) throw new Error("API not healthy");
  return res.json();
}
