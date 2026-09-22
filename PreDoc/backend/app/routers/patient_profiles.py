import base64
import logging
from typing import Optional, List
from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.models.patient_profile import PatientProfile
from app.models.patient_document import PatientDocument
from app.models.consultation import Consultation
from app.models.visit import Visit
from app.models.patient import Patient
from app.models.prescription import Prescription
from app.schemas.patient_profile import (
    PatientProfileCreateOrUpdate,
    PatientProfileRead,
    PatientProfileDetailResponse,
    PatientDocumentRead,
    PatientDocumentUploadResponse,
    PatientDocumentsListResponse,
)
from app.schemas.consultation import ConsultationRead
from app.schemas.prescription import PrescriptionResponse
from app.services.auth import get_current_user_optional, get_current_actor
from app.services.document_storage import save_file_to_disk, resolve_document_content, detect_mime_type
from app.services.gemini import evaluate_emergency_triage

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/patients", tags=["Patient Profiles"])

ALLOWED_MIME_TYPES = {
    "image/jpeg", "image/jpg", "image/png", "image/webp",
    "image/heic", "image/heif", "image/gif", "image/bmp",
    "application/pdf",
}


def _verify_profile_access(user: Optional[User], profile_id: int):
    """
    Access control rule:
    - Doctors and Admins can access any patient's profile and documents.
    - Patients can ONLY access their own profile and documents.
    """
    if not user:
        return  # Allow open access if no auth token provided in dev/test mode

    if user.role in ("doctor", "admin"):
        return

    # If patient, verify the profile belongs to them
    if user.patient_profile and user.patient_profile.id != profile_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: You can only view and manage your own patient profile.",
        )


# ---------------------------------------------------------------------------
# POST /api/patients/profile (Create / Update logged-in patient's profile)
# ---------------------------------------------------------------------------
@router.post("/profile", response_model=PatientProfileRead)
def create_or_update_profile(
    data: PatientProfileCreateOrUpdate,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """
    Create or update the logged-in patient's persistent profile.
    If no profile exists for the user, it creates one. Otherwise, updates fields.
    """
    profile = None
    if current_user:
        profile = current_user.patient_profile

    if not profile:
        # Check if there is an unattached or matching profile by user_id
        if current_user:
            profile = db.query(PatientProfile).filter(PatientProfile.user_id == current_user.id).first()

        if not profile:
            profile = PatientProfile(
                user_id=current_user.id if current_user else None,
                name=data.name or (current_user.name if current_user else "Patient"),
                age=data.age,
                gender=data.gender,
                phone=data.phone,
                language=data.language or "en",
            )
            db.add(profile)
            db.commit()
            db.refresh(profile)
            return profile

    if data.name is not None:
        profile.name = data.name.strip()
    if data.age is not None:
        profile.age = data.age
    if data.gender is not None:
        profile.gender = data.gender.strip()
    if data.phone is not None:
        profile.phone = data.phone.strip()
    if data.language is not None:
        profile.language = data.language.strip()

    db.commit()
    db.refresh(profile)
    return profile


# ---------------------------------------------------------------------------
# GET /api/patients/{patient_profile_id} (Full profile: info, documents, consultations)
# ---------------------------------------------------------------------------
@router.get("/{patient_profile_id}", response_model=PatientProfileDetailResponse)
def get_patient_profile(
    patient_profile_id: int,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """
    Retrieve full profile for a patient: basic info, all documents (newest first),
    and all past consultations (newest first, with doctor name, date, time, and case draft link).
    """
    _verify_profile_access(current_user, patient_profile_id)

    profile = db.query(PatientProfile).filter(PatientProfile.id == patient_profile_id).first()
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient profile #{patient_profile_id} not found.",
        )

    # Fetch documents sorted newest first
    docs = (
        db.query(PatientDocument)
        .filter(PatientDocument.patient_profile_id == patient_profile_id)
        .order_by(PatientDocument.uploaded_at.desc(), PatientDocument.id.desc())
        .all()
    )

    # Fetch past consultations sorted newest first
    consultations = (
        db.query(Consultation)
        .filter(Consultation.patient_profile_id == patient_profile_id)
        .order_by(Consultation.consultation_date.desc(), Consultation.id.desc())
        .all()
    )

    total_visits = db.query(Visit).filter(
        (Visit.patient_profile_id == patient_profile_id) | (Visit.patient_id == patient_profile_id)
    ).count()

    return PatientProfileDetailResponse(
        id=profile.id,
        user_id=profile.user_id,
        name=profile.name,
        age=profile.age,
        gender=profile.gender,
        phone=profile.phone,
        language=profile.language,
        created_at=profile.created_at,
        documents=[PatientDocumentRead.model_validate(d) for d in docs],
        consultations=[ConsultationRead.model_validate(c) for c in consultations],
        total_visits=total_visits,
    )


# ---------------------------------------------------------------------------
# POST /api/patients/{patient_profile_id}/documents (Upload document against profile)
# ---------------------------------------------------------------------------
@router.post("/{patient_profile_id}/documents", response_model=PatientDocumentUploadResponse)
async def upload_patient_document(
    patient_profile_id: int,
    visit_id: Optional[int] = Form(None),
    label: Optional[str] = Form(None),
    file: UploadFile = File(...),
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """
    Upload a document directly against a patient's profile.
    Accepts optional visit_id (null if uploaded standalone by doctor or patient outside a visit).
    Stores file directly without AI extraction or OCR.
    """
    _verify_profile_access(current_user, patient_profile_id)

    profile = db.query(PatientProfile).filter(PatientProfile.id == patient_profile_id).first()
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient profile #{patient_profile_id} not found.",
        )

    # Read uploaded file bytes
    file_bytes = await file.read()
    if len(file_bytes) == 0:
        raise HTTPException(status_code=422, detail="Uploaded file is empty.")
    if len(file_bytes) > 50 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File exceeds 50MB limit.")

    # Determine uploader identity
    uploader_role = "doctor" if (current_user and current_user.role == "doctor") else "patient"
    uploader_tag = current_user.name if current_user else uploader_role

    clean_filename = file.filename or "patient_document"
    clean_label = (label.strip() if label else None) or None
    resolved_visit_id = visit_id if (visit_id and visit_id > 0) else None

    # Save physical file to disk
    saved_file = save_file_to_disk(
        file_bytes=file_bytes,
        filename=clean_filename,
        mime_type=file.content_type,
    )

    # Generate base64 fallback for smaller files
    b64_encoded = None
    if len(file_bytes) <= 15 * 1024 * 1024:
        b64_encoded = f"data:{saved_file['mime_type']};base64,{base64.b64encode(file_bytes).decode('utf-8')}"

    doc = PatientDocument(
        patient_profile_id=patient_profile_id,
        visit_id=resolved_visit_id,
        filename=clean_filename,
        mime_type=saved_file["mime_type"],
        label=clean_label,
        file_url=saved_file["file_url"],
        file_path=saved_file["file_path"],
        image_base64=b64_encoded,
        uploaded_by=uploader_tag,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    # Run Emergency Medicine Clinical Triage AI evaluation on uploaded prescription/record
    is_img = saved_file["mime_type"].startswith("image/")
    try:
        triage_eval = evaluate_emergency_triage(
            text=f"{clean_label or ''} {clean_filename}",
            image_bytes=file_bytes if (is_img and len(file_bytes) <= 5 * 1024 * 1024) else None,
            mime_type=saved_file["mime_type"] if is_img else None,
        )
    except Exception as e:
        logger.warning("[Profile Document Upload] Triage evaluation error: %s", e)
        triage_eval = {
            "is_emergency": False,
            "triage_level": "ROUTINE",
            "urgency_score": 1,
            "detected_red_flags": [],
            "clinical_rationale": "Document processed and recorded.",
            "patient_warning_message": "",
            "recommended_department": "General Medicine",
        }

    try:
        if triage_eval.get("is_emergency") and resolved_visit_id:
            v = db.query(Visit).filter(Visit.id == resolved_visit_id).first()
            if v:
                v.urgency_flag = True
                v.urgency_reason = f"Document Alert: {', '.join(triage_eval.get('detected_red_flags', [])) or triage_eval.get('clinical_rationale')}"
                if triage_eval.get("recommended_department"):
                    v.department = triage_eval.get("recommended_department")
                db.commit()
    except Exception as e:
        logger.warning("[Profile Document Upload] Visit urgency update failed: %s", e)

    logger.info(
        "[Profile Document Upload] Stored document ID %d for patient_profile_id=%d, visit_id=%s, file='%s', mime='%s', by='%s', emergency=%s",
        doc.id,
        doc.patient_profile_id,
        doc.visit_id,
        doc.filename,
        doc.mime_type,
        doc.uploaded_by,
        triage_eval.get("is_emergency", False),
    )

    return PatientDocumentUploadResponse(
        id=doc.id,
        patient_profile_id=doc.patient_profile_id,
        visit_id=doc.visit_id,
        filename=doc.filename,
        mime_type=doc.mime_type,
        label=doc.label,
        image_base64=doc.image_base64,
        file_url=f"/api/documents/{doc.id}/raw",
        download_url=f"/api/documents/{doc.id}/download",
        uploaded_by=doc.uploaded_by,
        uploaded_at=doc.uploaded_at,
        is_emergency=triage_eval.get("is_emergency", False),
        triage_evaluation=triage_eval,
        message="Document uploaded successfully against patient profile.",
    )


# ---------------------------------------------------------------------------
# GET /api/patients/documents/{document_id}/raw & /download
# ---------------------------------------------------------------------------
@router.get("/documents/{document_id}/raw")
@router.get("/documents/{document_id}/file")
def get_patient_document_raw(
    document_id: int,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """Serve raw binary document file with inline Content-Disposition for PDF/image preview."""
    doc = db.query(PatientDocument).filter(PatientDocument.id == document_id).first()
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient document #{document_id} not found.",
        )
    _verify_profile_access(current_user, doc.patient_profile_id)

    content_bytes, actual_mime, filename = resolve_document_content(doc)
    if not content_bytes:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient document #{document_id} content is empty or unreadable.",
        )

    headers = {
        "Content-Disposition": f'inline; filename="{filename}"',
        "Content-Type": actual_mime,
        "Cache-Control": "public, max-age=86400",
        "Access-Control-Allow-Origin": "*",
    }
    return Response(content=content_bytes, media_type=actual_mime, headers=headers)


@router.get("/documents/{document_id}/download")
def download_patient_document(
    document_id: int,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """Serve document with attachment disposition for direct downloading."""
    doc = db.query(PatientDocument).filter(PatientDocument.id == document_id).first()
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient document #{document_id} not found.",
        )
    _verify_profile_access(current_user, doc.patient_profile_id)

    content_bytes, actual_mime, filename = resolve_document_content(doc)
    if not content_bytes:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient document #{document_id} content is empty or unreadable.",
        )

    headers = {
        "Content-Disposition": f'attachment; filename="{filename}"',
        "Content-Type": actual_mime,
        "Access-Control-Allow-Origin": "*",
    }
    return Response(content=content_bytes, media_type=actual_mime, headers=headers)


# ---------------------------------------------------------------------------
# GET /api/patients/{patient_profile_id}/documents (List all documents for patient)
# ---------------------------------------------------------------------------
@router.get("/{patient_profile_id}/documents", response_model=PatientDocumentsListResponse)
def list_patient_profile_documents(
    patient_profile_id: int,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """List all documents uploaded for this patient profile across all visits or standalone."""
    _verify_profile_access(current_user, patient_profile_id)

    profile = db.query(PatientProfile).filter(PatientProfile.id == patient_profile_id).first()
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient profile #{patient_profile_id} not found.",
        )

    docs = (
        db.query(PatientDocument)
        .filter(PatientDocument.patient_profile_id == patient_profile_id)
        .order_by(PatientDocument.uploaded_at.desc(), PatientDocument.id.desc())
        .all()
    )

    return PatientDocumentsListResponse(
        patient_profile_id=patient_profile_id,
        documents=[PatientDocumentRead.model_validate(d) for d in docs],
        total=len(docs),
    )


def _verify_patient_prescriptions_access(actor: Optional[dict], patient_id: int):
    """
    Enforces access control for patient prescriptions:
    - Doctors, Nurses, Admins, and Staff have full access to any patient's prescriptions.
    - Patient tokens can ONLY fetch their own prescriptions (matching token.patient_id == patient_id).
    - If mismatch, raises 403 Forbidden.
    """
    if actor is None:
        return  # Allow open access if no auth token provided in dev/test mode

    role = actor.get("role")
    if role in ("doctor", "nurse", "admin", "staff"):
        return

    if role == "patient":
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


# ---------------------------------------------------------------------------
# GET /api/patients/{patient_id}/prescriptions (List all saved prescriptions for patient)
# ---------------------------------------------------------------------------
@router.get("/{patient_id}/prescriptions", response_model=List[PrescriptionResponse])
def get_patient_saved_prescriptions(
    patient_id: int,
    actor: Optional[dict] = Depends(get_current_actor),
    db: Session = Depends(get_db),
):
    """
    Retrieve all saved prescriptions for a patient (most recent first).
    Returns medicines list, dosage, frequency, duration, instructions, doctor name, date, and visit ref.
    Enforces patient-session access control: a patient can only fetch their own prescriptions.
    """
    _verify_patient_prescriptions_access(actor, patient_id)

    # Check if patient exists
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    profile = db.query(PatientProfile).filter(PatientProfile.id == patient_id).first()

    # Query all prescriptions linked directly or via visit
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

    if not rxs and not patient and not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient #{patient_id} not found.",
        )

    from app.routers.prescriptions import ensure_prescription_token
    for r in rxs:
        ensure_prescription_token(r, db)

    return rxs



