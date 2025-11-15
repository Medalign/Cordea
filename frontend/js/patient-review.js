// ===== PATIENT REVIEW - ENCOUNTER SUMMARY =====
// Handles ECG interval evaluation and QTc assessment

// Keep last successful payload for AI summary
window._lastGuardrailPayload = null;
window._lastGuardrailResult = null;

// ===== DOM ELEMENTS =====
const guardrailForm = document.getElementById("guardrail-form");
const guardrailSubmit = document.getElementById("guardrail-submit");
const guardrailAdultDemo = document.getElementById("guardrail-demo-adult");
const guardrailPaedsDemo = document.getElementById("guardrail-demo-paeds");
const guardrailError = document.getElementById("guardrail-error");
const guardrailResult = document.getElementById("guardrail-result");

// ===== DEMO DATA =====
function loadAdultDemo() {
  document.getElementById("age_band_select").value = "65+ years";
  document.getElementById("sex_select").value = "male";
  document.getElementById("heart_rate_input").value = "72";
  document.getElementById("pr_ms_input").value = "160";
  document.getElementById("qrs_ms_input").value = "92";
  document.getElementById("qt_ms_input").value = "380";
  document.getElementById("rr_ms_input").value = "829";
  document.querySelector('input[name="qtc_method"][value="fridericia"]').checked = true;
}

function loadPaedsDemo() {
  document.getElementById("age_band_select").value = "6–12 years";
  document.getElementById("sex_select").value = "female";
  document.getElementById("heart_rate_input").value = "85";
  document.getElementById("pr_ms_input").value = "140";
  document.getElementById("qrs_ms_input").value = "75";
  document.getElementById("qt_ms_input").value = "340";
  document.getElementById("rr_ms_input").value = "706";
  document.querySelector('input[name="qtc_method"][value="fridericia"]').checked = true;
}

// ===== FORM SUBMISSION =====
async function handleGuardrailSubmit(event) {
  event.preventDefault();
  clearMsg(guardrailError);
  clearContainer(guardrailResult);

  const formData = new FormData(guardrailForm);
  const ageBand = mapAgeBandToEnum(formData.get("age_band"));
  const sex = formData.get("sex");
  const qtcMethod = formData.get("qtc_method") || "fridericia";

  const intervals = {
    HR_bpm: parseFloat(formData.get("heart_rate")) || null,
    PR_ms: parseFloat(formData.get("PR_ms")) || null,
    QRS_ms: parseFloat(formData.get("QRS_ms")) || null,
    QT_ms: parseFloat(formData.get("QT_ms")) || null,
    RR_ms: parseFloat(formData.get("RR_ms")) || null
  };

  const payload = {
    age_band: ageBand,
    sex: sex,
    intervals: intervals,
    qtc_method: qtcMethod
  };

  try {
    setBusy(guardrailSubmit, true);
    const result = await jsonPost("/guardrail/score", payload);

    // Store for AI summary
    window._lastGuardrailPayload = payload;
    window._lastGuardrailResult = result;

    renderGuardrailResult(result, ageBand, sex);

    const backendBanner = document.getElementById("backend-warning");
    if (backendBanner) backendBanner.style.display = "none";
  } catch (err) {
    showMsg(guardrailError, extractErrorMessage(err));
  } finally {
    setBusySuccess(guardrailSubmit, "✓ Assessment complete");
  }
}

// ===== RESULT RENDERING =====
function renderGuardrailResult(result, ageBand, sex) {
  clearContainer(guardrailResult);

  if (!result || !result.computed) {
    guardrailResult.innerHTML = '<p class="error">No result data returned.</p>';
    return;
  }

  const computed = result.computed;
  const qtcValue = computed.QTc_ms;
  const percentile = computed.percentile || "—";
  const assessment = result.assessment || "Assessment not available.";
  const parameters = result.parameters || [];

  // === HERO ASSESSMENT CARD ===
  const heroCard = document.createElement("div");
  heroCard.className = "hero-card";

  const heroInner = document.createElement("div");
  heroInner.className = "hero-inner";

  // QTc Value (large)
  const qtcDisplay = document.createElement("div");
  qtcDisplay.className = "qtc-display";
  qtcDisplay.innerHTML = `
    <div class="qtc-value">${qtcValue ? qtcValue.toFixed(1) : "—"}</div>
    <div class="qtc-unit">ms</div>
  `;

  // Percentile & Assessment
  const assessmentSection = document.createElement("div");
  assessmentSection.className = "assessment-section";

  const percentileBadge = renderPercentileBadge(percentile);
  percentileBadge.style.fontSize = "1.4rem";
  percentileBadge.style.padding = "0.6rem 1.4rem";

  const assessmentText = document.createElement("p");
  assessmentText.className = "assessment-text";
  assessmentText.textContent = assessment;

  assessmentSection.appendChild(percentileBadge);
  assessmentSection.appendChild(assessmentText);

  heroInner.appendChild(qtcDisplay);
  heroInner.appendChild(assessmentSection);
  heroCard.appendChild(heroInner);

  // Visual Percentile Gauge
  const gaugeSection = document.createElement("div");
  gaugeSection.className = "percentile-gauge";

  const severity = severityFromPercentileLabel(percentile);
  let position = 25; // default

  if (percentile.includes("<50")) position = 25;
  else if (percentile.includes("50")) position = 50;
  else if (percentile.includes("90")) position = 75;
  else if (percentile.includes("95")) position = 90;
  else if (percentile.includes("99")) position = 95;

  gaugeSection.innerHTML = `
    <div class="gauge-track">
      <div class="gauge-zone gauge-zone--normal"></div>
      <div class="gauge-zone gauge-zone--borderline"></div>
      <div class="gauge-zone gauge-zone--high"></div>
      <div class="gauge-marker" style="left: ${position}%">
        <div class="gauge-marker-dot"></div>
        <div class="gauge-marker-label">You are here</div>
      </div>
    </div>
    <div class="gauge-labels">
      <span>Normal</span>
      <span>Borderline</span>
      <span>Prolonged</span>
    </div>
  `;

  heroCard.appendChild(gaugeSection);
  guardrailResult.appendChild(heroCard);

  // === PARAMETERS GRID ===
  if (parameters && parameters.length > 0) {
    const paramsSection = document.createElement("div");
    paramsSection.className = "parameters-section";

    const paramsHeader = document.createElement("h3");
    paramsHeader.className = "section-title";
    paramsHeader.textContent = "ECG Parameters";
    paramsSection.appendChild(paramsHeader);

    const paramsGrid = document.createElement("div");
    paramsGrid.className = "parameters-grid";

    parameters.forEach(param => {
      const card = document.createElement("div");
      card.className = "param-card";

      const paramName = document.createElement("div");
      paramName.className = "param-name";
      paramName.textContent = param.name.replace("_", " ");

      const paramValue = document.createElement("div");
      paramValue.className = "param-value";
      paramValue.textContent = defined(param.value) ? param.value : "—";

      const statusBadge = renderStatusBadge(param.status);
      statusBadge.className = badgeClassFromStatus(param.status) + " param-badge";

      card.appendChild(paramName);
      card.appendChild(paramValue);
      card.appendChild(statusBadge);

      // Rationale (collapsible)
      if (param.rationale) {
        const rationaleToggle = document.createElement("button");
        rationaleToggle.className = "rationale-toggle";
        rationaleToggle.textContent = "Show details";
        rationaleToggle.type = "button";

        const rationaleText = document.createElement("div");
        rationaleText.className = "rationale-text hide";
        rationaleText.textContent = param.rationale;

        rationaleToggle.addEventListener("click", () => {
          rationaleText.classList.toggle("hide");
          rationaleToggle.textContent = rationaleText.classList.contains("hide")
            ? "Show details"
            : "Hide details";
        });

        card.appendChild(rationaleToggle);
        card.appendChild(rationaleText);
      }

      paramsGrid.appendChild(card);
    });

    paramsSection.appendChild(paramsGrid);
    guardrailResult.appendChild(paramsSection);
  }

  // === RECOMMENDATIONS ===
  if (result.recommendations && result.recommendations.length > 0) {
    const recsSection = document.createElement("div");
    recsSection.className = "recommendations-section";

    const recsHeader = document.createElement("h4");
    recsHeader.className = "section-title";
    recsHeader.textContent = "Clinical Recommendations";
    recsSection.appendChild(recsHeader);

    const recsList = document.createElement("ul");
    recsList.className = "recommendations-list";

    result.recommendations.forEach(rec => {
      const li = document.createElement("li");
      li.textContent = rec;
      recsList.appendChild(li);
    });

    recsSection.appendChild(recsList);
    guardrailResult.appendChild(recsSection);
  }

  // === QTC RELIABILITY NOTE ===
  const reliabilityNote = qtcReliabilityNoteFromLast();
  if (reliabilityNote) {
    const noteDiv = document.createElement("div");
    noteDiv.className = "reliability-note";
    noteDiv.innerHTML = `<strong>Note:</strong> ${reliabilityNote}`;
    guardrailResult.appendChild(noteDiv);
  }
}

// Helper to check QTc reliability based on HR
function qtcReliabilityNoteFromLast() {
  if (!window._lastGuardrailPayload || !window._lastGuardrailPayload.intervals) return null;

  const rawHr = window._lastGuardrailPayload.intervals.HR_bpm;
  const hr = Number(rawHr);

  if (!Number.isFinite(hr)) return null;

  if (hr < 50) {
    return "QTc values at very low heart rates may be less reliable and should be interpreted with caution.";
  }
  if (hr > 120) {
    return "QTc values at very high heart rates may be less reliable and should be interpreted with caution.";
  }

  return null;
}

// ===== EVENT LISTENERS =====
if (guardrailForm) {
  guardrailForm.addEventListener("submit", handleGuardrailSubmit);
}

if (guardrailAdultDemo) {
  guardrailAdultDemo.addEventListener("click", loadAdultDemo);
}

if (guardrailPaedsDemo) {
  guardrailPaedsDemo.addEventListener("click", loadPaedsDemo);
}