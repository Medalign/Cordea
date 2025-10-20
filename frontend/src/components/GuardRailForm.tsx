import React, { useMemo, useState } from "react";
import { scoreGuardrail } from "../api/client";
import type { IntervalSet, MetricEval, ScoreRequest, ScoreResponse } from "../api/types";
import { AGE_BAND_OPTIONS, QTC_METHOD_OPTIONS, SEX_OPTIONS } from "../content/options";
import { demoGuardRailAdult, demoGuardRailChild } from "../content/demoCases";
import RAGChip from "./RAGChip";

type IntervalKey = keyof IntervalSet;
type MetricKey = keyof ScoreResponse["evaluations"];

type IntervalInputs = Record<IntervalKey, string>;

type FormState = {
  age_band: ScoreRequest["age_band"];
  sex: ScoreRequest["sex"];
  qtc_method: ScoreRequest["qtc_method"];
  intervals: IntervalInputs;
};

const INTERVAL_KEYS: IntervalKey[] = ["HR_bpm", "PR_ms", "QRS_ms", "QT_ms", "RR_ms"];

const INTERVAL_LABELS: Record<IntervalKey, string> = {
  HR_bpm: "Heart rate (bpm)",
  PR_ms: "PR interval (ms)",
  QRS_ms: "QRS duration (ms)",
  QT_ms: "QT interval (ms)",
  RR_ms: "RR interval (ms)",
};

const METRIC_LABELS: Record<MetricKey, string> = {
  HR_bpm: "Heart rate (bpm)",
  PR_ms: "PR interval (ms)",
  QRS_ms: "QRS duration (ms)",
  QT_ms: "QT interval (ms)",
  RR_ms: "RR interval (ms)",
  QTc_ms: "QTc (ms)",
};

const toFormState = (demo: ScoreRequest): FormState => ({
  age_band: demo.age_band,
  sex: demo.sex,
  qtc_method: demo.qtc_method,
  intervals: INTERVAL_KEYS.reduce((acc, key) => {
    return { ...acc, [key]: demo.intervals[key] != null ? String(demo.intervals[key]) : "" };
  }, {} as IntervalInputs),
});

const GuardRailForm: React.FC = () => {
  const [form, setForm] = useState<FormState>(() => toFormState(demoGuardRailAdult));
  const [result, setResult] = useState<ScoreResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [invalidFields, setInvalidFields] = useState<Set<IntervalKey>>(new Set());
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

  const evaluationEntries = useMemo(() => {
    if (!result) return [] as Array<[MetricKey, MetricEval]>;
    return (Object.entries(result.evaluations) as Array<[MetricKey, MetricEval | undefined]>)
      .filter(([, value]) => Boolean(value))
      .map(([metric, value]) => [metric, value!] as [MetricKey, MetricEval]);
  }, [result]);

  const updateField = (key: keyof Omit<FormState, "intervals">, value: string) => {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const updateInterval = (key: IntervalKey, value: string) => {
    setForm((prev) => ({
      ...prev,
      intervals: {
        ...prev.intervals,
        [key]: value,
      },
    }));
    setInvalidFields((prev) => {
      if (!prev.has(key)) {
        return prev;
      }
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  const buildPayload = (): ScoreRequest | null => {
    const missing: IntervalKey[] = [];
    const intervals = {} as IntervalSet;

    for (const key of INTERVAL_KEYS) {
      const raw = form.intervals[key]?.trim();
      if (!raw) {
        missing.push(key);
        continue;
      }
      const numeric = Number(raw);
      if (!Number.isFinite(numeric)) {
        missing.push(key);
        continue;
      }
      intervals[key] = numeric;
    }

    if (missing.length > 0) {
      setInvalidFields(new Set(missing));
      setError("Please enter a value for each interval before scoring.");
      return null;
    }

    setInvalidFields(new Set());

    return {
      age_band: form.age_band,
      sex: form.sex,
      qtc_method: form.qtc_method,
      intervals,
    };
  };

  const submitPayload = async (payload: ScoreRequest) => {
    setIsSubmitting(true);
    setError(null);
    setCopyState("idle");
    try {
      const response = await scoreGuardrail(payload);
      setResult(response);
    } catch (err) {
      if (err instanceof Error) {
        setError(`Could not score encounter: ${err.message}`);
      } else {
        setError("Could not score encounter: unexpected error");
      }
      setResult(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const payload = buildPayload();
    if (!payload) {
      return;
    }
    await submitPayload(payload);
  };

  const loadDemo = (demo: ScoreRequest) => {
    setForm(toFormState(demo));
    setResult(null);
    setError(null);
    setInvalidFields(new Set());
    setCopyState("idle");
    void submitPayload(demo);
  };

  const handleCopy = async () => {
    if (!result?.summary) return;
    try {
      await navigator.clipboard.writeText(result.summary);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 2500);
    } catch (err) {
      console.error("Copy failed", err);
      setCopyState("error");
    }
  };

  return (
    <section aria-labelledby="guardrail-heading">
      <div className="section-header">
        <div>
          <h2 id="guardrail-heading">GuardRail — Encounter review</h2>
          <p className="small-text">
            Submit ECG intervals to score the encounter against age- and sex-specific reference ranges.
          </p>
        </div>
        <div className="section-actions">
          <button type="button" onClick={() => loadDemo(demoGuardRailAdult)} disabled={isSubmitting}>
            Load Adult Demo
          </button>
          <button type="button" onClick={() => loadDemo(demoGuardRailChild)} disabled={isSubmitting}>
            Load Paediatric Demo
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="form-grid" style={{ marginTop: "1.5rem" }} noValidate>
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
          {INTERVAL_KEYS.map((key) => (
            <div key={key}>
              <label htmlFor={key}>{INTERVAL_LABELS[key]}</label>
              <input
                id={key}
                type="number"
                inputMode="numeric"
                value={form.intervals[key] ?? ""}
                onChange={(event) => updateInterval(key, event.target.value)}
                className={invalidFields.has(key) ? "input-error" : undefined}
                aria-invalid={invalidFields.has(key)}
                required
              />
            </div>
          ))}
        </div>

        <div className="form-grid two-column">
          <fieldset className="fieldset">
            <legend>QTc method</legend>
            <div className="radio-row">
              {QTC_METHOD_OPTIONS.map((option) => (
                <label key={option.value} className="radio-option">
                  <input
                    type="radio"
                    name="qtc_method"
                    value={option.value}
                    checked={form.qtc_method === option.value}
                    onChange={(event) => updateField("qtc_method", event.target.value)}
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="form-actions">
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
          <div className="section-header" style={{ alignItems: "flex-start" }}>
            <div>
              <h3 id="guardrail-results-title">Encounter results</h3>
              <p className="small-text">QTc reported using the {result.method} method.</p>
            </div>
            <div className="section-actions">
              <button type="button" onClick={handleCopy}>
                Copy summary
              </button>
              {copyState === "copied" && <span className="small-text">Copied.</span>}
              {copyState === "error" && <span className="error-text">Copy failed. Try again.</span>}
            </div>
          </div>

          <div className="status-grid" style={{ marginTop: "1rem" }}>
            {evaluationEntries.map(([metric, evaluation]) => (
              <div key={metric}>
                <div className="status-header">
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
              <strong>Additional notes</strong>
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
