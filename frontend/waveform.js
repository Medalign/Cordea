// waveform.js — Cordea Waveform QT/QTc Viewer (standalone, no backend)

// ===== DOM lookups =====
const fileInput = document.getElementById("waveform-file");
const errorBox = document.getElementById("waveform-error");
const msPerPixelInput = document.getElementById("ms-per-pixel");

const btnMarkQ = document.getElementById("btn-mark-q");
const btnMarkT = document.getElementById("btn-mark-t");
const btnMarkR1 = document.getElementById("btn-mark-r1");
const btnMarkR2 = document.getElementById("btn-mark-r2");
const btnClearMarks = document.getElementById("btn-clear-marks");

const markModeLabel = document.getElementById("mark-mode-label");
const logArea = document.getElementById("waveform-log");

const canvas = document.getElementById("ecg-canvas");
const qtEl = document.getElementById("qt-ms");
const rrEl = document.getElementById("rr-ms");
const qtcEl = document.getElementById("qtc-ms");
const qtcClassEl = document.getElementById("qtc-class");

const healthChip = document.getElementById("health-chip");

// ===== Canvas + state =====
let ctx = null;
if (canvas && canvas.getContext) {
  ctx = canvas.getContext("2d");
}

// Marker state
const MARK_NONE = null;
const MARK_Q = "Q";
const MARK_T = "T";
const MARK_R1 = "R1";
const MARK_R2 = "R2";

let currentMarkMode = MARK_NONE;
let image = null; // HTMLImageElement
let imageLoaded = false;

// Marker coordinates in canvas space
let qPoint = null;
let tPoint = null;
let r1Point = null;
let r2Point = null;

// Logging buffer (for on-screen log)
const MAX_LOG_LINES = 50;
let logLines = [];

// ===== Logging helpers =====
function log(message, level = "info") {
  const ts = new Date().toISOString().slice(11, 19); // HH:MM:SS
  const line = `[${ts}] [${level.toUpperCase()}] ${message}`;
  logLines.push(line);
  if (logLines.length > MAX_LOG_LINES) {
    logLines.shift();
  }
  if (logArea) {
    logArea.textContent = logLines.join("\n");
  }
  // Also log to console for deeper debugging
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

function showError(msg) {
  if (errorBox) {
    errorBox.textContent = msg;
    errorBox.classList.remove("hide");
  }
  log(msg, "error");
}

function clearError() {
  if (errorBox) {
    errorBox.textContent = "";
    errorBox.classList.add("hide");
  }
}

// ===== Utility helpers =====
function safeNumberFromInput(inputEl, fallback) {
  if (!inputEl) return fallback;
  const v = Number(inputEl.value);
  if (!Number.isFinite(v) || v <= 0) return fallback;
  return v;
}

function setMarkMode(mode) {
  currentMarkMode = mode;
  if (!markModeLabel) return;

  switch (mode) {
    case MARK_Q:
      markModeLabel.textContent =
        "Marking Q start — click on the waveform where Q begins.";
      break;
    case MARK_T:
      markModeLabel.textContent =
        "Marking T end — click on the waveform where T ends.";
      break;
    case MARK_R1:
      markModeLabel.textContent =
        "Marking R1 — click on the first R peak used for RR.";
      break;
    case MARK_R2:
      markModeLabel.textContent =
        "Marking R2 — click on the second R peak used for RR.";
      break;
    default:
      markModeLabel.textContent =
        "No active mark. Choose a marker, then click on the waveform.";
      break;
  }

  log(`Mark mode set to: ${mode || "none"}`, "info");
}

// Reset numeric outputs
function resetOutputs() {
  if (qtEl) qtEl.textContent = "—";
  if (rrEl) rrEl.textContent = "—";
  if (qtcEl) qtcEl.textContent = "—";
  if (qtcClassEl) qtcClassEl.textContent = "—";
}

// ===== Canvas drawing =====
function clearCanvas() {
  if (!ctx || !canvas) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function drawGrid() {
  if (!ctx || !canvas) return;

  const W = canvas.width;
  const H = canvas.height;

  // Background
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, W, H);

  // Light grid (small boxes)
  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 0.5;
  const smallStep = 20; // px
  for (let x = 0; x <= W; x += smallStep) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, H);
    ctx.stroke();
  }
  for (let y = 0; y <= H; y += smallStep) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(W, y + 0.5);
    ctx.stroke();
  }

  // Darker grid (large boxes)
  ctx.strokeStyle = "#cbd5f5";
  ctx.lineWidth = 1;
  const largeStep = smallStep * 5;
  for (let x = 0; x <= W; x += largeStep) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, H);
    ctx.stroke();
  }
  for (let y = 0; y <= H; y += largeStep) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(W, y + 0.5);
    ctx.stroke();
  }
}

function drawImage() {
  if (!ctx || !canvas) return;
  if (!image || !imageLoaded) return;

  // Fit image into canvas while preserving aspect ratio
  const cw = canvas.width;
  const ch = canvas.height;
  const iw = image.naturalWidth || image.width;
  const ih = image.naturalHeight || image.height;

  if (!iw || !ih) {
    log("Image natural size not available, drawing raw.", "warn");
    ctx.drawImage(image, 0, 0, cw, ch);
    return;
  }

  const scale = Math.min(cw / iw, ch / ih);
  const drawW = iw * scale;
  const drawH = ih * scale;
  const offsetX = (cw - drawW) / 2;
  const offsetY = (ch - drawH) / 2;

  ctx.drawImage(image, offsetX, offsetY, drawW, drawH);
}

// Draw a single marker
function drawMarker(pt, color, label) {
  if (!ctx || !pt) return;

  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;

  // Dot
  ctx.beginPath();
  ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2);
  ctx.fill();

  // Label
  ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto";
  ctx.fillStyle = "#0f172a";
  ctx.fillText(label, pt.x + 8, pt.y - 8);

  ctx.restore();
}

// Draw QT band (vertical line between Q and T)
function drawQtBand(q, t) {
  if (!ctx || !q || !t) return;
  ctx.save();
  ctx.fillStyle = "rgba(37,99,235,0.10)";
  const x1 = q.x;
  const x2 = t.x;
  const left = Math.min(x1, x2);
  const right = Math.max(x1, x2);
  ctx.fillRect(left, 0, right - left, canvas.height);

  // Vertical lines at Q and T
  ctx.strokeStyle = "#2563eb";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(x1 + 0.5, 0);
  ctx.lineTo(x1 + 0.5, canvas.height);
  ctx.moveTo(x2 + 0.5, 0);
  ctx.lineTo(x2 + 0.5, canvas.height);
  ctx.stroke();
  ctx.restore();
}

// Draw RR band between R1 and R2
function drawRrBand(r1, r2) {
  if (!ctx || !r1 || !r2) return;
  ctx.save();
  ctx.fillStyle = "rgba(234,88,12,0.08)";
  const x1 = r1.x;
  const x2 = r2.x;
  const left = Math.min(x1, x2);
  const right = Math.max(x1, x2);
  ctx.fillRect(left, 0, right - left, canvas.height);

  // Vertical lines at R1 and R2
  ctx.strokeStyle = "#ea580c";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(x1 + 0.5, 0);
  ctx.lineTo(x1 + 0.5, canvas.height);
  ctx.moveTo(x2 + 0.5, 0);
  ctx.lineTo(x2 + 0.5, canvas.height);
  ctx.stroke();
  ctx.restore();
}

// Redraw all layers
function redraw() {
  if (!ctx || !canvas) return;

  clearCanvas();
  drawGrid();
  drawImage();

  // Bands first
  if (qPoint && tPoint) {
    drawQtBand(qPoint, tPoint);
  }
  if (r1Point && r2Point) {
    drawRrBand(r1Point, r2Point);
  }

  // Markers last
  if (qPoint) drawMarker(qPoint, "#1d4ed8", "Q");
  if (tPoint) drawMarker(tPoint, "#b91c1c", "T");
  if (r1Point) drawMarker(r1Point, "#d97706", "R1");
  if (r2Point) drawMarker(r2Point, "#047857", "R2");
}

// ===== Interval + QTc computation =====
function computeIntervalsAndUpdate() {
  const msPerPixel = safeNumberFromInput(msPerPixelInput, 1.2);

  let qtMs = null;
  let rrMs = null;

  if (qPoint && tPoint) {
    const dx = Math.abs(tPoint.x - qPoint.x);
    qtMs = dx * msPerPixel;
  }

  if (r1Point && r2Point) {
    const dx = Math.abs(r2Point.x - r1Point.x);
    rrMs = dx * msPerPixel;
  }

  // Update QT
  if (qtEl) {
    qtEl.textContent =
      qtMs !== null && Number.isFinite(qtMs) ? qtMs.toFixed(0) : "—";
  }

  // Update RR
  if (rrEl) {
    rrEl.textContent =
      rrMs !== null && Number.isFinite(rrMs) ? rrMs.toFixed(0) : "—";
  }

  // Compute QTc (Fridericia) if we have both QT and RR
  let qtcMs = null;
  if (qtMs !== null && rrMs !== null && qtMs > 0 && rrMs > 0) {
    const rrSec = rrMs / 1000;
    const denom = Math.cbrt(rrSec);
    if (denom > 0 && Number.isFinite(denom)) {
      qtcMs = qtMs / denom;
    }
  }

  if (qtcEl) {
    qtcEl.textContent =
      qtcMs !== null && Number.isFinite(qtcMs) ? qtcMs.toFixed(0) : "—";
  }

  // Simple non-diagnostic classification (generic, not age/sex specific)
  if (qtcClassEl) {
    if (qtcMs === null || !Number.isFinite(qtcMs)) {
      qtcClassEl.textContent = "Not available";
    } else if (qtcMs >= 500) {
      qtcClassEl.textContent = "Markedly prolonged (generic non-diagnostic band)";
    } else if (qtcMs >= 480) {
      qtcClassEl.textContent = "Prolonged (generic non-diagnostic band)";
    } else if (qtcMs >= 440) {
      qtcClassEl.textContent = "Borderline high (generic non-diagnostic band)";
    } else {
      qtcClassEl.textContent = "Within generic QTc reference band";
    }
  }

  log(
    `Recomputed intervals — QT: ${
      qtMs ? qtMs.toFixed(1) : "n/a"
    } ms, RR: ${rrMs ? rrMs.toFixed(1) : "n/a"} ms, QTc (Fridericia): ${
      qtcMs ? qtcMs.toFixed(1) : "n/a"
    } ms`,
    "info"
  );
}

// ===== Event handlers =====
function handleFileChange(event) {
  clearError();
  const file = event.target.files && event.target.files[0];
  if (!file) {
    log("No file selected.", "warn");
    return;
  }

  if (!file.type.match(/^image\/(png|jpeg|jpg)$/i)) {
    showError("Please upload a PNG or JPEG ECG image.");
    return;
  }

  const url = URL.createObjectURL(file);
  image = new Image();
  imageLoaded = false;

  image.onload = () => {
    imageLoaded = true;
    log(
      `Image loaded successfully (${file.name}, ${image.naturalWidth}×${image.naturalHeight}).`,
      "info"
    );
    redraw();
    URL.revokeObjectURL(url);
  };

  image.onerror = () => {
    showError("Unable to load this image. Please choose a valid ECG image.");
    imageLoaded = false;
    image = null;
    redraw();
    URL.revokeObjectURL(url);
  };

  image.src = url;
  log(`Loading image: ${file.name}`, "info");
}

function handleCanvasClick(event) {
  if (!canvas) return;
  if (!image || !imageLoaded) {
    showError("Upload an ECG image first, then mark intervals.");
    return;
  }
  if (!currentMarkMode) {
    showError("Select a mark mode (Q, T, R1, or R2) before clicking.");
    return;
  }

  clearError();

  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  const pt = { x, y };

  switch (currentMarkMode) {
    case MARK_Q:
      qPoint = pt;
      log(`Placed Q start at (${x.toFixed(1)}, ${y.toFixed(1)}).`, "info");
      break;
    case MARK_T:
      tPoint = pt;
      log(`Placed T end at (${x.toFixed(1)}, ${y.toFixed(1)}).`, "info");
      break;
    case MARK_R1:
      r1Point = pt;
      log(`Placed R1 at (${x.toFixed(1)}, ${y.toFixed(1)}).`, "info");
      break;
    case MARK_R2:
      r2Point = pt;
      log(`Placed R2 at (${x.toFixed(1)}, ${y.toFixed(1)}).`, "info");
      break;
    default:
      // Should not happen
      log("Canvas click with no active mark mode (unexpected).", "warn");
      break;
  }

  redraw();
  computeIntervalsAndUpdate();
}

function clearMarks() {
  qPoint = null;
  tPoint = null;
  r1Point = null;
  r2Point = null;
  resetOutputs();
  redraw();
  log("Cleared all markers and outputs.", "info");
}

// ===== Wiring =====
function initWaveformViewer() {
  try {
    if (fileInput) {
      fileInput.addEventListener("change", handleFileChange);
    } else {
      log("Missing file input element (waveform-file).", "error");
    }

    if (canvas && ctx) {
      canvas.addEventListener("click", handleCanvasClick);
      redraw();
    } else {
      log("Canvas context could not be initialised.", "error");
    }

    if (btnMarkQ) {
      btnMarkQ.addEventListener("click", () => setMarkMode(MARK_Q));
    } else {
      log("btn-mark-q not found in DOM.", "warn");
    }

    if (btnMarkT) {
      btnMarkT.addEventListener("click", () => setMarkMode(MARK_T));
    } else {
      log("btn-mark-t not found in DOM.", "warn");
    }

    if (btnMarkR1) {
      btnMarkR1.addEventListener("click", () => setMarkMode(MARK_R1));
    } else {
      log("btn-mark-r1 not found in DOM.", "warn");
    }

    if (btnMarkR2) {
      btnMarkR2.addEventListener("click", () => setMarkMode(MARK_R2));
    } else {
      log("btn-mark-r2 not found in DOM.", "warn");
    }

    if (btnClearMarks) {
      btnClearMarks.addEventListener("click", clearMarks);
    } else {
      log("btn-clear-marks not found in DOM.", "warn");
    }

    if (msPerPixelInput) {
      msPerPixelInput.addEventListener("change", () => {
        const val = safeNumberFromInput(msPerPixelInput, 1.2);
        log(`Updated ms-per-pixel calibration to ${val}.`, "info");
        computeIntervalsAndUpdate();
      });
    } else {
      log("ms-per-pixel input not found in DOM.", "warn");
    }

    resetOutputs();
    setMarkMode(MARK_NONE);

    if (healthChip) {
      healthChip.textContent = "Local waveform tools";
      healthChip.className = "status-badge status-badge--green";
    }

    log("Waveform viewer initialised.", "info");
  } catch (err) {
    log(`Unexpected initialisation error: ${err.message || err}`, "error");
  }
}

// DOM ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initWaveformViewer);
} else {
  initWaveformViewer();
}
