import type { ScoreRequest, TrendPoint } from "../api/types";

type TrendDemoCase = {
  id: string;
  title: string;
  description: string;
  age_band: ScoreRequest["age_band"];
  sex: ScoreRequest["sex"];
  readings: TrendPoint[];
  bands: { p50: number; p90: number; p99: number };
};

export const demoGuardRailAdult: ScoreRequest = {
  age_band: "adult_18_39",
  sex: "male",
  intervals: { HR_bpm: 72, PR_ms: 160, QRS_ms: 92, QT_ms: 380, RR_ms: 830 },
  qtc_method: "Bazett",
};

export const demoGuardRailChild: ScoreRequest = {
  age_band: "child_6_12",
  sex: "male",
  intervals: { HR_bpm: 88, PR_ms: 120, QRS_ms: 80, QT_ms: 360, RR_ms: 800 },
  qtc_method: "Fridericia",
};

export const demoTrendAdult: TrendDemoCase = {
  id: "adult",
  title: "Adult follow-up",
  description: "Adult male with recent QTc monitoring following medication change.",
  age_band: "adult_18_39",
  sex: "male",
  readings: [
    { date: "2025-09-01", value: 430 },
    { date: "2025-09-10", value: 440 },
    { date: "2025-09-20", value: 438 },
  ],
  bands: { p50: 420, p90: 450, p99: 470 },
};

export const demoTrendChild: TrendDemoCase = {
  id: "paediatric",
  title: "Paediatric review",
  description: "Female child undergoing weekly monitoring while titrating therapy.",
  age_band: "child_6_12",
  sex: "female",
  readings: [
    { date: "2025-07-01", value: 460 },
    { date: "2025-07-08", value: 470 },
    { date: "2025-07-15", value: 465 },
  ],
  bands: { p50: 420, p90: 465, p99: 485 },
};

export const TREND_CASES: TrendDemoCase[] = [demoTrendAdult, demoTrendChild];
