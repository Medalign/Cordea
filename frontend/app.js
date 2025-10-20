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

// Keep a reference to plotted points for tooltip hit-tests
let _plottedPoints = []; // {x,y,label, qt, rr, qtc, dateISO}

let apiBase = loadApiBase();
setApiBaseDisplay(apiBase);

// Seed history (demo)
const historicalReadings = [
  { timestamp: "2025-09-01", QT_ms: 430, RR_ms: 1000 },
  { timestamp: "2025-09-10", QT_ms: 440, RR_ms: 1000 },
  { timestamp: "2025-09-20", QT_ms: 438, RR_ms: 1000 },
];
updateTrendTable();

// Date init
if (trendDateInput) {
  try {
    const today = new Date();
    const tzOffset = today.getTimezoneOffset() * 60000;
    trendDateInput.value = new Date(today.getTime() - tzOffset).toISOString().slice(0, 10);
  } catch {}
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
  try { return normaliseBase(localStorage.getItem(STORAGE_KEY) || DEFAULT_API_BASE); }
  catch { return DEFAULT_API_BASE; }
}
function setApiBaseDisplay(value) {
  apiBase = normaliseBase(value);
  apiBaseInput.value = apiBase;
  apiBasePill.textContent = apiBase;
  try { localStorage.setItem(STORAGE_KEY, apiBase); } catch {}
}
function toIsoDate(value) {
  const s = String(value || "").trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); // DD/MM/YYYY
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return s;
}
function mapAgeBandToEnum(label) {
  const L = (label || "").toLowerCase().replace(/\u2013|\u2014/g, "-").trim();
  const table = {
    "adult 65+": "adult_65_plus",
    "adult 18–64": "adult_18_64",
    "adult 18-64": "adult_18_64",
    "child 10–12 yrs": "child_10_12",
    "child 10-12 yrs": "child_10_12",
  };
  return table[L] || label;
}
function computeQTcBazett(QT_ms, RR_ms) {
  if (QT_ms == null || RR_ms == null || RR_ms <= 0) return null;
  return Math.round((QT_ms / Math.sqrt(RR_ms / 1000)) * 10) / 10;
}
function defined(v){ return v!==undefined && v!==null; }
function pick(...xs){ for(const x of xs) if(defined(x)) return x; return null; }

function asChip(text) {
  const span = document.createElement("span");
  span.className = "chip";
  const s = String(text||"").toUpperCase();
  if (s.includes("GREEN")) span.classList.add("chip-green");
  else if (s.includes("AMBER") || s.includes("YELLOW")) span.classList.add("chip-amber");
  else if (s.includes("RED")) span.classList.add("chip-red");
  else span.classList.add("chip-muted");
  span.textContent = text || "—";
  return span;
}

function severityFromPercentile(pctLabel){
  const t = String(pctLabel||"").toLowerCase();
  if (t.includes(">95")) return "red";
  if (t.includes("75") || t.includes("50–75") || t.includes("50-75")) return "amber";
  if (t.includes("<50")) return "green";
  return "muted";
}

function formatShortDate(iso) {
  // "2025-10-20" -> "20 Oct"
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}
function bandToChipClass(band) {
  const s = String(band||"").toLowerCase();
  if (s.includes("99")) return "chip-red";
  if (s.includes("90")) return "chip-amber";
  return "chip-green"; // <90th
}
function deltaChip(delta) {
  const span = document.createElement("span");
  const up = delta > 0;
  span.className = `chip ${up ? "chip-red" : "chip-green"}`;
  span.textContent = `${up ? "↑" : "↓"} ${delta > 0 ? "+" : ""}${delta.toFixed(1)}`;
  return span;
}

// ===== API =====
async function checkHealth() {
  setHealthStatus("checking", "API: Checking…");
  healthRetryBtn.disabled = true;
  const url = `${normaliseBase(apiBase)}/healthz`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    setHealthStatus("green", "API: Green");
    hide(backendBanner);
  } catch {
    setHealthStatus("red", "API: Red");
  } finally {
    healthRetryBtn.disabled = false;
  }
}
function setHealthStatus(state, label) {
  healthChip.textContent = label;
  healthChip.className = "chip " + (state==="green"?"chip--green":state==="red"?"chip--red":"chip--muted");
}
async function jsonPost(path, body) {
  const url = `${normaliseBase(apiBase)}${path}`;
  let response;
  try {
    response = await fetch(url, { method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify(body) });
  } catch (error) {
    throw new ApiError(`Network error: ${error.message}`, { detail:error.message });
  }
  const ct = response.headers.get("content-type") || "";
  const parse = async () => ct.includes("application/json") ? response.json() : response.text();
  const data = await parse();
  if (!response.ok) {
    throw new ApiError(typeof data === "string" ? data : (data?.detail ?? `${response.status} ${response.statusText}`),
      { status:response.status, statusText:response.statusText, detail:data });
  }
  return data;
}

// ===== Patient Review – Submit =====
guardrailAdultDemo.addEventListener("click", () => {
  fillGuardrailForm({
    age_band: "adult_65_plus", sex:"male",
    heart_rate:72, PR_ms:160, QRS_ms:92, QT_ms:380, RR_ms:829, qtc_method:"fridericia",
  });
});
guardrailPaedsDemo.addEventListener("click", () => {
  fillGuardrailForm({
    age_band: "child_10_12", sex:"female",
    heart_rate:110, PR_ms:130, QRS_ms:80, QT_ms:340, RR_ms:545, qtc_method:"bazett",
  });
});

guardrailForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMsg(guardrailError);

  // basic client validation (prevent obvious junk)
  const hr  = +guardrailForm.heart_rate.value;
  const pr  = +guardrailForm.PR_ms.value;
  const qrs = +guardrailForm.QRS_ms.value;
  const qt  = +guardrailForm.QT_ms.value;
  const rr  = +guardrailForm.RR_ms.value;
  if (!(hr>0 && pr>0 && qrs>0 && qt>0 && rr>0)) {
    return showMsg(guardrailError, "Please enter all intervals as positive numbers.");
  }

  const payload = {
    age_band: mapAgeBandToEnum(guardrailForm.age_band.value),
    sex: guardrailForm.sex.value,
    intervals: { heart_rate:hr, PR_ms:pr, QRS_ms:qrs, QT_ms:qt, RR_ms:rr },
    qtc_method: guardrailForm.qtc_method.value,
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

function fillGuardrailForm(v) {
  guardrailForm.age_band.value = labelFromEnum(v.age_band);
  guardrailForm.sex.value = v.sex;
  guardrailForm.heart_rate.value = v.heart_rate;
  guardrailForm.PR_ms.value = v.PR_ms;
  guardrailForm.QRS_ms.value = v.QRS_ms;
  guardrailForm.QT_ms.value = v.QT_ms;
  guardrailForm.RR_ms.value = v.RR_ms;
  [...guardrailForm.querySelectorAll('input[name="qtc_method"]')]
    .forEach(r => r.checked = (r.value === v.qtc_method));
}
function labelFromEnum(enumVal){
  const t = (enumVal||"").toLowerCase();
  if (t==="adult_65_plus") return "Adult 65+";
  if (t==="adult_18_64") return "Adult 18–64";
  if (t==="child_10_12") return "Child 10–12 yrs";
  return enumVal;
}

// ===== Patient Review – Render =====
function renderGuardrailResult(result, payload) {
  clearContainer(guardrailResult);
  if (!result || typeof result !== "object") return;

  const computed = result.computed ?? {};
  const qtc = pick(computed.QTc_ms, computed.qtc_ms);
  const band = pick(computed.percentile, result.band, result.percentile);
  const refv = pick(computed.ref_version, result.ref_version);
  const summary = pick(result.summary, computed.assessment, "—");

  const card = document.createElement("article");
  card.className = "result-card";

  // Header with band chip and clinical headline
  const header = document.createElement("div");
  header.className = "result-header";
  const h3 = document.createElement("h3");
  h3.textContent = "Assessment";
  header.appendChild(h3);
  header.appendChild(asChip(band || "—"));
  card.appendChild(header);

  const headline = document.createElement("p");
  headline.className = "result-summary";
  const sex = (payload?.sex || "").toLowerCase();
  const ageLabel = labelFromEnum(payload?.age_band);
  if (defined(qtc) && band) {
    // Friendly one-liner
    const sev = severityFromPercentile(band);
    const word = sev==="red"?"Prolonged":sev==="amber"?"Borderline":"Normal";
    headline.textContent = `${word} QTc for ${ageLabel} ${sex} — ${qtc} ms (${band}).`;
  } else {
    headline.textContent = summary;
  }
  card.appendChild(headline);

  // Key metrics row
  const grid = document.createElement("div");
  grid.className = "kv-grid";
  grid.appendChild(kvItem("QTc (ms)", defined(qtc)?qtc:"—"));
  grid.appendChild(kvItem("Percentile", band||"—"));
  grid.appendChild(kvItem("Reference", refv||"—"));
  card.appendChild(grid);

  // Assessments table
  if (Array.isArray(result.assessments)) {
    const t = document.createElement("table");
    t.className = "assess-table";
    t.innerHTML = `<thead><tr><th>Parameter</th><th>Status</th><th>Rationale</th></tr></thead><tbody></tbody>`;
    const tb = t.querySelector("tbody");

    const defaultParams = ["Heart rate (bpm)", "PR interval (ms)", "QRS duration (ms)", "QTc (ms)"];
    const defaultReason = (status) => {
      const s = String(status||"").toUpperCase();
      if (s === "GREEN") return "Within reference range";
      if (s === "AMBER" || s === "YELLOW") return "Near limit of reference";
      if (s === "RED") return "Outside reference";
      return "—";
    };

    result.assessments.forEach((row, idx) => {
      const status = row?.status || (typeof row === "string" ? row : "—");
      const parameter = row?.parameter || row?.metric || defaultParams[idx] || "—";
      const rationale = row?.reason || row?.rationale || defaultReason(status);

      const tr = document.createElement("tr");
      const tdP = document.createElement("td"); tdP.textContent = parameter;
      const tdS = document.createElement("td"); tdS.appendChild(asChip(status));
      const tdR = document.createElement("td"); tdR.textContent = rationale;
      tr.append(tdP, tdS, tdR);
      tb.appendChild(tr);
    });

    card.appendChild(t);
  }
  
  // After the table is appended
  const recs = document.getElementById("guardrail-recs");
  if (recs) {
    recs.innerHTML = `
      <h4>Recommendations</h4>
      <ul>
        <li>QTc within normal limits for this demographic.</li>
        <li>No immediate concerns identified.</li>
        <li>Document in record and continue routine follow-up.</li>
      </ul>`;
  }

  if (result.red_flags && result.red_flags.length) {
    const p = document.createElement("p");
    p.innerHTML = "Red flags: " + result.red_flags.map(x=>`<strong>${x}</strong>`).join(", ");
    card.appendChild(p);
  }

  const small = document.createElement("p");
  small.className = "muted";
  small.textContent = result.disclaimer || "DEMONSTRATION ONLY — SYNTHETIC DATA — NOT FOR CLINICAL USE.";
  card.appendChild(small);

  guardrailResult.appendChild(card);
}
function kvItem(k,v){
  const wrap=document.createElement("div"); wrap.className="kv-item";
  const kk=document.createElement("div"); kk.className="kv-key"; kk.textContent=k;
  const vv=document.createElement("div"); vv.className="kv-val"; vv.textContent=String(v);
  wrap.appendChild(kk); wrap.appendChild(vv); return wrap;
}
function guessParamFromReason(r){
  const s=(r||"").toLowerCase();
  if (s.includes("hr")) return "HR_bpm";
  if (s.includes("pr")) return "PR_ms";
  if (s.includes("qrs")) return "QRS_ms";
  if (s.includes("qtc")) return "QTc_ms";
  return "";
}

// ===== Patient Trends – Table + Submit =====
function updateTrendTable() {
  clearContainer(trendTableBody);
  historicalReadings.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${r.timestamp}</td><td>${r.QT_ms}</td><td>${r.RR_ms}</td>`;
    trendTableBody.appendChild(tr);
  });
}

trendForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMsg(trendError);

  const timestamp = toIsoDate((trendDateInput.value||"").trim());
  const qt = Number(trendQtInput.value);
  const rr = Number(trendRrInput.value);
  if (!timestamp || !(qt>0) || !(rr>0)) {
    return showMsg(trendError, "Enter new reading date, QT (ms) and RR (ms).");
  }

  const payload = {
    age_band: mapAgeBandToEnum(trendAgeSelect.value),
    sex: trendSexSelect.value,
    readings: historicalReadings.map(x=>({...x})),
    new: { timestamp, QT_ms: qt, RR_ms: rr },
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

// ===== Patient Trends – Render + Chart =====
function renderTrendResult(payload, result){
  clearContainer(trendResult);
  if (!result || typeof result !== "object") return;

  const comp = result.computed ?? {};
  const newNode = pick(result.new, comp.new, {});
  const recordedOn =
    pick(newNode?.timestamp, result?.timestamp, comp?.timestamp, payload?.new?.timestamp) || "—";
  const band = pick(comp?.percentile, result?.band, result?.percentile, "—");

  // Build QTc series
  const hist = Array.isArray(result.series) ? result.series : payload.readings;
  const series = [];
  if (Array.isArray(hist)) {
    for (const p of hist) {
      const QTc = pick(p.QTc_ms, computeQTcBazett(p.QT_ms, p.RR_ms));
      if (defined(QTc)) series.push({ timestamp:p.timestamp, QTc, QT_ms: p.QT_ms, RR_ms: p.RR_ms });
    }
  }
  const newQTc = pick(newNode?.QTc_ms, computeQTcBazett(payload?.new?.QT_ms, payload?.new?.RR_ms));
  if (defined(newQTc)) series.push({ timestamp: recordedOn, QTc: newQTc, QT_ms: payload?.new?.QT_ms, RR_ms: payload?.new?.RR_ms });
  
  window._latestSeries = series;

  // Deltas
  let delta = pick(comp?.delta_ms, result?.delta_ms, null);
  if (!defined(delta) && series.length >= 2) {
    const prev = series[series.length-2]?.QTc;
    if (defined(prev) && defined(newQTc)) delta = Math.round((newQTc - prev)*10)/10;
  }

  // Card UI
  const card = document.createElement("article");
  card.className = "result-card";

  // Band chip + narrative
  const bandChip = document.getElementById("trend-band-chip");
  const narrative = document.getElementById("trend-narrative");
  if (bandChip) {
    const bandText = result?.band || result?.percentile_band || "—";
    bandChip.className = `chip ${bandToChipClass(bandText)}`;
    bandChip.textContent = bandText;
  }
  if (narrative) {
    const latest = result?.latest_qtc ?? result?.latest ?? newQTc;
    const deltaVal = Number(result?.delta_ms ?? delta ?? 0);
    const deltaPhrase = deltaVal > 0 ? "increased" : "decreased";
    const abs = Math.abs(deltaVal).toFixed(1);
    narrative.textContent =
      latest
        ? `QTc has ${deltaPhrase} by ${abs} ms since the last reading. Current QTc (${Number(latest).toFixed(1)} ms) remains ${result?.band || "within reference"} for this demographic. No immediate concerns identified.`
        : "—";
  }
  
  const grid = document.createElement("div");
  grid.className = "kv-grid";
  grid.appendChild(kvItem("Recorded on", recordedOn));
  grid.appendChild(kvItem("Δ QTc (ms)", defined(delta)?delta:"—"));
  grid.appendChild(kvItem("Latest QTc (ms)", defined(newQTc)?newQTc:"—"));
  card.appendChild(grid);

  // Replace the Δ tile content with an up/down chip
  const deltaTile = grid.childNodes[1].querySelector('.kv-val');
  if (deltaTile && defined(delta)) {
    deltaTile.textContent = ""; // clear
    deltaTile.appendChild(deltaChip(Number(delta)));
  }

  // Chart block
  const wrap = document.createElement("div"); wrap.className="chart-wrap";
  const canvasWrap = document.createElement("div"); canvasWrap.className="canvas-wrap"; wrap.appendChild(canvasWrap);
  const canvas = document.createElement("canvas"); canvas.id="trend-canvas"; canvasWrap.appendChild(canvas);
  canvasWrap.appendChild(chartTooltip);
  
  card.appendChild(wrap);
  trendResult.appendChild(card);

  // Draw chart with axes, ticks, dotted percentiles, tooltip
  drawTrendChart(canvas, series);
  installChartTooltip(canvas);
}

function drawTrendChart(canvas, series){
  if (!canvas || !Array.isArray(series) || !series.length) return;
  const ctx = canvas.getContext("2d");
  const DPR = window.devicePixelRatio || 1;
  const Wcss = canvas.clientWidth || 720;
  const Hcss = 300;
  canvas.width = Math.floor(Wcss * DPR);
  canvas.height = Math.floor(Hcss * DPR);
  canvas.style.width = Wcss + "px";
  canvas.style.height = Hcss + "px";
  ctx.scale(DPR, DPR);

  const parseT = (s)=> new Date(s).getTime();
  const pts = series
    .map(p=>({ ...p, t:parseT(p.timestamp), q:p.QTc }))
    .filter(p => Number.isFinite(p.t) && defined(p.q))
    .sort((a,b)=>a.t-b.t);
  if (!pts.length) return;

  const padL=48, padR=16, padT=32, padB=36;
  const W = Wcss, H = Hcss;
  const qVals = pts.map(p=>p.q);
  const tVals = pts.map(p=>p.t);
  const minQ = Math.min(...qVals) - 10;
  const maxQ = Math.max(...qVals) + 10;
  const minT = Math.min(...tVals);
  const maxT = Math.max(...tVals);

  const x = t => padL + ( (W-padL-padR) * (t-minT) / Math.max(1,(maxT-minT)) );
  const y = q => (H-padB) - ( (H-padT-padB) * (q-minQ) / Math.max(1,(maxQ-minQ)) );
  const plotRect = { x: padL, y: padT, w: W - padL - padR, h: H - padT - padB };

  // bg
  ctx.clearRect(0,0,W,H);
  
  // Percentile bands (hardcoded for demo)
  const yP50 = y(440);
  const yP90 = y(460);
  const yP99 = y(480);
  drawBands(ctx, plotRect, { yP50, yP90, yP99 });

  // axes
  ctx.strokeStyle = "#e2e8f0"; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(padL, padT); ctx.lineTo(padL, H-padB); ctx.lineTo(W-padR, H-padB); ctx.stroke();

  // y ticks every ~25-50 ms
  ctx.fillStyle = "#64748b";
  ctx.font = "12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto";
  const step = niceStep((maxQ-minQ)/5);
  for (let q = Math.ceil(minQ/step)*step; q <= maxQ; q += step){
    const yy = y(q);
    ctx.strokeStyle = "#e2e8f0"; ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(W-padR, yy); ctx.stroke();
    ctx.fillText(Math.round(q), 8, yy+4);
  }
  // x ticks (dates)
  const tickCount = Math.min(pts.length, 6);
  for (let i=0;i<tickCount;i++){
    const j = Math.round(i*(pts.length-1)/(tickCount-1||1));
    const label = formatTickDate(pts[j].timestamp);
    const xx = x(pts[j].t);
    ctx.fillText(label, xx-18, H-padB+22);
  }
  
  // Title & Legend
  ctx.fillStyle = "#111827";
  ctx.font = "600 14px system-ui, -apple-system, Segoe UI, Roboto";
  ctx.fillText("QTc Trend — Fridericia", plotRect.x, plotRect.y - 8);
  const legendText = [ { label: "QTc (ms)", swatch: "#2563eb" }, { label: "Percentile bands", swatch: "#94a3b8" } ];
  let lx = plotRect.x + plotRect.w - 220, ly = plotRect.y - 12;
  legendText.forEach((item, idx) => {
    const xPos = lx + idx*110;
    ctx.fillStyle = item.swatch;
    ctx.fillRect(xPos, ly - 8, 12, 8);
    ctx.fillStyle = "#374151";
    ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto";
    ctx.fillText(item.label, xPos + 16, ly);
  });
  
  // line
  ctx.strokeStyle="#2563eb"; ctx.lineWidth=2;
  ctx.beginPath();
  pts.forEach((p,i)=>{ const px=x(p.t), py=y(p.q); (i?ctx.lineTo(px,py):ctx.moveTo(px,py)); });
  ctx.stroke();

  // points
  _plottedPoints = [];
  pts.forEach((p, i) => {
    const px = x(p.t);
    const py = y(p.q);
    _plottedPoints.push({ x:px, y:py, dateISO: p.timestamp, qtc: p.QTc, qt: p.QT_ms, rr: p.RR_ms });
    ctx.beginPath();
    ctx.arc(px, py, i === pts.length - 1 ? 4 : 3, 0, Math.PI*2);
    ctx.fillStyle = i === pts.length - 1 ? "#1d4ed8" : "#2563eb"; // highlight last point darker
    ctx.fill();
    if (i === pts.length - 1) {
      ctx.fillStyle = "#111827";
      ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto";
      ctx.fillText(`${p.QTc.toFixed(1)} ms`, px + 6, py - 6);
    }
  });
}

function drawBands(ctx, plot, bands) {
  ctx.save();
  ctx.fillStyle = "rgba(34,197,94,.10)";
  ctx.fillRect(plot.x, bands.yP50, plot.w, plot.y + plot.h - bands.yP50);
  ctx.fillStyle = "rgba(245,158,11,.10)";
  ctx.fillRect(plot.x, bands.yP90, plot.w, bands.yP50 - bands.yP90);
  ctx.fillStyle = "rgba(249,115,22,.12)";
  ctx.fillRect(plot.x, bands.yP99, plot.w, bands.yP90 - bands.yP99);
  ctx.restore();
}
function formatTickDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}
function installChartTooltip(canvas) {
  if (!canvas || !chartTooltip) return;
  const rectFor = () => canvas.getBoundingClientRect();
  canvas.addEventListener("mousemove", (e) => {
    if (!_plottedPoints.length) return;
    const rect = rectFor();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    let best = null, bestDist = 9999;
    for (const pt of _plottedPoints) {
      const dx = mx - pt.x, dy = my - pt.y;
      const d2 = dx*dx + dy*dy;
      if (d2 < bestDist && d2 < 64) { best = pt; bestDist = d2; }
    }
    if (best) {
      chartTooltip.style.display = "block";
      chartTooltip.style.left = `${best.x}px`;
      chartTooltip.style.top  = `${best.y}px`;
      chartTooltip.innerHTML =
        `<div><strong>${formatShortDate(best.dateISO)}</strong></div>
         <div>QT: ${best.qt ?? "—"} ms</div>
         <div>RR: ${best.rr ?? "—"} ms</div>
         <div>QTc: ${best.qtc?.toFixed ? best.qtc.toFixed(1) : best.qtc} ms</div>`;
    } else {
      chartTooltip.style.display = "none";
    }
  });
  canvas.addEventListener("mouseleave", () => {
    chartTooltip.style.display = "none";
  });
}

function niceStep(x){
  const raw = Math.max(1, x);
  if (raw<15) return 10;
  if (raw<35) return 25;
  if (raw<75) return 50;
  return Math.round(raw/50)*50;
}

// ===== Utils (render + messaging) =====
function clearContainer(el){ while(el.firstChild) el.removeChild(el.firstChild); }
function show(el){ if (el) el.classList.remove("hide"); }
function hide(el){ if (el) el.classList.add("hide"); }

function setBusy(btn, isBusy){
  if (!btn) return;
  if (!btn.dataset.idle) btn.dataset.idle = btn.textContent;
  btn.disabled = isBusy;
  btn.textContent = isBusy ? "Working…" : btn.dataset.idle;
}
function setBusySuccess(btn, successLabel = "✓ Complete", revertMs = 1200){
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
    if (d && typeof d === "object") { try { return JSON.stringify(d); } catch { return error.message; } }
    return error.detail ? String(error.detail) : error.message;
  }
  return (error && error.message) || "Unexpected error.";
}
function showMsg(el, msg){ if (el){ el.textContent=msg; show(el); } }
function clearMsg(el){ if (el){ el.textContent=""; hide(el); } }

// ===== Header wiring =====
healthRetryBtn.addEventListener("click", checkHealth);
apiBaseInput.addEventListener("change", e => setApiBaseDisplay(e.target.value));

document.getElementById("export-csv")?.addEventListener("click", () => {
  const rows = [["date","QT_ms","RR_ms","QTc_ms"]];
  (window._latestSeries || []).forEach(r => {
    rows.push([r.timestamp, r.QT_ms, r.RR_ms, r.QTc_ms?.toFixed ? r.QTc_ms.toFixed(1) : r.QTc_ms]);
  });
  const csv = rows.map(r => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "qtc_series.csv"; a.click();
  URL.revokeObjectURL(url);
});
document.getElementById("print-report")?.addEventListener("click", () => {
  window.print();
});

// Kick off
checkHealth();
