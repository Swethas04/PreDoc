import logging
import secrets
from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.prescription import Prescription
from app.models.visit import Visit
from app.models.patient import Patient
from app.models.patient_profile import PatientProfile
from app.schemas.prescription import (
    PrescriptionCreate,
    PrescriptionResponse,
    PublicPrescriptionView,
    MedicineSearchResult,
    MedicineItem,
)
from app.services.medicine_service import medicine_repo
from app.services.auth import get_current_actor

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/prescriptions", tags=["Prescriptions"])


def generate_prescription_token() -> str:
    """Generate a cryptographically random, unguessable 32-character share token."""
    return secrets.token_urlsafe(24)


def ensure_prescription_token(rx: Prescription, db: Session) -> None:
    """Ensure prescription has a valid share_token and expiration."""
    if not rx.share_token:
        rx.share_token = generate_prescription_token()
        if not rx.token_expires_at:
            rx.token_expires_at = datetime.utcnow() + timedelta(days=30)
        try:
            db.commit()
            db.refresh(rx)
        except Exception:
            db.rollback()



@router.get("/medicines/search", response_model=List[MedicineSearchResult])
def search_medicines(
    q: str = Query(..., min_length=1, description="Search keyword for medicine name or composition"),
    limit: int = Query(25, ge=1, le=100, description="Max results to return"),
):
    """
    Search medicines from the loaded Medicine_Details dataset.
    Supports prefix matching, brand names, and active chemical compositions.
    Returns ranked medicine candidates with composition, dosage hints, and manufacturer.
    """
    try:
        results = medicine_repo.search(query=q, limit=limit)
        return results
    except Exception as e:
        logger.error("Error searching medicines for query '%s': %s", q, e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Medicine search failed: {str(e)}",
        )


@router.get("/visit/{visit_id}", response_model=Optional[PrescriptionResponse])
def get_visit_prescription(
    visit_id: int,
    db: Session = Depends(get_db),
):
    """
    Retrieve the current prescription associated with a visit.
    Returns 200 with null/empty if no prescription exists yet.
    """
    visit = db.query(Visit).filter(Visit.id == visit_id).first()
    if not visit:
        return None

    rx = (
        db.query(Prescription)
        .filter(Prescription.visit_id == visit_id)
        .order_by(Prescription.id.desc())
        .first()
    )
    if rx:
        ensure_prescription_token(rx, db)
    return rx


@router.post("/visit/{visit_id}", response_model=PrescriptionResponse)
def save_visit_prescription(
    visit_id: int,
    payload: PrescriptionCreate,
    db: Session = Depends(get_db),
):
    """
    Create or update the prescription for a visit and patient record.
    If the visit record does not exist yet, a placeholder visit is created so saving never fails.
    Generates a secure 32-character share_token with 30-day validity for public verification.
    """
    visit = db.query(Visit).filter(Visit.id == visit_id).first()
    if not visit:
        visit = Visit(id=visit_id, status="pending", department="General Medicine")
        db.add(visit)
        db.commit()
        db.refresh(visit)

    # Check if a prescription already exists for this visit
    rx = (
        db.query(Prescription)
        .filter(Prescription.visit_id == visit_id)
        .order_by(Prescription.id.desc())
        .first()
    )

    medicines_data = [m.model_dump() for m in payload.medicines]
    resolved_patient_id = visit.patient_id or visit.patient_profile_id
    token = generate_prescription_token()
    expiry = datetime.utcnow() + timedelta(days=30)

    if rx:
        # Update existing prescription
        rx.doctor_name = payload.doctor_name or rx.doctor_name
        rx.diagnosis = payload.diagnosis
        rx.medicines = medicines_data
        rx.general_advice = payload.general_advice
        rx.follow_up = payload.follow_up
        if not rx.patient_id and resolved_patient_id:
            rx.patient_id = resolved_patient_id
        if not rx.share_token:
            rx.share_token = token
            rx.token_expires_at = expiry
    else:
        # Create new prescription
        rx = Prescription(
            visit_id=visit.id,
            patient_id=resolved_patient_id,
            doctor_name=payload.doctor_name or "Dr. Attending Physician",
            diagnosis=payload.diagnosis,
            medicines=medicines_data,
            general_advice=payload.general_advice,
            follow_up=payload.follow_up,
            share_token=token,
            token_expires_at=expiry,
        )
        db.add(rx)

    db.commit()
    db.refresh(rx)
    logger.info("Saved prescription #%d for visit #%d (token=%s) with %d medicines", rx.id, visit.id, rx.share_token, len(rx.medicines))
    return rx


@router.get("/patient/{patient_id}", response_model=List[PrescriptionResponse])
def get_patient_prescriptions(
    patient_id: int,
    actor: Optional[dict] = Depends(get_current_actor),
    db: Session = Depends(get_db),
):
    """
    Retrieve prescription history for a given patient.
    Enforces access control: patient token must match patient_id.
    """
    if actor and actor.get("role") == "patient":
        token_patient_id = actor.get("patient_id")
        if token_patient_id is not None and token_patient_id != patient_id:
            logger.warning(
                "[Auth] 403 Forbidden: Patient token ID %s attempted to access prescriptions for patient %s",
                token_patient_id,
                patient_id,
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: You can only view your own prescriptions.",
            )

    rxs = (
        db.query(Prescription)
        .outerjoin(Visit, Prescription.visit_id == Visit.id)
        .filter(
            (Prescription.patient_id == patient_id)
            | (Visit.patient_id == patient_id)
            | (Visit.patient_profile_id == patient_id)
        )
        .order_by(Prescription.created_at.desc(), Prescription.id.desc())
        .all()
    )

    for r in rxs:
        ensure_prescription_token(r, db)

    return rxs


# ---------------------------------------------------------------------------
# GET /api/prescriptions/share/{share_token} (Public Read-Only Prescription View)
# ---------------------------------------------------------------------------
@router.get("/share/{share_token}", response_model=PublicPrescriptionView)
def get_public_prescription_by_token(
    share_token: str,
    db: Session = Depends(get_db),
):
    """
    Public, read-only endpoint for pharmacy and digital QR code verification.
    Does NOT require authentication. Returns ONLY data for this specific prescription.
    """
    rx = db.query(Prescription).filter(Prescription.share_token == share_token).first()
    if not rx:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prescription not found or invalid verification QR link.",
        )

    # Check expiration
    now = datetime.utcnow()
    is_expired = bool(rx.token_expires_at and now > rx.token_expires_at)

    # Resolve patient info
    patient_name = "Patient"
    patient_code = None
    patient_age = None
    patient_gender = None

    if rx.patient_id:
        patient = db.query(Patient).filter(Patient.id == rx.patient_id).first()
        if patient:
            patient_name = patient.name or patient_name
            patient_code = patient.patient_code
            patient_age = patient.age
        else:
            profile = db.query(PatientProfile).filter(PatientProfile.id == rx.patient_id).first()
            if profile:
                patient_name = profile.name or patient_name
                patient_age = profile.age
                patient_gender = profile.gender
    elif rx.visit_id:
        visit = db.query(Visit).filter(Visit.id == rx.visit_id).first()
        if visit and visit.patient:
            patient_name = visit.patient.name or patient_name
            patient_code = visit.patient.patient_code
            patient_age = visit.patient.age
        elif visit and visit.patient_profile:
            patient_name = visit.patient_profile.name or patient_name
            patient_age = visit.patient_profile.age
            patient_gender = visit.patient_profile.gender

    medicines_list = [
        MedicineItem(**m) if isinstance(m, dict) else m
        for m in (rx.medicines or [])
    ]

    return PublicPrescriptionView(
        id=rx.id,
        visit_id=rx.visit_id,
        share_token=rx.share_token,
        patient_name=patient_name,
        patient_code=patient_code,
        patient_age=patient_age,
        patient_gender=patient_gender,
        doctor_name=rx.doctor_name or "Dr. Attending Physician",
        diagnosis=rx.diagnosis,
        medicines=medicines_list,
        general_advice=rx.general_advice,
        follow_up=rx.follow_up,
        issued_at=rx.created_at,
        expires_at=rx.token_expires_at,
        is_expired=is_expired,
        is_verified=True,
        clinic_name="PreDoc Healthcare Center",
        clinic_department="Department of Internal Medicine & Clinical Triage",
    )


