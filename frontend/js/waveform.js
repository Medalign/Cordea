// ===== WAVEFORM VIEWER - ECG QT/QTc MEASUREMENT =====
// Interactive waveform marking for QT, RR, and QTc calculation

// ===== DOM ELEMENTS =====
const fileInput = document.getElementById("waveform-file");
const errorBox = document.getElementById("waveform-error");
const msPerPixelInput = document.getElementById("ms-per-pixel");

const btnMarkQ = document.getElementById("btn-mark-q");
const btnMarkT = document.getElementById("btn-mark-t");
const btnMarkR1 = document.getElementById("btn-mark-r1");
const btnMarkR2 = document.getElementById("btn-mark-r2");
const btnGrabMode = document.getElementById("btn-grab-mode");
const btnClearMarks = document.getElementById("btn-clear-marks");
const btnClearUpload = document.getElementById("clear-upload-btn");

const btnZoomIn = document.getElementById("zoom-in");
const btnZoomOut = document.getElementById("zoom-out");
const btnZoomReset = document.getElementById("zoom-reset");
const zoomLevelEl = document.getElementById("zoom-level");

const markModeLabel = document.getElementById("mark-mode-label");
const logArea = document.getElementById("waveform-log");

const canvas = document.getElementById("ecg-canvas");
const qtEl = document.getElementById("qt-ms");
const rrEl = document.getElementById("rr-ms");
const qtcEl = document.getElementById("qtc-ms");
const qtcClassEl = document.getElementById("qtc-class");

const healthChip = document.getElementById("health-chip");

// ===== CANVAS CONTEXT =====
let ctx = null;
if (canvas && canvas.getContext) {
  ctx = canvas.getContext("2d");
}

// ===== MARKER STATE =====
const MARK_NONE = null;
const MARK_Q = "Q";
const MARK_T = "T";
const MARK_R1 = "R1";
const MARK_R2 = "R2";
const MARK_GRAB = "GRAB";

let currentMarkMode = MARK_NONE;
let previousMarkMode = MARK_NONE; // Store mark mode before entering grab mode
let isGrabMode = false;
let image = null;
let imageLoaded = false;

// Marker coordinates in canvas space
let qPoint = null;
let tPoint = null;
let r1Point = null;
let r2Point = null;

// ===== ZOOM AND PAN STATE =====
let scale = 1.0;
let offsetX = 0;
let offsetY = 0;
let isPanning = false;
let panStartX = 0;
let panStartY = 0;
let lastOffsetX = 0;
let lastOffsetY = 0;

// ===== LOGGING =====
const MAX_LOG_LINES = 50;
let logLines = [];

function log(message, level = "info") {
  const ts = new Date().toISOString().slice(11, 19);
  const line = `[${ts}] [${level.toUpperCase()}] ${message}`;
  logLines.push(line);
  if (logLines.length > MAX_LOG_LINES) {
    logLines.shift();
  }
  if (logArea) {
    logArea.textContent = logLines.join("\n");
    // Auto-scroll to bottom
    logArea.scrollTop = logArea.scrollHeight;
  }
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

// ===== UTILITIES =====
function safeNumberFromInput(inputEl, fallback) {
  if (!inputEl) return fallback;
  const v = Number(inputEl.value);
  if (!Number.isFinite(v) || v <= 0) return fallback;
  return v;
}

function updateZoomLevel() {
  if (zoomLevelEl) {
    zoomLevelEl.textContent = `${Math.round(scale * 100)}%`;
  }
}

function resetZoom() {
  scale = 1.0;
  offsetX = 0;
  offsetY = 0;
  updateZoomLevel();
  redraw();
  log("🔍 Reset zoom to 100%", "info");
}

function zoomIn() {
  const oldScale = scale;
  scale = Math.min(scale * 1.2, 10);

  // Center the zoom on the canvas center
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;

  // Adjust offset to keep center point stable
  offsetX = offsetX * (scale / oldScale) + centerX * (1 - scale / oldScale);
  offsetY = offsetY * (scale / oldScale) + centerY * (1 - scale / oldScale);

  updateZoomLevel();
  redraw();
  log(`🔍 Zoomed in to ${Math.round(scale * 100)}%`, "info");
}

function zoomOut() {
  const oldScale = scale;
  scale = Math.max(scale / 1.2, 0.5);

  // Center the zoom on the canvas center
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;

  // Adjust offset to keep center point stable
  offsetX = offsetX * (scale / oldScale) + centerX * (1 - scale / oldScale);
  offsetY = offsetY * (scale / oldScale) + centerY * (1 - scale / oldScale);

  updateZoomLevel();
  redraw();
  log(`🔍 Zoomed out to ${Math.round(scale * 100)}%`, "info");
}

function zoomAtPoint(x, y, delta) {
  const oldScale = scale;

  // Determine zoom direction and amount
  if (delta > 0) {
    scale = Math.min(scale * 1.1, 10);
  } else {
    scale = Math.max(scale / 1.1, 0.5);
  }

  // Adjust offset to zoom towards cursor position
  offsetX = offsetX * (scale / oldScale) + x * (1 - scale / oldScale);
  offsetY = offsetY * (scale / oldScale) + y * (1 - scale / oldScale);

  updateZoomLevel();
  redraw();
}

// Transform screen coordinates to canvas coordinates
function screenToCanvas(screenX, screenY) {
  const rect = canvas.getBoundingClientRect();
  const x = screenX - rect.left;
  const y = screenY - rect.top;

  // Apply inverse transformation
  const canvasX = (x - offsetX) / scale;
  const canvasY = (y - offsetY) / scale;

  return { x: canvasX, y: canvasY };
}

function setMarkMode(mode) {
  currentMarkMode = mode;
  isGrabMode = false;

  // Remove active state from all buttons
  [btnMarkQ, btnMarkT, btnMarkR1, btnMarkR2].forEach(btn => {
    if (btn) btn.classList.remove("btn-primary");
  });

  if (btnGrabMode) {
    btnGrabMode.classList.remove("active");
  }

  // Set active state
  let activeBtn = null;
  switch (mode) {
    case MARK_Q:
      activeBtn = btnMarkQ;
      if (markModeLabel) {
        markModeLabel.textContent = "Marking Q start — click on the waveform where Q begins.";
      }
      break;
    case MARK_T:
      activeBtn = btnMarkT;
      if (markModeLabel) {
        markModeLabel.textContent = "Marking T end — click on the waveform where T ends.";
      }
      break;
    case MARK_R1:
      activeBtn = btnMarkR1;
      if (markModeLabel) {
        markModeLabel.textContent = "Marking R1 — click on the first R peak used for RR.";
      }
      break;
    case MARK_R2:
      activeBtn = btnMarkR2;
      if (markModeLabel) {
        markModeLabel.textContent = "Marking R2 — click on the second R peak used for RR.";
      }
      break;
    default:
      if (markModeLabel) {
        markModeLabel.textContent = "No active mark. Choose a marker, then click on the waveform.";
      }
      break;
  }

  if (activeBtn) {
    activeBtn.classList.add("btn-primary");
  }

  if (canvas) {
    canvas.style.cursor = 'crosshair';
  }

  log(`Mark mode set to: ${mode || "none"}`, "info");
}

function toggleGrabMode() {
  if (isGrabMode) {
    // Exit grab mode, return to previous mark mode
    isGrabMode = false;
    if (btnGrabMode) {
      btnGrabMode.classList.remove("active");
    }

    // Restore previous mark mode
    currentMarkMode = previousMarkMode;

    // Reactivate the previous mark button
    let activeBtn = null;
    switch (currentMarkMode) {
      case MARK_Q:
        activeBtn = btnMarkQ;
        if (markModeLabel) {
          markModeLabel.textContent = "Marking Q start — click on the waveform where Q begins.";
        }
        break;
      case MARK_T:
        activeBtn = btnMarkT;
        if (markModeLabel) {
          markModeLabel.textContent = "Marking T end — click on the waveform where T ends.";
        }
        break;
      case MARK_R1:
        activeBtn = btnMarkR1;
        if (markModeLabel) {
          markModeLabel.textContent = "Marking R1 — click on the first R peak used for RR.";
        }
        break;
      case MARK_R2:
        activeBtn = btnMarkR2;
        if (markModeLabel) {
          markModeLabel.textContent = "Marking R2 — click on the second R peak used for RR.";
        }
        break;
      default:
        if (markModeLabel) {
          markModeLabel.textContent = "No active mark. Choose a marker, then click on the waveform.";
        }
        break;
    }

    if (activeBtn) {
      activeBtn.classList.add("btn-primary");
    }

    if (canvas) {
      canvas.style.cursor = 'crosshair';
    }

    log("Exited grab mode, returned to mark mode", "info");
  } else {
    // Enter grab mode
    isGrabMode = true;
    previousMarkMode = currentMarkMode;

    if (btnGrabMode) {
      btnGrabMode.classList.add("active");
    }

    if (markModeLabel) {
      markModeLabel.textContent = "Grab mode active — click and drag to pan around the image.";
    }

    if (canvas) {
      canvas.style.cursor = 'grab';
    }

    log("Entered grab mode — click and drag to pan", "info");
  }
}

function resetOutputs() {
  if (qtEl) qtEl.textContent = "—";
  if (rrEl) rrEl.textContent = "—";
  if (qtcEl) qtcEl.textContent = "—";
  if (qtcClassEl) qtcClassEl.textContent = "—";
}

// ===== CANVAS DRAWING =====
function clearCanvas() {
  if (!ctx || !canvas) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function drawGrid() {
  if (!ctx || !canvas) return;

  // Calculate visible area in canvas coordinates
  const visibleLeft = -offsetX / scale;
  const visibleTop = -offsetY / scale;
  const visibleRight = (canvas.width - offsetX) / scale;
  const visibleBottom = (canvas.height - offsetY) / scale;

  // Background
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(visibleLeft, visibleTop, visibleRight - visibleLeft, visibleBottom - visibleTop);

  // Light grid (small boxes)
  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 0.5 / scale;
  const smallStep = 20;

  const startX = Math.floor(visibleLeft / smallStep) * smallStep;
  const startY = Math.floor(visibleTop / smallStep) * smallStep;

  for (let x = startX; x <= visibleRight; x += smallStep) {
    ctx.beginPath();
    ctx.moveTo(x, visibleTop);
    ctx.lineTo(x, visibleBottom);
    ctx.stroke();
  }
  for (let y = startY; y <= visibleBottom; y += smallStep) {
    ctx.beginPath();
    ctx.moveTo(visibleLeft, y);
    ctx.lineTo(visibleRight, y);
    ctx.stroke();
  }

  // Darker grid (large boxes)
  ctx.strokeStyle = "#cbd5f5";
  ctx.lineWidth = 1 / scale;
  const largeStep = smallStep * 5;

  const startLargeX = Math.floor(visibleLeft / largeStep) * largeStep;
  const startLargeY = Math.floor(visibleTop / largeStep) * largeStep;

  for (let x = startLargeX; x <= visibleRight; x += largeStep) {
    ctx.beginPath();
    ctx.moveTo(x, visibleTop);
    ctx.lineTo(x, visibleBottom);
    ctx.stroke();
  }
  for (let y = startLargeY; y <= visibleBottom; y += largeStep) {
    ctx.beginPath();
    ctx.moveTo(visibleLeft, y);
    ctx.lineTo(visibleRight, y);
    ctx.stroke();
  }
}

function drawImage() {
  if (!ctx || !canvas) return;
  if (!image || !imageLoaded) return;

  const cw = canvas.width;
  const ch = canvas.height;
  const iw = image.naturalWidth || image.width;
  const ih = image.naturalHeight || image.height;

  if (!iw || !ih) {
    log("Image natural size not available, drawing raw.", "warn");
    ctx.drawImage(image, 0, 0, cw, ch);
    return;
  }

  // Calculate scale to fit image in canvas
  const scaleToFit = Math.min(cw / iw, ch / ih);
  const drawW = iw * scaleToFit;
  const drawH = ih * scaleToFit;

  // Center the image
  const imageX = (cw - drawW) / 2;
  const imageY = (ch - drawH) / 2;

  ctx.drawImage(image, imageX, imageY, drawW, drawH);
}

function drawMarker(pt, color, label) {
  if (!ctx || !pt) return;

  ctx.save();

  // Scale marker size inversely to zoom so it stays consistent
  const markerScale = 1 / scale;

  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2 * markerScale;

  // Outer glow
  ctx.shadowColor = color;
  ctx.shadowBlur = 10 * markerScale;

  // Dot
  ctx.beginPath();
  ctx.arc(pt.x, pt.y, 6 * markerScale, 0, Math.PI * 2);
  ctx.fill();

  // Reset shadow
  ctx.shadowBlur = 0;

  // Label with background
  const fontSize = 13 * markerScale;
  ctx.font = `bold ${fontSize}px system-ui, -apple-system, Segoe UI, Roboto`;
  const metrics = ctx.measureText(label);
  const labelWidth = metrics.width;
  const labelHeight = 16 * markerScale;
  const labelX = pt.x + 10 * markerScale;
  const labelY = pt.y - 10 * markerScale;

  // Label background
  ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
  ctx.fillRect(labelX - 2 * markerScale, labelY - labelHeight + 2 * markerScale, labelWidth + 4 * markerScale, labelHeight);

  // Label border
  ctx.strokeStyle = color;
  ctx.lineWidth = 1 * markerScale;
  ctx.strokeRect(labelX - 2 * markerScale, labelY - labelHeight + 2 * markerScale, labelWidth + 4 * markerScale, labelHeight);

  // Label text
  ctx.fillStyle = color;
  ctx.fillText(label, labelX, labelY);

  ctx.restore();
}

function drawQtBand(q, t) {
  if (!ctx || !q || !t) return;
  ctx.save();
  ctx.fillStyle = "rgba(37,99,235,0.10)";
  const x1 = q.x;
  const x2 = t.x;
  const left = Math.min(x1, x2);
  const right = Math.max(x1, x2);

  // Draw to full canvas height in canvas coordinates
  const canvasTop = -offsetY / scale;
  const canvasBottom = (canvas.height - offsetY) / scale;
  ctx.fillRect(left, canvasTop, right - left, canvasBottom - canvasTop);

  // Vertical lines
  ctx.strokeStyle = "#2563eb";
  ctx.lineWidth = 2 / scale;
  ctx.setLineDash([4 / scale, 4 / scale]);
  ctx.beginPath();
  ctx.moveTo(x1, canvasTop);
  ctx.lineTo(x1, canvasBottom);
  ctx.moveTo(x2, canvasTop);
  ctx.lineTo(x2, canvasBottom);
  ctx.stroke();
  ctx.restore();
}

function drawRrBand(r1, r2) {
  if (!ctx || !r1 || !r2) return;
  ctx.save();
  ctx.fillStyle = "rgba(234,88,12,0.08)";
  const x1 = r1.x;
  const x2 = r2.x;
  const left = Math.min(x1, x2);
  const right = Math.max(x1, x2);

  // Draw to full canvas height in canvas coordinates
  const canvasTop = -offsetY / scale;
  const canvasBottom = (canvas.height - offsetY) / scale;
  ctx.fillRect(left, canvasTop, right - left, canvasBottom - canvasTop);

  // Vertical lines
  ctx.strokeStyle = "#ea580c";
  ctx.lineWidth = 2 / scale;
  ctx.setLineDash([4 / scale, 4 / scale]);
  ctx.beginPath();
  ctx.moveTo(x1, canvasTop);
  ctx.lineTo(x1, canvasBottom);
  ctx.moveTo(x2, canvasTop);
  ctx.lineTo(x2, canvasBottom);
  ctx.stroke();
  ctx.restore();
}

function redraw() {
  if (!ctx || !canvas) return;

  // Clear the entire canvas first
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Apply transformation
  ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);

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

  // Reset transformation for any UI elements drawn in screen space
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// ===== INTERVAL COMPUTATION =====
function computeIntervalsAndUpdate() {
  const msPerPixel = safeNumberFromInput(msPerPixelInput, 6.0);

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

  // Update displays
  if (qtEl) {
    qtEl.textContent = qtMs !== null && Number.isFinite(qtMs) ? qtMs.toFixed(0) : "—";
  }

  if (rrEl) {
    rrEl.textContent = rrMs !== null && Number.isFinite(rrMs) ? rrMs.toFixed(0) : "—";
  }

  // Compute QTc (Fridericia)
  let qtcMs = null;
  if (qtMs !== null && rrMs !== null && qtMs > 0 && rrMs > 0) {
    const rrSec = rrMs / 1000;
    const denom = Math.cbrt(rrSec);
    if (denom > 0 && Number.isFinite(denom)) {
      qtcMs = qtMs / denom;
    }
  }

  if (qtcEl) {
    qtcEl.textContent = qtcMs !== null && Number.isFinite(qtcMs) ? qtcMs.toFixed(0) : "—";
  }

  // Classification (generic, non-diagnostic)
  if (qtcClassEl) {
    if (qtcMs === null || !Number.isFinite(qtcMs)) {
      qtcClassEl.textContent = "Not available";
      qtcClassEl.className = "result-classification";
    } else if (qtcMs >= 500) {
      qtcClassEl.textContent = "Markedly prolonged (generic non-diagnostic band)";
      qtcClassEl.className = "result-classification";
    } else if (qtcMs >= 480) {
      qtcClassEl.textContent = "Prolonged (generic non-diagnostic band)";
      qtcClassEl.className = "result-classification";
    } else if (qtcMs >= 440) {
      qtcClassEl.textContent = "Borderline high (generic non-diagnostic band)";
      qtcClassEl.className = "result-classification";
    } else {
      qtcClassEl.textContent = "Within generic QTc reference band";
      qtcClassEl.className = "result-classification";
    }
  }

  log(
    `Recomputed — QT: ${qtMs ? qtMs.toFixed(1) : "n/a"} ms, RR: ${rrMs ? rrMs.toFixed(1) : "n/a"} ms, QTc: ${qtcMs ? qtcMs.toFixed(1) : "n/a"} ms`,
    "info"
  );
}

// ===== EVENT HANDLERS =====
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

  // Update button text to show filename
  const uploadBtn = document.querySelector('.upload-btn');
  const uploadBtnText = document.getElementById('upload-btn-text');
  if (uploadBtn) {
    uploadBtn.classList.add('has-file');
  }
  if (uploadBtnText) {
    const maxLength = 30;
    const fileName = file.name.length > maxLength
      ? file.name.substring(0, maxLength - 3) + '...'
      : file.name;
    uploadBtnText.textContent = fileName;
  }

  // Show clear button
  if (btnClearUpload) {
    btnClearUpload.classList.remove('hide');
  }

  const url = URL.createObjectURL(file);
  image = new Image();
  imageLoaded = false;

  image.onload = () => {
    imageLoaded = true;
    log(`✅ Image loaded successfully (${file.name}, ${image.naturalWidth}×${image.naturalHeight})`, "info");
    redraw();
    URL.revokeObjectURL(url);
  };

  image.onerror = () => {
    showError("Unable to load this image. Please choose a valid ECG image.");
    imageLoaded = false;
    image = null;
    redraw();
    URL.revokeObjectURL(url);
    // Reset button
    if (uploadBtn) {
      uploadBtn.classList.remove('has-file');
    }
    if (uploadBtnText) {
      uploadBtnText.textContent = 'Upload ECG Image';
    }
    if (btnClearUpload) {
      btnClearUpload.classList.add('hide');
    }
  };

  image.src = url;
  log(`Loading image: ${file.name}...`, "info");
}

function handleCanvasClick(event) {
  if (!canvas) return;
  if (!image || !imageLoaded) {
    showError("Upload an ECG image first, then mark intervals.");
    return;
  }

  // Don't place marker if in grab mode
  if (isGrabMode) {
    return;
  }

  if (!currentMarkMode) {
    showError("Select a mark mode (Q, T, R1, or R2) before clicking.");
    return;
  }

  // Don't place marker if we were panning
  if (isPanning) {
    return;
  }

  clearError();

  // Transform screen coordinates to canvas coordinates for pinpoint accuracy
  const pt = screenToCanvas(event.clientX, event.clientY);

  switch (currentMarkMode) {
    case MARK_Q:
      qPoint = pt;
      log(`✓ Placed Q start at (${pt.x.toFixed(1)}, ${pt.y.toFixed(1)})`, "info");
      break;
    case MARK_T:
      tPoint = pt;
      log(`✓ Placed T end at (${pt.x.toFixed(1)}, ${pt.y.toFixed(1)})`, "info");
      break;
    case MARK_R1:
      r1Point = pt;
      log(`✓ Placed R1 at (${pt.x.toFixed(1)}, ${pt.y.toFixed(1)})`, "info");
      break;
    case MARK_R2:
      r2Point = pt;
      log(`✓ Placed R2 at (${pt.x.toFixed(1)}, ${pt.y.toFixed(1)})`, "info");
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
  log("🗑️ Cleared all markers and outputs", "info");
}

function clearUpload() {
  // Clear the image
  image = null;
  imageLoaded = false;

  // Clear all markers
  clearMarks();

  // Reset file input
  if (fileInput) {
    fileInput.value = '';
  }

  // Reset button appearance
  const uploadBtn = document.querySelector('.upload-btn');
  const uploadBtnText = document.getElementById('upload-btn-text');
  if (uploadBtn) {
    uploadBtn.classList.remove('has-file');
  }
  if (uploadBtnText) {
    uploadBtnText.textContent = 'Upload ECG Image';
  }

  // Hide clear button
  if (btnClearUpload) {
    btnClearUpload.classList.add('hide');
  }

  // Clear any errors
  clearError();

  // Reset zoom
  resetZoom();

  // Redraw (will show just the grid)
  redraw();

  log("🗑️ Cleared uploaded image", "info");
}

// ===== PANNING HANDLERS =====
function handleMouseDown(event) {
  if (!canvas) return;

  // Allow pan if in grab mode, or if no mark mode is active, or using right/middle mouse button
  if (isGrabMode || !currentMarkMode || event.button === 1 || event.button === 2) {
    event.preventDefault();
    isPanning = true;
    panStartX = event.clientX;
    panStartY = event.clientY;
    lastOffsetX = offsetX;
    lastOffsetY = offsetY;
    canvas.style.cursor = 'grabbing';
  }
}

function handleMouseMove(event) {
  if (!canvas) return;

  if (isPanning) {
    event.preventDefault();
    const dx = event.clientX - panStartX;
    const dy = event.clientY - panStartY;

    offsetX = lastOffsetX + dx;
    offsetY = lastOffsetY + dy;

    redraw();
  }
}

function handleMouseUp(event) {
  if (!canvas) return;

  if (isPanning) {
    isPanning = false;
    // Set cursor based on current mode
    canvas.style.cursor = isGrabMode ? 'grab' : 'crosshair';
  }
}

function handleMouseLeave(event) {
  if (!canvas) return;

  if (isPanning) {
    isPanning = false;
    // Set cursor based on current mode
    canvas.style.cursor = isGrabMode ? 'grab' : 'crosshair';
  }
}

function handleWheel(event) {
  if (!canvas) return;
  event.preventDefault();

  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  // Normalize wheel delta for different browsers/devices
  const delta = event.deltaY || event.detail || event.wheelDelta;

  zoomAtPoint(x, y, -delta);
}

// ===== INITIALIZATION =====
function initializeWaveformViewer() {
  try {
    if (fileInput) {
      fileInput.addEventListener("change", handleFileChange);
    } else {
      log("❌ Missing file input element (waveform-file)", "error");
    }

    if (canvas && ctx) {
      canvas.addEventListener("click", handleCanvasClick);

      // Pan event listeners
      canvas.addEventListener("mousedown", handleMouseDown);
      canvas.addEventListener("mousemove", handleMouseMove);
      canvas.addEventListener("mouseup", handleMouseUp);
      canvas.addEventListener("mouseleave", handleMouseLeave);

      // Zoom with mouse wheel
      canvas.addEventListener("wheel", handleWheel, { passive: false });

      // Prevent context menu on right-click
      canvas.addEventListener("contextmenu", (e) => e.preventDefault());

      redraw();
    } else {
      log("❌ Canvas context could not be initialized", "error");
    }

    // Zoom controls
    if (btnZoomIn) {
      btnZoomIn.addEventListener("click", zoomIn);
    }
    if (btnZoomOut) {
      btnZoomOut.addEventListener("click", zoomOut);
    }
    if (btnZoomReset) {
      btnZoomReset.addEventListener("click", resetZoom);
    }

    if (btnMarkQ) {
      btnMarkQ.addEventListener("click", () => setMarkMode(MARK_Q));
    }
    if (btnMarkT) {
      btnMarkT.addEventListener("click", () => setMarkMode(MARK_T));
    }
    if (btnMarkR1) {
      btnMarkR1.addEventListener("click", () => setMarkMode(MARK_R1));
    }
    if (btnMarkR2) {
      btnMarkR2.addEventListener("click", () => setMarkMode(MARK_R2));
    }
    if (btnGrabMode) {
      btnGrabMode.addEventListener("click", toggleGrabMode);
    }
    if (btnClearMarks) {
      btnClearMarks.addEventListener("click", clearMarks);
    }

    if (btnClearUpload) {
      btnClearUpload.addEventListener("click", clearUpload);
    }

    if (msPerPixelInput) {
      msPerPixelInput.addEventListener("change", () => {
        const val = safeNumberFromInput(msPerPixelInput, 6.0);
        log(`⚙️ Updated calibration to ${val} ms/pixel`, "info");
        computeIntervalsAndUpdate();
      });
    }

    resetOutputs();
    setMarkMode(MARK_NONE);
    updateZoomLevel();

    if (healthChip) {
      healthChip.textContent = "Local Tools";
      healthChip.className = "status-badge status-badge--green";
    }

    log("🚀 Waveform viewer initialized successfully", "info");
  } catch (err) {
    log(`❌ Initialization error: ${err.message || err}`, "error");
  }
}

// ===== START =====
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeWaveformViewer);
} else {
  initializeWaveformViewer();
}