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
from app.services.red_flag_checker import evaluate_red_flags

logger = logging.getLogger(__name__)

DEFAULT_GEMINI_MODEL = "gemini-2.5-flash"
CANDIDATE_GEMINI_MODELS = [
    "gemini-2.5-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-flash-latest",
]

# ---------------------------------------------------------------------------
# Clinical script definition (base fixed order)
# ---------------------------------------------------------------------------
CLINICAL_STEPS = [
    "chief_complaint",
    "duration",
    "associated_symptoms",
    "past_history",
    "medications",
    "allergies",
]

# Adaptive steps that can be dynamically injected after "duration"
# based on symptoms detected in the chief_complaint response.
ADAPTIVE_STEPS = {"fever_details", "pain_details"}

# All steps the backend will accept (base + adaptive)
ALL_KNOWN_STEPS = set(CLINICAL_STEPS) | ADAPTIVE_STEPS

STEP_LABELS = {
    "chief_complaint":     {"en": "Chief Complaint",       "hi": "मुख्य शिकायत"},
    "duration":            {"en": "Duration",               "hi": "अवधि"},
    "fever_details":       {"en": "Fever Details",          "hi": "बुखार का विवरण"},
    "pain_details":        {"en": "Pain Details",           "hi": "दर्द का विवरण"},
    "associated_symptoms": {"en": "Associated Symptoms",   "hi": "संबंधित लक्षण"},
    "past_history":        {"en": "Past Medical History",  "hi": "पिछला चिकित्सा इतिहास"},
    "medications":         {"en": "Current Medications",   "hi": "वर्तमान दवाएं"},
    "allergies":           {"en": "Allergies",              "hi": "एलर्जी"},
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
    "fever_details": {
        "en": "Do you have any chills or shivering with the fever? Any night sweats?",
        "hi": "क्या बुखार के साथ ठंड या कंपकंपी भी लग रही है? क्या रात में पसीना आता है?",
    },
    "pain_details": {
        "en": "How severe is the pain on a scale of 1 to 10? Where exactly is the pain located?",
        "hi": "दर्द की तीव्रता 1 से 10 के पैमाने पर कितनी है? दर्द ठीक कहाँ हो रहा है?",
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
# 8-Section Case Draft Generation
# ---------------------------------------------------------------------------

SOAP_PROMPT_TEMPLATE = """You are a senior clinical documentation and pre-consultation triage specialist.
Synthesize the provided patient intake interview transcript and extracted medical documents for this visit into an accurate, highly specific, evidence-grounded 8-section clinical case draft for the attending physician.

CRITICAL DIRECTIVE:
The generated case draft must be strictly accurate to the actual patient data provided. Do NOT produce generic medical boilerplate or repetitive templates. Do NOT speculate or diagnose. Ground every single claim directly in the provided evidence.
If a section has no data, state that explicitly (e.g. "No known allergies reported", "No current medications reported or documented", "No previous laboratory or diagnostic investigations uploaded") rather than leaving it blank or fabricating content.

PATIENT INFORMATION:
- Name: {patient_name}
- Age: {patient_age}
- Language: {language}

INTAKE INTERVIEW TURNS (Verbatim conversation):
{formatted_turns}

EXTRACTED MEDICAL DOCUMENTS (OCR & clinical data):
{formatted_documents}

MANDATORY 8 CLINICAL SECTIONS & MAPPING RULES:

1. chief_complaint:
- Patient's primary reported concern(s) from the intake transcript.
- Verbatim or near-verbatim specifics intact. If none: "No primary chief complaint reported".

2. hpi (History of Present Illness):
- Duration, progression, onset, and associated symptoms from the transcript.
- If none: "No symptom duration or progression details reported".

3. medical_history:
- Past medical conditions, surgeries, and chronic illnesses mentioned.
- If none: "No significant past medical or surgical history reported".

4. medications:
- Current medications reported by the patient in the interview + any active prescription drugs extracted from uploaded documents.
- If none: "No current medications reported or documented".

5. allergies:
- Exact drug, food, or environmental allergies and reactions reported in the allergies intake step.
- If none: "No known allergies reported (NKDA)".

6. previous_investigations:
- Extracted laboratory test results, diagnostic reports, vitals, and measurements from uploaded medical documents.
- If none: "No previous laboratory or diagnostic investigations uploaded".

7. timeline:
- Chronological document timeline entries from uploaded prescriptions/reports.
- Each entry must include fact, date, title, category ("medication" | "diagnosis" | "measurement"), and source.
- If no documents uploaded: exactly one entry with fact "No prior medical documents on file for timeline generation".

8. red_flags:
- Any urgent red flags, severity indicators, or critical symptoms triggered during intake.
- If none: "No acute red-flag symptoms detected".

SOURCE LINKING RULES:
- Every item across all 8 sections MUST contain a "source" object linking to the exact turn_id (type: "turn") or document_id (type: "document").
- The label field MUST be strictly formatted as:
  "Transcript #<ID>"  (e.g., "Transcript #1")
  or
  "Document #<ID>"    (e.g., "Document #2")
- Example:
  {{
    "fact": "Severe throbbing headache and mild dizziness for 4 days",
    "source": {{
      "type": "turn",
      "id": 1,
      "label": "Transcript #1",
      "quote": "I have severe throbbing headache and mild dizziness for the past 4 days."
    }}
  }}

OUTPUT FORMAT:
Return ONLY a valid, parseable JSON object with these 8 keys + clinical_summary:
{{
  "clinical_summary": "A concise 2-3 sentence executive clinical summary citing the patient's reported symptoms, duration, and medical/allergy profile.",
  "chief_complaint": [
    {{ "fact": "...", "source": {{ "type": "turn", "id": 1, "label": "Transcript #1", "quote": "..." }} }}
  ],
  "hpi": [
    {{ "fact": "...", "source": {{ "type": "turn", "id": 2, "label": "Transcript #2", "quote": "..." }} }}
  ],
  "medical_history": [
    {{ "fact": "...", "source": {{ "type": "turn", "id": 4, "label": "Transcript #4", "quote": "..." }} }}
  ],
  "medications": [
    {{ "fact": "...", "source": {{ "type": "turn" or "document", "id": 5, "label": "Transcript #5" or "Document #1", "quote": "..." }} }}
  ],
  "allergies": [
    {{ "fact": "...", "source": {{ "type": "turn", "id": 6, "label": "Transcript #6", "quote": "..." }} }}
  ],
  "previous_investigations": [
    {{ "fact": "...", "source": {{ "type": "document", "id": 1, "label": "Document #1", "quote": "..." }} }}
  ],
  "timeline": [
    {{ "fact": "...", "date": "...", "title": "...", "category": "medication|diagnosis|measurement", "source": {{ "type": "document", "id": 1, "label": "Document #1", "quote": "..." }} }}
  ],
  "red_flags": [
    {{ "fact": "...", "severity": "urgent|normal", "department": "Emergency|General", "source": {{ "type": "turn", "id": 1, "label": "Transcript #1", "quote": "..." }} }}
  ]
}}
"""


def _generate_fallback_soap(
    patient_name: str,
    patient_age: Optional[int],
    language: str,
    turns: list,
    documents: list,
    visit: Any = None,
) -> Dict[str, Any]:
    """
    Deterministically synthesizes a grounded 8-section case draft from actual visit turns
    and documents when GEMINI_API_KEY is not configured or in fallback scenarios.
    Ensures every section has an explicit no-data statement if absent and source-linked tags.
    """
    turn_by_step = {t.step: t for t in turns}
    primary_turn_id = turns[0].id if turns else 1
    primary_doc_id = documents[0].id if documents else None

    # 1. Chief Complaint
    cc_t = turn_by_step.get("chief_complaint")
    chief_complaint_items = []
    if cc_t and cc_t.transcript and cc_t.transcript.strip() and cc_t.transcript.strip() != "[inaudible]":
        cc_text = cc_t.transcript.strip()
        chief_complaint_items.append({
            "fact": cc_text,
            "category": "Chief Complaint",
            "source": {
                "type": "turn",
                "id": cc_t.id,
                "label": f"Transcript #{cc_t.id}",
                "quote": cc_text[:200],
            },
        })
    else:
        chief_complaint_items.append({
            "fact": "No primary chief complaint reported",
            "category": "Chief Complaint",
            "source": {
                "type": "turn",
                "id": primary_turn_id,
                "label": f"Transcript #{primary_turn_id}",
                "quote": "No chief complaint recorded in intake interview.",
            },
        })

    # 2. HPI (History of Present Illness)
    dur_t = turn_by_step.get("duration")
    assoc_t = turn_by_step.get("associated_symptoms")
    hpi_items = []
    if dur_t and dur_t.transcript and dur_t.transcript.strip() and dur_t.transcript.strip() != "[inaudible]":
        dur_text = dur_t.transcript.strip()
        hpi_items.append({
            "fact": f"Duration and onset: {dur_text}",
            "category": "Duration & Onset",
            "source": {
                "type": "turn",
                "id": dur_t.id,
                "label": f"Transcript #{dur_t.id}",
                "quote": dur_text[:200],
            },
        })
    if assoc_t and assoc_t.transcript and assoc_t.transcript.strip() and assoc_t.transcript.strip() != "[inaudible]":
        assoc_text = assoc_t.transcript.strip()
        hpi_items.append({
            "fact": f"Associated symptoms: {assoc_text}",
            "category": "Associated Symptoms",
            "source": {
                "type": "turn",
                "id": assoc_t.id,
                "label": f"Transcript #{assoc_t.id}",
                "quote": assoc_text[:200],
            },
        })
    if not hpi_items:
        hpi_items.append({
            "fact": "No symptom duration or progression details reported",
            "category": "HPI",
            "source": {
                "type": "turn",
                "id": primary_turn_id,
                "label": f"Transcript #{primary_turn_id}",
                "quote": "No HPI information recorded in intake.",
            },
        })

    # 3. Medical History
    ph_t = turn_by_step.get("past_history")
    medical_history_items = []
    if ph_t and ph_t.transcript and ph_t.transcript.strip() and ph_t.transcript.strip() != "[inaudible]":
        ph_text = ph_t.transcript.strip()
        is_neg = any(neg in ph_text.lower() for neg in ["no ", "none", "nothing", "नहीं", "कोई नहीं"])
        if is_neg:
            medical_history_items.append({
                "fact": "No significant past medical or surgical history reported",
                "category": "Medical History",
                "source": {
                    "type": "turn",
                    "id": ph_t.id,
                    "label": f"Transcript #{ph_t.id}",
                    "quote": ph_text[:200],
                },
            })
        else:
            medical_history_items.append({
                "fact": ph_text,
                "category": "Past Medical History",
                "source": {
                    "type": "turn",
                    "id": ph_t.id,
                    "label": f"Transcript #{ph_t.id}",
                    "quote": ph_text[:200],
                },
            })
    else:
        medical_history_items.append({
            "fact": "No significant past medical or surgical history reported",
            "category": "Medical History",
            "source": {
                "type": "turn",
                "id": primary_turn_id,
                "label": f"Transcript #{primary_turn_id}",
                "quote": "No past medical history recorded in intake.",
            },
        })

    # 4. Medications
    med_t = turn_by_step.get("medications")
    medications_items = []
    if med_t and med_t.transcript and med_t.transcript.strip() and med_t.transcript.strip() != "[inaudible]":
        med_text = med_t.transcript.strip()
        is_neg_med = any(neg in med_text.lower() for neg in ["no ", "none", "not taking", "नहीं", "कोई दवा नहीं"])
        if not is_neg_med:
            medications_items.append({
                "fact": f"Patient reported: {med_text}",
                "category": "Patient-Reported Medications",
                "source": {
                    "type": "turn",
                    "id": med_t.id,
                    "label": f"Transcript #{med_t.id}",
                    "quote": med_text[:200],
                },
            })
    # Also extract medications from documents
    for doc in documents:
        raw_json = doc.extracted_json or {}
        for drug in raw_json.get("drug_names", []):
            if isinstance(drug, dict):
                d_name = drug.get("name", "Medication")
                d_dose = drug.get("dosage") or ""
                d_freq = drug.get("frequency") or ""
                desc = f"Documented prescription: {d_name} {d_dose} ({d_freq})".strip()
            else:
                desc = f"Documented prescription: {drug}"
            medications_items.append({
                "fact": desc,
                "category": "Documented Prescriptions",
                "source": {
                    "type": "document",
                    "id": doc.id,
                    "label": f"Document #{doc.id}",
                    "quote": desc[:150],
                },
            })
    if not medications_items:
        medications_items.append({
            "fact": "No current medications reported or documented",
            "category": "Medications",
            "source": {
                "type": "turn",
                "id": med_t.id if med_t else primary_turn_id,
                "label": f"Transcript #{med_t.id if med_t else primary_turn_id}",
                "quote": "No active medications recorded.",
            },
        })

    # 5. Allergies
    all_t = turn_by_step.get("allergies")
    allergies_items = []
    if all_t and all_t.transcript and all_t.transcript.strip() and all_t.transcript.strip() != "[inaudible]":
        all_text = all_t.transcript.strip()
        is_neg_all = any(neg in all_text.lower() for neg in ["no known", "none", "nkda", "नहीं", "कोई नहीं"])
        if is_neg_all:
            allergies_items.append({
                "fact": "No known allergies reported (NKDA)",
                "category": "Allergies",
                "source": {
                    "type": "turn",
                    "id": all_t.id,
                    "label": f"Transcript #{all_t.id}",
                    "quote": all_text[:200],
                },
            })
        else:
            allergies_items.append({
                "fact": all_text,
                "category": "Known Allergies",
                "source": {
                    "type": "turn",
                    "id": all_t.id,
                    "label": f"Transcript #{all_t.id}",
                    "quote": all_text[:200],
                },
            })
    else:
        allergies_items.append({
            "fact": "No known allergies reported (NKDA)",
            "category": "Allergies",
            "source": {
                "type": "turn",
                "id": primary_turn_id,
                "label": f"Transcript #{primary_turn_id}",
                "quote": "No allergies recorded in intake.",
            },
        })

    # 6. Previous Investigations
    investigation_items = []
    for doc in documents:
        lbl = getattr(doc, "label", None) or getattr(doc, "filename", "Document")
        doc_entry = {
            "fact": f"Uploaded medical document on file: {lbl} ({doc.filename}) — available in Patient Records panel for direct review.",
            "category": "Prior Medical Records",
            "source": {
                "type": "document",
                "id": doc.id,
                "label": f"Document #{doc.id}",
                "quote": f"{doc.filename}: {lbl}",
            },
        }
        investigation_items.append(doc_entry)
        raw_json = getattr(doc, "extracted_json", None) or {}
        for m in raw_json.get("measurements", []):
            raw_m = m.get("raw") if isinstance(m, dict) else str(m)
            m_type = m.get("type", "Investigation") if isinstance(m, dict) else "Measurement"
            investigation_items.append({
                "fact": f"Recorded {m_type}: {raw_m}",
                "category": "Vital Signs & Lab Values",
                "source": {
                    "type": "document",
                    "id": doc.id,
                    "label": f"Document #{doc.id}",
                    "quote": raw_m[:100],
                },
            })
        for diag in raw_json.get("diagnoses", []):
            investigation_items.append({
                "fact": f"Documented prior clinical finding: {diag}",
                "category": "Prior Diagnostic Records",
                "source": {
                    "type": "document",
                    "id": doc.id,
                    "label": f"Document #{doc.id}",
                    "quote": str(diag)[:100],
                },
            })
    if not investigation_items:
        investigation_items.append({
            "fact": "No previous laboratory or diagnostic investigations uploaded",
            "category": "Previous Investigations",
            "source": {
                "type": "turn",
                "id": primary_turn_id,
                "label": f"Transcript #{primary_turn_id}",
                "quote": "No medical documents or lab reports uploaded for this visit.",
            },
        })

    # 7. Timeline
    timeline_items = []
    for doc in documents:
        raw_json = doc.extracted_json or {}
        doc_dates = raw_json.get("dates", [])
        date_str = "Recent"
        if doc_dates and isinstance(doc_dates, list):
            first_d = doc_dates[0]
            date_str = first_d.get("value") if isinstance(first_d, dict) else str(first_d)

        # Medication timeline entry
        for drug in raw_json.get("drug_names", []):
            name = drug.get("name") if isinstance(drug, dict) else str(drug)
            timeline_items.append({
                "fact": f"Prescribed: {name} (Doc: {doc.filename})",
                "date": date_str,
                "title": f"Prescription: {name}",
                "category": "medication",
                "details": f"Prescription record from {doc.filename}",
                "source": {
                    "type": "document",
                    "id": doc.id,
                    "label": f"Document #{doc.id}",
                    "quote": f"{name} on {date_str}",
                },
            })
        # Measurement timeline entry
        for m in raw_json.get("measurements", []):
            raw_m = m.get("raw") if isinstance(m, dict) else str(m)
            timeline_items.append({
                "fact": f"Lab/Vital: {raw_m}",
                "date": date_str,
                "title": f"Investigation: {raw_m}",
                "category": "measurement",
                "details": f"Recorded in {doc.filename}",
                "source": {
                    "type": "document",
                    "id": doc.id,
                    "label": f"Document #{doc.id}",
                    "quote": raw_m[:100],
                },
            })
    if not timeline_items:
        timeline_items.append({
            "fact": "No timeline events available from medical documents",
            "date": "N/A",
            "title": "No uploaded records",
            "category": "document",
            "details": "No prior medical documents on file for timeline generation",
            "source": {
                "type": "turn",
                "id": primary_turn_id,
                "label": f"Transcript #{primary_turn_id}",
                "quote": "No documents uploaded.",
            },
        })

    # 8. Red Flags
    red_flag_items = []
    transcripts_list = [getattr(t, "transcript", "") or "" for t in turns]
    red_flag_result = evaluate_red_flags(transcripts_list)
    is_urgent_visit = getattr(visit, "urgency_flag", False) or (red_flag_result and red_flag_result.is_urgent)
    if is_urgent_visit:
        reason = getattr(visit, "urgency_reason", None) or (red_flag_result.reason if red_flag_result else "Urgent symptom combination detected")
        dept = getattr(visit, "department", None) or (red_flag_result.department if red_flag_result else "Emergency")
        red_flag_items.append({
            "fact": f"Urgent alert: {reason}. Recommended department: {dept}.",
            "category": "Urgent Triage Alert",
            "severity": "urgent",
            "department": dept,
            "source": {
                "type": "turn",
                "id": primary_turn_id,
                "label": f"Transcript #{primary_turn_id}",
                "quote": reason[:150],
            },
        })
    else:
        red_flag_items.append({
            "fact": "No acute red-flag symptoms detected",
            "category": "Clinical Safety Profile",
            "severity": "normal",
            "source": {
                "type": "turn",
                "id": primary_turn_id,
                "label": f"Transcript #{primary_turn_id}",
                "quote": "Standard triage review: no red flags triggered.",
            },
        })

    # Clinical Summary
    cc_summary = chief_complaint_items[0]["fact"] if chief_complaint_items else "unspecified symptoms"
    summary = (
        f"Pre-consultation clinical case draft for {patient_name} (Age: {patient_age or 'Not specified'}, Lang: {language.upper()}). "
        f"Chief complaint: {cc_summary}. "
        f"Allergies: {allergies_items[0]['fact'] if allergies_items else 'None reported'}; "
        f"Medications: {medications_items[0]['fact'] if medications_items else 'None reported'}; "
        f"Past history: {medical_history_items[0]['fact'] if medical_history_items else 'None reported'}. "
        f"{len(documents)} medical documents on file."
    )

    # Backward-compatible SOAP mappings for any legacy consumer
    subjective_compat = chief_complaint_items + hpi_items + medical_history_items + allergies_items
    objective_compat = investigation_items + [m for m in medications_items if m.get("source", {}).get("type") == "document"]
    assessment_compat = [{
        "fact": f"Clinical profile: {cc_summary}. Red flags: {red_flag_items[0]['fact']}.",
        "category": "Assessment Summary",
        "source": chief_complaint_items[0]["source"],
    }]
    plan_compat = [{
        "fact": f"Attending physician to conduct focused examination regarding {cc_summary}.",
        "category": "Clinical Next Step",
        "source": chief_complaint_items[0]["source"],
    }]

    return {
        "clinical_summary": summary,
        "chief_complaint": chief_complaint_items,
        "hpi": hpi_items,
        "medical_history": medical_history_items,
        "medications": medications_items,
        "allergies": allergies_items,
        "previous_investigations": investigation_items,
        "timeline": timeline_items,
        "red_flags": red_flag_items,
        # Backward compatibility keys:
        "subjective": subjective_compat,
        "objective": objective_compat,
        "assessment": assessment_compat,
        "plan": plan_compat,
    }


def generate_soap_case_draft(
    visit: Any,
    turns: list,
    documents: list,
) -> tuple[Dict[str, Any], Dict[str, Any]]:
    """
    Generates a structured 8-section case draft for a visit using Gemini 2.0 Flash.
    Returns:
      (content_dict, source_links_dict)
    where content_dict contains the 8 requested keys:
      1. chief_complaint
      2. hpi
      3. medical_history
      4. medications
      5. allergies
      6. previous_investigations
      7. timeline
      8. red_flags
      (plus clinical_summary and backward-compatible SOAP keys)
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
        logger.warning("GEMINI_API_KEY not set. Using clinical synthesis fallback for 8-section case draft.")
        fallback = _generate_fallback_soap(patient_name, patient_age, language, turns, documents, visit=visit)
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
            max_output_tokens=4096,
            response_mime_type="application/json",
        )

        response = _generate_with_fallback(client, prompt, config=cfg)

        raw_text = (response.text or "").strip()
        cleaned = re.sub(r"^```(?:json)?\s*", "", raw_text, flags=re.MULTILINE)
        cleaned = re.sub(r"\s*```$", "", cleaned, flags=re.MULTILINE).strip()
        parsed = json.loads(cleaned)

        EIGHT_KEYS = [
            "chief_complaint",
            "hpi",
            "medical_history",
            "medications",
            "allergies",
            "previous_investigations",
            "timeline",
            "red_flags",
        ]

        # Ensure all 8 keys exist as lists
        fallback_content = _generate_fallback_soap(patient_name, patient_age, language, turns, documents, visit=visit)

        for key in EIGHT_KEYS:
            if key not in parsed or not isinstance(parsed[key], list) or len(parsed[key]) == 0:
                parsed[key] = fallback_content.get(key, [])

        # Validate and normalize sources in each section
        valid_turn_ids = {t.id for t in turns}
        valid_doc_ids = {d.id for d in documents}
        first_turn_id = turns[0].id if turns else 1

        for section in EIGHT_KEYS:
            clean_items = []
            for item in parsed[section]:
                if not isinstance(item, dict):
                    continue
                if not item.get("fact") and not item.get("title"):
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

                # Enforce clean label format: "Transcript #<ID>" or "Document #<ID>"
                if src["type"] == "document":
                    src["label"] = f"Document #{src['id']}"
                else:
                    src["label"] = f"Transcript #{src['id']}"

                if not src.get("quote"):
                    src["quote"] = str(item.get("fact") or item.get("title") or "")[:150]

                clean_items.append(item)

            # If clean items is empty, take from fallback
            parsed[section] = clean_items if clean_items else fallback_content.get(section, [])

        # Populate backward-compatible keys
        parsed["clinical_summary"] = parsed.get("clinical_summary") or fallback_content.get("clinical_summary")
        parsed["subjective"] = parsed.get("chief_complaint", []) + parsed.get("hpi", []) + parsed.get("medical_history", []) + parsed.get("allergies", [])
        parsed["objective"] = parsed.get("previous_investigations", []) + [m for m in parsed.get("medications", []) if m.get("source", {}).get("type") == "document"]
        parsed["assessment"] = fallback_content.get("assessment", [])
        parsed["plan"] = fallback_content.get("plan", [])

        return parsed, source_links

    except Exception as e:
        logger.error("Gemini case draft generation error: %s. Falling back to clinical synthesis.", e, exc_info=True)
        fallback = _generate_fallback_soap(patient_name, patient_age, language, turns, documents, visit=visit)
        return fallback, source_links



