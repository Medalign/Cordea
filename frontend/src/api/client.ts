import type {
  ScoreRequest,
  ScoreResponse,
  TrendSeriesRequest,
  TrendSeriesResponse,
} from "./types";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8000";

async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      if (j?.detail) msg += `: ${JSON.stringify(j.detail)}`;
    } catch {}
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export function scoreGuardRail(req: ScoreRequest) {
  return postJSON<ScoreResponse>("/guardrail/score", req);
}

export function evalTrend(req: TrendSeriesRequest) {
  return postJSON<TrendSeriesResponse>("/trend/series", req);
}
