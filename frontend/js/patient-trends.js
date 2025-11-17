// ===== PATIENT TRENDS - QTC MONITORING =====
// Handles longitudinal QTc tracking and visualization

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

// ===== HISTORICAL READINGS DATA =====
const historicalReadings = [
  { timestamp: "2025-09-01", QT_ms: 430, RR_ms: 1000 },
  { timestamp: "2025-09-10", QT_ms: 440, RR_ms: 1000 },
  { timestamp: "2025-09-20", QT_ms: 438, RR_ms: 1000 }
];

// Keep reference to plotted points for tooltip
let _plottedPoints = [];

// ===== INITIALIZE =====
function initializeTrends() {
  // Set default date to today
  const today = new Date();
  const tzOffset = today.getTimezoneOffset() * 60000;
  trendDateInput.value = new Date(today.getTime() - tzOffset)
    .toISOString()
    .slice(0, 10);

  // Render initial table
  updateTrendTable();
}

// ===== TABLE MANAGEMENT =====
function updateTrendTable() {
  clearContainer(trendTableBody);

  if (historicalReadings.length === 0) {
    const row = document.createElement("tr");
    row.innerHTML = '<td colspan="4" class="empty-state">No historical readings yet. Add readings below.</td>';
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
    updateTrendTable();
  }
}

// ===== FORM SUBMISSION =====
async function handleTrendSubmit(event) {
  event.preventDefault();
  clearMsg(trendError);

  const ageBand = mapAgeBandToEnum(trendAgeSelect.value);
  const sex = trendSexSelect.value;
  const newDate = trendDateInput.value.trim();
  const newQt = parseFloat(trendQtInput.value);
  const newRr = parseFloat(trendRrInput.value);

  // Validation
  if (!newDate || !newQt || !newRr) {
    showMsg(trendError, "Please fill in all fields for the new reading.");
    return;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
    showMsg(trendError, "Date must be in YYYY-MM-DD format.");
    return;
  }

  // Build series (historical + new)
  const series = [
    ...historicalReadings,
    { timestamp: newDate, QT_ms: newQt, RR_ms: newRr }
  ];

  const payload = {
    age_band: ageBand,
    sex: sex,
    series: series,
    qtc_method: "fridericia"
  };

  try {
    setBusy(trendSubmit, true);
    const result = await jsonPost("/trend/series", payload);

    // Store for AI summary and CSV export
    window._lastTrendPayload = payload;
    window._lastTrendResult = result;
    window._latestSeries = result.series || series;

    // Add new reading to historical data
    historicalReadings.push({ timestamp: newDate, QT_ms: newQt, RR_ms: newRr });
    updateTrendTable();

    // Clear inputs
    trendQtInput.value = "";
    trendRrInput.value = "";

    // Update next date
    const nextDate = new Date(newDate);
    nextDate.setDate(nextDate.getDate() + 7);
    trendDateInput.value = nextDate.toISOString().slice(0, 10);

    // Render results
    renderTrendResults(result);

    const backendBanner = document.getElementById("backend-warning");
    if (backendBanner) backendBanner.style.display = "none";
  } catch (err) {
    showMsg(trendError, extractErrorMessage(err));
  } finally {
    setBusySuccess(trendSubmit, "✓ Trend updated");
  }
}

// ===== RESULT RENDERING =====
function renderTrendResults(result) {
  if (!result || !result.series) {
    return;
  }

  const series = result.series;
  const latest = result.latest || series[series.length - 1];
  const latestQtc = latest.QTc_ms;
  const deltaQtc = result.delta_qtc || 0;
  const percentile = result.percentile_band || "—";
  const narrative = result.narrative || "Trend analysis complete.";

  // Show summary section
  show(trendSummary);
  show(chartContainer);

  // Update summary cards
  if (latestQtcEl) {
    latestQtcEl.textContent = latestQtc ? latestQtc.toFixed(1) : "—";
  }

  if (deltaQtcEl) {
    deltaQtcEl.textContent = deltaQtc > 0 ? `+${deltaQtc.toFixed(1)}` : deltaQtc.toFixed(1);
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

  // Draw chart
  drawTrendChart(series, result.age_band, result.sex);
}

// ===== CHART DRAWING =====
function drawTrendChart(series, ageBand, sex) {
  if (!trendCanvas || !series || series.length === 0) return;

  const ctx = trendCanvas.getContext("2d");
  const canvas = trendCanvas;

  // Set canvas size to match container
  const container = canvas.parentElement;
  canvas.width = container.clientWidth - 40; // Account for padding
  canvas.height = container.clientHeight - 40;

  const width = canvas.width;
  const height = canvas.height;

  // Clear canvas
  ctx.clearRect(0, 0, width, height);

  // Extract QTc values
  const qtcValues = series.map(r => r.QTc_ms).filter(v => defined(v));
  if (qtcValues.length === 0) return;

  const minQtc = Math.min(...qtcValues);
  const maxQtc = Math.max(...qtcValues);
  const rangeQtc = maxQtc - minQtc;
  const padding = rangeQtc * 0.2; // 20% padding

  const yMin = Math.max(300, minQtc - padding);
  const yMax = maxQtc + padding;
  const yRange = yMax - yMin;

  // Draw percentile bands (background)
  drawPercentileBands(ctx, width, height, yMin, yMax);

  // Draw grid lines
  drawGridLines(ctx, width, height, yMin, yMax);

  // Plot data points and line
  _plottedPoints = [];
  const points = [];

  series.forEach((reading, index) => {
    if (!defined(reading.QTc_ms)) return;

    const x = (index / (series.length - 1)) * (width - 60) + 30;
    const y = height - 30 - ((reading.QTc_ms - yMin) / yRange) * (height - 60);

    points.push({ x, y });
    _plottedPoints.push({
      x, y,
      dateISO: reading.timestamp,
      qtc: reading.QTc_ms,
      qt: reading.QT_ms,
      rr: reading.RR_ms
    });
  });

  // Draw line connecting points
  if (points.length > 1) {
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();
  }

  // Draw data points
  points.forEach((point, index) => {
    ctx.fillStyle = "#3b82f6";
    ctx.beginPath();
    ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Highlight latest point
    if (index === points.length - 1) {
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(point.x, point.y, 8, 0, Math.PI * 2);
      ctx.stroke();
    }
  });

  // Draw Y-axis labels
  drawYAxisLabels(ctx, height, yMin, yMax);
}

function drawPercentileBands(ctx, width, height, yMin, yMax) {
  // Approximate percentile thresholds (these should come from backend ideally)
  // For now, using rough estimates
  const p50 = yMin + (yMax - yMin) * 0.5;
  const p90 = yMin + (yMax - yMin) * 0.8;

  // Normal band (bottom to 50th)
  ctx.fillStyle = "rgba(34, 197, 94, 0.1)";
  const normalHeight = ((p50 - yMin) / (yMax - yMin)) * (height - 60);
  ctx.fillRect(0, height - 30 - normalHeight, width, normalHeight);

  // Borderline band (50th to 90th)
  ctx.fillStyle = "rgba(245, 158, 11, 0.1)";
  const borderlineHeight = ((p90 - p50) / (yMax - yMin)) * (height - 60);
  ctx.fillRect(0, height - 30 - normalHeight - borderlineHeight, width, borderlineHeight);

  // High band (90th and above)
  ctx.fillStyle = "rgba(239, 68, 68, 0.1)";
  const highHeight = ((yMax - p90) / (yMax - yMin)) * (height - 60);
  ctx.fillRect(0, 30, width, highHeight);
}

function drawGridLines(ctx, width, height, yMin, yMax) {
  ctx.strokeStyle = "rgba(0, 0, 0, 0.1)";
  ctx.lineWidth = 1;

  const steps = 5;
  const stepSize = (yMax - yMin) / steps;

  for (let i = 0; i <= steps; i++) {
    const y = height - 30 - (i / steps) * (height - 60);
    ctx.beginPath();
    ctx.moveTo(30, y);
    ctx.lineTo(width - 30, y);
    ctx.stroke();
  }
}

function drawYAxisLabels(ctx, height, yMin, yMax) {
  ctx.fillStyle = "#475569";
  ctx.font = "12px 'Open Sans', sans-serif";
  ctx.textAlign = "right";

  const steps = 5;
  for (let i = 0; i <= steps; i++) {
    const value = yMin + (i / steps) * (yMax - yMin);
    const y = height - 30 - (i / steps) * (height - 60);
    ctx.fillText(Math.round(value) + " ms", 25, y + 4);
  }
}

// ===== CHART TOOLTIP =====
if (trendCanvas && chartTooltip) {
  trendCanvas.addEventListener("mousemove", (e) => {
    const rect = trendCanvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    let best = null;
    let bestDist = 9999;

    for (const pt of _plottedPoints) {
      const dx = mx - pt.x;
      const dy = my - pt.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestDist && d2 < 100) {
        best = pt;
        bestDist = d2;
      }
    }

    if (best) {
      chartTooltip.style.display = "block";
      chartTooltip.style.left = `${best.x + rect.left}px`;
      chartTooltip.style.top = `${best.y + rect.top - 80}px`;
      chartTooltip.innerHTML = `
        <strong>${formatShortDate(best.dateISO)}</strong>
        <div>QTc: ${best.qtc?.toFixed ? best.qtc.toFixed(1) : best.qtc} ms</div>
        <div>QT: ${defined(best.qt) ? best.qt : "—"} ms</div>
        <div>RR: ${defined(best.rr) ? best.rr : "—"} ms</div>
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
        defined(r.QTc_ms) ? (r.QTc_ms.toFixed ? r.QTc_ms.toFixed(1) : r.QTc_ms) : ""
      ]);
    });

    const csv = rows.map(r => r.join(",")).join("\n");
    downloadCSV(csv, "qtc_trend_series.csv");
  });
}

// ===== PRINT REPORT =====
if (printReportBtn) {
  printReportBtn.addEventListener("click", () => {
    window.print();
  });
}

// ===== EVENT LISTENERS =====
if (trendForm) {
  trendForm.addEventListener("submit", handleTrendSubmit);
}

// ===== INITIALIZE ON LOAD =====
initializeTrends();