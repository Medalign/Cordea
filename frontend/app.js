// ==== Robust API client + UI for Cordea (vanilla JS) ====

class ApiError extends Error {
  constructor(message, { status, statusText, detail } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.statusText = statusText;
    this.detail = detail;
  }
}

const DEFAULT_API_BASE = "http://127.0.0.1:8000";
const STORAGE_KEY = "cordeaApiBase";

document.title = "Cordea — Patient Review & Patient Trends";

// ----- DOM lookups -----
const healthChip = document.getElementById("health-chip");
const healthRetryBtn = document.getElementById("health-retry");
const apiBaseInput = document.getElementById("api-base-input");
const apiBasePill = document.getElementById("api-base-pill");
const backendBanner = document.getElementById("backend-warning");

// Patient Review DOM
const guardrailForm = document.getElementById("guardrail-form");
const guardrailSubmit = document.getElementById("guardrail-submit");
const guardrailAdultDemo = document.getElementById("guardrail-demo-adult");
const guardrailPaedsDemo = document.getElementById("guardrail-demo-paeds");
const guardrailError = document.getElementById("guardrail-error");
const guardrailResult = document.getElementById("guardrail-result");
const guardrailRecs = document.getElementById("guardrail-recs");

// Patient Trends DOM
const trendForm = document.getElementById("trend-form");
const trendSubmit = document.getElementById("trend-submit");
const trendError = document.getElementById("trend-error");
const trendResult = document.getElementById("trend-result");
const trendTableBody = document.getElementById("trend-table-body");
const trendAgeSelect = document.getElementById("trend-age-band");
const trendSexSelect = document.getElementById("trend-sex");
const trendDateInput = document.getElementById("trend-date");
const trendQtInput = document.getElementById("trend-qt");
const trendRrInput = document.getElementById("trend-rr");
const chartTooltip = document.getElementById("chart-tooltip");
const trendBandChip = document.getElementById("trend-band-chip");
const trendNarrative = document.getElementById("trend-narrative");

// Keep a reference to plotted points for tooltip hit-tests
let _plottedPoints = []; // {x,y,dateISO, qtc, qt, rr}

// This will mirror the readings we send to the backend
const historicalReadings = [
  { timestamp: "2025-09-01", QT_ms: 430, RR_ms: 1000 },
  { timestamp: "2025-09-10", QT_ms: 440, RR_ms: 1000 },
  { timestamp: "2025-09-20", QT_ms: 438, RR_ms: 1000 }
];

// Latest series with QTc + QT/RR for CSV export
window._latestSeries = [];

let apiBase = loadApiBase();
setApiBaseDisplay(apiBase);
updateTrendTable();

// Init default trend date
if (trendDateInput) {
  try {
    const today = new Date();
    const tzOffset = today.getTimezoneOffset() * 60000;
    trendDateInput.value = new Date(today.getTime() - tzOffset)
      .toISOString()
      .slice(0, 10);
  } catch {
    // ignore
  }
}

// ===== Helpers =====
function normaliseBase(v) {
  if (!v) return DEFAULT_API_BASE;
  let s = String(v).trim();
  if (!s) return DEFAULT_API_BASE;
  if (s.endsWith("/")) s = s.slice(0, -1);
  return s;
}
function loadApiBase() {
  try {
    return normaliseBase(localStorage.getItem(STORAGE_KEY) || DEFAULT_API_BASE);
  } catch {
    return DEFAULT_API_BASE;
  }
}
function setApiBaseDisplay(value) {
  apiBase = normaliseBase(value);
  if (apiBaseInput) apiBaseInput.value = apiBase;
  if (apiBasePill) apiBasePill.textContent = apiBase;
  try {
    localStorage.setItem(STORAGE_KEY, apiBase);
  } catch {
    // ignore
  }
}
function toIsoDate(value) {
  const s = String(value || "").trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); // DD/MM/YYYY
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return s;
}

// Map UI labels to backend enum age bands (norms/percentiles keys)
function mapAgeBandToEnum(label) {
  const L = (label || "")
    .toLowerCase()
    .replace(/\u2013|\u2014/g, "-")
    .trim();

  const table = {
    // Current UI labels
    "18-39 years": "adult_18_39",
    "18–39 years": "adult_18_39",
    "40-64 years": "adult_40_64",
    "40–64 years": "adult_40_64",
    "65+ years": "adult_65_plus",
    "6-12 years": "child_6_12",
    "6–12 years": "child_6_12",

    // Legacy / fallback labels (old UI copies)
    "adult 18-39": "adult_18_39",
    "adult 18–39": "adult_18_39",
    "adult 40-64": "adult_40_64",
    "adult 40–64": "adult_40_64",
    "adult 65+": "adult_65_plus",
    "child 6-12 yrs": "child_6_12",
    "child 6–12 yrs": "child_6_12",
    "child 10-12 yrs": "child_6_12",
    "child 10–12 yrs": "child_6_12"
  };

  return table[L] || label;
}

function labelFromEnum(enumVal) {
  const t = (enumVal || "").toLowerCase();
  if (t === "adult_18_39") return "18–39 years";
  if (t === "adult_40_64") return "40–64 years";
  if (t === "adult_65_plus") return "65+ years";
  if (t === "child_6_12") return "6–12 years";
  return enumVal;
}

function defined(v) {
  return v !== undefined && v !== null && !Number.isNaN(v);
}
function pick(...xs) {
  for (const x of xs) if (defined(x)) return x;
  return null;
}

// Fridericia correction (what the backend uses)
function computeQTcFridericia(QT_ms, RR_ms) {
  if (!defined(QT_ms) || !defined(RR_ms) || RR_ms <= 0) return null;
  const rrSec = RR_ms / 1000;
  return Math.round((QT_ms / Math.cbrt(rrSec)) * 10) / 10;
}

// Percentile label -> severity bucket
function severityFromPercentileLabel(label) {
  const t = String(label || "").toLowerCase();
  if (!t) return "muted";
  if (t.includes(">=99")) return "high";
  if (t.includes("95")) return "high";
  if (t.includes("99th")) return "high";
  if (t.includes("90")) return "borderline";
  if (t.includes("<50")) return "normal";
  if (t.includes("50")) return "borderline";
  return "muted";
}

// GREEN / AMBER / RED -> badge class
function badgeClassFromStatus(status) {
  const s = String(status || "").toUpperCase();
  if (s === "GREEN") return "status-badge status-badge--green";
  if (s === "AMBER") return "status-badge status-badge--amber";
  if (s === "RED") return "status-badge status-badge--red";
  return "status-badge status-badge--muted";
}

// severity bucket -> badge class
function badgeClassFromSeverity(sev) {
  switch (sev) {
    case "high":
      return "status-badge status-badge--red";
    case "borderline":
      return "status-badge status-badge--amber";
    case "normal":
      return "status-badge status-badge--green";
    default:
      return "status-badge status-badge--muted";
  }
}

function renderStatusBadge(statusText) {
  const span = document.createElement("span");
  span.className = badgeClassFromStatus(statusText);
  span.textContent = statusText || "—";
  return span;
}

function renderPercentileBadge(label) {
  const span = document.createElement("span");
  const sev = severityFromPercentileLabel(label);
  span.className = badgeClassFromSeverity(sev);
  span.textContent = label || "—";
  return span;
}

function deltaBadge(delta) {
  const span = document.createElement("span");
  const up = delta > 0;
  const sev = up ? "high" : "normal";
  span.className = badgeClassFromSeverity(sev);
  span.textContent = `${up ? "↑" : "↓"} ${
    delta > 0 ? "+" : ""
  }${delta.toFixed(1)} ms`;
  return span;
}

function formatShortDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso || "—";
  return d.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short"
  });
}

function niceStep(x) {
  const raw = Math.max(1, x);
  if (raw < 15) return 10;
  if (raw < 35) return 25;
  if (raw < 75) return 50;
  return Math.round(raw / 50) * 50;
}

// ===== API =====
async function checkHealth() {
  setHealthStatus("checking", "API: Checking…");
  if (healthRetryBtn) healthRetryBtn.disabled = true;
  const url = `${normaliseBase(apiBase)}/healthz`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    setHealthStatus("green", "API: Green");
    hide(backendBanner);
  } catch {
    setHealthStatus("red", "API: Red");
  } finally {
    if (healthRetryBtn) healthRetryBtn.disabled = false;
  }
}

function setHealthStatus(state, label) {
  if (!healthChip) return;
  healthChip.textContent = label;
  let cls = "status-badge ";
  if (state === "green") cls += "status-badge--green";
  else if (state === "red") cls += "status-badge--red";
  else cls += "status-badge--muted";
  healthChip.className = cls;
}

async function jsonPost(path, body) {
  const url = `${normaliseBase(apiBase)}${path}`;
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  } catch (error) {
    throw new ApiError(`Network error: ${error.message}`, {
      detail: error.message
    });
  }
  const ct = response.headers.get("content-type") || "";
  const parse = async () =>
    ct.includes("application/json") ? response.json() : response.text();
  const data = await parse();
  if (!response.ok) {
    throw new ApiError(
      typeof data === "string"
        ? data
        : data?.detail ?? `${response.status} ${response.statusText}`,
      { status: response.status, statusText: response.statusText, detail: data }
    );
  }
  return data;
}

// ===== Patient Review – Demo buttons =====
if (guardrailAdultDemo) {
  guardrailAdultDemo.addEventListener("click", () => {
    fillGuardrailForm({
      age_band: "adult_65_plus",
      sex: "male",
      HR_bpm: 72,
      PR_ms: 160,
      QRS_ms: 92,
      QT_ms: 380,
      RR_ms: 830,
      qtc_method: "fridericia"
    });
  });
}
if (guardrailPaedsDemo) {
  guardrailPaedsDemo.addEventListener("click", () => {
    fillGuardrailForm({
      age_band: "child_6_12",
      sex: "female",
      HR_bpm: 110,
      PR_ms: 130,
      QRS_ms: 80,
      QT_ms: 340,
      RR_ms: 545,
      qtc_method: "fridericia"
    });
  });
}

// ===== Patient Review – Submit =====
if (guardrailForm && guardrailSubmit) {
  guardrailForm.addEventListener("submit", async event => {
    event.preventDefault();
    clearMsg(guardrailError);

    const hr = Number(guardrailForm.heart_rate.value);
    const pr = Number(guardrailForm.PR_ms.value);
    const qrs = Number(guardrailForm.QRS_ms.value);
    const qt = Number(guardrailForm.QT_ms.value);
    const rr = Number(guardrailForm.RR_ms.value);

    if (!(hr > 0 && pr > 0 && qrs > 0 && qt > 0 && rr > 0)) {
      return showMsg(
        guardrailError,
        "Please enter all intervals as positive numbers."
      );
    }

    const payload = {
      age_band: mapAgeBandToEnum(guardrailForm.age_band.value),
      sex: guardrailForm.sex.value,
      // Backend expects HR_bpm, not heart_rate
      intervals: {
        HR_bpm: hr,
        PR_ms: pr,
        QRS_ms: qrs,
        QT_ms: qt,
        RR_ms: rr
      },
      // For now the backend only supports Fridericia
      qtc_method: "fridericia"
    };

    try {
      setBusy(guardrailSubmit, true);
      const result = await jsonPost("/guardrail/score", payload);
      renderGuardrailResult(result, payload);
      hide(backendBanner);
    } catch (err) {
      showMsg(guardrailError, extractErrorMessage(err));
    } finally {
      setBusySuccess(guardrailSubmit);
    }
  });
}

function fillGuardrailForm(v) {
  if (!guardrailForm) return;
  guardrailForm.age_band.value = labelFromEnum(v.age_band);
  guardrailForm.sex.value = v.sex;
  guardrailForm.heart_rate.value = v.HR_bpm;
  guardrailForm.PR_ms.value = v.PR_ms;
  guardrailForm.QRS_ms.value = v.QRS_ms;
  guardrailForm.QT_ms.value = v.QT_ms;
  guardrailForm.RR_ms.value = v.RR_ms;
  const radios = [
    ...guardrailForm.querySelectorAll('input[name="qtc_method"]')
  ];
  radios.forEach(r => {
    // UI can still show Bazett vs Fridericia, but backend uses Fridericia only.
    r.checked = r.value === "fridericia";
  });
}

// ===== Patient Review – Render =====
function renderGuardrailResult(result, payload) {
  clearContainer(guardrailResult);
  if (!result || typeof result !== "object") return;

  const computed = result.computed ?? {};
  const qtc = defined(computed.QTc_ms) ? computed.QTc_ms : null;
  const band = computed.percentile || null;
  const refv = computed.ref_version || null;

  const card = document.createElement("article");
  card.className = "result-card";

  const header = document.createElement("div");
  header.className = "result-header";
  const h3 = document.createElement("h3");
  h3.textContent = "Assessment";
  header.appendChild(h3);
  header.appendChild(renderPercentileBadge(band || "—"));
  card.appendChild(header);

  const headline = document.createElement("p");
  headline.className = "result-summary";
  const sex = (payload?.sex || "").toLowerCase();
  const ageLabel = labelFromEnum(payload?.age_band);

  if (defined(qtc) && band) {
    const sev = severityFromPercentileLabel(band);
    let word = "Normal";
    if (sev === "high") word = "Prolonged";
    else if (sev === "borderline") word = "Borderline";
    headline.textContent = `${word} QTc for ${ageLabel} ${sex} — ${qtc} ms (${band}).`;
  } else if (defined(qtc)) {
    headline.textContent = `Computed QTc ${qtc} ms for ${ageLabel} ${sex}.`;
  } else {
    headline.textContent = "No QTc computed — missing or invalid intervals.";
  }
  card.appendChild(headline);

  // Key metrics
  const grid = document.createElement("div");
  grid.className = "kv-grid";
  grid.appendChild(kvItem("QTc (ms)", defined(qtc) ? qtc : "—"));
  grid.appendChild(kvItem("Percentile", band || "—"));
  grid.appendChild(kvItem("Reference pack", refv || "—"));
  card.appendChild(grid);

  // Assessments table
  const assessments = Array.isArray(result.assessments)
    ? result.assessments
    : [];
  if (assessments.length) {
    const t = document.createElement("table");
    t.className = "assess-table";
    t.innerHTML =
      "<thead><tr><th>Parameter</th><th>Status</th><th>Rationale</th></tr></thead><tbody></tbody>";
    const tb = t.querySelector("tbody");

    assessments.forEach((row, idx) => {
      const status = row?.status || (typeof row === "string" ? row : "—");
      const parameter =
        row?.metric ||
        row?.parameter ||
        ["HR_bpm", "PR_ms", "QRS_ms", "QTc_ms"][idx] ||
        "—";
      const rationale =
        row?.rationale ||
        row?.reason ||
        (status === "GREEN"
          ? "Within reference range for this age/sex band."
          : status === "AMBER"
          ? "Near the edge of the reference range — interpret in clinical context."
          : status === "RED"
          ? "Outside reference range — review in context."
          : "—");

      const tr = document.createElement("tr");
      const tdP = document.createElement("td");
      tdP.textContent = parameter;
      const tdS = document.createElement("td");
      tdS.appendChild(renderStatusBadge(status));
      const tdR = document.createElement("td");
      tdR.textContent = rationale;
      tr.append(tdP, tdS, tdR);
      tb.appendChild(tr);
    });

    card.appendChild(t);
  }

  guardrailResult.appendChild(card);

  // Dynamic recommendations (aligned with QTc risk concepts)
  if (guardrailRecs) {
    const qtcAssessment = assessments.find(a => a.metric === "QTc_ms");
    const qtcStatus = qtcAssessment?.status || null;
    const sev = severityFromPercentileLabel(band);
    const highRiskQtc = defined(qtc) && qtc >= 500;

    let items = [];

    if (highRiskQtc || sev === "high") {
      items = [
        "Treat QTc as high-risk — check and correct K⁺/Mg²⁺ urgently.",
        "Review and rationalise QT-prolonging medications; avoid stacking.",
        "Arrange repeat ECG and escalate as per local arrhythmia / cardiology pathways.",
        "Ensure this is clearly documented in the clinical record."
      ];
    } else if (qtcStatus === "RED" || qtcStatus === "AMBER") {
      items = [
        "QTc is at or beyond the upper reference limit — interpret with symptoms and comorbidities.",
        "Review medication list for QT-prolonging agents and consider dose changes or alternatives.",
        "Repeat ECG if the clinical picture changes or new drugs are added.",
        "Document the finding and communicate to the responsible clinician."
      ];
    } else {
      items = [
        "QTc is within the reference range for this demographic.",
        "No interval-based red flags identified from this single reading.",
        "Document the ECG review and continue routine follow-up as per local policy."
      ];
    }

    guardrailRecs.innerHTML = `
      <h4>Recommendations</h4>
      <ul>${items.map(li => `<li>${li}</li>`).join("")}</ul>
    `;
  }

  if (result.red_flags && result.red_flags.length) {
    const p = document.createElement("p");
    p.innerHTML =
      "Red-flag rules fired (demo only): " +
      result.red_flags.map(x => `<strong>${x}</strong>`).join(", ");
    card.appendChild(p);
  }

  const small = document.createElement("p");
  small.className = "muted";
  small.textContent =
    result.disclaimer ||
    "DEMONSTRATION ONLY — SYNTHETIC DATA — NOT FOR CLINICAL USE.";
  card.appendChild(small);
}

function kvItem(k, v) {
  const wrap = document.createElement("div");
  wrap.className = "kv-item";
  const kk = document.createElement("div");
  kk.className = "kv-key";
  kk.textContent = k;
  const vv = document.createElement("div");
  vv.className = "kv-val";
  vv.textContent = String(v);
  wrap.appendChild(kk);
  wrap.appendChild(vv);
  return wrap;
}

// ===== Patient Trends – Table + Submit =====
function updateTrendTable() {
  if (!trendTableBody) return;
  clearContainer(trendTableBody);
  historicalReadings.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${formatShortDate(
      r.timestamp
    )}</td><td>${r.QT_ms}</td><td>${r.RR_ms}</td>`;
    trendTableBody.appendChild(tr);
  });
}

if (trendForm && trendSubmit) {
  trendForm.addEventListener("submit", async event => {
    event.preventDefault();
    clearMsg(trendError);

    const timestamp = toIsoDate((trendDateInput.value || "").trim());
    const qt = Number(trendQtInput.value);
    const rr = Number(trendRrInput.value);

    if (!timestamp || !(qt > 0) || !(rr > 0)) {
      return showMsg(
        trendError,
        "Enter a reading date plus QT (ms) and RR (ms)."
      );
    }

    // Add new reading into local history and keep it sorted
    historicalReadings.push({ timestamp, QT_ms: qt, RR_ms: rr });
    historicalReadings.sort(
      (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
    );
    updateTrendTable();

    const payload = {
      age_band: mapAgeBandToEnum(trendAgeSelect.value),
      sex: trendSexSelect.value,
      qtc_method: "fridericia",
      readings: historicalReadings.map(r => ({
        timestamp: r.timestamp,
        QT_ms: r.QT_ms,
        RR_ms: r.RR_ms
      }))
    };

    try {
      setBusy(trendSubmit, true);
      const result = await jsonPost("/trend/series", payload);
      renderTrendResult(payload, result);
      hide(backendBanner);
    } catch (err) {
      showMsg(trendError, extractErrorMessage(err));
    } finally {
      setBusySuccess(trendSubmit);
    }
  });
}

// ===== Patient Trends – Render + Chart =====
function renderTrendResult(payload, result) {
  clearContainer(trendResult);
  if (!result || typeof result !== "object") return;
  const seriesFromApi = Array.isArray(result.series) ? result.series : [];
  if (!seriesFromApi.length) return;

  // Build lookup: timestamp -> QT/RR from payload
  const readingByTs = {};
  if (Array.isArray(payload.readings)) {
    payload.readings.forEach(r => {
      const key = toIsoDate(r.timestamp);
      readingByTs[key] = {
        QT_ms: r.QT_ms,
        RR_ms: r.RR_ms
      };
    });
  }

  const series = seriesFromApi.map(p => {
    const key = toIsoDate(p.timestamp);
    const base = readingByTs[key] || {};
    return {
      timestamp: key,
      QTc_ms: Number(p.QTc_ms),
      percentile: p.percentile || null,
      QT_ms: base.QT_ms ?? null,
      RR_ms: base.RR_ms ?? null
    };
  });

  if (!series.length) return;
  window._latestSeries = series;

  const latest = series[series.length - 1];
  const prev = series.length >= 2 ? series[series.length - 2] : null;
  const delta =
    latest && prev && defined(latest.QTc_ms) && defined(prev.QTc_ms)
      ? Math.round((latest.QTc_ms - prev.QTc_ms) * 10) / 10
      : null;

  const recordedOn = latest.timestamp || "—";
  const latestQt = latest.QTc_ms;
  const bandLabel = latest.percentile || "—";
  const sev = severityFromPercentileLabel(bandLabel);
  const highRisk = defined(latestQt) && latestQt >= 500;

  const card = document.createElement("article");
  card.className = "result-card";

  const grid = document.createElement("div");
  grid.className = "kv-grid";
  grid.appendChild(kvItem("Recorded on", recordedOn));
  grid.appendChild(kvItem("Δ QTc (ms)", defined(delta) ? delta : "—"));
  grid.appendChild(
    kvItem("Latest QTc (ms)", defined(latestQt) ? latestQt.toFixed(1) : "—")
  );
  card.appendChild(grid);

  // Replace Δ tile with an up/down badge if we have a delta
  const deltaTile = grid.childNodes[1]?.querySelector(".kv-val");
  if (deltaTile && defined(delta)) {
    deltaTile.textContent = "";
    deltaTile.appendChild(deltaBadge(Number(delta)));
  }

  // Percentile chip + narrative
  if (trendBandChip) {
    trendBandChip.className = badgeClassFromSeverity(sev);
    trendBandChip.textContent = bandLabel;
  }
  if (trendNarrative) {
    if (!defined(latestQt)) {
      trendNarrative.textContent = "QTc could not be derived from the inputs.";
    } else {
      const absDelta = defined(delta) ? Math.abs(delta).toFixed(1) : null;
      const dir =
        defined(delta) && delta > 0
          ? "increased"
          : defined(delta) && delta < 0
          ? "decreased"
          : "changed";
      const trendBit =
        defined(delta) && delta !== 0
          ? `QTc has ${dir} by ${absDelta} ms since the last reading. `
          : "";

      if (highRisk) {
        trendNarrative.textContent = `${trendBit}Current QTc (${latestQt.toFixed(
          1
        )} ms, ${bandLabel}) sits in a high-risk range. Check electrolytes, review QT-prolonging drugs, and escalate according to local policy.`;
      } else if (sev === "high" || sev === "borderline") {
        trendNarrative.textContent = `${trendBit}Current QTc (${latestQt.toFixed(
          1
        )} ms, ${bandLabel}) is at or near the upper reference limit. Consider repeat ECG after medication or electrolyte changes.`;
      } else {
        trendNarrative.textContent = `${trendBit}Current QTc (${latestQt.toFixed(
          1
        )} ms, ${bandLabel}) is within the reference band for this demographic. Continue to trend rather than rely on a single snapshot.`;
      }
    }
  }

  // Chart block
  const wrap = document.createElement("div");
  wrap.className = "chart-wrap";
  const canvasWrap = document.createElement("div");
  canvasWrap.className = "canvas-wrap";
  wrap.appendChild(canvasWrap);

  const canvas = document.createElement("canvas");
  canvas.id = "trend-canvas";
  canvasWrap.appendChild(canvas);
  if (chartTooltip) canvasWrap.appendChild(chartTooltip);

  card.appendChild(wrap);
  trendResult.appendChild(card);

  // Extract percentile bands from response for the shaded areas
  const bands = result.bands || {};
  const bandValues = {
    p50: Array.isArray(bands.p50) && bands.p50[0] ? bands.p50[0].y : null,
    p90: Array.isArray(bands.p90) && bands.p90[0] ? bands.p90[0].y : null,
    p99: Array.isArray(bands.p99) && bands.p99[0] ? bands.p99[0].y : null
  };

  drawTrendChart(canvas, series, bandValues);
  installChartTooltip(canvas);
}

function drawTrendChart(canvas, series, bandValues) {
  if (!canvas || !Array.isArray(series) || !series.length) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const DPR = window.devicePixelRatio || 1;
  const Wcss = canvas.clientWidth || 720;
  const Hcss = 300;
  canvas.width = Math.floor(Wcss * DPR);
  canvas.height = Math.floor(Hcss * DPR);
  canvas.style.width = Wcss + "px";
  canvas.style.height = Hcss + "px";
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

  const parseT = s => new Date(s).getTime();
  const pts = series
    .map(p => ({
      ...p,
      t: parseT(p.timestamp),
      q: p.QTc_ms
    }))
    .filter(p => Number.isFinite(p.t) && defined(p.q))
    .sort((a, b) => a.t - b.t);
  if (!pts.length) return;

  const padL = 48,
    padR = 16,
    padT = 32,
    padB = 36;
  const W = Wcss,
    H = Hcss;

  const qVals = pts.map(p => p.q);
  const tVals = pts.map(p => p.t);
  const minQ = Math.min(...qVals) - 10;
  const maxQ = Math.max(...qVals) + 10;
  const minT = Math.min(...tVals);
  const maxT = Math.max(...tVals);

  const x = t =>
    padL +
    ((W - padL - padR) * (t - minT)) / Math.max(1, maxT - minT);
  const y = q =>
    H -
    padB -
    ((H - padT - padB) * (q - minQ)) / Math.max(1, maxQ - minQ);
  const plotRect = {
    x: padL,
    y: padT,
    w: W - padL - padR,
    h: H - padT - padB
  };

  ctx.clearRect(0, 0, W, H);

  // Shaded percentile bands from backend
  const yBands = {};
  if (bandValues && typeof bandValues === "object") {
    if (defined(bandValues.p50)) yBands.yP50 = y(bandValues.p50);
    if (defined(bandValues.p90)) yBands.yP90 = y(bandValues.p90);
    if (defined(bandValues.p99)) yBands.yP99 = y(bandValues.p99);
  }
  if (
    defined(yBands.yP50) ||
    defined(yBands.yP90) ||
    defined(yBands.yP99)
  ) {
    drawBands(ctx, plotRect, yBands);
  }

  // Axes
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, H - padB);
  ctx.lineTo(W - padR, H - padB);
  ctx.stroke();

  // Y ticks
  ctx.fillStyle = "#64748b";
  ctx.font =
    "12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto";
  const step = niceStep((maxQ - minQ) / 5);
  for (
    let q = Math.ceil(minQ / step) * step;
    q <= maxQ;
    q += step
  ) {
    const yy = y(q);
    ctx.strokeStyle = "#e2e8f0";
    ctx.beginPath();
    ctx.moveTo(padL, yy);
    ctx.lineTo(W - padR, yy);
    ctx.stroke();
    ctx.fillText(Math.round(q), 8, yy + 4);
  }

  // X ticks (dates)
  const tickCount = Math.min(pts.length, 6);
  for (let i = 0; i < tickCount; i++) {
    const j = Math.round(
      (i * (pts.length - 1)) / (tickCount - 1 || 1)
    );
    const label = formatShortDate(pts[j].timestamp);
    const xx = x(pts[j].t);
    ctx.fillText(label, xx - 18, H - padB + 22);
  }

  // Title + legend
  ctx.fillStyle = "#111827";
  ctx.font =
    "600 14px system-ui, -apple-system, Segoe UI, Roboto";
  ctx.fillText(
    "QTc Trend — Fridericia",
    plotRect.x,
    plotRect.y - 8
  );

  const legendItems = [
    { label: "QTc (ms)", swatch: "#2563eb" },
    { label: "Percentile bands", swatch: "#94a3b8" }
  ];
  let lx = plotRect.x + plotRect.w - 220;
  const ly = plotRect.y - 12;
  legendItems.forEach((item, idx) => {
    const xPos = lx + idx * 110;
    ctx.fillStyle = item.swatch;
    ctx.fillRect(xPos, ly - 8, 12, 8);
    ctx.fillStyle = "#374151";
    ctx.font =
      "12px system-ui, -apple-system, Segoe UI, Roboto";
    ctx.fillText(item.label, xPos + 16, ly);
  });

  // Line
  ctx.strokeStyle = "#2563eb";
  ctx.lineWidth = 2;
  ctx.beginPath();
  pts.forEach((p, i) => {
    const px = x(p.t);
    const py = y(p.q);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();

  // Points + highlight last
  _plottedPoints = [];
  pts.forEach((p, i) => {
    const px = x(p.t);
    const py = y(p.q);
    _plottedPoints.push({
      x: px,
      y: py,
      dateISO: p.timestamp,
      qtc: p.q,
      qt: p.QT_ms,
      rr: p.RR_ms
    });
    ctx.beginPath();
    ctx.arc(px, py, i === pts.length - 1 ? 4 : 3, 0, Math.PI * 2);
    ctx.fillStyle =
      i === pts.length - 1 ? "#1d4ed8" : "#2563eb";
    ctx.fill();
    if (i === pts.length - 1) {
      ctx.fillStyle = "#111827";
      ctx.font =
        "12px system-ui, -apple-system, Segoe UI, Roboto";
      ctx.fillText(`${p.q.toFixed(1)} ms`, px + 6, py - 6);
    }
  });
}

function drawBands(ctx, plot, bands) {
  ctx.save();
  // Normal band (<= p50)
  if (defined(bands.yP50)) {
    ctx.fillStyle = "rgba(34,197,94,.10)";
    ctx.fillRect(
      plot.x,
      bands.yP50,
      plot.w,
      plot.y + plot.h - bands.yP50
    );
  }
  // Borderline band (p50–p90)
  if (defined(bands.yP90) && defined(bands.yP50)) {
    ctx.fillStyle = "rgba(245,158,11,.10)";
    ctx.fillRect(
      plot.x,
      bands.yP90,
      plot.w,
      bands.yP50 - bands.yP90
    );
  }
  // High-risk band (p90–p99)
  if (defined(bands.yP99) && defined(bands.yP90)) {
    ctx.fillStyle = "rgba(249,115,22,.12)";
    ctx.fillRect(
      plot.x,
      bands.yP99,
      plot.w,
      bands.yP90 - bands.yP99
    );
  }
  ctx.restore();
}

function installChartTooltip(canvas) {
  if (!canvas || !chartTooltip) return;
  const rectFor = () => canvas.getBoundingClientRect();

  canvas.addEventListener("mousemove", e => {
    if (!_plottedPoints.length) return;
    const rect = rectFor();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    let best = null;
    let bestDist = 9999;

    for (const pt of _plottedPoints) {
      const dx = mx - pt.x;
      const dy = my - pt.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestDist && d2 < 64) {
        best = pt;
        bestDist = d2;
      }
    }

    if (best) {
      chartTooltip.style.display = "block";
      chartTooltip.style.left = `${best.x}px`;
      chartTooltip.style.top = `${best.y}px`;
      chartTooltip.innerHTML = `
        <div><strong>${formatShortDate(
          best.dateISO
        )}</strong></div>
        <div>QTc: ${
          best.qtc?.toFixed ? best.qtc.toFixed(1) : best.qtc
        } ms</div>
        <div>QT: ${defined(best.qt) ? best.qt : "—"} ms</div>
        <div>RR: ${defined(best.rr) ? best.rr : "—"} ms</div>`;
    } else {
      chartTooltip.style.display = "none";
    }
  });

  canvas.addEventListener("mouseleave", () => {
    chartTooltip.style.display = "none";
  });
}

// ===== Utils (render + messaging) =====
function clearContainer(el) {
  if (!el) return;
  while (el.firstChild) el.removeChild(el.firstChild);
}
function show(el) {
  if (el) el.classList.remove("hide");
}
function hide(el) {
  if (el) el.classList.add("hide");
}

function setBusy(btn, isBusy) {
  if (!btn) return;
  if (!btn.dataset.idle) btn.dataset.idle = btn.textContent;
  btn.disabled = isBusy;
  btn.textContent = isBusy ? "Working…" : btn.dataset.idle;
}
function setBusySuccess(btn, successLabel = "✓ Complete", revertMs = 1200) {
  if (!btn) return;
  const idle = btn.dataset.idle || btn.textContent || "Evaluate";
  btn.classList.add("success");
  btn.textContent = successLabel;
  setTimeout(() => {
    btn.classList.remove("success");
    btn.disabled = false;
    btn.textContent = idle;
  }, revertMs);
}

function extractErrorMessage(error) {
  if (error instanceof ApiError) {
    const d = error.detail;
    if (d && typeof d === "object") {
      try {
        return JSON.stringify(d);
      } catch {
        return error.message;
      }
    }
    return error.detail ? String(error.detail) : error.message;
  }
  return (error && error.message) || "Unexpected error.";
}
function showMsg(el, msg) {
  if (el) {
    el.textContent = msg;
    show(el);
  }
}
function clearMsg(el) {
  if (el) {
    el.textContent = "";
    hide(el);
  }
}

// ===== Header wiring =====
if (healthRetryBtn) {
  healthRetryBtn.addEventListener("click", checkHealth);
}
if (apiBaseInput) {
  apiBaseInput.addEventListener("change", e =>
    setApiBaseDisplay(e.target.value)
  );
}

const exportBtn = document.getElementById("export-csv");
if (exportBtn) {
  exportBtn.addEventListener("click", () => {
    const rows = [["date", "QT_ms", "RR_ms", "QTc_ms"]];
    (window._latestSeries || []).forEach(r => {
      rows.push([
        r.timestamp,
        defined(r.QT_ms) ? r.QT_ms : "",
        defined(r.RR_ms) ? r.RR_ms : "",
        defined(r.QTc_ms)
          ? r.QTc_ms.toFixed
            ? r.QTc_ms.toFixed(1)
            : r.QTc_ms
          : ""
      ]);
    });
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "qtc_series.csv";
    a.click();
    URL.revokeObjectURL(url);
  });
}

const printBtn = document.getElementById("print-report");
if (printBtn) {
  printBtn.addEventListener("click", () => {
    window.print();
  });
}

// Kick off health check on load
checkHealth();
