// ===== PATIENT TRENDS - QTC MONITORING =====
// Handles longitudinal QTc tracking and visualization with smooth animations
// NOW WITH LOCALSTORAGE PERSISTENCE

// Keep last successful trend data for AI summary
window._lastTrendPayload = null;
window._lastTrendResult = null;
window._latestSeries = [];

// ===== DOM ELEMENTS =====
const trendForm = document.getElementById("trend-form");
const trendSubmit = document.getElementById("trend-submit");
const trendError = document.getElementById("trend-error");
const trendTableBody = document.getElementById("trend-table-body");
const trendAgeSelect = document.getElementById("trend-age-band");
const trendSexSelect = document.getElementById("trend-sex");
const trendDateInput = document.getElementById("trend-date");
const trendQtInput = document.getElementById("trend-qt");
const trendRrInput = document.getElementById("trend-rr");
const trendSummary = document.getElementById("trend-summary");
const chartContainer = document.getElementById("chart-container");
const trendCanvas = document.getElementById("trend-canvas");
const chartTooltip = document.getElementById("chart-tooltip");

// Summary display elements
const latestQtcEl = document.getElementById("latest-qtc");
const deltaQtcEl = document.getElementById("delta-qtc");
const percentileBadgeEl = document.getElementById("percentile-badge");
const trendNarrative = document.getElementById("trend-narrative");

// Export buttons
const exportCsvBtn = document.getElementById("export-csv");
const printReportBtn = document.getElementById("print-report");
const clearAllBtn = document.getElementById("clear-all-readings");

// ===== LOCALSTORAGE KEY =====
const STORAGE_KEY = "cordea_historical_readings";

// ===== HISTORICAL READINGS DATA (NOW PERSISTENT) =====
let historicalReadings = [];

// Keep reference to plotted points for tooltip
let _plottedPoints = [];
let _canvasRect = null;

// ===== LOCALSTORAGE FUNCTIONS =====
function saveHistoricalReadings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(historicalReadings));
    console.log("✅ Saved historical readings to localStorage:", historicalReadings);
  } catch (err) {
    console.error("❌ Failed to save to localStorage:", err);
    showNotification("Failed to save data", "error");
  }
}

function loadHistoricalReadings() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      historicalReadings = JSON.parse(stored);
      console.log("✅ Loaded historical readings from localStorage:", historicalReadings);
    } else {
      // First time - initialize with demo data
      historicalReadings = [
        { timestamp: "2025-09-01", QT_ms: 430, RR_ms: 1000 },
        { timestamp: "2025-09-10", QT_ms: 440, RR_ms: 1000 },
        { timestamp: "2025-09-20", QT_ms: 438, RR_ms: 1000 }
      ];
      saveHistoricalReadings(); // Save demo data
      console.log("✅ Initialized with demo data");
    }
  } catch (err) {
    console.error("❌ Failed to load from localStorage:", err);
    // Fallback to demo data
    historicalReadings = [
      { timestamp: "2025-09-01", QT_ms: 430, RR_ms: 1000 },
      { timestamp: "2025-09-10", QT_ms: 440, RR_ms: 1000 },
      { timestamp: "2025-09-20", QT_ms: 438, RR_ms: 1000 }
    ];
  }
}

// ===== INITIALIZE =====
function initializeTrends() {
  // Load data from localStorage
  loadHistoricalReadings();

  // Set today's date as default for new readings
  const today = new Date();
  const tzOffset = today.getTimezoneOffset() * 60000;
  trendDateInput.value = new Date(today.getTime() - tzOffset)
    .toISOString()
    .slice(0, 10);

  // Render the table with loaded data
  updateTrendTable();
}

// ===== TABLE MANAGEMENT =====
function updateTrendTable() {
  clearContainer(trendTableBody);

  if (historicalReadings.length === 0) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td colspan="4">
        <div class="empty-state-container">
          <svg class="empty-state-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <div class="empty-state-text">No historical readings yet</div>
          <div class="empty-state-hint">Add your first ECG reading below to start tracking QTc over time</div>
        </div>
      </td>
    `;
    trendTableBody.appendChild(row);
    return;
  }

  historicalReadings.forEach((reading, index) => {
    const row = document.createElement("tr");

    const dateCell = document.createElement("td");
    dateCell.textContent = reading.timestamp;

    const qtCell = document.createElement("td");
    qtCell.textContent = reading.QT_ms;

    const rrCell = document.createElement("td");
    rrCell.textContent = reading.RR_ms;

    const actionCell = document.createElement("td");
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-btn";
    deleteBtn.innerHTML = `
      <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
      </svg>
    `;
    deleteBtn.title = "Delete reading";
    deleteBtn.addEventListener("click", () => deleteReading(index));
    actionCell.appendChild(deleteBtn);

    row.appendChild(dateCell);
    row.appendChild(qtCell);
    row.appendChild(rrCell);
    row.appendChild(actionCell);

    trendTableBody.appendChild(row);
  });
}

function deleteReading(index) {
  if (confirm("Delete this reading?")) {
    historicalReadings.splice(index, 1);
    saveHistoricalReadings(); // Persist to localStorage
    updateTrendTable();
    showNotification("Reading deleted", "success");
  }
}

// ===== CLEAR ALL READINGS =====
function clearAllReadings() {
  if (confirm("Delete all historical readings? This cannot be undone.")) {
    historicalReadings.length = 0; // Clear array
    saveHistoricalReadings(); // Save empty array to localStorage
    updateTrendTable();

    // Hide results
    hide(trendSummary);
    hide(chartContainer);

    showNotification("All readings cleared", "info");
  }
}

// ===== FORM SUBMISSION =====
async function handleTrendSubmit(event) {
  event.preventDefault();
  clearMsg(trendError);

  const ageBand = trendAgeSelect.value;
  const sex = trendSexSelect.value;
  const newDate = trendDateInput.value.trim();
  const newQt = parseFloat(trendQtInput.value);
  const newRr = parseFloat(trendRrInput.value);

  if (!newDate || !newQt || !newRr) {
    showMsg(trendError, "Please fill in all fields for the new reading.");
    return;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
    showMsg(trendError, "Date must be in YYYY-MM-DD format.");
    return;
  }

  const series = [
    ...historicalReadings,
    { timestamp: newDate, QT_ms: newQt, RR_ms: newRr }
  ];

  const payload = {
    age_band: ageBand,
    sex: sex,
    readings: series,
    qtc_method: "fridericia"
  };

  try {
    setBusy(trendSubmit, true);
    const result = await jsonPost("/trend/series", payload);

    window._lastTrendPayload = payload;
    window._lastTrendResult = result;
    window._latestSeries = result.series || [];

    // Add to historicalReadings and persist
    historicalReadings.push({ timestamp: newDate, QT_ms: newQt, RR_ms: newRr });
    saveHistoricalReadings(); // Persist to localStorage
    updateTrendTable();

    trendQtInput.value = "";
    trendRrInput.value = "";

    const nextDate = new Date(newDate);
    nextDate.setDate(nextDate.getDate() + 7);
    trendDateInput.value = nextDate.toISOString().slice(0, 10);

    renderTrendResults(result, ageBand, sex);

    const backendBanner = document.getElementById("backend-warning");
    if (backendBanner) backendBanner.style.display = "none";

    showNotification("Reading added and saved", "success");
  } catch (err) {
    showMsg(trendError, extractErrorMessage(err));
  } finally {
    setBusySuccess(trendSubmit, "✓ Trend updated");
  }
}

// ===== GENERATE NARRATIVE =====
function generateNarrative(latest, deltaQtc, percentile, ageBand, sex) {
  const qtc = latest.QTc_ms;

  let narrative = `Current QTc (${qtc.toFixed(1)} ms`;

  if (percentile && percentile !== "—") {
    narrative += `, ${percentile}`;
  }

  narrative += `) `;

  if (qtc >= 500) {
    narrative += "is significantly prolonged. Urgent review recommended.";
  } else if (qtc >= 470) {
    narrative += "is at or near the upper reference limit. Consider repeat ECG after medication or electrolyte changes.";
  } else if (qtc >= 450) {
    narrative += "is borderline prolonged. Monitor for further increases.";
  } else {
    narrative += "is within normal limits for this demographic.";
  }

  if (Math.abs(deltaQtc) >= 10) {
    narrative += ` QTc has ${deltaQtc > 0 ? 'increased' : 'decreased'} by ${Math.abs(deltaQtc).toFixed(1)} ms since the previous reading.`;
  }

  return narrative;
}

// ===== RESULT RENDERING =====
function renderTrendResults(result, ageBand, sex) {
  if (!result || !result.series) return;

  const series = result.series;
  const latest = series[series.length - 1];
  const previous = series.length > 1 ? series[series.length - 2] : null;

  const latestQtc = latest.QTc_ms;
  const deltaQtc = previous ? (latestQtc - previous.QTc_ms) : 0;
  const percentile = latest.percentile || "—";

  const narrative = generateNarrative(latest, deltaQtc, percentile, ageBand, sex);

  show(trendSummary);
  show(chartContainer);

  if (latestQtcEl) {
    latestQtcEl.textContent = latestQtc ? latestQtc.toFixed(1) : "—";
  }

  if (deltaQtcEl) {
    const deltaText = deltaQtc > 0 ? `↑ ${deltaQtc.toFixed(1)}` : deltaQtc < 0 ? `↓ ${Math.abs(deltaQtc).toFixed(1)}` : "0.0";
    deltaQtcEl.textContent = deltaText;
    deltaQtcEl.className = "trend-card-value";
    if (deltaQtc > 0) deltaQtcEl.classList.add("positive");
    else if (deltaQtc < 0) deltaQtcEl.classList.add("negative");
    else deltaQtcEl.classList.add("neutral");
  }

  if (percentileBadgeEl) {
    clearContainer(percentileBadgeEl);
    const badge = renderPercentileBadge(percentile);
    badge.style.fontSize = "1.3rem";
    badge.style.padding = "0.5rem 1.2rem";
    percentileBadgeEl.appendChild(badge);
  }

  if (trendNarrative) {
    trendNarrative.textContent = narrative;
  }

  drawTrendChart(series, result.bands);
}

// ===== CHART DRAWING =====
function drawTrendChart(series, bands) {
  if (!trendCanvas || !series || series.length === 0) return;

  const ctx = trendCanvas.getContext("2d");
  const canvas = trendCanvas;
  const container = canvas.parentElement;

  // Store rect for tooltip
  _canvasRect = container.getBoundingClientRect();

  // Simple 1:1 canvas (no DPI scaling for now to avoid coordinate issues)
  const containerWidth = Math.floor(_canvasRect.width) - 40;
  const containerHeight = Math.floor(_canvasRect.height) - 40;

  canvas.width = containerWidth;
  canvas.height = containerHeight;
  canvas.style.width = containerWidth + 'px';
  canvas.style.height = containerHeight + 'px';

  const width = containerWidth;
  const height = containerHeight;

  ctx.clearRect(0, 0, width, height);

  const qtcValues = series.map(r => r.QTc_ms).filter(v => defined(v));
  if (qtcValues.length === 0) return;

  const minQtc = Math.min(...qtcValues);
  const maxQtc = Math.max(...qtcValues);
  const rangeQtc = maxQtc - minQtc;
  const padding = Math.max(rangeQtc * 0.2, 20);

  const yMin = Math.floor(Math.max(300, minQtc - padding) / 10) * 10;
  const yMax = Math.ceil((maxQtc + padding) / 10) * 10;
  const yRange = yMax - yMin;

  // Draw background zones
  drawPercentileBands(ctx, width, height, yMin, yMax, bands);
  drawGridLines(ctx, width, height, yMin, yMax);

  // Calculate points
  _plottedPoints = [];
  const points = [];

  series.forEach((reading, index) => {
    if (!defined(reading.QTc_ms)) return;

    const x = (index / Math.max(series.length - 1, 1)) * (width - 60) + 30;
    const y = height - 30 - ((reading.QTc_ms - yMin) / yRange) * (height - 60);

    points.push({
      x, y,
      category: reading.category,
      timestamp: reading.timestamp,
      qtc: reading.QTc_ms
    });

    _plottedPoints.push({
      x, y,
      dateISO: reading.timestamp,
      qtc: reading.QTc_ms,
      category: reading.category
    });
  });

  // Draw line
  ctx.strokeStyle = "#3b82f6";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.stroke();

  // Draw points
  points.forEach((point, index) => {
    let fillColor = "#3b82f6";
    if (point.category === "normal") fillColor = "#22c55e";
    else if (point.category === "borderline_prolonged") fillColor = "#f59e0b";
    else if (point.category === "prolonged" || point.category === "high_risk") fillColor = "#ef4444";

    ctx.fillStyle = fillColor;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Highlight latest
    if (index === points.length - 1) {
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(point.x, point.y, 7, 0, Math.PI * 2);
      ctx.stroke();
    }
  });

  // Draw labels
  drawYAxisLabels(ctx, height, yMin, yMax);
  drawXAxisLabels(ctx, width, height, series);
}

function drawPercentileBands(ctx, width, height, yMin, yMax, bands) {
  let p50 = yMin + (yMax - yMin) * 0.5;
  let p90 = yMin + (yMax - yMin) * 0.8;

  if (bands && bands.p50 && bands.p50[0]) p50 = bands.p50[0].y;
  if (bands && bands.p90 && bands.p90[0]) p90 = bands.p90[0].y;

  ctx.fillStyle = "rgba(34, 197, 94, 0.1)";
  const normalHeight = ((p50 - yMin) / (yMax - yMin)) * (height - 60);
  ctx.fillRect(0, height - 30 - normalHeight, width, normalHeight);

  ctx.fillStyle = "rgba(245, 158, 11, 0.1)";
  const borderlineHeight = ((p90 - p50) / (yMax - yMin)) * (height - 60);
  ctx.fillRect(0, height - 30 - normalHeight - borderlineHeight, width, borderlineHeight);

  ctx.fillStyle = "rgba(239, 68, 68, 0.1)";
  const highHeight = ((yMax - p90) / (yMax - yMin)) * (height - 60);
  ctx.fillRect(0, 30, width, highHeight);
}

function drawGridLines(ctx, width, height, yMin, yMax) {
  ctx.strokeStyle = "rgba(0, 0, 0, 0.05)";
  ctx.lineWidth = 1;

  const steps = 5;
  for (let i = 0; i <= steps; i++) {
    const y = height - 30 - (i / steps) * (height - 60);
    ctx.beginPath();
    ctx.moveTo(30, y);
    ctx.lineTo(width - 30, y);
    ctx.stroke();
  }
}

function drawYAxisLabels(ctx, height, yMin, yMax) {
  const isDark = document.body.classList.contains('dark-mode');
  ctx.fillStyle = isDark ? "#e2e8f0" : "#475569";
  ctx.font = "12px 'Open Sans', sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  const steps = 5;
  for (let i = 0; i <= steps; i++) {
    const value = yMin + (i / steps) * (yMax - yMin);
    const y = height - 30 - (i / steps) * (height - 60);
    ctx.fillText(Math.round(value), 25, y);
  }
}

function drawXAxisLabels(ctx, width, height, series) {
  const isDark = document.body.classList.contains('dark-mode');
  ctx.fillStyle = isDark ? "#e2e8f0" : "#475569";
  ctx.font = "11px 'Open Sans', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  series.forEach((reading, index) => {
    const x = (index / Math.max(series.length - 1, 1)) * (width - 60) + 30;
    const dateLabel = formatShortDate(reading.timestamp);
    ctx.fillText(dateLabel, x, height - 20);
  });
}

// ===== TOOLTIP =====
if (trendCanvas && chartTooltip) {
  trendCanvas.addEventListener("mousemove", (e) => {
    if (!_canvasRect) return;

    const mx = e.clientX - _canvasRect.left - 20;
    const my = e.clientY - _canvasRect.top - 20;

    let best = null;
    let bestDist = 9999;

    for (const pt of _plottedPoints) {
      const dx = mx - pt.x;
      const dy = my - pt.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestDist && d2 < 400) {
        best = pt;
        bestDist = d2;
      }
    }

    if (best) {
      chartTooltip.style.display = "block";
      chartTooltip.style.left = `${e.clientX + 15}px`;
      chartTooltip.style.top = `${e.clientY - 60}px`;

      let valueClass = "tooltip-value-normal";
      if (best.category === "borderline_prolonged") valueClass = "tooltip-value-borderline";
      else if (best.category === "prolonged" || best.category === "high_risk") valueClass = "tooltip-value-prolonged";

      chartTooltip.innerHTML = `
        <strong>${formatShortDate(best.dateISO)}</strong>
        <div class="${valueClass}">QTc: ${best.qtc.toFixed(1)} ms</div>
      `;
    } else {
      chartTooltip.style.display = "none";
    }
  });

  trendCanvas.addEventListener("mouseleave", () => {
    chartTooltip.style.display = "none";
  });
}

// ===== CSV EXPORT =====
if (exportCsvBtn) {
  exportCsvBtn.addEventListener("click", () => {
    const rows = [["Date", "QT_ms", "RR_ms", "QTc_ms"]];
    (window._latestSeries || []).forEach(r => {
      rows.push([
        r.timestamp || "",
        defined(r.QT_ms) ? r.QT_ms : "",
        defined(r.RR_ms) ? r.RR_ms : "",
        defined(r.QTc_ms) ? r.QTc_ms.toFixed(1) : ""
      ]);
    });
    const csv = rows.map(r => r.join(",")).join("\n");
    downloadCSV(csv, "qtc_trend_series.csv");
    showNotification("CSV exported", "success");
  });
}

// ===== PRINT =====
if (printReportBtn) {
  printReportBtn.addEventListener("click", () => {
    window.print();
  });
}

// ===== CLEAR ALL BUTTON =====
if (clearAllBtn) {
  clearAllBtn.addEventListener("click", clearAllReadings);
}

// ===== EVENT LISTENERS =====
if (trendForm) {
  trendForm.addEventListener("submit", handleTrendSubmit);
}

// ===== INITIALIZE ON LOAD =====
initializeTrends();