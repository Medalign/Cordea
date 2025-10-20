import React, { useEffect, useMemo, useState } from "react";
import { evalTrend } from "../api/client";
import type { TrendPoint, TrendSeriesRequest, TrendSeriesResponse } from "../api/types";
import { TREND_CASES } from "../content/demoCases";

type TrendResult = TrendSeriesResponse & { recordedOn: string };

const toISODate = (date: Date) => date.toISOString().slice(0, 10);
const sortReadings = (points: TrendPoint[]) =>
  [...points].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

const TrendView: React.FC = () => {
  const [selectedCaseId, setSelectedCaseId] = useState<string>(TREND_CASES[0]?.id ?? "");
  const [readings, setReadings] = useState<TrendPoint[]>(TREND_CASES[0]?.readings ?? []);
  const [newValue, setNewValue] = useState<string>("");
  const [newDate, setNewDate] = useState<string>(toISODate(new Date()));
  const [result, setResult] = useState<TrendResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedCase = useMemo(
    () => TREND_CASES.find((item) => item.id === selectedCaseId) ?? TREND_CASES[0],
    [selectedCaseId]
  );

  useEffect(() => {
    if (!selectedCase) return;
    setReadings(sortReadings(selectedCase.readings.map((reading) => ({ ...reading }))));
    setResult(null);
    setError(null);
    setNewValue("");
    setNewDate(toISODate(new Date()));
  }, [selectedCase]);

  if (!selectedCase) {
    return null;
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setResult(null);

    if (!newValue) {
      setError("Enter the new QTc value before submitting.");
      return;
    }

    const valueNumber = Number(newValue);
    if (Number.isNaN(valueNumber)) {
      setError("QTc value must be a number.");
      return;
    }

    const payload: TrendSeriesRequest = {
      age_band: selectedCase.age_band,
      sex: selectedCase.sex,
      readings,
      new_value: valueNumber,
    };

    setIsSubmitting(true);
    try {
      const response = await evalTrend(payload);
      setReadings((prev) => sortReadings([...prev, { date: newDate, value: valueNumber }]));
      setResult({ ...response, recordedOn: newDate });
      setNewValue("");
      setNewDate(toISODate(new Date()));
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Unable to evaluate the new reading right now.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const chartData = useMemo(() => {
    const combined = readings;
    if (combined.length === 0) {
      return null;
    }
    const timestamps = combined.map((point) => new Date(point.date).getTime());
    const minTime = Math.min(...timestamps);
    const maxTime = Math.max(...timestamps);

    const values = combined.map((point) => point.value);
    const bandValues = [selectedCase.bands.p50, selectedCase.bands.p90, selectedCase.bands.p99];
    const minValue = Math.min(...values, ...bandValues) - 10;
    const maxValue = Math.max(...values, ...bandValues) + 10;

    const rangeTime = maxTime - minTime;
    const rangeValue = maxValue - minValue;

    const width = 640;
    const height = 320;

    const plotWidth = width - 80;
    const plotHeight = height - 40;

    const toX = (time: number) => {
      if (rangeTime === 0) {
        return plotWidth / 2;
      }
      return ((time - minTime) / rangeTime) * plotWidth;
    };
    const toY = (value: number) => {
      if (rangeValue === 0) {
        return plotHeight / 2;
      }
      return plotHeight - ((value - minValue) / rangeValue) * plotHeight;
    };

    const polylinePoints = combined
      .map((point) => {
        const x = toX(new Date(point.date).getTime());
        const y = toY(point.value);
        return `${x},${y}`;
      })
      .join(" ");

    const latestPoint = combined[combined.length - 1];

    return {
      width,
      height,
      plotWidth,
      plotHeight,
      toX,
      toY,
      polylinePoints,
      latestPoint: {
        x: toX(new Date(latestPoint.date).getTime()),
        y: toY(latestPoint.value),
      },
      minValue,
      maxValue,
      minTime,
      maxTime,
    };
  }, [readings, selectedCase]);

  return (
    <section aria-labelledby="trendview-heading">
      <h2 id="trendview-heading">TrendView — Serial QTc monitoring</h2>
      <p className="small-text">
        Track the latest QTc reading against percentile bands and surface any material change from
        the baseline values recorded for this case.
      </p>

      <div className="card" style={{ marginTop: "1rem" }}>
        <div className="form-grid">
          <div>
            <label htmlFor="case">Demo patient</label>
            <select
              id="case"
              value={selectedCaseId}
              onChange={(event) => setSelectedCaseId(event.target.value)}
            >
              {TREND_CASES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
            <p className="small-text" style={{ marginTop: "0.5rem" }}>
              {selectedCase.description}
            </p>
          </div>
        </div>

        <div className="table-container">
          <table aria-label="Existing QTc readings">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">QTc (ms)</th>
              </tr>
            </thead>
            <tbody>
              {readings.map((reading, index) => (
                <tr key={`${reading.date}-${index}`}>
                  <td>{reading.date}</td>
                  <td>{reading.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <form onSubmit={handleSubmit} className="form-grid two-column" style={{ marginTop: "1.5rem" }}>
          <div>
            <label htmlFor="newDate">Reading date</label>
            <input
              id="newDate"
              type="date"
              value={newDate}
              max={toISODate(new Date())}
              onChange={(event) => setNewDate(event.target.value)}
            />
          </div>
          <div>
            <label htmlFor="newValue">New QTc (ms)</label>
            <input
              id="newValue"
              type="number"
              inputMode="numeric"
              value={newValue}
              onChange={(event) => setNewValue(event.target.value)}
              placeholder="e.g. 485"
              min={0}
            />
          </div>
          <div
            style={{
              gridColumn: "1 / -1",
              display: "flex",
              gap: "1rem",
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Submitting…" : "Evaluate new reading"}
            </button>
            {error && <span className="error-text">{error}</span>}
          </div>
        </form>

        {result && (
          <div className="summary-box">
            <strong>Latest assessment:</strong>
            <p style={{ margin: "0.5rem 0 0" }}>{result.message}</p>
            <p style={{ margin: "0.5rem 0 0" }}>
              Recorded on <strong>{result.recordedOn}</strong>; change from baseline:
              <strong> {result.delta_ms} ms</strong> (band: <strong>{result.band}</strong>).
            </p>
          </div>
        )}
      </div>

      {chartData && (
        <div className="chart-container">
          <div className="chart-legend">
            <div className="legend-item">
              <span className="legend-swatch" style={{ backgroundColor: "#1f8ad1" }} />
              <span>Recorded QTc</span>
            </div>
            <div className="legend-item">
              <span className="legend-swatch" style={{ backgroundColor: "#94b6d5" }} />
              <span>P50</span>
            </div>
            <div className="legend-item">
              <span className="legend-swatch" style={{ backgroundColor: "#f5b400" }} />
              <span>P90</span>
            </div>
            <div className="legend-item">
              <span className="legend-swatch" style={{ backgroundColor: "#d9534f" }} />
              <span>P99</span>
            </div>
          </div>
          <svg
            role="img"
            aria-label="QTc trend chart"
            width={chartData.width}
            height={chartData.height}
            style={{ maxWidth: "100%", background: "#ffffff", borderRadius: "12px", border: "1px solid #dde3ea" }}
          >
            <g transform="translate(40,20)">
              <rect
                x={0}
                y={0}
                width={chartData.plotWidth}
                height={chartData.plotHeight}
                fill="#f9fbfd"
                rx={8}
              />
              {([selectedCase.bands.p50, selectedCase.bands.p90, selectedCase.bands.p99] as const).map(
                (bandValue, index) => {
                  const colors = ["#94b6d5", "#f5b400", "#d9534f"] as const;
                  const y = chartData.toY(bandValue);
                  return (
                    <g key={`${bandValue}-${index}`}>
                      <line
                        x1={0}
                        x2={chartData.plotWidth}
                        y1={y}
                        y2={y}
                        stroke={colors[index]}
                        strokeDasharray="6 6"
                        strokeWidth={1.5}
                      />
                      <text
                        x={chartData.plotWidth - 4}
                        y={y - 6}
                        fill={colors[index]}
                        fontSize="12"
                        textAnchor="end"
                      >
                        P{index === 0 ? 50 : index === 1 ? 90 : 99}
                      </text>
                    </g>
                  );
                }
              )}
              <polyline fill="none" stroke="#1f8ad1" strokeWidth={2.5} points={chartData.polylinePoints} />
              <circle
                cx={chartData.latestPoint.x}
                cy={chartData.latestPoint.y}
                r={5}
                fill="#1f8ad1"
                stroke="#0b3d60"
                strokeWidth={1.5}
              />
              <line
                x1={0}
                x2={chartData.plotWidth}
                y1={chartData.plotHeight}
                y2={chartData.plotHeight}
                stroke="#b8c4d1"
              />
              <line x1={0} x2={0} y1={0} y2={chartData.plotHeight} stroke="#b8c4d1" />
              <text x={0} y={chartData.plotHeight + 20} fill="#3d5467" fontSize="12">
                {new Date(chartData.minTime).toLocaleDateString()}
              </text>
              <text
                x={chartData.plotWidth}
                y={chartData.plotHeight + 20}
                fill="#3d5467"
                fontSize="12"
                textAnchor="end"
              >
                {new Date(chartData.maxTime).toLocaleDateString()}
              </text>
              <text x={0} y={-6} fill="#3d5467" fontSize="12">
                {Math.round(chartData.maxValue)} ms
              </text>
              <text
                x={0}
                y={chartData.plotHeight}
                fill="#3d5467"
                fontSize="12"
                dy={16}
              >
                {Math.round(chartData.minValue)} ms
              </text>
            </g>
          </svg>
        </div>
      )}
    </section>
  );
};

export default TrendView;
