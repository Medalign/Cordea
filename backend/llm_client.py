import os
import json
import logging
from typing import Dict, Any

from openai import OpenAI

logger = logging.getLogger(__name__)

# ============================================================
# Model + API key config
# ============================================================

OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-5.1-2025-11-13")
_API_KEY = os.environ.get("OPENAI_API_KEY")

# Client uses env var OPENAI_API_KEY
_client = OpenAI() if _API_KEY else None

DEMO_DISCLAIMER = "DEMONSTRATION ONLY — NOT FOR CLINICAL USE."

# ============================================================
# Guardrail configuration
# ============================================================

# These are phrases we NEVER want in the narrative because they imply
# diagnosis, risk, or management. Keep this tight.
BANNED_TERMS = [
    # Explicit diagnoses / conditions
    "long qt syndrome",
    "lqts",
    "torsades",
    "torsade de pointes",
    "myocardial infarction",
    "heart failure",
    "ventricular tachycardia",
    "ventricular fibrillation",
    "vfib",
    "vt ",

    # Diagnostic framing
    "diagnosis",
    "diagnose",
    "diagnostic",
    "pathognomonic",

    # Management / advice
    "start ",
    "stop ",
    "commence",
    "discontinue",
    "increase dose",
    "reduce dose",
    "treat ",
    "treatment",
    "therapy",
    "admit ",
    "admission",
    "discharge ",
    "refer ",
    "referral",
    "urgent review",
    "call 999",
    "emergency department",
    "a&e",
    "accident and emergency",

    # Risk language
    "high risk",
    "low risk",
    "reassuring",
    "benign",
    "malignant",
]


def is_llm_configured() -> bool:
    """
    Returns True only if an OpenAI API key is present.
    """
    return bool(_API_KEY) and _client is not None


def _contains_banned(text: str) -> bool:
    """
    Very simple substring scanner for obviously banned phrases.
    Applied only to the free-text parts of the response.
    """
    if not text:
        return False
    lowered = text.lower()
    for term in BANNED_TERMS:
        if term in lowered:
            return True
    return False


def _deterministic_fallback(structured: Dict[str, Any]) -> Dict[str, Any]:
    """
    Safe, purely deterministic summary used when:
      - no API key configured, OR
      - LLM call fails, OR
      - guardrail blocks the LLM output.
    """
    qtc = structured.get("qtc_ms")
    band = structured.get("percentile_band") or "—"
    age_band = structured.get("age_band_label", "this age band")
    sex = structured.get("sex_label", "this patient")

    intervals = structured.get("intervals_ms", {}) or {}
    hr = intervals.get("HR_bpm")
    pr = intervals.get("PR_ms")
    qrs = intervals.get("QRS_ms")
    qt = intervals.get("QT_ms")
    rr = intervals.get("RR_ms")

    parts = []
    if hr is not None:
        parts.append(f"Heart rate recorded at {hr:.1f} bpm.")
    if pr is not None:
        parts.append(f"PR interval measured at {pr:.1f} ms.")
    if qrs is not None:
        parts.append(f"QRS duration measured at {qrs:.1f} ms.")
    if qt is not None:
        parts.append(f"QT interval (uncorrected) measured at {qt:.1f} ms.")
    if qtc is not None:
        parts.append(
            f"QTc approximately {qtc:.1f} ms in {age_band} {sex} "
            f"(percentile band {band})."
        )
    narrative = " ".join(parts) if parts else (
        "Intervals and QTc are summarised numerically using a deterministic template."
    )

    key_points = [
        "Intervals and QTc are summarised numerically using a deterministic template.",
        "This output is strictly non-diagnostic and for demonstration use only.",
    ]

    return {
        "narrative": narrative,
        "key_points": key_points,
        "caution_flags": structured.get("red_flags") or [],
        "disclaimer": DEMO_DISCLAIMER,
    }


def generate_qtc_narrative(structured: Dict[str, Any]) -> Dict[str, Any]:
    """
    Call OpenAI GPT-5.1 to generate a non-diagnostic narrative for the
    ECG intervals / QTc context we pass in.

    `structured` should already be de-identified and purely numeric / categorical.
    """
    # Fallback if there is no API key configured
    if not is_llm_configured():
        logger.info(
            "AI narrative: using deterministic fallback (no OPENAI_API_KEY or client unavailable)."
        )
        return _deterministic_fallback(structured)

    # Prompt: strict instructions + JSON response format
    system_prompt = (
        "You are assisting with an ECG INTERVAL INTERPRETATION DEMO. "
        "You are NOT providing diagnosis. You are NOT screening. "
        "You are NOT making treatment decisions or management suggestions. "
        "You ONLY explain the interval and QT/QTc context using neutral, generic language. "
        "You must never:\n"
        "- name a specific diagnosis (e.g. bradycardia, long QT syndrome, AV block, myocardial infarction, heart failure, etc.),\n"
        "- describe risk level (e.g. high risk, low risk, reassuring),\n"
        "- give any advice about treatment, referral, admission, or emergency care.\n"
        "You MAY:\n"
        "- restate the measured values (HR, PR, QRS, QT, RR, QTc),\n"
        "- state whether they fall within, below, or above the reference ranges used by this tool,\n"
        "- mention the percentile band provided by the tool,\n"
        "- use neutral phrases such as 'within the reference range used by this tool' or "
        "'values outside the reference range are noted for awareness.'\n"
        "All content must be non-diagnostic and non-directive, suitable for documentation and teaching only."
    )

    user_prompt = (
        "You are given de-identified ECG interval data and derived QTc metrics.\n"
        "Summarise this as a short, neutral narrative plus key bullet points.\n\n"
        "Input JSON:\n"
        f"{structured}\n\n"
        "Required output JSON with this exact schema:\n"
        "{\n"
        '  \"narrative\": \"one or two sentences of plain English describing the intervals and QTc in relation to the reference ranges used by this tool\",\n'
        '  \"key_points\": [\"short bullet point\", \"...\"],\n'
        '  \"caution_flags\": [\"if any values lie outside the reference range, you may include a neutral note such as '
        '                        \'Values outside the reference range are noted for awareness.\'\"] ,\n'
        '  \"disclaimer\": \"must explicitly state: DEMONSTRATION ONLY — NOT FOR CLINICAL USE.\"\n'
        "}\n"
        "Do NOT include any other top-level fields. "
        "Do NOT mention diagnosis, prognosis, risk, or treatment.\n"
    )

    try:
        logger.info("AI narrative: calling OpenAI model %s", OPENAI_MODEL)
        resp = _client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            response_format={"type": "json_object"},
            temperature=0.2,
        )
        data = resp.choices[0].message.content
        parsed = json.loads(data)

        # Guardrail: scan only the free-text bits
        text_for_scan_parts = [
            parsed.get("narrative") or "",
            " ".join(parsed.get("key_points") or []),
            " ".join(parsed.get("caution_flags") or []),
        ]
        text_for_scan = " ".join(text_for_scan_parts)

        if _contains_banned(text_for_scan):
            logger.info("AI narrative: banned language detected in LLM output, using fallback.")
            return _deterministic_fallback(structured)

        # Ensure mandatory fields and disclaimer
        narrative = parsed.get("narrative") or ""
        key_points = parsed.get("key_points") or []
        caution_flags = parsed.get("caution_flags") or []
        disclaimer = parsed.get("disclaimer") or DEMO_DISCLAIMER

        return {
            "narrative": narrative,
            "key_points": key_points,
            "caution_flags": caution_flags,
            "disclaimer": disclaimer,
        }

    except Exception as exc:
        logger.exception("AI narrative: OpenAI call failed, using deterministic fallback: %s", exc)
        return _deterministic_fallback(structured)
