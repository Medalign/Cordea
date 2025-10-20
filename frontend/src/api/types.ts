export type Sex = "male" | "female";
export type AgeBand =
  | "neonate"
  | "infant"
  | "child_1_5"
  | "child_6_12"
  | "adolescent"
  | "adult_18_39"
  | "adult_40_64"
  | "adult_65_plus";

export interface IntervalSet {
  HR_bpm: number;
  PR_ms: number;
  QRS_ms: number;
  QT_ms: number;
  RR_ms: number;
}

export type QTcMethod = "Bazett" | "Fridericia";

export interface ScoreRequest {
  age_band: AgeBand;
  sex: Sex;
  intervals: IntervalSet;
  qtc_method: QTcMethod;
}

export interface MetricEval {
  status: "green" | "amber" | "red";
  reason: string;
}

export interface ScoreResponse {
  QTc_ms: number;
  evaluations: {
    HR_bpm?: MetricEval;
    PR_ms?: MetricEval;
    QRS_ms?: MetricEval;
    QTc_ms?: MetricEval;
  };
  summary: string;
  method: QTcMethod;
  notes?: string[];
}

export interface TrendPoint {
  date: string;
  value: number;
}

export interface TrendSeriesRequest {
  age_band: AgeBand;
  sex: Sex;
  readings: TrendPoint[];
  new_value: number;
}

export interface TrendSeriesResponse {
  band: "p50" | "p90" | "p99" | ">p99" | "<p50";
  delta_ms: number;
  message: string;
}
