import logging
from typing import Literal, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.patient import Patient
from app.models.visit import Visit
from app.models.intake_turn import IntakeTurn
from app.schemas.intake import (
    StartIntakeRequest,
    StartIntakeResponse,
    IntakeRespondResponse,
    IntakeTurnsResponse,
    IntakeTurnRead,
    UpdatePatientRequest,
    ParseDemographicsResponse,
)
from app.services.gemini import (
    CLINICAL_STEPS,
    STEP_QUESTIONS,
    detect_language,
    get_next_question,
    get_next_step,
    transcribe_audio,
    parse_demographics_from_text,
)
from app.services.red_flag_checker import evaluate_red_flags

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/intake", tags=["Intake"])

# Mapping of clinical steps to frontend input interaction type
STEP_INPUT_TYPES = {
    "chief_complaint": "options",
    "duration": "options",
    "associated_symptoms": "options",
    "past_history": "yesno",
    "medications": "yesno",
    "allergies": "text",
}


# ---------------------------------------------------------------------------
# POST /api/intake/start
# ---------------------------------------------------------------------------
@router.post("/start", response_model=StartIntakeResponse)
def start_intake(body: StartIntakeRequest, db: Session = Depends(get_db)):
    """
    Begin a guided patient intake session.
    Creates a Patient and Visit record, returns the first clinical question.
    """
    logger.info(
        "[Intake Router] Received /api/intake/start request: patient_name='%s', patient_age=%s, language='%s'",
        body.patient_name,
        body.patient_age,
        body.language,
    )
    try:
        # Create patient (placeholder or initial name/age)
        patient = Patient(
            name=body.patient_name or "Patient",
            age=body.patient_age,
            language=body.language,
        )
        db.add(patient)
        db.flush()  # get patient.id

        # Create visit
        visit = Visit(
            patient_id=patient.id,
            status="intake_in_progress",
            urgency_flag=False,
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
            "[Intake Router] Successfully started intake: patient_id=%d, visit_id=%d, first_step='%s'",
            patient.id,
            visit.id,
            first_step,
        )

        return StartIntakeResponse(
            visit_id=visit.id,
            patient_id=patient.id,
            language=body.language,
            first_step=first_step,
            first_question=first_question,
            steps=CLINICAL_STEPS,
            message="Intake session started successfully.",
            input_type=STEP_INPUT_TYPES.get(first_step, "options"),
            step_input_types=STEP_INPUT_TYPES,
        )
    except Exception as e:
        db.rollback()
        logger.error("[Intake Router] Failed to start intake session: %s", e, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to start intake session: {str(e)}"
        )


# ---------------------------------------------------------------------------
# PATCH /api/intake/patient/{visit_id}
# ---------------------------------------------------------------------------
@router.patch("/patient/{visit_id}")
def update_patient_demographics(visit_id: int, body: UpdatePatientRequest, db: Session = Depends(get_db)):
    """
    Save or update captured patient demographics (name, age, language) for a visit.
    Updates the database Patient record so all screens (Header, Doctor Dashboard, Case Review) reflect the change.
    """
    visit = db.query(Visit).filter(Visit.id == visit_id).first()
    if not visit:
        raise HTTPException(status_code=404, detail=f"Visit {visit_id} not found")

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
    audio: Optional[UploadFile] = File(None),
    transcript_text: Optional[str] = Form(None),
    client_transcript: Optional[str] = Form(None),
    transcript: Optional[str] = Form(None),
    db: Session = Depends(get_db),
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

    # Validate step
    if step not in CLINICAL_STEPS:
        raise HTTPException(status_code=422, detail=f"Unknown step: {step}. Must be one of {CLINICAL_STEPS}")

    lang: Literal["en", "hi"] = "hi" if language == "hi" else "en"

    # Validate visit exists
    visit = db.query(Visit).filter(Visit.id == visit_id).first()
    if not visit:
        raise HTTPException(status_code=404, detail=f"Visit {visit_id} not found")

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

    # Determine next step
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

    # --- Real-Time Red-Flag Evaluation ---
    # Fetch all completed transcript turns for this visit to detect cross-turn combinations
    all_turns = (
        db.query(IntakeTurn)
        .filter(IntakeTurn.visit_id == visit_id)
        .all()
    )
    all_transcripts = [t.transcript for t in all_turns if t.transcript]
    if transcript not in all_transcripts:
        all_transcripts.append(transcript)

    red_flag_result = evaluate_red_flags(all_transcripts)
    if red_flag_result.is_urgent:
        visit.urgency_flag = True
        if red_flag_result.department:
            visit.department = red_flag_result.department
        if red_flag_result.reason:
            visit.urgency_reason = red_flag_result.reason
        logger.warning(
            "RED FLAG TRIGGERED for Visit %d: Dept=%s, Reason=%s, Triggers=%s",
            visit.id,
            visit.department,
            visit.urgency_reason,
            red_flag_result.matched_triggers,
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
        matched_triggers=red_flag_result.matched_triggers if red_flag_result.is_urgent else None,
        input_type=current_input_type,
        next_input_type=next_input_type,
    )


# ---------------------------------------------------------------------------
# GET /api/intake/turns/{visit_id}
# ---------------------------------------------------------------------------
@router.get("/turns/{visit_id}", response_model=IntakeTurnsResponse)
def get_intake_turns(visit_id: int, db: Session = Depends(get_db)):
    """Return all stored intake turns for a given visit."""
    visit = db.query(Visit).filter(Visit.id == visit_id).first()
    if not visit:
        raise HTTPException(status_code=404, detail=f"Visit {visit_id} not found")

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
