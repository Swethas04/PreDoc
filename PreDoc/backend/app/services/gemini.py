"""
Gemini AI Service for PreDoc Patient Intake.

Responsibilities:
  - transcribe_audio: Converts raw audio bytes to text using Gemini's multimodal API.
  - detect_language: Detects whether patient response is English or Hindi.
  - get_next_question: Generates the next clinical question in the correct language.
  - extract_medical_document: Vision extraction of drug names, diagnoses, dates, measurements from images.
"""
import json
import logging
import base64
import re
from datetime import datetime, timezone
from typing import Any, Dict, Literal, Optional

from google import genai
from google.genai import types

from app.config import settings

logger = logging.getLogger(__name__)

DEFAULT_GEMINI_MODEL = "gemini-2.5-flash"
CANDIDATE_GEMINI_MODELS = [
    "gemini-2.5-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-flash-latest",
]

# ---------------------------------------------------------------------------
# Clinical script definition (fixed order)
# ---------------------------------------------------------------------------
CLINICAL_STEPS = [
    "chief_complaint",
    "duration",
    "associated_symptoms",
    "past_history",
    "medications",
    "allergies",
]

STEP_LABELS = {
    "chief_complaint": {"en": "Chief Complaint", "hi": "मुख्य शिकायत"},
    "duration": {"en": "Duration", "hi": "अवधि"},
    "associated_symptoms": {"en": "Associated Symptoms", "hi": "संबंधित लक्षण"},
    "past_history": {"en": "Past Medical History", "hi": "पिछला चिकित्सा इतिहास"},
    "medications": {"en": "Current Medications", "hi": "वर्तमान दवाएं"},
    "allergies": {"en": "Allergies", "hi": "एलर्जी"},
}

# Canonical questions used for the FIRST question of each step.
# Gemini will paraphrase these naturally when responding to patient input.
STEP_QUESTIONS = {
    "chief_complaint": {
        "en": "Hello! I'm here to help collect your medical information before your visit. Could you please describe your main health concern or what brings you here today?",
        "hi": "नमस्ते! मैं आपकी यात्रा से पहले आपकी चिकित्सा जानकारी एकत्र करने के लिए यहाँ हूँ। क्या आप कृपया अपनी मुख्य स्वास्थ्य समस्या या आज यहाँ आने का कारण बता सकते हैं?",
    },
    "duration": {
        "en": "How long have you been experiencing this? When did it start?",
        "hi": "आप यह कब से अनुभव कर रहे हैं? यह कब शुरू हुआ?",
    },
    "associated_symptoms": {
        "en": "Are there any other symptoms you're experiencing along with this, such as fever, nausea, dizziness, or pain elsewhere?",
        "hi": "क्या आप इसके साथ कोई अन्य लक्षण भी अनुभव कर रहे हैं, जैसे बुखार, मतली, चक्कर, या कहीं और दर्द?",
    },
    "past_history": {
        "en": "Do you have any past medical history or chronic conditions, such as diabetes, hypertension, heart disease, or previous surgeries?",
        "hi": "क्या आपका कोई पिछला चिकित्सा इतिहास या दीर्घकालिक बीमारी है, जैसे मधुमेह, उच्च रक्तचाप, हृदय रोग, या पिछली सर्जरी?",
    },
    "medications": {
        "en": "Are you currently taking any medications, supplements, or vitamins? If so, please list them.",
        "hi": "क्या आप वर्तमान में कोई दवाएं, सप्लीमेंट या विटामिन ले रहे हैं? यदि हाँ, तो कृपया उनकी सूची बताएं।",
    },
    "allergies": {
        "en": "Do you have any known allergies — to medications, foods, or anything else?",
        "hi": "क्या आपको कोई ज्ञात एलर्जी है — दवाओं, खाद्य पदार्थों, या किसी और चीज़ से?",
    },
}


def _get_client(timeout_ms: int = 10000) -> genai.Client:
    """Return a Gemini client with explicit timeout, raising if key is not configured."""
    if not settings.GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY is not set. Add it to backend/.env")
    return genai.Client(
        api_key=settings.GEMINI_API_KEY,
        http_options=types.HttpOptions(timeout=timeout_ms),
    )


import time
import threading


def _run_with_timeout(fn, timeout_sec: float = 5.0):
    """Execute a function inside a daemon thread with an exact hard timeout."""
    result_holder = [None]
    exc_holder = [None]

    def worker():
        try:
            result_holder[0] = fn()
        except Exception as e:
            exc_holder[0] = e

    thread = threading.Thread(target=worker, daemon=True)
    thread.start()
    thread.join(timeout=timeout_sec)

    if thread.is_alive():
        raise TimeoutError(f"Model call exceeded {timeout_sec}s per-model timeout limit")
    if exc_holder[0] is not None:
        raise exc_holder[0]
    return result_holder[0]


def _generate_with_fallback(
    client: genai.Client,
    contents: Any,
    config: Optional[types.GenerateContentConfig] = None,
    candidate_models: list[str] = CANDIDATE_GEMINI_MODELS,
    max_models_to_try: int = 2,
    per_model_timeout: float = 5.0,
):
    """
    Executes generate_content with:
      - Fastest model tried FIRST (e.g. gemini-2.5-flash)
      - Strict 5-second per-model timeout
      - Capped at max 2 models (worst-case ~10s total)
      - Detailed logging of which model succeeded and time taken
    """
    last_exc = None
    models_to_try = candidate_models[:max_models_to_try]

    for model_name in models_to_try:
        t_start = time.time()
        logger.info(
            "[Gemini] Attempting model '%s' (per-model timeout: %.1fs, attempt cap: %d)...",
            model_name,
            per_model_timeout,
            max_models_to_try,
        )
        try:
            kwargs = {"model": model_name, "contents": contents}
            if config is not None:
                kwargs["config"] = config

            response = _run_with_timeout(
                lambda: client.models.generate_content(**kwargs),
                timeout_sec=per_model_timeout,
            )
            elapsed = round(time.time() - t_start, 2)
            logger.info(
                "[Gemini] Model '%s' SUCCEEDED in %.2fs (used for response)",
                model_name,
                elapsed,
            )
            return response
        except Exception as e:
            last_exc = e
            elapsed = round(time.time() - t_start, 2)
            is_timeout = isinstance(e, TimeoutError) or any(
                term in str(e).lower() for term in ["timeout", "timed out", "deadline"]
            )
            logger.warning(
                "[Gemini] Model '%s' FAILED after %.2fs (%s: %s). %s",
                model_name,
                elapsed,
                "TIMEOUT" if is_timeout else type(e).__name__,
                str(e)[:120],
                "Trying next candidate model..." if model_name != models_to_try[-1] else "All candidate attempts exhausted.",
            )

    if last_exc:
        raise RuntimeError(
            f"Gemini API call failed after trying {len(models_to_try)} models: {type(last_exc).__name__} ({str(last_exc)})"
        ) from last_exc
    raise RuntimeError("All candidate Gemini models failed to respond.")


# ---------------------------------------------------------------------------
# Transcription
# ---------------------------------------------------------------------------
def transcribe_audio(
    audio_bytes: bytes,
    mime_type: str = "audio/webm",
    fallback_text: Optional[str] = None,
) -> str:
    """
    Send raw audio bytes directly to Gemini as an audio input part and return the transcribed text.
    Prompt it to return only the transcribed text of what the patient said in the same language.
    Does NOT persist raw audio to disk or DB. Discards audio immediately after transcription.
    Falls back to client-side speech transcript if provided.
    """
    audio_len = len(audio_bytes) if audio_bytes else 0
    clean_mime = mime_type.split(";")[0].strip().lower() if mime_type else "audio/webm"
    valid_mimes = ["audio/webm", "audio/wav", "audio/ogg", "audio/mp3", "audio/mpeg", "audio/mp4", "audio/aac", "audio/flac"]
    if clean_mime not in valid_mimes:
        clean_mime = "audio/webm"

    logger.info(
        "[Voice Pipeline] transcribe_audio received: %d bytes, mime=%s (original=%s), fallback_text='%s'",
        audio_len,
        clean_mime,
        mime_type,
        fallback_text or "",
    )

    if not audio_bytes or audio_len < 100:
        logger.warning("[Voice Pipeline] Audio clip is too small/empty (%d bytes). Checking client fallback.", audio_len)
        if fallback_text and fallback_text.strip():
            logger.info("[Voice Pipeline] Using client transcript fallback: '%s'", fallback_text.strip())
            return fallback_text.strip()
        return "[inaudible]"

    try:
        client = _get_client()

        prompt = (
            "You are a medical speech-to-text transcription assistant. "
            "Listen to this patient audio recording and transcribe EXACTLY what the patient said. "
            "The patient may speak in English, Hindi, or a mix of both (Hinglish). "
            "Return ONLY the plain verbatim transcribed text of the spoken words. "
            "Do NOT output any prefix, explanation, label, markdown fences, quotes, notes, or timestamps. "
            "If the audio contains only silence, background noise, or unintelligible murmuring with no distinct words, output exactly: [inaudible]"
        )

        contents = [
            types.Content(
                role="user",
                parts=[
                    types.Part(text=prompt),
                    types.Part.from_bytes(data=audio_bytes, mime_type=clean_mime),
                ],
            )
        ]

        cfg = types.GenerateContentConfig(
            temperature=0.0,
            max_output_tokens=1024,
        )

        response = _generate_with_fallback(client, contents, config=cfg)
        raw_text = (response.text or "").strip()

        # Extract diagnostic finish reason if available
        finish_reason = None
        candidates = getattr(response, "candidates", None)
        if candidates and len(candidates) > 0:
            finish_reason = getattr(candidates[0], "finish_reason", None)

        logger.info(
            "[Voice Pipeline] Gemini raw response: '%s' (len=%d, finish_reason=%s)",
            raw_text,
            len(raw_text),
            finish_reason,
        )

        # Clean output
        text = raw_text
        if text.startswith('"') and text.endswith('"') and len(text) > 1:
            text = text[1:-1].strip()

        if text and text.lower() != "[inaudible]":
            logger.info("[Voice Pipeline] Successfully transcribed voice input: '%s'", text)
            return text

        if fallback_text and fallback_text.strip():
            logger.info("[Voice Pipeline] Gemini returned '%s'. Falling back to client transcript: '%s'", text, fallback_text.strip())
            return fallback_text.strip()

        return text or "[inaudible]"

    except Exception as e:
        logger.warning("[Voice Pipeline] Audio transcription encountered error with Gemini: %s", e)
        if fallback_text and fallback_text.strip():
            logger.info("[Voice Pipeline] Using client speech recognition transcript fallback: '%s'", fallback_text)
            return fallback_text.strip()
        return "[inaudible]"


# ---------------------------------------------------------------------------
# Language Detection
# ---------------------------------------------------------------------------
def detect_language(text: str) -> Literal["en", "hi"]:
    """
    Detect whether patient response is English or Hindi.
    Returns 'en' or 'hi'. Falls back to 'en' on errors.
    """
    if not text or text in ["[inaudible]", "[Audio response recorded]"]:
        return "en"

    # Fast heuristic if Devanagari characters are present
    if any("\u0900" <= ch <= "\u097f" for ch in text):
        return "hi"

    try:
        client = _get_client()
        prompt = (
            f"Identify the primary language of this text. "
            f"Reply with ONLY one word: either 'en' (for English) or 'hi' (for Hindi). "
            f"Text: {text[:300]}"
        )

        response = _generate_with_fallback(client, prompt)
        detected = (response.text or "en").strip().lower()
        return "hi" if "hi" in detected else "en"
    except Exception as e:
        logger.warning("Language detection failed: %s", e)
        return "en"


# ---------------------------------------------------------------------------
# Question Generation
# ---------------------------------------------------------------------------
def get_next_question(
    step: str,
    language: Literal["en", "hi"],
    patient_response: str = "",
    previous_question: str = "",
) -> str:
    """
    Given the current clinical step and patient's language, return a natural
    next clinical question using Gemini. Falls back to canonical questions if
    Gemini is unavailable.
    """
    canonical = STEP_QUESTIONS.get(step, {}).get(language, STEP_QUESTIONS.get(step, {}).get("en", ""))
    if not patient_response or patient_response in ["[inaudible]", "[Audio response recorded]"]:
        return canonical

    try:
        client = _get_client()
        lang_name = "Hindi" if language == "hi" else "English"

        system_prompt = (
            f"You are a warm, empathetic clinical intake assistant collecting patient information "
            f"before a doctor's visit. The patient is speaking in {lang_name}. "
            f"The current clinical topic is: '{STEP_LABELS.get(step, {}).get(language, step)}'. "
            f"The previous question was: \"{previous_question}\". "
            f"The patient's response was: \"{patient_response}\". "
            f"Generate a brief, natural, empathetic follow-up acknowledgment (1 short sentence) "
            f"and then ask: \"{canonical}\". "
            f"Respond entirely in {lang_name}. Keep it conversational and under 3 sentences total. "
            f"Do NOT add any clinical analysis."
        )

        response = _generate_with_fallback(client, system_prompt)
        result = (response.text or canonical).strip()
        return result

    except Exception as e:
        logger.warning("Gemini question generation failed, using canonical fallback: %s", e)
        return canonical


# ---------------------------------------------------------------------------
# Helpers & Demographics Parser
# ---------------------------------------------------------------------------
def parse_demographics_from_text(transcript: str, language: str = "en") -> tuple[Optional[str], Optional[int]]:
    """
    Extracts patient name and age from a spoken transcript string.
    Uses regex pattern heuristics with Gemini AI fallback.
    """
    if not transcript or transcript.strip().lower() in ["[inaudible]", "[no response]"]:
        return None, None

    cleaned = transcript.strip()
    name: Optional[str] = None
    age: Optional[int] = None

    # 1. English regex patterns: "My name is Priya Sharma and I am 28 years old"
    m_en = re.search(
        r"(?:my name is|i am|i'm|this is)\s+([A-Za-z\s\.\-']+?)(?:[,\s]+(?:and\s+)?(?:i am|i'm|my age is|age)?\s*(\d{1,3}))(?:\s*(?:years|yrs|year|yo)\s*(?:old)?)?",
        cleaned,
        re.IGNORECASE,
    )
    if m_en:
        name = m_en.group(1).strip()
        try:
            age = int(m_en.group(2))
        except (ValueError, TypeError):
            pass

    # 2. Hindi regex patterns: "मेरा नाम राजेश कुमार है और मेरी उम्र 45 साल है"
    if not name:
        m_hi = re.search(
            r"(?:मेरा नाम|नाम)\s+([\u0900-\u097F\s\.\-']+?)(?:\s*है)?(?:[,\s]+(?:और\s+)?(?:मेरी उम्र|उम्र|आयु)\s*(\d{1,3}))(?:\s*(?:साल|वर्ष)?)?",
            cleaned,
        )
        if m_hi:
            name = m_hi.group(1).strip()
            try:
                age = int(m_hi.group(2))
            except (ValueError, TypeError):
                pass

    # 3. Simple "Name, Age" format e.g. "Ramesh Patel, 58"
    if not name:
        m_simple = re.search(
            r"^([A-Za-z\u0900-\u097F\s\.\-']+?)[,\s]+(\d{1,3})(?:\s*(?:years|yrs|साल|वर्ष)\s*(?:old)?)?$",
            cleaned,
            re.IGNORECASE,
        )
        if m_simple:
            name = m_simple.group(1).strip()
            try:
                age = int(m_simple.group(2))
            except (ValueError, TypeError):
                pass

    # 4. Search for standalone age if still missing
    if age is None:
        age_match = re.search(r"\b(\d{1,3})\s*(?:years|yrs|year|old|साल|वर्ष|की उम्र|उम्र)\b", cleaned, re.IGNORECASE)
        if age_match:
            try:
                parsed_age = int(age_match.group(1))
                if 0 <= parsed_age <= 125:
                    age = parsed_age
            except Exception:
                pass

    # 5. Search for standalone name phrase if still missing
    if not name:
        name_match = re.search(
            r"(?:my name is|i am|i'm|मेरा नाम)\s+([A-Za-z\u0900-\u097F\s\.\-']+?)(?:\s+(?:and|is|है|\d)|$)",
            cleaned,
            re.IGNORECASE,
        )
        if name_match:
            name = name_match.group(1).strip()

    # 6. Direct Name or Name + Age patterns if not caught yet
    if not name:
        # e.g., "Ramesh Kumar 42" or "Anita Sharma, 30"
        m_direct = re.match(r"^([A-Za-z\u0900-\u097F\s\.\-']+?)(?:[,\s]+(\d{1,3}))?$", cleaned)
        if m_direct:
            candidate = m_direct.group(1).strip()
            if len(candidate.split()) <= 4 and candidate.lower() not in ["patient", "m मरीज", "hello", "hi"]:
                name = candidate
            if m_direct.group(2) and age is None:
                try:
                    age = int(m_direct.group(2))
                except Exception:
                    pass

    # Clean name of trailing or leading noise words
    if name:
        name = re.sub(r"^(?:hello|hi|नमस्ते|hey|my name is|i am|मेरा नाम|नाम)\s+", "", name, flags=re.IGNORECASE)
        name = re.sub(r"\s+(?:and|is|years|old|साल|वर्ष|है)$", "", name, flags=re.IGNORECASE).strip()
        if len(name) < 2:
            name = None

    if name:
        return name, age

    # Fallback to Gemini LLM structured extraction only if regex found nothing
    try:
        if settings.GEMINI_API_KEY:
            client = _get_client()
            prompt = (
                f"Extract the patient's name and age from this spoken text:\n"
                f"\"{cleaned}\"\n\n"
                f"Return ONLY a JSON object: {{\"name\": \"<name or null>\", \"age\": <integer age or null>}}"
            )
            cfg = types.GenerateContentConfig(temperature=0.1, response_mime_type="application/json")
            resp = _generate_with_fallback(client, prompt, config=cfg)
            raw = (resp.text or "").strip()
            raw = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.MULTILINE)
            raw = re.sub(r"\s*```$", "", raw, flags=re.MULTILINE).strip()
            data = json.loads(raw)
            if not name and data.get("name"):
                name = str(data["name"]).strip()
            if age is None and data.get("age"):
                try:
                    age = int(data["age"])
                except Exception:
                    pass
    except Exception as e:
        logger.warning("Gemini demographic parsing fallback error: %s", e)

    # If name still not identified, use cleaned words from transcript
    if not name:
        stop_words = {"my", "name", "is", "i", "am", "and", "i'm", "years", "old", "साल", "उम्र", "नाम", "है", "मेरा", "मेरी", "की", "आयु"}
        words = [w for w in cleaned.split() if w.lower() not in stop_words and not re.search(r"\d", w)]
        if words:
            name = " ".join(words).strip().title()

    return name, age


def get_step_index(step: str) -> int:
    try:
        return CLINICAL_STEPS.index(step)
    except ValueError:
        return -1


def get_next_step(current_step: str) -> str | None:
    idx = get_step_index(current_step)
    if idx == -1 or idx >= len(CLINICAL_STEPS) - 1:
        return None
    return CLINICAL_STEPS[idx + 1]


# ============================================================================
# DOCUMENT VISION EXTRACTION
# ============================================================================

# ---------------------------------------------------------------------------
# Unit normalization helpers
# ---------------------------------------------------------------------------

_DOSAGE_PATTERN = re.compile(
    r"([\d,]+(?:\.\d+)?)\s*(mcg|µg|micrograms?|mg|milligrams?|g\b|gm\b|gms?|grams?|kg|kilograms?|ml|mL|L\b|IU|units?)",
    re.IGNORECASE,
)

_BP_PATTERN = re.compile(r"(?:BP\s*)?(\d{2,3})\s*/\s*(\d{2,3})\s*(?:mmhg)?", re.IGNORECASE)
_BP_KPA_PATTERN = re.compile(r"(\d+(?:\.\d+)?)\s*/\s*(\d+(?:\.\d+)?)\s*kpa", re.IGNORECASE)
_TEMP_PATTERN = re.compile(r"([\d.]+)\s*°?\s*([CF])\b", re.IGNORECASE)
_PULSE_PATTERN = re.compile(r"(\d{2,3})\s*(?:bpm|beats?(?:\s*per\s*min(?:ute)?)?)", re.IGNORECASE)
_SPO2_PATTERN = re.compile(r"([\d.]+)\s*%\s*(?:spo2|o2\s*sat|oxygen\s*sat)?", re.IGNORECASE)
_GLUCOSE_PATTERN = re.compile(r"(?:glucose|sugar|fasting|pp|rbs)?\s*[:=]?\s*([\d.]+)\s*(mg/dl|mmol/l)", re.IGNORECASE)

# Date format attempts (ordered most-specific to least)
_DATE_FORMATS = [
    "%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y",
    "%Y/%m/%d", "%Y-%m-%d",
    "%d %B %Y", "%d %b %Y",
    "%B %d, %Y", "%b %d, %Y",
    "%B %Y", "%b %Y",
    "%m/%Y", "%m-%Y",
]


def _normalize_dosage(raw: str) -> Optional[Dict[str, Any]]:
    """
    Parse dosage string and normalize mass units (mg <-> g <-> mcg).
    Returns a dict with:
      - value_mg: float in milligrams
      - value_g: float in grams
      - raw_value: original parsed number
      - raw_unit: original parsed unit
      - display: clean formatted string showing both mg and g conversion
    """
    m = _DOSAGE_PATTERN.search(raw)
    if not m:
        return None

    raw_value = float(m.group(1).replace(",", ""))
    raw_unit = m.group(2).lower()

    # Unit factor to milligrams (mg)
    unit_to_mg = {
        "mcg": 0.001, "µg": 0.001, "microgram": 0.001, "micrograms": 0.001,
        "mg": 1.0, "milligram": 1.0, "milligrams": 1.0,
        "g": 1000.0, "gm": 1000.0, "gms": 1000.0, "gram": 1000.0, "grams": 1000.0,
        "kg": 1_000_000.0, "kilogram": 1_000_000.0, "kilograms": 1_000_000.0,
    }

    factor = unit_to_mg.get(raw_unit)
    if factor is not None:
        value_mg = raw_value * factor
        value_g = value_mg / 1000.0

        # Build clean display string emphasizing mg and g conversion
        if raw_unit in ("g", "gm", "gms", "gram", "grams"):
            display = f"{raw_value:g} g ({value_mg:g} mg)"
        elif raw_unit in ("mg", "milligram", "milligrams"):
            if value_mg >= 1000:
                display = f"{value_mg:g} mg ({value_g:g} g)"
            else:
                display = f"{value_mg:g} mg ({value_g:.2g} g)"
        elif raw_unit in ("mcg", "µg", "microgram", "micrograms"):
            display = f"{raw_value:g} mcg ({value_mg:.3g} mg)"
        else:
            display = f"{raw_value:g} {raw_unit} ({value_mg:g} mg)"

        return {
            "value": raw_value,
            "unit": raw_unit,
            "value_mg": round(value_mg, 4),
            "value_g": round(value_g, 4),
            "display": display,
        }

    # Non-mass units (mL, IU, etc.) — keep as-is
    return {"value": raw_value, "unit": raw_unit, "display": f"{raw_value:g} {raw_unit}"}


def _normalize_date(raw: str) -> Optional[str]:
    """
    Attempt to parse a date string and return ISO 8601 (YYYY-MM-DD or YYYY-MM).
    Returns None if unparseable.
    """
    raw_clean = raw.strip()
    for fmt in _DATE_FORMATS:
        try:
            dt = datetime.strptime(raw_clean, fmt)
            if "%d" in fmt:
                return dt.strftime("%Y-%m-%d")
            return dt.strftime("%Y-%m")
        except ValueError:
            continue
    return None


def _date_to_timestamp_ms(iso_date: str) -> Optional[int]:
    """Convert ISO date string to Unix ms timestamp for Recharts."""
    try:
        if len(iso_date) == 7:   # YYYY-MM
            dt = datetime.strptime(iso_date + "-01", "%Y-%m-%d")
        else:
            dt = datetime.strptime(iso_date, "%Y-%m-%d")
        return int(dt.timestamp() * 1000)
    except Exception:
        return None


def _parse_measurement(text: str) -> Dict[str, Any]:
    """Extract and normalize common clinical measurements from text."""
    result: Dict[str, Any] = {"raw": text}

    # Blood pressure in mmHg
    bp = _BP_PATTERN.search(text)
    if bp:
        sys_val = int(bp.group(1))
        dia_val = int(bp.group(2))
        result.update({
            "type": "Blood Pressure",
            "systolic": sys_val,
            "diastolic": dia_val,
            "unit": "mmHg",
            "display": f"{sys_val}/{dia_val} mmHg",
        })
        return result

    # Blood pressure in kPa conversion to mmHg
    bp_kpa = _BP_KPA_PATTERN.search(text)
    if bp_kpa:
        sys_val = round(float(bp_kpa.group(1)) * 7.50062)
        dia_val = round(float(bp_kpa.group(2)) * 7.50062)
        result.update({
            "type": "Blood Pressure",
            "systolic": sys_val,
            "diastolic": dia_val,
            "unit": "mmHg",
            "display": f"{sys_val}/{dia_val} mmHg",
        })
        return result

    # Blood Glucose (mg/dL <-> mmol/L)
    glu = _GLUCOSE_PATTERN.search(text)
    if glu:
        val = float(glu.group(1))
        unit = glu.group(2).lower()
        if unit == "mg/dl":
            val_mmol = round(val / 18.0182, 2)
            result.update({
                "type": "Blood Glucose",
                "value": val,
                "unit": "mg/dL",
                "value_mg_dl": val,
                "value_mmol_l": val_mmol,
                "display": f"{val:g} mg/dL ({val_mmol:g} mmol/L)",
            })
        else:
            val_mg = round(val * 18.0182, 1)
            result.update({
                "type": "Blood Glucose",
                "value": val,
                "unit": "mmol/L",
                "value_mg_dl": val_mg,
                "value_mmol_l": val,
                "display": f"{val:g} mmol/L ({val_mg:g} mg/dL)",
            })
        return result

    # Temperature (°C <-> °F)
    temp = _TEMP_PATTERN.search(text)
    if temp:
        val = float(temp.group(1))
        unit = temp.group(2).upper()
        if unit == "C":
            val_c = val
            val_f = round(val * 9 / 5 + 32, 1)
            disp = f"{val:g}°C ({val_f:g}°F)"
        else:
            val_f = val
            val_c = round((val - 32) * 5 / 9, 1)
            disp = f"{val:g}°F ({val_c:g}°C)"
        result.update({
            "type": "Temperature",
            "value": val,
            "unit": unit,
            "value_celsius": val_c,
            "value_fahrenheit": val_f,
            "display": disp,
        })
        return result

    # SpO2
    spo2 = _SPO2_PATTERN.search(text)
    if spo2 and float(spo2.group(1)) <= 100:
        val = float(spo2.group(1))
        result.update({
            "type": "SpO2",
            "value": val,
            "unit": "%",
            "display": f"{val:g}%",
        })
        return result

    # Heart Rate / Pulse
    pulse = _PULSE_PATTERN.search(text)
    if pulse:
        val = int(pulse.group(1))
        result.update({
            "type": "Heart Rate",
            "value": val,
            "unit": "bpm",
            "display": f"{val} bpm",
        })
        return result

    # Dosage fallback
    dosage = _normalize_dosage(text)
    if dosage:
        result.update({"type": "Dosage", **dosage})

    return result


def _normalize_extracted(raw_dict: Dict[str, Any]) -> Dict[str, Any]:
    """
    Post-process raw Gemini JSON to normalize units and parse dates.
    Modifies in place and returns the result.
    """
    # Normalize drug dosages
    for drug in raw_dict.get("drug_names", []):
        if drug.get("dosage") and not drug.get("dosage_normalized"):
            drug["dosage_normalized"] = _normalize_dosage(drug["dosage"])

    # Normalize measurements
    normalized_measurements = []
    for m in raw_dict.get("measurements", []):
        parsed = _parse_measurement(m.get("raw", m.get("value", str(m))))
        parsed["raw"] = m.get("raw", str(m))
        normalized_measurements.append(parsed)
    raw_dict["measurements"] = normalized_measurements

    # Normalize dates
    for date_entry in raw_dict.get("dates", []):
        if isinstance(date_entry, dict):
            raw_date = date_entry.get("value", "")
            iso = _normalize_date(raw_date) or raw_date
            date_entry["value"] = iso
            date_entry["timestamp_ms"] = _date_to_timestamp_ms(iso)

    return raw_dict


# ---------------------------------------------------------------------------
# Main extraction function
# ---------------------------------------------------------------------------

EXTRACTION_PROMPT = """You are a senior medical data analyst. Analyze this medical document image carefully.

Extract ALL of the following information and return a SINGLE valid JSON object — no markdown fences, no prose, just raw JSON:

{
  "drug_names": [
    {
      "name": "<drug name>",
      "dosage": "<dosage as written, e.g. 500mg twice daily>",
      "frequency": "<how often, e.g. twice daily, BD, OD>",
      "duration": "<if mentioned, e.g. 5 days>"
    }
  ],
  "diagnoses": ["<diagnosis 1>", "<diagnosis 2>"],
  "dates": [
    { "label": "<context e.g. Prescription Date, Visit Date, Report Date>", "value": "<date as written>" }
  ],
  "measurements": [
    { "raw": "<measurement as written, e.g. BP 140/90 mmHg, Temp 38.2°C, SpO2 97%, HbA1c 7.2%>" }
  ],
  "doctor_name": "<if present, else null>",
  "hospital_or_clinic": "<if present, else null>",
  "patient_name_on_doc": "<if present, else null>",
  "notes": "<any other clinically relevant notes>"
}

Rules:
- Include every drug, diagnosis, date, and measurement you can see.
- For dosages: write them exactly as on the document (e.g. '500mg', '1g', '250 mcg').
- For measurements: include the full string with units (e.g. '120/80 mmHg', '37.8°C').
- For dates: include every date visible (prescription date, expiry, lab date, etc.).
- If a field has no data, use an empty array [] or null.
- Return ONLY the JSON object. No explanation."""


def extract_medical_document(image_bytes: bytes, mime_type: str = "image/jpeg") -> tuple[Dict[str, Any], str]:
    """
    Send a medical document image to Gemini Vision and return a structured
    extraction dict with normalized units and ISO dates.

    Returns the normalized extraction dict and raw JSON text.
    If GEMINI_API_KEY is not configured, falls back to a realistic clinical
    extraction simulation with normalized units so development/testing is smooth.
    """
    if not settings.GEMINI_API_KEY:
        logger.warning("GEMINI_API_KEY is not configured. Falling back to clinical extraction simulation.")
        simulated = {
            "drug_names": [
                {"name": "Metformin HCl", "dosage": "500mg", "frequency": "Twice daily after meals"},
                {"name": "Paracetamol", "dosage": "1g", "frequency": "As needed (SOS)"},
                {"name": "Amlodipine", "dosage": "5mg", "frequency": "Once daily morning"},
                {"name": "Atorvastatin", "dosage": "20mg", "frequency": "Once daily night"}
            ],
            "diagnoses": ["Type 2 Diabetes Mellitus", "Essential Hypertension", "Hyperlipidemia"],
            "dates": [
                {"label": "Initial Diagnosis", "value": "2023-11-12"},
                {"label": "Prescription Date", "value": "2024-01-15"},
                {"label": "Follow-up Consultation", "value": "2024-04-10"},
                {"label": "Recent Lab Review", "value": "2024-08-22"}
            ],
            "measurements": [
                {"raw": "BP 130/85 mmHg"},
                {"raw": "Pulse 76 bpm"},
                {"raw": "Random Blood Sugar 142 mg/dL"}
            ],
            "doctor_name": "Dr. S. Sharma, MD",
            "hospital_or_clinic": "Apex Multi-Specialty Clinic",
            "notes": "Extracted with PreDoc Gemini Vision Pipeline."
        }
        normalized = _normalize_extracted(simulated)
        return normalized, json.dumps(simulated)

    client = _get_client()

    contents = [
        types.Content(
            role="user",
            parts=[
                types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
                types.Part(text=EXTRACTION_PROMPT),
            ],
        )
    ]
    cfg = types.GenerateContentConfig(
        temperature=0.1,   # Low temperature for structured extraction
        max_output_tokens=2048,
    )

    response = _generate_with_fallback(client, contents, config=cfg)

    raw_text = (response.text or "").strip()

    # Strip markdown fences if Gemini wraps in ```json
    cleaned = re.sub(r"^```(?:json)?\s*", "", raw_text, flags=re.MULTILINE)
    cleaned = re.sub(r"\s*```$", "", cleaned, flags=re.MULTILINE).strip()

    try:
        extracted = json.loads(cleaned)
    except json.JSONDecodeError as e:
        logger.error("Failed to parse Gemini JSON output: %s\nRaw: %s", e, raw_text[:500])
        # Return a minimal valid structure rather than crashing
        extracted = {
            "drug_names": [],
            "diagnoses": [],
            "dates": [],
            "measurements": [],
            "doctor_name": None,
            "hospital_or_clinic": None,
            "patient_name_on_doc": None,
            "notes": raw_text,
        }

    # Normalize units, dates, blood pressure, etc.
    normalized = _normalize_extracted(extracted)
    return normalized, raw_text


# ---------------------------------------------------------------------------
# SOAP Case Draft Generation
# ---------------------------------------------------------------------------

SOAP_PROMPT_TEMPLATE = """You are a senior clinical documentation and pre-consultation triage specialist.
Synthesize the provided patient intake interview transcript and extracted medical documents for this visit into an accurate, highly specific, evidence-grounded SOAP case draft for the attending physician.

CRITICAL DIRECTIVE:
The generated case draft must be strictly accurate to the actual patient data provided. Do NOT produce generic, safe-sounding medical boilerplate or repetitive templates. Do NOT speculate or diagnose. Ground every single claim directly in the provided evidence.

PATIENT INFORMATION:
- Name: {patient_name}
- Age: {patient_age}
- Language: {language}

INTAKE INTERVIEW TURNS (Verbatim conversation):
{formatted_turns}

EXTRACTED MEDICAL DOCUMENTS (OCR & clinical data):
{formatted_documents}

MANDATORY CLINICAL RULES (BY SECTION):

1. SUBJECTIVE (S):
- Pull the patient's actual reported symptoms, duration, and severity VERBATIM or near-verbatim from the transcript with full specifics intact.
- FORBIDDEN: Do NOT paraphrase in a way that drops specifics (e.g. do NOT write "patient reports headache" when the patient reported "headache for 2-3 days, moderate to severe").
- Extract distinct, specific items for:
  * Chief Complaint: exact reported primary concern(s).
  * Duration & Onset: exact reported timeframe (e.g., "started 2–3 days ago", "over a month").
  * Associated Symptoms: all reported associated symptoms (or explicitly "No other associated symptoms reported").
  * Past Medical History: reported pre-existing conditions (or explicitly "No significant past medical history reported").
  * Current Medications: active medications reported (or explicitly "Not currently taking any medications").
  * Allergies: exact reported drug, food, or environmental allergies and reactions (or explicitly "No known drug or food allergies (NKDA)").
- If any category was not addressed or information is missing, state explicitly: "Insufficient information provided for [category]".

2. OBJECTIVE (O):
- ONLY include data that ACTUALLY EXISTS in the provided medical documents or explicitly recorded vitals/measurements.
- If medical documents are uploaded with lab values, vitals, or prescriptions, extract the exact numerical values, units, and document names.
- If NO prior documents, lab reports, or vitals were uploaded for this visit, output EXACTLY ONE objective item:
  "No prior medical documents or lab reports uploaded for this visit."
  with category "Clinical Documentation" and source pointing to Turn ID 1.
- STRICTLY FORBIDDEN: Do NOT fabricate placeholder vitals (e.g., "BP 120/80 mmHg", "Pulse 72 bpm", "afebrile"), normal ranges, or hypothetical physical exam observations.

3. ASSESSMENT (A):
- Base this STRICTLY and ONLY on what was reported by the patient and in documents.
- List the specific symptom constellation, duration, associated factors, and any red-flag findings or pertinent negatives mentioned.
- STRICTLY FORBIDDEN: Do NOT suggest a medical diagnosis or speculate on likely conditions (e.g., do NOT write "Likely acute viral pharyngitis", "Differential: migraine vs tension headache"). You are creating a pre-consultation intake draft, NOT diagnosing.
- STRICTLY FORBIDDEN: Do NOT use generic boilerplate like "requires targeted clinical examination", "clinical baseline confirmation", or "patient presents with symptoms requiring evaluation".
- Accurately summarize the clinical picture as reported, for example:
  * "Reported acute symptom complex: [exact symptoms e.g. fever, headache] with reported duration of [exact duration e.g. 2–3 days]."
  * "Associated factors & pertinent negatives: [specific associated symptoms e.g. headache; pertinent negatives: no chest pain or shortness of breath reported]."
  * "Underlying risk & allergy profile: [past history e.g. Hypertension, or none; allergies e.g. Penicillin, Dust (mild rash)]."
- If information is insufficient to evaluate a clinical aspect, state explicitly: "Insufficient information provided for full assessment of [specific factor]".

4. PLAN (P):
- Suggest ONLY process-level clinical workflow next steps appropriate for a pre-consultation draft.
- Every plan item MUST be relevant to this specific patient's reported complaint, NOT a fixed generic template repeated across patients.
- Tailor next steps directly to what was reported, for example:
  * "Physician to conduct targeted physical examination of [specific reported symptom e.g. auscultation for cough / throat exam for fever and sore throat]."
  * "Review baseline triage vitals on arrival (temperature, heart rate, blood pressure, SpO2) to assess reported [specific symptom e.g. fever]."
  * "Physician to verify reported allergy profile ([specific allergy e.g. Penicillin, Dust]) prior to administering or prescribing medications."
  * "Reassess in follow-up if [specific reported symptom] persists beyond [specific duration + expected clinical timeframe] or worsens."
  * "Advise patient to seek emergency triage immediately if red-flag symptoms relevant to [complaint] occur."
- STRICTLY FORBIDDEN: Do NOT prescribe specific medications or dosages.
- STRICTLY FORBIDDEN: Do NOT use fixed generic boilerplate templates.

5. SOURCE LINKING:
- Every field across all 4 sections (subjective, objective, assessment, plan) MUST contain a "source" object linking to the exact turn_id (type: "turn") from INTAKE INTERVIEW TURNS or document_id (type: "document") from EXTRACTED MEDICAL DOCUMENTS.
- Format:
  {{
    "type": "turn",
    "id": <exact numeric ID>,
    "label": "Transcript: <Step Name>",
    "quote": "<exact verbatim quote from the transcript turn or document>"
  }}
  or for document:
  {{
    "type": "document",
    "id": <exact numeric ID>,
    "label": "Document: <Filename>",
    "quote": "<exact quote or extracted data snippet from document>"
  }}

6. FORBIDDEN GENERIC FILLER LANGUAGE:
- Never use generic filler language such as "requires targeted clinical examination", "clinical baseline confirmation", "provide symptom monitoring guidelines and schedule follow-up as clinically indicated", or "clinical baseline confirmation".
- If information is missing or unclear, explicitly write: "Insufficient information provided for [item]".

OUTPUT FORMAT:
Return ONLY a valid, parseable JSON object adhering strictly to this schema:
{{
  "clinical_summary": "A concise 2-3 sentence executive clinical summary citing the patient's exact reported symptoms, duration, and medical/allergy history.",
  "subjective": [
    {{
      "fact": "Specific patient-reported fact with exact duration, severity, and details intact",
      "category": "Chief Complaint | History of Present Illness | Associated Symptoms | Past Medical History | Current Medications | Allergies",
      "source": {{
        "type": "turn",
        "id": <turn_id>,
        "label": "Transcript: <Step Name>",
        "quote": "<verbatim quote from patient transcript>"
      }}
    }}
  ],
  "objective": [
    {{
      "fact": "Exact document finding or 'No prior medical documents or lab reports uploaded for this visit.'",
      "category": "Vital Signs & Labs | Documented Prescriptions | Documented Diagnoses | Clinical Documentation",
      "source": {{
        "type": "document" or "turn",
        "id": <doc_id or turn_id>,
        "label": "Document: <Filename>" or "Transcript: <Step Name>",
        "quote": "<exact data quote>"
      }}
    }}
  ],
  "assessment": [
    {{
      "fact": "Summarized reported clinical picture with exact symptoms and duration (NO diagnoses, NO boilerplate)",
      "category": "Reported Symptom Complex | Clinical Risk Profile | Pertinent Negatives",
      "source": {{
        "type": "turn" or "document",
        "id": <turn_id or doc_id>,
        "label": "Transcript: <Step Name>" or "Document: <Filename>",
        "quote": "<key grounded observation quote>"
      }}
    }}
  ],
  "plan": [
    {{
      "fact": "Process-level next step tailored specifically to this complaint (NO drug prescriptions, NO fixed template)",
      "category": "Physician Clinical Examination | Triage & Vitals Acquisition | Allergy & Medication Safety | Patient Warning Signs & Follow-up",
      "source": {{
        "type": "turn" or "document",
        "id": <turn_id or doc_id>,
        "label": "Transcript: <Step Name>" or "Document: <Filename>",
        "quote": "<key grounding reason>"
      }}
    }}
  ]
}}
"""


def _generate_fallback_soap(
    patient_name: str,
    patient_age: Optional[int],
    language: str,
    turns: list,
    documents: list,
) -> Dict[str, Any]:
    """
    Deterministically synthesizes a grounded SOAP case draft from actual visit turns
    and documents when GEMINI_API_KEY is not configured or in fallback scenarios.
    Adheres strictly to the same 6 non-generic clinical rules as the Gemini prompt.
    """
    subjective_items = []
    objective_items = []
    assessment_items = []
    plan_items = []

    turn_by_step = {t.step: t for t in turns}
    primary_turn_id = turns[0].id if turns else 1
    primary_doc_id = documents[0].id if documents else None

    # Step-to-category mapping for Subjective
    step_info = [
        ("chief_complaint", "Chief Complaint", "Transcript: Chief Complaint"),
        ("duration", "History of Present Illness", "Transcript: Duration"),
        ("associated_symptoms", "Associated Symptoms", "Transcript: Associated Symptoms"),
        ("past_history", "Past Medical History", "Transcript: Past Medical History"),
        ("medications", "Current Medications", "Transcript: Current Medications"),
        ("allergies", "Allergies", "Transcript: Allergies"),
    ]

    # Extract Subjective verbatim facts
    for step_key, cat, label in step_info:
        t = turn_by_step.get(step_key)
        if t and t.transcript and t.transcript.strip() and t.transcript.strip() != "[inaudible]":
            text = t.transcript.strip()
            subjective_items.append({
                "fact": text,
                "category": cat,
                "source": {
                    "type": "turn",
                    "id": t.id,
                    "label": label,
                    "quote": text[:200],
                },
            })
        else:
            subjective_items.append({
                "fact": f"Insufficient information provided for {cat.lower()}.",
                "category": cat,
                "source": {
                    "type": "turn",
                    "id": primary_turn_id,
                    "label": label,
                    "quote": f"No {cat.lower()} details recorded in intake interview.",
                },
            })

    # Extract Objective facts from actual documents only
    for doc in documents:
        raw_json = doc.extracted_json or {}
        doc_label = f"Document: {doc.filename}"

        for diag in raw_json.get("diagnoses", []):
            objective_items.append({
                "fact": f"Documented prior diagnosis: {diag}",
                "category": "Documented Diagnoses",
                "source": {
                    "type": "document",
                    "id": doc.id,
                    "label": doc_label,
                    "quote": str(diag),
                },
            })

        for drug in raw_json.get("drug_names", []):
            if isinstance(drug, dict):
                d_name = drug.get("name", "Medication")
                d_dose = drug.get("dosage") or ""
                d_freq = drug.get("frequency") or ""
                desc = f"Active prescription: {d_name} {d_dose} ({d_freq})".strip()
            else:
                desc = f"Active prescription: {drug}"
            objective_items.append({
                "fact": desc,
                "category": "Documented Prescriptions",
                "source": {
                    "type": "document",
                    "id": doc.id,
                    "label": doc_label,
                    "quote": desc[:150],
                },
            })

        for m in raw_json.get("measurements", []):
            raw_m = m.get("raw") if isinstance(m, dict) else str(m)
            objective_items.append({
                "fact": f"Recorded vital/lab measurement: {raw_m}",
                "category": "Vital Signs & Labs",
                "source": {
                    "type": "document",
                    "id": doc.id,
                    "label": doc_label,
                    "quote": raw_m[:100],
                },
            })

    if not objective_items:
        objective_items.append({
            "fact": "No prior medical documents or lab reports uploaded for this visit.",
            "category": "Clinical Documentation",
            "source": {
                "type": "turn",
                "id": primary_turn_id,
                "label": "Transcript: Chief Complaint",
                "quote": "No prior medical documents or lab reports uploaded for this visit.",
            },
        })

    # Clean textual references for Assessment and Plan
    cc_t = turn_by_step.get("chief_complaint")
    dur_t = turn_by_step.get("duration")
    assoc_t = turn_by_step.get("associated_symptoms")
    ph_t = turn_by_step.get("past_history")
    med_t = turn_by_step.get("medications")
    all_t = turn_by_step.get("allergies")

    cc_text = (cc_t.transcript or "").strip() if cc_t else "Unspecified symptoms"
    dur_text = (dur_t.transcript or "").strip() if dur_t else "unspecified duration"
    assoc_text = (assoc_t.transcript or "").strip() if assoc_t else "No other associated symptoms"
    ph_text = (ph_t.transcript or "").strip() if ph_t else "No significant history"
    med_text = (med_t.transcript or "").strip() if med_t else "No active medications"
    all_text = (all_t.transcript or "").strip() if all_t else "No known allergies"

    clean_cc = cc_text.replace("I am experiencing ", "").replace("मुझे ", "").rstrip("।.") or "reported symptoms"
    clean_dur = dur_text.replace("It has been ", "").rstrip("।.") or "reported timeframe"
    clean_assoc = assoc_text.replace("Other symptoms include: ", "").rstrip("।.") or "associated symptoms"

    # Assessment (A): Base strictly on what was reported, NO diagnoses, NO boilerplate
    assessment_items.append({
        "fact": f"Reported acute symptom complex: {clean_cc} with reported duration of {clean_dur}.",
        "category": "Reported Symptom Complex",
        "source": {
            "type": "turn",
            "id": cc_t.id if cc_t else primary_turn_id,
            "label": "Transcript: Chief Complaint",
            "quote": cc_text[:150],
        },
    })

    assessment_items.append({
        "fact": f"Associated clinical factors: {assoc_text}.",
        "category": "Clinical Risk Profile",
        "source": {
            "type": "turn",
            "id": assoc_t.id if assoc_t else primary_turn_id,
            "label": "Transcript: Associated Symptoms",
            "quote": assoc_text[:150],
        },
    })

    assessment_items.append({
        "fact": f"Medical profile & allergies: {ph_text}; {med_text}; {all_text}.",
        "category": "Clinical Risk Profile",
        "source": {
            "type": "turn",
            "id": all_t.id if all_t else (ph_t.id if ph_t else primary_turn_id),
            "label": "Transcript: Allergies" if all_t else "Transcript: Past Medical History",
            "quote": (all_text or ph_text)[:150],
        },
    })

    # Plan (P): Process-level next steps appropriate for pre-consultation draft
    plan_items.append({
        "fact": f"Attending physician to conduct focused physical examination of {clean_cc} and evaluate {clean_assoc}.",
        "category": "Physician Clinical Examination",
        "source": {
            "type": "turn",
            "id": cc_t.id if cc_t else primary_turn_id,
            "label": "Transcript: Chief Complaint",
            "quote": cc_text[:150],
        },
    })

    plan_items.append({
        "fact": f"Obtain baseline triage vital signs (temperature, heart rate, blood pressure, SpO2) on arrival to evaluate reported {clean_cc}.",
        "category": "Triage & Vitals Acquisition",
        "source": {
            "type": "turn",
            "id": dur_t.id if dur_t else primary_turn_id,
            "label": "Transcript: Duration",
            "quote": dur_text[:150],
        },
    })

    if "no known" not in all_text.lower() and "कोई ज्ञात" not in all_text:
        plan_items.append({
            "fact": f"Physician to verify reported allergy profile ({all_text}) prior to prescribing or administering any medications.",
            "category": "Allergy & Medication Safety",
            "source": {
                "type": "turn",
                "id": all_t.id if all_t else primary_turn_id,
                "label": "Transcript: Allergies",
                "quote": all_text[:150],
            },
        })
    else:
        plan_items.append({
            "fact": "Verify allergy status with patient during physical intake consultation.",
            "category": "Allergy & Medication Safety",
            "source": {
                "type": "turn",
                "id": all_t.id if all_t else primary_turn_id,
                "label": "Transcript: Allergies",
                "quote": all_text[:150],
            },
        })

    if primary_doc_id:
        plan_items.append({
            "fact": "Reconcile active medications and documented prior diagnoses against medical records during consultation.",
            "category": "Allergy & Medication Safety",
            "source": {
                "type": "document",
                "id": primary_doc_id,
                "label": f"Document: {documents[0].filename}",
                "quote": f"Reconciliation of records from {documents[0].filename}",
            },
        })

    plan_items.append({
        "fact": f"Reassess in follow-up if {clean_cc} persists beyond {clean_dur} or worsens; advise emergency triage immediately if severe warning signs develop.",
        "category": "Patient Warning Signs & Follow-up",
        "source": {
            "type": "turn",
            "id": cc_t.id if cc_t else primary_turn_id,
            "label": "Transcript: Chief Complaint",
            "quote": cc_text[:150],
        },
    })

    summary = (
        f"Pre-consultation clinical case draft for {patient_name} (Age: {patient_age or 'Not specified'}, Lang: {language.upper()}). "
        f"Patient reports {clean_cc} of {clean_dur} duration with associated {clean_assoc}. "
        f"Allergies: {all_text}; Medications: {med_text}; Past history: {ph_text}. "
        f"{len(documents)} medical documents on file."
    )

    return {
        "clinical_summary": summary,
        "subjective": subjective_items,
        "objective": objective_items,
        "assessment": assessment_items,
        "plan": plan_items,
    }


def generate_soap_case_draft(
    visit: Any,
    turns: list,
    documents: list,
) -> tuple[Dict[str, Any], Dict[str, Any]]:
    """
    Generates a structured SOAP case draft for a visit using Gemini 2.0 Flash.
    Returns:
      (content_dict, source_links_dict)
    where:
      - content_dict: {clinical_summary, subjective, objective, assessment, plan}
      - source_links_dict: {turns: {id: ...}, documents: {id: ...}, generated_at: ...}
    """
    patient = getattr(visit, "patient", None)
    patient_name = getattr(patient, "name", "Patient") if patient else "Patient"
    patient_age = getattr(patient, "age", None) if patient else None
    language = getattr(patient, "language", "en") if patient else "en"

    # Build source links index for quick lookup
    source_links: Dict[str, Any] = {
        "turns": {},
        "documents": {},
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_turns": len(turns),
        "total_documents": len(documents),
    }

    for t in turns:
        source_links["turns"][str(t.id)] = {
            "id": t.id,
            "step": t.step,
            "question": t.question,
            "transcript": t.transcript,
            "language": t.language,
        }

    for doc in documents:
        source_links["documents"][str(doc.id)] = {
            "id": doc.id,
            "filename": doc.filename,
            "mime_type": doc.mime_type,
            "extracted": doc.extracted_json,
        }

    # Format turns text for prompt
    formatted_turns_list = []
    for t in turns:
        resp = t.transcript or "[No patient response recorded]"
        formatted_turns_list.append(
            f"- Turn ID {t.id} [Step: {t.step} | Lang: {t.language}]:\n"
            f"  Question: \"{t.question}\"\n"
            f"  Patient: \"{resp}\""
        )
    formatted_turns = "\n\n".join(formatted_turns_list) if formatted_turns_list else "No interview turns recorded."

    # Format documents text for prompt
    formatted_docs_list = []
    for doc in documents:
        doc_summary = json.dumps(doc.extracted_json or {}, indent=2)
        formatted_docs_list.append(
            f"- Document ID {doc.id} [Filename: {doc.filename}]:\n"
            f"  Extracted Data: {doc_summary}"
        )
    formatted_documents = "\n\n".join(formatted_docs_list) if formatted_docs_list else "No medical documents uploaded."

    # If Gemini API key is missing, use deterministic clinical fallback
    if not settings.GEMINI_API_KEY:
        logger.warning("GEMINI_API_KEY not set. Using clinical synthesis fallback for case draft.")
        fallback = _generate_fallback_soap(patient_name, patient_age, language, turns, documents)
        return fallback, source_links

    # Otherwise, invoke Gemini 2.0 Flash
    prompt = SOAP_PROMPT_TEMPLATE.format(
        patient_name=patient_name,
        patient_age=patient_age or "Not specified",
        language=language,
        formatted_turns=formatted_turns,
        formatted_documents=formatted_documents,
    )

    try:
        client = _get_client()

        cfg = types.GenerateContentConfig(
            temperature=0.2,
            max_output_tokens=3072,
            response_mime_type="application/json",
        )

        response = _generate_with_fallback(client, prompt, config=cfg)

        raw_text = (response.text or "").strip()
        # Clean potential markdown fences
        cleaned = re.sub(r"^```(?:json)?\s*", "", raw_text, flags=re.MULTILINE)
        cleaned = re.sub(r"\s*```$", "", cleaned, flags=re.MULTILINE).strip()
        parsed = json.loads(cleaned)

        # Basic structure validation
        for section in ("subjective", "objective", "assessment", "plan"):
            if section not in parsed or not isinstance(parsed[section], list):
                parsed[section] = []

        # Validate and normalize sources in each section
        valid_turn_ids = {t.id for t in turns}
        valid_doc_ids = {d.id for d in documents}
        first_turn_id = turns[0].id if turns else 1

        for section in ("subjective", "objective", "assessment", "plan"):
            clean_items = []
            for item in parsed[section]:
                if not isinstance(item, dict) or not item.get("fact"):
                    continue
                src = item.get("source")
                if not isinstance(src, dict):
                    src = {}
                    item["source"] = src

                # Normalize source type
                raw_type = str(src.get("type", "")).lower()
                if raw_type in ("doc", "document", "file"):
                    src["type"] = "document"
                else:
                    src["type"] = "turn"

                # Normalize and validate source ID
                try:
                    src_id = int(src.get("id"))
                except (ValueError, TypeError):
                    src_id = first_turn_id

                if src["type"] == "document" and src_id not in valid_doc_ids:
                    src["type"] = "turn"
                    src["id"] = first_turn_id
                elif src["type"] == "turn" and src_id not in valid_turn_ids:
                    src["id"] = first_turn_id
                else:
                    src["id"] = src_id

                if not src.get("label"):
                    src["label"] = "Transcript: Intake Turn" if src["type"] == "turn" else "Document: Attached Record"

                if not src.get("quote"):
                    src["quote"] = str(item.get("fact", ""))[:150]

                clean_items.append(item)
            parsed[section] = clean_items

        return parsed, source_links

    except Exception as e:
        logger.error("Gemini case draft generation error: %s. Falling back to clinical synthesis.", e, exc_info=True)
        fallback = _generate_fallback_soap(patient_name, patient_age, language, turns, documents)
        return fallback, source_links



