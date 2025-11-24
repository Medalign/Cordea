// ===== SHARED GLOBAL STATE AND CONFIG =====

// Detect API base URL
let API_BASE = 'http://127.0.0.1:8000';

// Check URL parameters for API override
const urlParams = new URLSearchParams(window.location.search);
const apiOverride = urlParams.get('api');
if (apiOverride) {
  API_BASE = apiOverride;
  localStorage.setItem('cordea_API_BASE', apiOverride);
} else {
  const savedAPI = localStorage.getItem('cordea_API_BASE');
  if (savedAPI) {
    API_BASE = savedAPI;
  }
}

console.log('ðŸ”— Using API base:', API_BASE);

// ===== CORDEA API HELPER FUNCTIONS =====

class ApiError extends Error {
  constructor(message, { status, statusText, detail } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.statusText = statusText;
    this.detail = detail;
  }
}

function normaliseBase(v) {
  if (!v) return API_BASE;
  let s = String(v).trim();
  if (!s) return API_BASE;
  if (s.endsWith("/")) s = s.slice(0, -1);
  return s;
}

async function jsonPost(endpoint, body) {
  const url = `${normaliseBase(API_BASE)}${endpoint}`;

  try {
    console.log(`ðŸ“¡ POST: ${url}`);
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new ApiError(`HTTP ${response.status}: ${response.statusText}`, {
        status: response.status,
        statusText: response.statusText,
        detail: detail
      });
    }

    const data = await response.json();
    console.log(`âœ… Response:`, data);
    return data;
  } catch (error) {
    console.error(`âŒ API Error:`, error);
    throw error;
  }
}

async function checkHealth() {
  const healthChip = document.getElementById("health-chip");
  const healthRetryBtn = document.getElementById("health-retry");
  const backendBanner = document.getElementById("backend-warning");

  if (healthChip) healthChip.textContent = "API: Checking...";
  if (healthRetryBtn) healthRetryBtn.disabled = true;

  const url = `${normaliseBase(API_BASE)}/healthz`;

  try {
    const res = await fetch(url, { cache: "no-store" });

    if (res.ok) {
      if (healthChip) {
        healthChip.textContent = "API: Green";
        healthChip.className = "status-badge status-badge--green";
      }
      if (backendBanner) backendBanner.style.display = "none";
    } else {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch (err) {
    if (healthChip) {
      healthChip.textContent = "API: Offline";
      healthChip.className = "status-badge status-badge--red";
    }
    if (backendBanner) backendBanner.style.display = "block";
  } finally {
    if (healthRetryBtn) healthRetryBtn.disabled = false;
  }
}

// ===== CORDEA UTILITY FUNCTIONS =====

// Map UI age band labels to backend enum values
function mapAgeBandToEnum(label) {
  const L = (label || "")
    .toLowerCase()
    .replace(/\u2013|\u2014/g, "-")
    .trim();

  const table = {
    "adult 65+": "adult_65_plus",
    "65+ years": "adult_65_plus",
    "adult 18–64": "adult_18_39",
    "adult 18-64": "adult_18_39",
    "18–39 years": "adult_18_39",
    "18-39 years": "adult_18_39",
    "40–64 years": "adult_40_64",
    "40-64 years": "adult_40_64",
    "6–12 years": "child_6_12",
    "6-12 years": "child_6_12",
    "13–17 years": "adolescent",
    "13-17 years": "adolescent"
  };

  return table[L] || label;
}

function labelFromEnum(enumVal) {
  const t = (enumVal || "").toLowerCase();
  if (t === "adult_18_39") return "18â€“39 years";
  if (t === "adult_40_64") return "40â€“64 years";
  if (t === "adult_65_plus") return "65+ years";
  if (t === "child_6_12") return "6â€“12 years";
  return enumVal;
}

function defined(v) {
  return v !== undefined && v !== null && !Number.isNaN(v);
}

function pick(...xs) {
  for (const x of xs) if (defined(x)) return x;
  return null;
}

// Fridericia QTc correction
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
  if (t.includes("95")) return "borderline";
  if (t.includes("<50")) return "normal";
  if (t.includes("50")) return "normal";
  return "muted";
}

// Status -> badge class
function badgeClassFromStatus(status) {
  const s = String(status || "").toUpperCase();
  if (s === "GREEN") return "status-badge status-badge--green";
  if (s === "AMBER") return "status-badge status-badge--amber";
  if (s === "RED") return "status-badge status-badge--red";
  return "status-badge status-badge--muted";
}

// Severity -> badge class
function badgeClassFromSeverity(sev) {
  switch (sev) {
    case "high": return "status-badge status-badge--red";
    case "borderline": return "status-badge status-badge--amber";
    case "normal": return "status-badge status-badge--green";
    default: return "status-badge status-badge--muted";
  }
}

// Render badge elements
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

// ===== DOM UTILITIES =====

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
  btn.classList.add("btn-success");
  btn.textContent = successLabel;
  setTimeout(() => {
    btn.classList.remove("btn-success");
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

// ===== SHARED NOTIFICATION SYSTEM =====

function showNotification(message, type = 'success') {
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(() => notification.classList.add('show'), 100);
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  }, 4000);
}

// ===== SHARED UTILITY FUNCTIONS =====

function formatTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  let interval = seconds / 31536000;
  if (interval > 1) return Math.floor(interval) + " years ago";
  interval = seconds / 2592000;
  if (interval > 1) return Math.floor(interval) + " months ago";
  interval = seconds / 86400;
  if (interval > 1) return Math.floor(interval) + " days ago";
  interval = seconds / 3600;
  if (interval > 1) return Math.floor(interval) + " hours ago";
  interval = seconds / 60;
  if (interval > 1) return Math.floor(interval) + " minutes ago";
  return "Just now";
}

function formatShortDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso || "—";
  return d.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short"
  });
}

// ===== SHARED THEME MANAGEMENT =====

function applyTheme(theme) {
  document.body.classList.remove('dark-mode', 'high-contrast-mode');

  if (theme === 'dark') {
    document.body.classList.add('dark-mode');
  } else if (theme === 'high-contrast') {
    document.body.classList.add('high-contrast-mode');
  } else if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const prefersContrast = window.matchMedia('(prefers-contrast: more)').matches;

    if (prefersContrast) {
      document.body.classList.add('high-contrast-mode');
    } else if (prefersDark) {
      document.body.classList.add('dark-mode');
    }
  }
}

// ===== SHARED DIGITAL CLOCK =====

function updateClock() {
  const now = new Date();
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');
  const seconds = now.getSeconds().toString().padStart(2, '0');

  const clockElement = document.getElementById('digital-clock');
  if (clockElement) {
    clockElement.textContent = `${hours}:${minutes}:${seconds}`;
  }
}

// ===== SHARED SIDEBAR MANAGEMENT =====

function updateSidebarIcon(isExpanded) {
  const sidebarToggle = document.getElementById('sidebar-toggle');
  if (sidebarToggle) {
    if (isExpanded) {
      sidebarToggle.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"></polyline>
        </svg>
      `;
    } else {
      sidebarToggle.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
      `;
    }
  }
}

// ===== SHARED CSV EXPORT UTILITY =====

function downloadCSV(content, filename) {
  const blob = new Blob([content], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.URL.revokeObjectURL(url);
}

// ===== SHARED DATE/TIME UTILITIES =====

function formatDate(date, format = 'short') {
  const options = {
    short: { day: 'numeric', month: 'short', year: 'numeric' },
    long: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
    time: { hour: '2-digit', minute: '2-digit' },
    datetime: { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
  };

  return new Date(date).toLocaleDateString('en-GB', options[format] || options.short);
}

// ===== SHARED INITIALIZATION =====

document.addEventListener('DOMContentLoaded', async () => {
  console.log('ðŸš€ Initializing Cordea Shared Components...');

  try {
    // Load saved theme
    const savedTheme = localStorage.getItem('cordea-theme') || 'system';
    applyTheme(savedTheme);

    // Theme toggle functionality
    let currentTheme = savedTheme;
    const themeToggle = document.getElementById('theme-toggle');

    function updateThemeToggle() {
      if (!themeToggle) return;

      const isDark = document.body.classList.contains('dark-mode');
      const isHighContrast = document.body.classList.contains('high-contrast-mode');

      if (isHighContrast) {
        themeToggle.textContent = '⚡ High Contrast';
      } else if (isDark) {
        themeToggle.textContent = '☀️ Light';
      } else {
        themeToggle.textContent = '🌙 Dark';
      }
    }

    if (themeToggle) {
      updateThemeToggle();

      themeToggle.addEventListener('click', () => {
        if (currentTheme === 'system' || currentTheme === 'light') {
          currentTheme = 'dark';
        } else if (currentTheme === 'dark') {
          currentTheme = 'high-contrast';
        } else {
          currentTheme = 'light';
        }

        localStorage.setItem('cordea-theme', currentTheme);
        applyTheme(currentTheme);
        updateThemeToggle();
      });
    }

    // Digital clock
    updateClock();
    setInterval(updateClock, 1000);

    // Sidebar management
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebar-toggle');

    if (sidebarToggle && sidebar) {
      sidebarToggle.addEventListener('click', () => {
        const isExpanded = sidebar.classList.contains('expanded');

        if (isExpanded) {
          sidebar.classList.remove('expanded');
        } else {
          sidebar.classList.add('expanded');
        }

        const newState = sidebar.classList.contains('expanded');
        updateSidebarIcon(newState);
        localStorage.setItem('cordea-sidebar-expanded', newState.toString());
      });

      // Load saved sidebar state
      const savedState = localStorage.getItem('cordea-sidebar-expanded');
      if (savedState === 'true') {
        sidebar.classList.add('expanded');
        updateSidebarIcon(true);
      } else {
        sidebar.classList.remove('expanded');
        updateSidebarIcon(false);
      }
    }

    // Health check retry button
    const healthRetryBtn = document.getElementById("health-retry");
    if (healthRetryBtn) {
      healthRetryBtn.addEventListener("click", checkHealth);
    }

    // Run initial health check
    checkHealth();

    // Listen for storage changes (multi-tab sync)
    window.addEventListener('storage', (e) => {
      if (e.key === 'cordea-theme') {
        applyTheme(e.newValue);
        updateThemeToggle();
      }
      if (e.key === 'cordea-sidebar-expanded' && sidebar) {
        const isExpanded = e.newValue === 'true';
        if (isExpanded) {
          sidebar.classList.add('expanded');
        } else {
          sidebar.classList.remove('expanded');
        }
        updateSidebarIcon(isExpanded);
      }
    });

    console.log('âœ… Shared components initialized successfully');

  } catch (error) {
    console.error(' Failed to initialize shared components:', error);
    showNotification('Failed to initialize application', 'error');
  }
});