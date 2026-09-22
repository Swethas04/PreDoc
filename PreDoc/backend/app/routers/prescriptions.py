import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.prescription import Prescription
from app.models.visit import Visit
from app.models.patient import Patient
from app.schemas.prescription import (
    PrescriptionCreate,
    PrescriptionResponse,
    MedicineSearchResult,
)
from app.services.medicine_service import medicine_repo

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/prescriptions", tags=["Prescriptions"])


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

    if rx:
        # Update existing prescription
        rx.doctor_name = payload.doctor_name or rx.doctor_name
        rx.diagnosis = payload.diagnosis
        rx.medicines = medicines_data
        rx.general_advice = payload.general_advice
        rx.follow_up = payload.follow_up
    else:
        # Create new prescription
        rx = Prescription(
            visit_id=visit.id,
            patient_id=visit.patient_id,
            doctor_name=payload.doctor_name or "Dr. Attending Physician",
            diagnosis=payload.diagnosis,
            medicines=medicines_data,
            general_advice=payload.general_advice,
            follow_up=payload.follow_up,
        )
        db.add(rx)

    db.commit()
    db.refresh(rx)
    logger.info("Saved prescription #%d for visit #%d with %d medicines", rx.id, visit.id, len(rx.medicines))
    return rx


@router.get("/patient/{patient_id}", response_model=List[PrescriptionResponse])
def get_patient_prescriptions(
    patient_id: int,
    db: Session = Depends(get_db),
):
    """
    Retrieve prescription history for a given patient.
    """
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail=f"Patient #{patient_id} not found")

    rxs = (
        db.query(Prescription)
        .filter(Prescription.patient_id == patient_id)
        .order_by(Prescription.id.desc())
        .all()
    )
    return rxs
