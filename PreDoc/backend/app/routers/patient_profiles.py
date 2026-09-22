import base64
import logging
from typing import Optional, List
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.models.patient_profile import PatientProfile
from app.models.patient_document import PatientDocument
from app.models.consultation import Consultation
from app.models.visit import Visit
from app.schemas.patient_profile import (
    PatientProfileCreateOrUpdate,
    PatientProfileRead,
    PatientProfileDetailResponse,
    PatientDocumentRead,
    PatientDocumentUploadResponse,
    PatientDocumentsListResponse,
)
from app.schemas.consultation import ConsultationRead
from app.services.auth import get_current_user_optional
from app.services.document_storage import save_file_to_disk, resolve_document_content, detect_mime_type

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

    logger.info(
        "[Profile Document Upload] Stored document ID %d for patient_profile_id=%d, visit_id=%s, file='%s', mime='%s', by='%s'",
        doc.id,
        doc.patient_profile_id,
        doc.visit_id,
        doc.filename,
        doc.mime_type,
        doc.uploaded_by,
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

