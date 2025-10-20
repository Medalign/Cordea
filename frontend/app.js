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
const healthLabel = document.getElementById("health-label");
const healthRetryBtn = document.getElementById("health-retry");
const apiBaseInput = document.getElementById("api-base-input");

const guardrailForm = document.getElementById("guardrail-form");
const guardrailSubmit = document.getElementById("guardrail-submit");
const guardrailAdultDemo = document.getElementById("guardrail-demo-adult");
const guardrailPaedsDemo = document.getElementById("guardrail-demo-paeds");
const guardrailError = document.getElementById("guardrail-error");
const guardrailResult = document.getElementById("guardrail-result");

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
setApiBaseInput(apiBase);

const historicalReadings = [
  { timestamp: "2025-09-01", QT_ms: 430, RR_ms: 1000 },
  { timestamp: "2025-09-10", QT_ms: 440, RR_ms: 1000 },
  { timestamp: "2025-09-20", QT_ms: 438, RR_ms: 1000 },
];

updateTrendTable();

if (trendDateInput) {
  try {
    const today = new Date();
    const tzOffset = today.getTimezoneOffset() * 60000;
    const localISO = new Date(today.getTime() - tzOffset).toISOString().slice(0, 10);
    trendDateInput.value = localISO;
  } catch (err) {
    // Ignore date initialisation errors
  }
}

checkHealth();

healthRetryBtn.addEventListener("click", () => {
  checkHealth();
});

apiBaseInput.addEventListener("change", (event) => {
  const value = event.target.value.trim();
  setApiBase(value || DEFAULT_API_BASE, true);
  checkHealth();
});

guardrailAdultDemo.addEventListener("click", () => {
  fillGuardrailForm({
    age_band: "adult_65_plus",
    sex: "male",
    heart_rate: 72,
    PR_ms: 160,
    QRS_ms: 92,
    QT_ms: 380,
    RR_ms: 829,
    qtc_method: "fridericia",
  });
});

guardrailPaedsDemo.addEventListener("click", () => {
  fillGuardrailForm({
    age_band: "paediatric",
    sex: "female",
    heart_rate: 110,
    PR_ms: 130,
    QRS_ms: 80,
    QT_ms: 340,
    RR_ms: 545,
    qtc_method: "bazett",
  });
});

guardrailForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  guardrailError.textContent = "";
  clearContainer(guardrailResult);
  setGuardrailBusy(true);

  const payload = {
    age_band: guardrailForm.age_band.value,
    sex: guardrailForm.sex.value,
    heart_rate: Number(guardrailForm.heart_rate.value),
    PR_ms: Number(guardrailForm.PR_ms.value),
    QRS_ms: Number(guardrailForm.QRS_ms.value),
    QT_ms: Number(guardrailForm.QT_ms.value),
    RR_ms: Number(guardrailForm.RR_ms.value),
    qtc_method: guardrailForm.qtc_method.value,
  };

  try {
    const result = await jsonPost("/guardrail/score", payload);
    renderGuardrailResult(result);
  } catch (error) {
    guardrailError.textContent = extractErrorMessage(error);
  } finally {
    setGuardrailBusy(false);
  }
});

trendForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  trendError.textContent = "";
  clearContainer(trendResult);
  setTrendBusy(true);

  const timestamp = (trendDateInput.value || "").trim();
  const qt = Number(trendQtInput.value);
  const rr = Number(trendRrInput.value);

  const payload = {
    age_band: trendAgeSelect.value,
    sex: trendSexSelect.value,
    readings: historicalReadings.map((item) => ({ ...item })),
    new: {
      timestamp,
      QT_ms: qt,
      RR_ms: rr,
    },
  };

  try {
    const result = await jsonPost("/trend/series", payload);
    renderTrendResult(result);
  } catch (error) {
    trendError.textContent = extractErrorMessage(error);
  } finally {
    setTrendBusy(false);
  }
});

function loadApiBase() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return normaliseBase(stored);
    }
  } catch (error) {
    console.warn("Unable to read API base from storage", error);
  }
  return DEFAULT_API_BASE;
}

function setApiBaseInput(value) {
  apiBase = normaliseBase(value);
  apiBaseInput.value = apiBase;
  storeApiBase(apiBase);
}

function setApiBase(value, persist = false) {
  apiBase = normaliseBase(value);
  apiBaseInput.value = apiBase;
  if (persist) {
    storeApiBase(apiBase);
  }
}

function storeApiBase(value) {
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch (error) {
    console.warn("Unable to persist API base", error);
  }
}

function normaliseBase(value) {
  if (!value) {
    return DEFAULT_API_BASE;
  }
  let normalised = value.trim();
  if (!normalised) {
    return DEFAULT_API_BASE;
  }
  if (normalised.endsWith("/")) {
    normalised = normalised.slice(0, -1);
  }
  return normalised;
}

function setGuardrailBusy(isBusy) {
  guardrailSubmit.disabled = isBusy;
  guardrailAdultDemo.disabled = isBusy;
  guardrailPaedsDemo.disabled = isBusy;
}

function setTrendBusy(isBusy) {
  trendSubmit.disabled = isBusy;
}

async function checkHealth() {
  setHealthStatus("checking", "API: Checking…");
  healthRetryBtn.disabled = true;
  const url = `${normaliseBase(apiBase)}/healthz`;
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Status ${response.status}`);
    }
    setHealthStatus("green", "API: Green");
  } catch (error) {
    setHealthStatus("red", "API: Red");
  } finally {
    healthRetryBtn.disabled = false;
  }
}

function setHealthStatus(status, labelText) {
  healthChip.classList.remove("green", "red");
  if (status === "green") {
    healthChip.classList.add("green");
  } else if (status === "red") {
    healthChip.classList.add("red");
  }
  healthLabel.textContent = labelText;
}

async function jsonPost(path, body) {
  const base = normaliseBase(apiBase);
  const url = `${base}${path}`;
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new ApiError(`Network error: ${error.message}`, {
      detail: error.message,
    });
  }

  const contentType = response.headers.get("content-type") || "";

  if (!response.ok) {
    let detail;
    if (contentType.includes("application/json")) {
      try {
        const data = await response.json();
        detail = data?.detail ?? data;
      } catch (error) {
        detail = null;
      }
    } else {
      try {
        detail = await response.text();
      } catch (error) {
        detail = null;
      }
    }
    const message =
      typeof detail === "string" && detail.trim().length > 0
        ? detail
        : `${response.status} ${response.statusText}`;
    throw new ApiError(message, {
      status: response.status,
      statusText: response.statusText,
      detail,
    });
  }

  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (error) {
    return text;
  }
}

function renderGuardrailResult(result) {
  clearContainer(guardrailResult);
  if (!result || typeof result !== "object") {
    return;
  }

  const card = document.createElement("article");
  card.className = "result-card";

  const summaryHeading = document.createElement("h3");
  summaryHeading.textContent = "Assessment";
  card.appendChild(summaryHeading);

  const summaryParagraph = document.createElement("p");
  summaryParagraph.textContent = result.summary ?? "—";
  card.appendChild(summaryParagraph);

  const computed = result.computed ?? {};
  const details = document.createElement("dl");
  details.className = "result-details";
  appendDefinition(details, "QTc", computed.QTc_ms);
  appendDefinition(details, "Percentile", computed.percentile);
  appendDefinition(details, "Reference version", computed.ref_version);
  card.appendChild(details);

  if (Array.isArray(result.assessments)) {
    const assessmentsSection = document.createElement("div");
    const heading = document.createElement("h4");
    heading.textContent = "Assessments";
    assessmentsSection.appendChild(heading);

    if (result.assessments.length > 0) {
      const list = document.createElement("ul");
      list.className = "result-list";
      result.assessments.forEach((item) => {
        const li = document.createElement("li");
        const status = item?.status ? `${item.status}` : null;
        const reason = item?.reason ? `${item.reason}` : null;
        if (status && reason) {
          li.textContent = `${status}: ${reason}`;
        } else if (status) {
          li.textContent = status;
        } else if (reason) {
          li.textContent = reason;
        } else {
          li.textContent = "—";
        }
        list.appendChild(li);
      });
      assessmentsSection.appendChild(list);
    } else {
      const empty = document.createElement("p");
      empty.textContent = "No assessments returned.";
      assessmentsSection.appendChild(empty);
    }
    card.appendChild(assessmentsSection);
  }

  if (Array.isArray(result.red_flags) && result.red_flags.length > 0) {
    const redFlagsSection = document.createElement("div");
    const heading = document.createElement("h4");
    heading.textContent = "Red flags";
    redFlagsSection.appendChild(heading);

    const list = document.createElement("ul");
    list.className = "result-list";
    result.red_flags.forEach((flag) => {
      const li = document.createElement("li");
      li.textContent = flag ?? "—";
      list.appendChild(li);
    });
    redFlagsSection.appendChild(list);
    card.appendChild(redFlagsSection);
  }

  if (result.disclaimer) {
    const disclaimer = document.createElement("p");
    disclaimer.textContent = result.disclaimer;
    card.appendChild(disclaimer);
  }

  guardrailResult.appendChild(card);
}

function renderTrendResult(result) {
  clearContainer(trendResult);
  if (!result || typeof result !== "object") {
    return;
  }

  const card = document.createElement("article");
  card.className = "result-card";

  const heading = document.createElement("h3");
  heading.textContent = "Trend evaluation";
  card.appendChild(heading);

  const message = document.createElement("p");
  message.textContent = result.message ?? "—";
  card.appendChild(message);

  const details = document.createElement("dl");
  details.className = "result-details";
  appendDefinition(details, "Recorded on", result.recordedOn);
  appendDefinition(details, "Δ QTc (ms)", result.delta_ms);
  appendDefinition(details, "Band", result.band);
  card.appendChild(details);

  trendResult.appendChild(card);
}

function appendDefinition(container, label, value) {
  const dt = document.createElement("dt");
  dt.textContent = label;
  container.appendChild(dt);

  const dd = document.createElement("dd");
  dd.textContent = formatValue(value);
  container.appendChild(dd);
}

function formatValue(value) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  return String(value);
}

function fillGuardrailForm(values) {
  guardrailForm.age_band.value = values.age_band;
  guardrailForm.sex.value = values.sex;
  guardrailForm.heart_rate.value = values.heart_rate;
  guardrailForm.PR_ms.value = values.PR_ms;
  guardrailForm.QRS_ms.value = values.QRS_ms;
  guardrailForm.QT_ms.value = values.QT_ms;
  guardrailForm.RR_ms.value = values.RR_ms;
  if (values.qtc_method) {
    const radios = guardrailForm.querySelectorAll('input[name="qtc_method"]');
    radios.forEach((radio) => {
      radio.checked = radio.value === values.qtc_method;
    });
  }
}

function updateTrendTable() {
  clearContainer(trendTableBody);
  const fragment = document.createDocumentFragment();
  historicalReadings.forEach((reading) => {
    const row = document.createElement("tr");

    const dateCell = document.createElement("td");
    dateCell.textContent = reading.timestamp;
    row.appendChild(dateCell);

    const qtCell = document.createElement("td");
    qtCell.textContent = reading.QT_ms;
    row.appendChild(qtCell);

    const rrCell = document.createElement("td");
    rrCell.textContent = reading.RR_ms;
    row.appendChild(rrCell);

    fragment.appendChild(row);
  });
  trendTableBody.appendChild(fragment);
}

function clearContainer(container) {
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }
}

function extractErrorMessage(error) {
  if (error instanceof ApiError) {
    if (error.detail && typeof error.detail === "object") {
      try {
        return JSON.stringify(error.detail);
      } catch (err) {
        return error.message;
      }
    }
    if (error.detail) {
      return String(error.detail);
    }
    return error.message;
  }
  if (error && typeof error.message === "string") {
    return error.message;
  }
  return "An unexpected error occurred.";
}
