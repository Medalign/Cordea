// ===== PATIENT REVIEW - ENCOUNTER SUMMARY =====
// Handles ECG interval evaluation and QTc assessment with enhanced UI

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

// ===== RISK CLASSIFICATION (mirrors backend logic.py) =====
function getRiskCategory(qtc, sex) {
  if (!qtc || qtc === null || isNaN(qtc)) {
    return "unknown";
  }

  const sexNorm = (sex || "").toLowerCase();
  let normalUpper, borderlineUpper, highRisk;

  if (sexNorm.startsWith("m")) {
    // Male thresholds
    normalUpper = 440;
    borderlineUpper = 449;
    highRisk = 500;
  } else if (sexNorm.startsWith("f")) {
    // Female thresholds
    normalUpper = 460;
    borderlineUpper = 469;
    highRisk = 500;
  } else {
    // Generic thresholds
    normalUpper = 450;
    borderlineUpper = 479;
    highRisk = 500;
  }

  if (qtc < normalUpper) return "normal";
  if (qtc <= borderlineUpper) return "borderline";
  if (qtc < highRisk) return "prolonged";
  return "high";
}

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

    // ✅ NEW: Save to localStorage for AI Summary page
    try {
      localStorage.setItem('cordea_last_guardrail_payload', JSON.stringify(payload));
      localStorage.setItem('cordea_last_guardrail_result', JSON.stringify(result));
      console.log("✅ Saved Patient Review data for AI Summary");
    } catch (err) {
      console.error("❌ Failed to save to localStorage:", err);
    }

    renderGuardrailResult(result, ageBand, sex);

    const backendBanner = document.getElementById("backend-warning");
    if (backendBanner) backendBanner.style.display = "none";
  } catch (err) {
    showMsg(guardrailError, extractErrorMessage(err));
  } finally {
    setBusySuccess(guardrailSubmit, "✓ Assessment complete");
  }
}

// ===== GENERATE ASSESSMENT TEXT =====
function generateAssessmentText(qtcValue, percentile, ageBand, sex) {
  if (!qtcValue || isNaN(qtcValue)) {
    return "QTc assessment unavailable due to incomplete data.";
  }

  const riskCat = getRiskCategory(qtcValue, sex);
  const ageLabel = labelFromEnum(ageBand);

  if (riskCat === "normal") {
    return `QTc of ${qtcValue.toFixed(0)} ms falls in the ${percentile} percentile band for ${ageLabel} ${sex} patients. This is within normal limits based on reference data.`;
  } else if (riskCat === "borderline") {
    return `QTc of ${qtcValue.toFixed(0)} ms falls in the ${percentile} percentile band for ${ageLabel} ${sex} patients. This is in the borderline range and warrants monitoring.`;
  } else if (riskCat === "prolonged") {
    return `QTc of ${qtcValue.toFixed(0)} ms falls in the ${percentile} percentile band for ${ageLabel} ${sex} patients. This represents QTc prolongation.`;
  } else if (riskCat === "high") {
    return `QTc of ${qtcValue.toFixed(0)} ms falls in the ${percentile} percentile band for ${ageLabel} ${sex} patients. This is significantly prolonged and represents high risk.`;
  }

  return `QTc of ${qtcValue.toFixed(0)} ms falls in the ${percentile} percentile band for ${ageLabel} ${sex} patients.`;
}

// ===== GENERATE RECOMMENDATIONS =====
function generateRecommendations(qtcValue, riskCategory, redFlags) {
  const recommendations = [];

  if (riskCategory === "normal") {
    recommendations.push("QTc within normal limits for this demographic.");
    recommendations.push("No immediate concerns identified.");
    recommendations.push("Document in record and continue routine follow-up.");
  } else if (riskCategory === "borderline") {
    recommendations.push("QTc in borderline range for this demographic.");
    recommendations.push("Review medication list for QT-prolonging agents.");
    recommendations.push("Consider repeat ECG if clinically indicated.");
  } else if (riskCategory === "prolonged") {
    recommendations.push("QTc prolongation identified.");
    recommendations.push("Review medication list and consider adjustment if appropriate.");
    recommendations.push("Specialist input may be warranted depending on clinical context.");
  } else if (riskCategory === "high") {
    recommendations.push("Significantly prolonged QTc identified.");
    recommendations.push("Urgent review of medications and electrolytes recommended.");
    recommendations.push("Consider cardiology consultation.");
  }

  if (redFlags && redFlags.length > 0) {
    recommendations.push("Additional flags identified - review full assessment.");
  }

  return recommendations;
}

// ===== RESULT RENDERING WITH ENHANCEMENTS =====
function renderGuardrailResult(result, ageBand, sex) {
  clearContainer(guardrailResult);

  if (!result || !result.computed) {
    guardrailResult.innerHTML = '<p class="error">No result data returned.</p>';
    return;
  }

  const computed = result.computed;
  const qtcValue = computed.QTc_ms;
  const percentile = computed.percentile || "—";

  // Generate assessment text from percentile and QTc
  const assessment = generateAssessmentText(qtcValue, percentile, ageBand, sex);

  // Backend returns 'assessments' not 'parameters'
  const parameters = result.assessments || [];

  // Determine risk category for gradient
  const riskCategory = getRiskCategory(qtcValue, sex);

  // Generate recommendations
  const recommendations = generateRecommendations(qtcValue, riskCategory, result.red_flags);

  // === ENHANCED HERO ASSESSMENT CARD ===
  const heroCard = document.createElement("div");
  heroCard.className = `hero-card risk-${riskCategory}`;

  const heroInner = document.createElement("div");
  heroInner.className = "hero-inner";

  // QTc Value (larger now - 8rem)
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

  // Add pulse animation if high risk
  if (riskCategory === "high" || riskCategory === "prolonged") {
    percentileBadge.classList.add("pulse-danger");
  }

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

  // === PARAMETERS GRID WITH TOOLTIPS ===
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

      // ✅ FIXED: Use param.metric instead of param.name
      const nameText = param.metric.replace("_", " ");

      paramName.innerHTML = `
        ${nameText}
        <span class="tooltip-trigger">
          ?
          <span class="tooltip">${getTooltipForMetric(param.metric)}</span>
        </span>
      `;

      // ✅ FIXED: Get value from stored payload instead of param.value
      const metricValue = window._lastGuardrailPayload?.intervals?.[param.metric] || null;

      const paramValue = document.createElement("div");
      paramValue.className = "param-value";
      paramValue.textContent = defined(metricValue) ? metricValue : "—";

      const statusBadge = renderStatusBadge(param.status);
      statusBadge.className = badgeClassFromStatus(param.status) + " param-badge";

      // Add pulse animation for RED status
      if (param.status === "RED") {
        statusBadge.classList.add("pulse-danger");
      }

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
  if (recommendations && recommendations.length > 0) {
    const recsSection = document.createElement("div");
    recsSection.className = "recommendations-section";

    const recsHeader = document.createElement("h4");
    recsHeader.className = "section-title";
    recsHeader.textContent = "Clinical Recommendations";
    recsSection.appendChild(recsHeader);

    const recsList = document.createElement("ul");
    recsList.className = "recommendations-list";

    recommendations.forEach(rec => {
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

// ===== TOOLTIP CONTENT HELPER =====
function getTooltipForMetric(metricName) {
  const tooltips = {
    "HR_bpm": "Heart rate: number of beats per minute. Normal range varies by age.",
    "PR_ms": "PR interval: time from atrial to ventricular activation. Prolonged PR may indicate AV block.",
    "QRS_ms": "QRS duration: ventricular depolarization time. Widened QRS may indicate conduction delay.",
    "QTc_ms": "QTc: heart rate-corrected QT interval. Prolonged QTc increases risk of arrhythmias.",
    "QT_ms": "QT interval: time for ventricular depolarization and repolarization.",
    "RR_ms": "RR interval: time between consecutive heartbeats."
  };

  return tooltips[metricName] || "ECG interval measurement";
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