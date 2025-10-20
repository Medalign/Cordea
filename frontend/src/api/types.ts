export type Sex = "male" | "female";
export type QTcMethod = "bazett" | "fridericia";

export interface IntervalSet {
  HR_bpm?: number | null;
  PR_ms?: number | null;
  QRS_ms?: number | null;
  QT_ms?: number | null;
  RR_ms?: number | null;
  qtc_method?: QTcMethod | null;
}

export interface ScoreRequest {
  age_band: string;
  sex: Sex;
  intervals: IntervalSet;
}

export interface ScoreResponse {
  [k: string]: any;
}

export interface TrendReading {
  date: string;
  qtc_ms: number;
}

export interface TrendSeriesRequest {
  age_band: string;
  sex: Sex;
  readings: TrendReading[];
  new_reading: TrendReading;
}

export interface TrendSeriesResponse {
  band?: string;
  delta_ms?: number;
  message?: string;
  [k: string]: any;
}
