import type { ScoreRequest, ScoreResponse, TrendSeriesRequest, TrendSeriesResponse } from "./types";

const BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8000";

async function extractError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (typeof data === "string") {
      return data;
    }
    if (data?.detail) {
      if (Array.isArray(data.detail)) {
        return data.detail
          .map((item: { msg?: string; detail?: string }) => item.msg ?? item.detail ?? "")
          .filter(Boolean)
          .join("; ");
      }
      if (typeof data.detail === "string") {
        return data.detail;
      }
      return JSON.stringify(data.detail);
    }
    if (data?.message) {
      return data.message;
    }
    return JSON.stringify(data);
  } catch (err) {
    return await res.text();
  }
}

async function postJSON<TReq, TRes>(path: string, body: TReq): Promise<TRes> {
  const response = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await extractError(response);
    throw new Error(detail || `Request to ${path} failed (${response.status})`);
  }

  return response.json() as Promise<TRes>;
}

export const healthz = async (): Promise<boolean> => {
  try {
    const response = await fetch(`${BASE}/healthz`);
    return response.ok;
  } catch (error) {
    console.error("Health check failed", error);
    return false;
  }
};

export const scoreGuardrail = (req: ScoreRequest) =>
  postJSON<ScoreRequest, ScoreResponse>("/guardrail/score", req);

export const evalTrend = (req: TrendSeriesRequest) =>
  postJSON<TrendSeriesRequest, TrendSeriesResponse>("/trend/series", req);
