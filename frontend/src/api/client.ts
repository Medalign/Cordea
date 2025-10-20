import type {
  ScoreRequest,
  ScoreResponse,
  TrendSeriesRequest,
  TrendSeriesResponse,
  AgeBand,
  Sex,
} from "./types";

const BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8000";

async function handleResponse(res: Response) {
  if (!res.ok) {
    let detail: string;
    try {
      const data = await res.json();
      if (data?.detail) {
        if (Array.isArray(data.detail)) {
          detail = data.detail
            .map((item: { loc?: unknown; msg?: string }) => item.msg ?? JSON.stringify(item))
            .join("; ");
        } else if (typeof data.detail === "string") {
          detail = data.detail;
        } else {
          detail = JSON.stringify(data.detail);
        }
      } else {
        detail = JSON.stringify(data);
      }
    } catch (err) {
      detail = await res.text();
    }
    throw new Error(`${res.status} ${res.statusText}: ${detail}`.trim());
  }
  return res.json();
}

async function postJSON<TReq, TRes>(path: string, body: TReq): Promise<TRes> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return handleResponse(res) as Promise<TRes>;
}

export const scoreGuardrail = (req: ScoreRequest) =>
  postJSON<ScoreRequest, ScoreResponse>("/guardrail/score", req);

export const evalTrend = (req: TrendSeriesRequest) =>
  postJSON<TrendSeriesRequest, TrendSeriesResponse>("/trend/series", req);

export async function getRanges(): Promise<
  Record<AgeBand, { sex: Sex; lower: number; upper: number }[]>
> {
  const res = await fetch(`${BASE}/references/ranges`);
  return handleResponse(res);
}

export async function getVersions(): Promise<unknown> {
  const res = await fetch(`${BASE}/references/versions`);
  return handleResponse(res);
}

export const checkHealth = async (): Promise<boolean> => {
  try {
    const res = await fetch(`${BASE}/healthz`);
    return res.ok;
  } catch (error) {
    console.error("Health check failed", error);
    return false;
  }
};
