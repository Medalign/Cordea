// ===== AI SUMMARY - ECG NARRATIVE GENERATION =====
// Generates contextual narratives from Patient Review and Trends data

// ===== DOM ELEMENTS =====
const aiForm = document.getElementById("ai-summary-form");
const aiAgeSelect = document.getElementById("ai-age-band");
const aiSexSelect = document.getElementById("ai-sex");
const aiGenerateBtn = document.getElementById("ai-generate");
const aiError = document.getElementById("ai-error");
const sourceData = document.getElementById("source-data");
const aiResult = document.getElementById("ai-summary-result");

// Info card toggle
const infoToggleBtn = document.getElementById("info-toggle");
const infoCard = document.getElementById("info-card");

// Source data display elements
const sourceQtc = document.getElementById("source-qtc");
const sourcePercentile = document.getElementById("source-percentile");
const sourceHr = document.getElementById("source-hr");
const sourcePr = document.getElementById("source-pr");
const sourceQrs = document.getElementById("source-qrs");
const sourceQt = document.getElementById("source-qt");

// Result display elements
const narrativeContent = document.getElementById("narrative-content");
const keyPointsSection = document.getElementById("key-points-section");
const keyPointsList = document.getElementById("key-points-list");
const cautionSection = document.getElementById("caution-section");
const cautionText = document.getElementById("caution-text");
const disclaimerText = document.getElementById("disclaimer-text");

// ===== LOCALSTORAGE KEYS =====
const STORAGE_KEY_PAYLOAD = 'cordea_last_guardrail_payload';
const STORAGE_KEY_RESULT = 'cordea_last_guardrail_result';

// ===== LOAD DATA FROM LOCALSTORAGE =====
function loadPatientReviewData() {
  try {
    const payloadJSON = localStorage.getItem(STORAGE_KEY_PAYLOAD);
    const resultJSON = localStorage.getItem(STORAGE_KEY_RESULT);

    if (payloadJSON && resultJSON) {
      window._lastGuardrailPayload = JSON.parse(payloadJSON);
      window._lastGuardrailResult = JSON.parse(resultJSON);
      console.log("âœ… Loaded Patient Review data from localStorage");
      return true;
    } else {
      console.log("âš ï¸ No Patient Review data found in localStorage");
      return false;
    }
  } catch (err) {
    console.error("âŒ Failed to load from localStorage:", err);
    return false;
  }
}

// ===== INFO CARD TOGGLE =====
if (infoToggleBtn && infoCard) {
  infoToggleBtn.addEventListener("click", () => {
    if (infoCard.classList.contains("hide")) {
      infoCard.classList.remove("hide");
      infoToggleBtn.setAttribute("aria-label", "Hide how this works");
      infoToggleBtn.setAttribute("title", "Hide how this works");
    } else {
      infoCard.classList.add("hide");
      infoToggleBtn.setAttribute("aria-label", "Show how this works");
      infoToggleBtn.setAttribute("title", "Show how this works");
    }
  });
}

// ===== INITIALIZE =====
function initializeAISummary() {
  // âœ… NEW: Load data from localStorage (from separate pages)
  const hasData = loadPatientReviewData();

  if (!hasData) {
    console.log("âš ï¸ No Patient Review data available. User must run Patient Review first.");
  }

  // Pre-populate age/sex if available from Patient Review
  if (window._lastGuardrailPayload) {
    const ageBand = window._lastGuardrailPayload.age_band;
    const sex = window._lastGuardrailPayload.sex;

    if (ageBand) {
      const label = labelFromEnum(ageBand);
      if (aiAgeSelect) {
        // Try to find matching option
        const options = Array.from(aiAgeSelect.options);
        const match = options.find(opt => opt.value === label || opt.textContent === label);
        if (match) {
          aiAgeSelect.value = match.value;
        }
      }
    }

    if (sex && aiSexSelect) {
      aiSexSelect.value = sex;
    }
  }
}

// ===== FORM SUBMISSION =====
async function handleAIGenerate(event) {
  event.preventDefault();
  clearMsg(aiError);
  hide(sourceData);
  hide(aiResult);

  // Check if we have Patient Review data
  if (!window._lastGuardrailPayload || !window._lastGuardrailResult) {
    showMsg(
      aiError,
      "Please run a Patient Review first. The AI summary needs ECG interval data to generate a narrative."
    );
    return;
  }

  // Get form inputs
  const ageLabel = aiAgeSelect ? aiAgeSelect.value : null;
  const sex = aiSexSelect ? aiSexSelect.value : null;

  if (!ageLabel || !sex) {
    showMsg(aiError, "Please select both age band and sex.");
    return;
  }

  const ageEnum = ageLabel; // Value from dropdown is already correct key

  // Build payload from Patient Review data
  const intervals = window._lastGuardrailPayload.intervals || {};
  const computed = window._lastGuardrailResult.computed || {};
  const qtc = computed.QTc_ms || null;
  const percentileBand = computed.percentile || null;
  const redFlags = Array.isArray(window._lastGuardrailResult.red_flags)
    ? window._lastGuardrailResult.red_flags
    : [];

  // Optional trend comment from Patient Trends
  let trendComment = null;
  if (window._lastTrendResult && window._lastTrendResult.narrative) {
    trendComment = window._lastTrendResult.narrative;
  }

  const payload = {
    age_band: ageEnum,
    sex: sex,
    intervals: {
      HR_bpm: intervals.HR_bpm,
      PR_ms: intervals.PR_ms,
      QRS_ms: intervals.QRS_ms,
      QT_ms: intervals.QT_ms,
      RR_ms: intervals.RR_ms
    },
    qtc_ms: qtc,
    percentile_band: percentileBand,
    red_flags: redFlags,
    trend_comment: trendComment
  };

  try {
    setBusy(aiGenerateBtn, true);
    const result = await jsonPost("/ai/narrative", payload);

    // Display source data
    displaySourceData(payload);

    // Display AI result
    displayAIResult(result);

    const backendBanner = document.getElementById("backend-warning");
    if (backendBanner) backendBanner.style.display = "none";
  } catch (err) {
    showMsg(aiError, extractErrorMessage(err));
  } finally {
    setBusySuccess(aiGenerateBtn, "âœ“ Summary generated");
  }
}

// ===== DISPLAY SOURCE DATA =====
function displaySourceData(payload) {
  show(sourceData);

  if (sourceQtc) {
    sourceQtc.textContent = defined(payload.qtc_ms)
      ? payload.qtc_ms.toFixed(1)
      : "—";
  }

  if (sourcePercentile) {
    sourcePercentile.textContent = payload.percentile_band || "—";
  }

  if (sourceHr) {
    sourceHr.textContent = defined(payload.intervals.HR_bpm)
      ? payload.intervals.HR_bpm
      : "—";
  }

  if (sourcePr) {
    sourcePr.textContent = defined(payload.intervals.PR_ms)
      ? payload.intervals.PR_ms
      : "—";
  }

  if (sourceQrs) {
    sourceQrs.textContent = defined(payload.intervals.QRS_ms)
      ? payload.intervals.QRS_ms
      : "—";
  }

  if (sourceQt) {
    sourceQt.textContent = defined(payload.intervals.QT_ms)
      ? payload.intervals.QT_ms
      : "—";
  }
}

// ===== DISPLAY AI RESULT =====
function displayAIResult(result) {
  if (!result || typeof result !== "object") return;

  show(aiResult);

  // Display narrative
  if (narrativeContent) {
    const narrative = result.narrative || "No narrative generated.";

    // Split into paragraphs if contains double newlines
    const paragraphs = narrative.split("\n\n").filter(p => p.trim());

    if (paragraphs.length > 1) {
      narrativeContent.innerHTML = paragraphs
        .map(p => `<p>${escapeHtml(p.trim())}</p>`)
        .join("");
    } else {
      narrativeContent.innerHTML = `<p>${escapeHtml(narrative)}</p>`;
    }
  }

  // Display key points
  if (Array.isArray(result.key_points) && result.key_points.length > 0) {
    show(keyPointsSection);
    clearContainer(keyPointsList);

    result.key_points.forEach(point => {
      const li = document.createElement("li");
      li.textContent = point;
      keyPointsList.appendChild(li);
    });
  } else {
    hide(keyPointsSection);
  }

  // Display caution flags
  if (Array.isArray(result.caution_flags) && result.caution_flags.length > 0) {
    show(cautionSection);

    if (cautionText) {
      cautionText.textContent = result.caution_flags.join(", ");
    }
  } else {
    hide(cautionSection);
  }

  // Update disclaimer
  if (disclaimerText && result.disclaimer) {
    disclaimerText.innerHTML = `<strong>DISCLAIMER:</strong> ${escapeHtml(result.disclaimer)}`;
  }
}

// ===== UTILITY: ESCAPE HTML =====
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// ===== EVENT LISTENERS =====
if (aiForm) {
  aiForm.addEventListener("submit", handleAIGenerate);
}

// ===== INITIALIZE ON LOAD =====
initializeAISummary();