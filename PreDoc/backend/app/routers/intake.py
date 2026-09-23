import logging
import uuid
from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.patient import Patient
from app.models.visit import Visit
from app.models.intake_turn import IntakeTurn
from app.schemas.intake import (
    ConsentUpdateRequest,
    StartIntakeRequest,
    StartIntakeResponse,
    IntakeRespondResponse,
    IntakeTurnsResponse,
    IntakeTurnRead,
    UpdatePatientRequest,
    ParseDemographicsResponse,
    EvaluateEmergencyRequest,
    EvaluateEmergencyResponse,
)
from app.services.gemini import (
    CLINICAL_STEPS,
    ALL_KNOWN_STEPS,
    STEP_QUESTIONS,
    detect_language,
    get_next_question,
    get_next_step,
    transcribe_audio,
    parse_demographics_from_text,
    evaluate_emergency_triage,
)
from app.services.red_flag_checker import evaluate_red_flags
from app.services.auth import (
    generate_patient_code,
    generate_pin,
    hash_pin,
    verify_pin,
    create_patient_token,
    get_current_actor,
    verify_visit_access,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/intake", tags=["Intake"])

# Mapping of clinical steps to frontend input interaction type
STEP_INPUT_TYPES = {
    "chief_complaint": "options",
    "duration": "options",
    "fever_details": "options",   # adaptive step
    "pain_details": "options",    # adaptive step
    "associated_symptoms": "options",
    "past_history": "yesno",
    "medications": "yesno",
    "allergies": "text",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
_FEVER_KEYWORDS = {
    "fever", "temperature", "bukhar", "pyrexia", "febrile",
    "\u092c\u0941\u0916\u093e\u0930",  # बुखार
    "\u0924\u093e\u092a",              # ताप
    "\u092c\u0941\u0916\u093e",        # बुखा (partial)
}
_PAIN_KEYWORDS = {
    "pain", "ache", "aching", "hurt", "hurts", "sore", "cramp",
    "dard", "\u0926\u0930\u094d\u0926",   # दर्द
    "\u092a\u0940\u095c\u093e",           # पीड़ा
    "\u0926\u0947\u0916",                 # partial
}


def _detect_adaptive_symptoms(transcript: str) -> list[str]:
    """
    Scan a chief_complaint transcript for fever/pain keywords.
    Returns a list of adaptive step IDs to inject, e.g. ["fever_details", "pain_details"].
    """
    lower = transcript.lower()
    result = []
    if any(kw in lower for kw in _FEVER_KEYWORDS):
        result.append("fever_details")
    if any(kw in lower for kw in _PAIN_KEYWORDS):
        result.append("pain_details")
    return result


# ---------------------------------------------------------------------------
# POST /api/intake/start
# ---------------------------------------------------------------------------
@router.post("/start", response_model=StartIntakeResponse)
def start_intake(body: StartIntakeRequest, db: Session = Depends(get_db)):
    """
    Begin a guided patient intake session.
    - New patient: generates unique PD-XXXXXX code + 4-digit PIN, stores bcrypt hash,
      issues patient JWT, returns code and plaintext PIN once for display.
    - Returning patient: validates patient_code + PIN, reuses existing patient record,
      issues fresh patient JWT.
    """
    logger.info(
        "[Intake Router] Received /api/intake/start: patient_name='%s', patient_code='%s', is_returning=%s",
        body.patient_name,
        body.patient_code,
        bool(body.patient_code and body.pin),
    )
    try:
        is_returning = False
        raw_pin = None

        if body.patient_code and body.pin:
            # Returning patient validation
            code = body.patient_code.strip().upper()
            pin = body.pin.strip()
            patient = db.query(Patient).filter(Patient.patient_code == code).first()
            if not patient or not patient.pin_hash or not verify_pin(pin, patient.pin_hash):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Incorrect Patient ID or PIN. Please try again.",
                )
            if body.patient_name and body.patient_name.strip():
                patient.name = body.patient_name.strip()
            if body.patient_age is not None:
                patient.age = body.patient_age
            if body.language:
                patient.language = body.language
            is_returning = True
            logger.info("[Intake Router] Returning patient authenticated: %s (id=%d)", patient.patient_code, patient.id)
        else:
            # New patient: generate unique PD-XXXXXX code and random 4-digit PIN
            for _ in range(10):
                code_candidate = generate_patient_code()
                if not db.query(Patient).filter(Patient.patient_code == code_candidate).first():
                    break
            else:
                code_candidate = generate_patient_code()

            raw_pin = generate_pin()
            pin_hash = hash_pin(raw_pin)
            patient = Patient(
                name=body.patient_name or "Patient",
                age=body.patient_age,
                language=body.language,
                patient_code=code_candidate,
                pin_hash=pin_hash,
            )
            db.add(patient)
            db.flush()  # get patient.id
            logger.info("[Intake Router] Created new patient: %s (id=%d)", patient.patient_code, patient.id)

        # Issue patient session token (JWT)
        patient_token = create_patient_token(patient)

        # Create visit with consent and unique session token
        c_time = body.consent_timestamp or (datetime.now(timezone.utc) if body.consent_given else None)
        v_token = str(uuid.uuid4())
        visit = Visit(
            patient_id=patient.id,
            status="intake_in_progress",
            urgency_flag=False,
            consent_given=body.consent_given,
            consent_timestamp=c_time,
            visit_token=v_token,
        )
        db.add(visit)
        db.flush()  # get visit.id

        first_step = CLINICAL_STEPS[0]
        first_question = get_next_question(
            step=first_step,
            language=body.language,
            patient_response="",
            previous_question="",
        )

        # Store first question turn (no transcript yet — will be filled on respond)
        turn = IntakeTurn(
            visit_id=visit.id,
            step=first_step,
            question=first_question,
            transcript=None,
            language=body.language,
        )
        db.add(turn)
        db.commit()

        logger.info(
            "[Intake Router] Started intake: patient_id=%d, code=%s, visit_id=%d, is_returning=%s",
            patient.id,
            patient.patient_code,
            visit.id,
            is_returning,
        )

        return StartIntakeResponse(
            visit_id=visit.id,
            visit_token=visit.visit_token,
            patient_id=patient.id,
            patient_code=patient.patient_code,
            pin=raw_pin if not is_returning else None,
            is_returning=is_returning,
            patient_token=patient_token,
            language=body.language,
            first_step=first_step,
            first_question=first_question,
            steps=CLINICAL_STEPS,
            message="Intake session started successfully.",
            input_type=STEP_INPUT_TYPES.get(first_step, "options"),
            step_input_types=STEP_INPUT_TYPES,
            consent_given=visit.consent_given,
            consent_timestamp=visit.consent_timestamp,
        )
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error("[Intake Router] Failed to start intake session: %s", e, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to start intake session: {str(e)}"
        )


# ---------------------------------------------------------------------------
# POST /api/intake/consent/{visit_id}
# ---------------------------------------------------------------------------
@router.post("/consent/{visit_id}")
def update_visit_consent(
    visit_id: int,
    body: ConsentUpdateRequest,
    db: Session = Depends(get_db),
    actor: Optional[dict] = Depends(get_current_actor),
):
    """Update consent status and timestamp for a specific visit."""
    visit = db.query(Visit).filter(Visit.id == visit_id).first()
    if not visit:
        raise HTTPException(status_code=404, detail=f"Visit {visit_id} not found")
    verify_visit_access(visit, actor)
    visit.consent_given = body.consent_given
    visit.consent_timestamp = body.consent_timestamp or datetime.now(timezone.utc)
    db.commit()
    return {
        "visit_id": visit.id,
        "consent_given": visit.consent_given,
        "consent_timestamp": visit.consent_timestamp.isoformat() if visit.consent_timestamp else None,
        "message": "Consent recorded successfully",
    }


# ---------------------------------------------------------------------------
# PATCH /api/intake/patient/{visit_id}
# ---------------------------------------------------------------------------
@router.patch("/patient/{visit_id}")
def update_patient_demographics(
    visit_id: int,
    body: UpdatePatientRequest,
    db: Session = Depends(get_db),
    actor: Optional[dict] = Depends(get_current_actor),
):
    """
    Save or update captured patient demographics (name, age, language) for a visit.
    Updates the database Patient record so all screens (Header, Doctor Dashboard, Case Review) reflect the change.
    """
    visit = db.query(Visit).filter(Visit.id == visit_id).first()
    if not visit:
        raise HTTPException(status_code=404, detail=f"Visit {visit_id} not found")
    verify_visit_access(visit, actor)

    patient = visit.patient
    if not patient:
        raise HTTPException(status_code=404, detail=f"Patient for visit {visit_id} not found")

    if body.name is not None and body.name.strip():
        patient.name = body.name.strip()
    if body.age is not None:
        patient.age = body.age
    if body.language is not None and body.language.strip():
        patient.language = body.language.strip()

    db.commit()
    db.refresh(patient)

    return {
        "visit_id": visit_id,
        "patient_id": patient.id,
        "name": patient.name,
        "age": patient.age,
        "language": patient.language,
    }


# ---------------------------------------------------------------------------
# POST /api/intake/parse-demographics
# ---------------------------------------------------------------------------
@router.post("/parse-demographics", response_model=ParseDemographicsResponse)
async def parse_demographics_endpoint(
    audio: Optional[UploadFile] = File(None),
    transcript_text: Optional[str] = Form(None),
    client_transcript: Optional[str] = Form(None),
    language: str = Form("en"),
):
    """
    Parse patient name and age from spoken voice or text in intro step.
    Checks for inaudible/unintelligible audio before parsing.
    """
    if transcript_text is not None:
        transcript = transcript_text.strip()
    elif audio is not None:
        audio_bytes = await audio.read()
        mime_type = audio.content_type or "audio/webm"
        try:
            transcript = transcribe_audio(audio_bytes, mime_type, fallback_text=client_transcript)
        except Exception as e:
            logger.error("Audio transcription error in parse-demographics: %s", e)
            transcript = (client_transcript or "").strip() or "[inaudible]"
    elif client_transcript:
        transcript = client_transcript.strip()
    else:
        raise HTTPException(status_code=422, detail="Audio or transcript must be provided.")

    is_inaudible = (
        not transcript
        or transcript.strip().lower() in ["[inaudible]", "[no response]", ""]
        or len(transcript.strip()) < 2
    )

    if is_inaudible:
        return ParseDemographicsResponse(
            name=None,
            age=None,
            raw_transcript=transcript or "[inaudible]",
            is_inaudible=True,
        )

    name, age = parse_demographics_from_text(transcript, language=language)
    if not name:
        name = "आगंतुक मरीज" if language == "hi" else "Patient"
    if age is None:
        age = 35

    return ParseDemographicsResponse(
        name=name,
        age=age,
        raw_transcript=transcript,
        is_inaudible=False,
    )


# ---------------------------------------------------------------------------
# POST /api/intake/respond (and alias /api/intake/turn)
# ---------------------------------------------------------------------------
@router.post("/respond", response_model=IntakeRespondResponse)
@router.post("/turn", response_model=IntakeRespondResponse, include_in_schema=False)
async def respond_intake(
    visit_id: int = Form(...),
    step: str = Form(...),
    language: str = Form("en"),
    next_step_hint: Optional[str] = Form(None),  # frontend tells backend what the next step is
    audio: Optional[UploadFile] = File(None),
    transcript_text: Optional[str] = Form(None),
    client_transcript: Optional[str] = Form(None),
    transcript: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    actor: Optional[dict] = Depends(get_current_actor),
):
    """
    Accept either a voice recording (audio) or pre-built transcript text (tap mode).
    Both modes write to the same intake_turns table — backend is mode-agnostic.
    Immediately runs real-time red-flag checker across accumulated transcripts.
    Checks for inaudible/unintelligible voice input and re-prompts without advancing.
    """
    # Map transcript alias if transcript_text is not provided
    if transcript_text is None and transcript is not None:
        transcript_text = transcript

    # Validate step — accepts both base and adaptive steps
    if step not in ALL_KNOWN_STEPS:
        raise HTTPException(status_code=422, detail=f"Unknown step: '{step}'. Accepted steps: {sorted(ALL_KNOWN_STEPS)}")

    lang: Literal["en", "hi"] = "hi" if language == "hi" else "en"

    # Validate visit exists
    visit = db.query(Visit).filter(Visit.id == visit_id).first()
    if not visit:
        raise HTTPException(status_code=404, detail=f"Visit {visit_id} not found")
    verify_visit_access(visit, actor)

    # --- Transcription ---
    if transcript_text is not None:
        transcript = transcript_text.strip() or "[no response]"
    elif audio is not None:
        audio_bytes = await audio.read()
        mime_type = audio.content_type or "audio/webm"
        try:
            transcript = transcribe_audio(audio_bytes, mime_type, fallback_text=client_transcript)
        except Exception as e:
            logger.error("Transcription error, using client fallback: %s", e)
            transcript = (client_transcript or "").strip() or "[inaudible]"
    elif client_transcript:
        transcript = client_transcript.strip()
    else:
        raise HTTPException(status_code=422, detail="Either 'audio', 'transcript_text', or 'client_transcript' must be provided.")

    # Determine effective language efficiently
    if any("\u0900" <= ch <= "\u097f" for ch in transcript) or lang == "hi":
        effective_lang: Literal["en", "hi"] = "hi"
    elif lang == "en":
        effective_lang: Literal["en", "hi"] = "en"
    else:
        effective_lang: Literal["en", "hi"] = detect_language(transcript)

    # Find the pending turn for this step (created by /start or previous respond)
    current_turn = (
        db.query(IntakeTurn)
        .filter(
            IntakeTurn.visit_id == visit_id,
            IntakeTurn.step == step,
            IntakeTurn.transcript == None,  # noqa: E711
        )
        .order_by(IntakeTurn.id.desc())
        .first()
    )

    current_question = current_turn.question if current_turn else STEP_QUESTIONS.get(step, {}).get(effective_lang, "")

    # Determine input type for current and next steps
    current_input_type = STEP_INPUT_TYPES.get(step, "text")

    # Inaudible input check: do NOT save blank transcript, do NOT advance turn
    is_inaudible = (
        transcript.strip().lower() in ["[inaudible]", "[no response]", ""]
        or len(transcript.strip()) < 2
    )
    if is_inaudible:
        logger.info("Inaudible voice input detected for Visit %d, Step %s. Re-prompting without advancing.", visit_id, step)
        return IntakeRespondResponse(
            visit_id=visit_id,
            step=step,
            question=current_question,
            transcript="[inaudible]",
            language=effective_lang,
            next_step=step,
            next_question=current_question,
            is_complete=False,
            turn_id=current_turn.id if current_turn else 0,
            urgency_flag=visit.urgency_flag,
            department=visit.department,
            urgency_reason=visit.urgency_reason,
            is_inaudible=True,
            input_type=current_input_type,
            next_input_type=current_input_type,
        )

    if current_turn:
        current_turn.transcript = transcript
        current_turn.language = effective_lang
        current_question = current_turn.question
    else:
        # Edge case: turn was already filled — create a supplemental one
        current_question = STEP_QUESTIONS.get(step, {}).get(effective_lang, "")
        new_turn = IntakeTurn(
            visit_id=visit_id,
            step=step,
            question=current_question,
            transcript=transcript,
            language=effective_lang,
        )
        db.add(new_turn)
        db.flush()
        current_turn = new_turn

    # --- Detect adaptive symptoms (voice mode, chief_complaint only) ---
    suggested_adaptive_steps: list[str] = []
    if step == "chief_complaint":
        suggested_adaptive_steps = _detect_adaptive_symptoms(transcript)
        if suggested_adaptive_steps:
            logger.info(
                "[Adaptive] Detected symptoms in voice transcript for Visit %d: %s",
                visit_id, suggested_adaptive_steps,
            )

    # --- Determine next step ---
    # If the frontend provided a next_step_hint (e.g. an adaptive step was injected),
    # trust that. Otherwise fall back to the default linear get_next_step().
    if next_step_hint and next_step_hint in ALL_KNOWN_STEPS:
        next_step: Optional[str] = next_step_hint
    else:
        next_step = get_next_step(step)

    is_complete = next_step is None

    next_question: Optional[str] = None
    if not is_complete and next_step:
        next_question = get_next_question(
            step=next_step,
            language=effective_lang,
            patient_response=transcript,
            previous_question=current_question,
        )
        # Pre-create the next turn record (question asked, awaiting response)
        # Skip if a pending turn for this step already exists (idempotent)
        existing_next = (
            db.query(IntakeTurn)
            .filter(
                IntakeTurn.visit_id == visit_id,
                IntakeTurn.step == next_step,
                IntakeTurn.transcript == None,  # noqa: E711
            )
            .first()
        )
        if not existing_next:
            next_turn_record = IntakeTurn(
                visit_id=visit_id,
                step=next_step,
                question=next_question,
                transcript=None,
                language=effective_lang,
            )
            db.add(next_turn_record)

    if is_complete:
        visit.status = "intake_complete"

    # --- Real-Time Red-Flag & Emergency Triage Evaluation ---
    all_turns = (
        db.query(IntakeTurn)
        .filter(IntakeTurn.visit_id == visit_id)
        .all()
    )
    all_transcripts = [t.transcript for t in all_turns if t.transcript]
    if transcript not in all_transcripts:
        all_transcripts.append(transcript)

    combined_intake_text = " ".join(all_transcripts)
    emergency_triage_result = evaluate_emergency_triage(text=combined_intake_text)

    red_flag_result = evaluate_red_flags(all_transcripts)
    if red_flag_result.is_urgent or emergency_triage_result.get("is_emergency"):
        visit.urgency_flag = True
        dept = emergency_triage_result.get("recommended_department") or red_flag_result.department
        if dept:
            visit.department = dept
        reason = emergency_triage_result.get("clinical_rationale") or red_flag_result.reason
        if reason:
            visit.urgency_reason = reason
        logger.warning(
            "RED FLAG / EMERGENCY TRIGGERED for Visit %d: Dept=%s, Reason=%s, Triggers=%s",
            visit.id,
            visit.department,
            visit.urgency_reason,
            emergency_triage_result.get("detected_red_flags") or red_flag_result.matched_triggers,
        )

    db.commit()
    db.refresh(current_turn)
    db.refresh(visit)

    next_input_type = STEP_INPUT_TYPES.get(next_step, "text") if next_step else None

    return IntakeRespondResponse(
        visit_id=visit_id,
        step=step,
        question=current_question,
        transcript=transcript,
        language=effective_lang,
        next_step=next_step,
        next_question=next_question,
        is_complete=is_complete,
        turn_id=current_turn.id,
        urgency_flag=visit.urgency_flag,
        department=visit.department,
        urgency_reason=visit.urgency_reason,
        matched_triggers=emergency_triage_result.get("detected_red_flags") or red_flag_result.matched_triggers if (red_flag_result.is_urgent or emergency_triage_result.get("is_emergency")) else None,
        input_type=current_input_type,
        next_input_type=next_input_type,
        suggested_adaptive_steps=suggested_adaptive_steps or None,
        emergency_triage=emergency_triage_result,
    )


# ---------------------------------------------------------------------------
# POST /api/intake/evaluate-emergency
# ---------------------------------------------------------------------------
@router.post("/evaluate-emergency", response_model=EvaluateEmergencyResponse)
def evaluate_patient_emergency(
    body: EvaluateEmergencyRequest,
    db: Session = Depends(get_db),
    actor: Optional[dict] = Depends(get_current_actor),
):
    """
    On-demand endpoint to evaluate any entered condition or symptoms using the
    PreDoc Emergency Medicine Clinical Triage AI.
    If visit_id is provided, automatically updates visit urgency if emergency is flagged.
    """
    result = evaluate_emergency_triage(text=body.text)
    
    # If emergency detected and patient/visit is provided, reflect immediately in Triage Queue
    if result.get("is_emergency") or result.get("triage_level") == "CRITICAL":
        alert_reason = f"Patient Emergency Alert: {', '.join(result.get('detected_red_flags', [])) or result.get('clinical_rationale')}"
        rec_dept = result.get("recommended_department", "Emergency Medicine")

        target_visit = None
        if body.visit_id:
            target_visit = db.query(Visit).filter(Visit.id == body.visit_id).first()
            if target_visit:
                verify_visit_access(target_visit, actor)

        if not target_visit and body.patient_id:
            # Check for existing open visit for this patient
            target_visit = (
                db.query(Visit)
                .filter(
                    (Visit.patient_id == body.patient_id) | (Visit.patient_profile_id == body.patient_id),
                    Visit.status.in_(["intake_in_progress", "triaged", "in_queue", "pending"]),
                )
                .order_by(Visit.id.desc())
                .first()
            )
            if not target_visit:
                # Find patient or patient profile
                p = db.query(Patient).filter(Patient.id == body.patient_id).first()
                target_visit = Visit(
                    patient_id=body.patient_id if p else None,
                    patient_profile_id=body.patient_id,
                    status="intake_in_progress",
                    urgency_flag=True,
                    urgency_reason=alert_reason,
                    department=rec_dept,
                )
                db.add(target_visit)
                db.flush()

        if target_visit:
            target_visit.urgency_flag = True
            target_visit.urgency_reason = alert_reason
            if rec_dept:
                target_visit.department = rec_dept

            # Save the emergency symptom text as a turn
            turn = IntakeTurn(
                visit_id=target_visit.id,
                step="chief_complaint",
                question="Emergency Condition Entry",
                transcript=body.text,
                language=body.language or "en",
            )
            db.add(turn)
            db.commit()
            logger.warning(
                "[Emergency Triage API] Created/Updated urgent Visit #%d for patient_id=%s, dept=%s, reason=%s",
                target_visit.id,
                body.patient_id or target_visit.patient_id,
                target_visit.department,
                target_visit.urgency_reason,
            )

    return EvaluateEmergencyResponse(
        is_emergency=result.get("is_emergency", False),
        triage_level=result.get("triage_level", "ROUTINE"),
        urgency_score=result.get("urgency_score", 1),
        detected_red_flags=result.get("detected_red_flags", []),
        clinical_rationale=result.get("clinical_rationale", ""),
        patient_warning_message=result.get("patient_warning_message", ""),
        recommended_department=result.get("recommended_department", "General Medicine"),
    )


# ---------------------------------------------------------------------------
# GET /api/intake/turns/{visit_id}
# ---------------------------------------------------------------------------
@router.get("/turns/{visit_id}", response_model=IntakeTurnsResponse)
def get_intake_turns(
    visit_id: int,
    db: Session = Depends(get_db),
    actor: Optional[dict] = Depends(get_current_actor),
):
    """Return all stored intake turns for a given visit."""
    visit = db.query(Visit).filter(Visit.id == visit_id).first()
    if not visit:
        raise HTTPException(status_code=404, detail=f"Visit {visit_id} not found")
    verify_visit_access(visit, actor)

    turns = (
        db.query(IntakeTurn)
        .filter(IntakeTurn.visit_id == visit_id)
        .order_by(IntakeTurn.id.asc())
        .all()
    )

    return IntakeTurnsResponse(
        visit_id=visit_id,
        turns=[IntakeTurnRead.model_validate(t) for t in turns],
        total=len(turns),
    )
