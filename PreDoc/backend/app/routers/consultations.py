import logging
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.models.patient_profile import PatientProfile
from app.models.consultation import Consultation
from app.models.visit import Visit
from app.models.case_draft import CaseDraft
from app.schemas.consultation import (
    ConsultationCreate,
    ConsultationRead,
    ConsultationListResponse,
)
from app.services.auth import get_current_user_optional

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/consultations", tags=["Consultations"])


# ---------------------------------------------------------------------------
# POST /api/consultations (Create consultation record)
# ---------------------------------------------------------------------------
@router.post("", response_model=ConsultationRead)
def create_consultation(
    data: ConsultationCreate,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """
    Create a consultation record (invoked when a doctor completes/approves a consultation).
    Auto-populates doctor information from logged-in user if available.
    """
    visit = db.query(Visit).filter(Visit.id == data.visit_id).first()
    if not visit:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Visit #{data.visit_id} not found.",
        )

    # Resolve patient_profile_id from visit if not explicit
    resolved_profile_id = data.patient_profile_id or visit.patient_profile_id or visit.patient_id
    if not resolved_profile_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Valid patient_profile_id is required.",
        )

    # Doctor information
    doctor_id = data.doctor_id
    doctor_name = data.doctor_name or "Attending Physician"
    if current_user and current_user.role == "doctor":
        doctor_id = current_user.id
        doctor_name = current_user.name

    now = datetime.now(timezone.utc)
    consultation_date = data.consultation_date or now
    consultation_time = data.consultation_time or now.strftime("%I:%M %p")

    # Case draft ID resolution
    case_draft_id = data.case_draft_id
    if not case_draft_id:
        latest_draft = (
            db.query(CaseDraft)
            .filter(CaseDraft.visit_id == data.visit_id)
            .order_by(CaseDraft.id.desc())
            .first()
        )
        if latest_draft:
            case_draft_id = latest_draft.id

    consultation = Consultation(
        patient_profile_id=resolved_profile_id,
        doctor_id=doctor_id,
        doctor_name=doctor_name,
        visit_id=visit.id,
        consultation_date=consultation_date,
        consultation_time=consultation_time,
        notes=data.notes,
        case_draft_id=case_draft_id,
    )
    db.add(consultation)
    db.commit()
    db.refresh(consultation)

    logger.info(
        "[Consultation Created] ID %d for patient_profile_id=%d, visit_id=%d by %s",
        consultation.id,
        consultation.patient_profile_id,
        consultation.visit_id,
        consultation.doctor_name,
    )

    return ConsultationRead.model_validate(consultation)


# ---------------------------------------------------------------------------
# GET /api/consultations/patient/{patient_profile_id} (History for patient)
# ---------------------------------------------------------------------------
@router.get("/patient/{patient_profile_id}", response_model=ConsultationListResponse)
def get_patient_consultations(
    patient_profile_id: int,
    db: Session = Depends(get_db),
):
    """Retrieve full consultation history for a patient, sorted newest first."""
    profile = db.query(PatientProfile).filter(PatientProfile.id == patient_profile_id).first()
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient profile #{patient_profile_id} not found.",
        )

    consultations = (
        db.query(Consultation)
        .filter(Consultation.patient_profile_id == patient_profile_id)
        .order_by(Consultation.consultation_date.desc(), Consultation.id.desc())
        .all()
    )

    return ConsultationListResponse(
        patient_profile_id=patient_profile_id,
        consultations=[ConsultationRead.model_validate(c) for c in consultations],
        total=len(consultations),
    )
