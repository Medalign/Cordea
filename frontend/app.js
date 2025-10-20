// ==== Robust API client + UI for ECG-Assist (vanilla JS) ====

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
const STORAGE_KEY = "ecgAssistApiBase";

const healthChip = document.getElementById("health-chip");
const healthRetryBtn = document.getElementById("health-retry");
const apiBaseInput = document.getElementById("api-base-input");
const apiBasePill  = document.getElementById("api-base-pill");
const backendBanner = document.getElementById("backend-warning");

// GuardRail DOM
const guardrailForm = document.getElementById("guardrail-form");
const guardrailSubmit = document.getElementById("guardrail-submit");
const guardrailAdultDemo = document.getElementById("guardrail-demo-adult");
const guardrailPaedsDemo = document.getElementById("guardrail-demo-paeds");
const guardrailError = document.getElementById("guardrail-error");
const guardrailResult = document.getElementById("guardrail-result");

// Trend DOM
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
  const T = String(text ?? "").toUpperCase();
  if (T.includes("RED") || T.includes(">95")) span.classList.add("chip--red");
  else if (T.includes("AMBER") || T.includes("YELLOW") || T.includes("75")) span.classList.add("chip--amber");
  else if (T.includes("GREEN") || T.includes("<50")) span.classList.add("chip--green");
  else span.classList.add("chip--muted");
  span.textContent = String(text ?? "—");
  return span;
}
function severityFromPercentile(pctLabel){
  const t = String(pctLabel||"").toLowerCase();
  if (t.includes(">95")) return "red";
  if (t.includes("75") || t.includes("50–75") || t.includes("50-75")) return "amber";
  if (t.includes("<50")) return "green";
  return "muted";
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

// ===== GuardRail – Submit =====
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
    setBusy(guardrailSubmit, false);
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

// ===== GuardRail – Render =====
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

  // Assessments table — robust to shapes: strings or objects
  if (Array.isArray(result.assessments)) {
    const t = document.createElement("table");
    t.className = "assess-table";
    t.innerHTML = `<thead><tr><th>Parameter</th><th>Status</th><th>Rationale</th></tr></thead><tbody></tbody>`;
    const tb = t.querySelector("tbody");
    result.assessments.forEach(a => {
      // Possible shapes:
      // 1) "GREEN" | "AMBER: foo" | "RED: bar"
      // 2) { parameter, status, reason } or { status, reason }
      let parameter = a?.parameter ?? "";
      let status = a?.status ?? "";
      let reason = a?.reason ?? "";
      if (typeof a === "string") {
        // try split "STATUS: reason"
        const m = a.match(/^([A-Z]+)\s*:?\s*(.*)$/);
        status = m ? m[1] : a;
        reason = m ? m[2] : "";
      }
      const tr = document.createElement("tr");
      const tdP = document.createElement("td");
      tdP.textContent = parameter || guessParamFromReason(reason) || "—";
      const tdS = document.createElement("td");
      tdS.appendChild(asChip(status || "—"));
      const tdR = document.createElement("td");
      tdR.textContent = reason || "—";
      tr.appendChild(tdP); tr.appendChild(tdS); tr.appendChild(tdR);
      tb.appendChild(tr);
    });
    card.appendChild(t);
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

// ===== Trend – Table + Submit =====
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
    setBusy(trendSubmit, false);
  }
});

// ===== Trend – Render + Chart =====
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
      if (defined(QTc)) series.push({ timestamp:p.timestamp, QTc });
    }
  }
  const newQTc = pick(newNode?.QTc_ms, computeQTcBazett(payload?.new?.QT_ms, payload?.new?.RR_ms));
  if (defined(newQTc)) series.push({ timestamp: recordedOn, QTc: newQTc });

  // Deltas
  let delta = pick(comp?.delta_ms, result?.delta_ms, null);
  if (!defined(delta) && series.length >= 2) {
    const prev = series[series.length-2]?.QTc;
    if (defined(prev) && defined(newQTc)) delta = Math.round((newQTc - prev)*10)/10;
  }

  // Card UI
  const card = document.createElement("article");
  card.className = "result-card";

  const header = document.createElement("div");
  header.className = "result-header";
  const h3 = document.createElement("h3"); h3.textContent = "Trend evaluation";
  header.appendChild(h3); header.appendChild(asChip(band));
  card.appendChild(header);

  const grid = document.createElement("div");
  grid.className = "kv-grid";
  grid.appendChild(kvItem("Recorded on", recordedOn));
  grid.appendChild(kvItem("Δ QTc (ms)", defined(delta)?delta:"—"));
  grid.appendChild(kvItem("Latest QTc (ms)", defined(newQTc)?newQTc:"—"));
  card.appendChild(grid);

  // Chart block
  const wrap = document.createElement("div"); wrap.className="chart-wrap";
  const canvasWrap = document.createElement("div"); canvasWrap.className="canvas-wrap"; wrap.appendChild(canvasWrap);
  const canvas = document.createElement("canvas"); canvas.id="trend-canvas"; canvasWrap.appendChild(canvas);

  // Legend
  const legend = document.createElement("div"); legend.className="chart-legend";
  legend.innerHTML = `
    <span class="legend-swatch sw-blue"></span> QTc (ms)
    <span class="legend-swatch sw-dash"></span> Percentile guides (P50 | P90 | P99)
  `;
  wrap.appendChild(legend);
  card.appendChild(wrap);

  trendResult.appendChild(card);

  // Draw chart with axes, ticks, dotted percentiles, tooltip
  drawTrendChart(canvas, series);
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
    .map(p=>({ t:parseT(p.timestamp), q:p.QTc }))
    .filter(p => Number.isFinite(p.t) && defined(p.q))
    .sort((a,b)=>a.t-b.t);
  if (!pts.length) return;

  const padL=48, padR=16, padT=18, padB=36;
  const W = Wcss, H = Hcss;
  const qVals = pts.map(p=>p.q);
  const tVals = pts.map(p=>p.t);
  const minQ = Math.min(...qVals) - 10;
  const maxQ = Math.max(...qVals) + 10;
  const minT = Math.min(...tVals);
  const maxT = Math.max(...tVals);

  const x = t => padL + ( (W-padL-padR) * (t-minT) / Math.max(1,(maxT-minT)) );
  const y = q => (H-padB) - ( (H-padT-padB) * (q-minQ) / Math.max(1,(maxQ-minQ)) );

  // bg
  ctx.clearRect(0,0,W,H);

  // axes
  ctx.strokeStyle = "#e2e8f0"; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(padL, padT); ctx.lineTo(padL, H-padB); ctx.lineTo(W-padR, H-padB); ctx.stroke();

  // y ticks every ~25-50 ms
  ctx.fillStyle = "#64748b";
  ctx.font = "12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto";
  const step = niceStep((maxQ-minQ)/5);
  for (let q = Math.ceil(minQ/step)*step; q <= maxQ; q += step){
    const yy = y(q);
    ctx.strokeStyle = "#f1f5f9"; ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(W-padR, yy); ctx.stroke();
    ctx.fillText(Math.round(q), 8, yy+4);
  }
  // x ticks (dates)
  const tickCount = Math.min(pts.length, 6);
  for (let i=0;i<tickCount;i++){
    const j = Math.round(i*(pts.length-1)/(tickCount-1||1));
    const dd = new Date(pts[j].t);
    const label = dd.toISOString().slice(0,10);
    const xx = x(pts[j].t);
    ctx.fillText(label, xx-34, H-padB+22);
  }
  // axis labels
  ctx.fillText("QTc (ms)", 8, padT-4);
  ctx.fillText("Date", W/2-14, H-8);

  // percentile guides (synthetic: mid, ~P90, ~P99 relative to range)
  const mid = (minQ+maxQ)/2;
  const p50 = mid;
  const p90 = maxQ - (maxQ-minQ)*0.10;
  const p99 = maxQ - (maxQ-minQ)*0.01;
  ctx.setLineDash([6,6]); ctx.strokeStyle="#94a3b8";
  [ ["P50",p50], ["P90",p90], ["P99",p99] ].forEach(([label,val])=>{
    const yy=y(val);
    ctx.beginPath(); ctx.moveTo(padL,yy); ctx.lineTo(W-padR,yy); ctx.stroke();
    ctx.fillText(label, W-padR-30, yy-4);
  });
  ctx.setLineDash([]);

  // danger threshold marker (optional visual): q>470 => red dots
  const danger = 470;

  // line
  ctx.strokeStyle="#2563eb"; ctx.lineWidth=2;
  ctx.beginPath();
  pts.forEach((p,i)=>{ const px=x(p.t), py=y(p.q); (i?ctx.lineTo(px,py):ctx.moveTo(px,py)); });
  ctx.stroke();

  // points
  pts.forEach((p,i)=>{
    const px=x(p.t), py=y(p.q);
    ctx.fillStyle = p.q>=danger ? "#dc2626" : "#2563eb";
    ctx.beginPath(); ctx.arc(px,py,3,0,Math.PI*2); ctx.fill();
  });

  // last label
  const last = pts[pts.length-1];
  if (last){
    ctx.fillStyle="#0f172a";
    ctx.fillText(`${last.q} ms`, x(last.t)+6, y(last.q)-8);
  }

  // tooltip
  const tooltip = document.createElement("div");
  tooltip.className = "tooltip";
  tooltip.style.display="none";
  canvas.parentElement.appendChild(tooltip);

  canvas.addEventListener("mousemove", (e)=>{
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left);
    const my = (e.clientY - rect.top);
    // find nearest point
    let best=null, bestD=1e9;
    pts.forEach(p=>{
      const dx = x(p.t)-mx, dy = y(p.q)-my;
      const d = Math.hypot(dx,dy);
      if (d<bestD){ bestD=d; best=p; }
    });
    if (best && bestD<24){
      const dd = new Date(best.t).toISOString().slice(0,10);
      tooltip.textContent = `${dd} — QTc ${best.q} ms`;
      tooltip.style.left = (x(best.t))+"px";
      tooltip.style.top  = (y(best.q))+"px";
      tooltip.style.display="block";
    } else {
      tooltip.style.display="none";
    }
  });
  canvas.addEventListener("mouseleave", ()=> tooltip.style.display="none");
}
function niceStep(x){
  // round step to 10/25/50 for pleasing grid
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
function setBusy(btn, isBusy){ if (btn){ btn.disabled = isBusy; btn.textContent = isBusy ? "Working…" : btn.dataset.idle || btn.textContent; } }
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

// Kick off
checkHealth();
