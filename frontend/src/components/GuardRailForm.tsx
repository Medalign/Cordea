import React, { useCallback, useMemo, useState } from "react";
import { scoreGuardrail } from "../api/client";
import type { MetricEval, ScoreRequest, ScoreResponse } from "../api/types";
import { AGE_BAND_OPTIONS, QTC_METHOD_OPTIONS, SEX_OPTIONS } from "../content/options";
import { demoGuardRailAdult, demoGuardRailChild } from "../content/demoCases";
import RAGChip from "./RAGChip";

type MetricKey = keyof NonNullable<ScoreResponse["evaluations"]>;
const INTERVAL_ORDER: Array<keyof ScoreRequest["intervals"]> = [
  "HR_bpm",
  "PR_ms",
  "QRS_ms",
  "QT_ms",
  "RR_ms",
];

const METRIC_LABELS: Record<MetricKey, string> = {
  HR_bpm: "Heart rate (bpm)",
  PR_ms: "PR interval (ms)",
  QRS_ms: "QRS duration (ms)",
  QTc_ms: "QTc (ms)",
};

const INPUT_LABELS: Record<keyof ScoreRequest["intervals"], string> = {
  HR_bpm: "Heart rate (bpm)",
  PR_ms: "PR interval (ms)",
  QRS_ms: "QRS duration (ms)",
  QT_ms: "QT interval (ms)",
  RR_ms: "RR interval (ms)",
};

const GuardRailForm: React.FC = () => {
  const [form, setForm] = useState<ScoreRequest>({
    ...demoGuardRailAdult,
    intervals: { ...demoGuardRailAdult.intervals },
  });
  const [result, setResult] = useState<ScoreResponse | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

  const intervalKeys = useMemo(() => INTERVAL_ORDER, []);

  const updateField = (key: keyof ScoreRequest, value: string) => {
    setForm((prev) => ({
      ...prev,
      [key]: value as ScoreRequest[keyof ScoreRequest],
    }));
  };

  const updateInterval = (key: keyof ScoreRequest["intervals"], value: string) => {
    setForm((prev) => ({
      ...prev,
      intervals: {
        ...prev.intervals,
        [key]: value === "" ? Number.NaN : Number(value),
      },
    }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setCopyState("idle");
    try {
      const cleanedIntervals = intervalKeys.reduce((acc, key) => {
        const value = form.intervals[key];
        if (typeof value !== "number" || Number.isNaN(value)) {
          throw new Error("Please provide all interval values before scoring.");
        }
        return { ...acc, [key]: value };
      }, {} as ScoreRequest["intervals"]);

      const payload: ScoreRequest = {
        age_band: form.age_band,
        sex: form.sex,
        qtc_method: form.qtc_method,
        intervals: cleanedIntervals,
      };

      const response = await scoreGuardrail(payload);
      setResult(response);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Unable to score this encounter right now.");
      }
      setResult(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const loadDemo = useCallback((demo: ScoreRequest) => {
    setForm({ ...demo, intervals: { ...demo.intervals } });
    setResult(null);
    setError(null);
    setCopyState("idle");
  }, []);

  const handleCopy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.summary);
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 2500);
    } catch (err) {
      console.error("Copy failed", err);
      setCopyState("error");
    }
  };

  const evaluationEntries = useMemo(() => {
    if (!result) return [] as Array<[MetricKey, MetricEval]>;
    const keys = Object.keys(result.evaluations) as MetricKey[];
    return keys
      .filter((key) => result.evaluations[key])
      .map((key) => [key, result.evaluations[key]!] as [MetricKey, MetricEval]);
  }, [result]);

  return (
    <section aria-labelledby="guardrail-heading">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
        <div>
          <h2 id="guardrail-heading">GuardRail — Encounter review</h2>
          <p className="small-text">
            Check entered ECG intervals against age and sex reference ranges. Results update once
            you submit the encounter.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button type="button" onClick={() => loadDemo(demoGuardRailAdult)}>
            Load adult demo
          </button>
          <button type="button" onClick={() => loadDemo(demoGuardRailChild)}>
            Load paediatric demo
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="form-grid" style={{ marginTop: "1.5rem" }}>
        <div className="form-grid two-column">
          <div>
            <label htmlFor="age_band">Age band</label>
            <select
              id="age_band"
              value={form.age_band}
              onChange={(event) => updateField("age_band", event.target.value)}
            >
              {AGE_BAND_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="sex">Sex recorded</label>
            <select id="sex" value={form.sex} onChange={(event) => updateField("sex", event.target.value)}>
              {SEX_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-grid three-column">
          {intervalKeys.map((key) => (
            <div key={key}>
              <label htmlFor={key}>{INPUT_LABELS[key] ?? key}</label>
              <input
                id={key}
                type="number"
                inputMode="numeric"
                value={form.intervals[key] ?? ""}
                onChange={(event) => updateInterval(key, event.target.value)}
              />
            </div>
          ))}
        </div>

        <div className="form-grid two-column">
          <div>
            <span style={{ display: "block", marginBottom: "0.5rem" }}>QTc method</span>
            <div style={{ display: "flex", gap: "0.75rem" }}>
              {QTC_METHOD_OPTIONS.map((option) => (
                <label key={option.value} style={{ fontWeight: 500 }}>
                  <input
                    type="radio"
                    name="qtc_method"
                    value={option.value}
                    checked={form.qtc_method === option.value}
                    onChange={(event) => updateField("qtc_method", event.target.value)}
                    style={{ marginRight: "0.5rem" }}
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "center" }}>
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Scoring…" : "Score encounter"}
          </button>
          {error && <span className="error-text">{error}</span>}
        </div>
      </form>

      {result && (
        <div
          className="card"
          style={{ marginTop: "1.5rem" }}
          role="region"
          aria-live="polite"
          aria-labelledby="guardrail-results-title"
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: "1rem", flexWrap: "wrap" }}>
            <div>
              <h3 id="guardrail-results-title">Results</h3>
              <p className="small-text">QTc reported using the {result.method} method.</p>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <button type="button" onClick={handleCopy}>
                Copy summary
              </button>
              {copyState === "copied" && <span className="small-text">Copied to clipboard.</span>}
              {copyState === "error" && (
                <span className="error-text">Copy unavailable on this browser.</span>
              )}
            </div>
          </div>

          <div className="status-grid" style={{ marginTop: "1rem" }}>
            {evaluationEntries.map(([metric, evaluation]) => (
              <div key={metric}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.35rem" }}>
                  <strong>{METRIC_LABELS[metric] ?? metric}</strong>
                  <RAGChip status={evaluation.status} />
                </div>
                <p className="small-text" style={{ margin: 0 }}>{evaluation.reason}</p>
              </div>
            ))}
          </div>

          <div className="summary-box" role="status" aria-live="polite">
            <strong>Encounter summary:</strong>
            <p style={{ margin: "0.5rem 0 0" }}>{result.summary}</p>
            <p style={{ margin: "0.5rem 0 0" }}>Calculated QTc: <strong>{result.QTc_ms} ms</strong>.</p>
          </div>

          {result.notes && result.notes.length > 0 && (
            <div style={{ marginTop: "1rem" }}>
              <strong>FYI</strong>
              <ul>
                {result.notes.map((note) => (
                  <li key={note} className="small-text">
                    {note}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
};

export default GuardRailForm;
