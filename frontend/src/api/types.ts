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
  // existing backend shape
  age_band?: string;
  sex: "male" | "female";
  readings?: TrendReading[];

  // UI convenience fields (camelCase)
  ageBand?: string;
  series?: any[];
  newValue?: number;
  readingDate?: string;
}

export interface TrendSeriesResponse {
  band?: string;
  delta_ms?: number;
  message?: string;
  [k: string]: any;
}