import os
import base64
import logging
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.patient import Patient
from app.models.visit import Visit
from app.models.document_record import DocumentRecord
from app.models.patient_document import PatientDocument
from app.schemas.document import (
    DocumentUploadResponse,
    DocumentRecordRead,
    DocumentListResponse,
    PatientDocumentsResponse,
)
from app.services.document_storage import (
    save_file_to_disk,
    resolve_document_content,
    detect_mime_type,
    ALLOWED_EXTENSIONS,
)
from app.services.gemini import evaluate_emergency_triage

logger = logging.getLogger("predoc.documents")
router = APIRouter(prefix="/api/documents", tags=["Documents"])


def _find_document_model(document_id: int, db: Session):
    """Find document across PatientDocument or DocumentRecord models."""
    patient_doc = db.query(PatientDocument).filter(PatientDocument.id == document_id).first()
    if patient_doc:
        return patient_doc

    doc_rec = db.query(DocumentRecord).filter(DocumentRecord.id == document_id).first()
    if doc_rec:
        return doc_rec

    return None


# ---------------------------------------------------------------------------
# POST /api/documents/upload and /api/documents/extract (Direct Document Storage)
# ---------------------------------------------------------------------------
@router.post("/upload", response_model=DocumentUploadResponse)
@router.post("/extract", response_model=DocumentUploadResponse)
async def upload_document(
    patient_id: Optional[int] = Form(None),
    visit_id: Optional[int] = Form(None),
    label: Optional[str] = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """
    Upload and directly store a medical document/file (Image, PDF, DOCX, DOC, etc.).
    Saves the physical file to backend/uploads, persists metadata, and returns reachable file URLs.
    """
    resolved_patient_id = patient_id
    resolved_visit_id = visit_id

    # If visit_id is provided, resolve patient from visit
    if resolved_visit_id and resolved_visit_id > 0:
        visit = db.query(Visit).filter(Visit.id == resolved_visit_id).first()
        if visit:
            resolved_patient_id = visit.patient_id
        else:
            patient = Patient(name="Intake Patient", age=None, language="en")
            db.add(patient)
            db.flush()
            resolved_patient_id = patient.id
            visit = Visit(patient_id=patient.id, status="intake_in_progress", urgency_flag=False)
            db.add(visit)
            db.flush()
            resolved_visit_id = visit.id
    elif not resolved_patient_id or resolved_patient_id <= 0:
        patient = Patient(name="Intake Patient", age=None, language="en")
        db.add(patient)
        db.flush()
        resolved_patient_id = patient.id
        visit = Visit(patient_id=patient.id, status="intake_in_progress", urgency_flag=False)
        db.add(visit)
        db.flush()
        resolved_visit_id = visit.id

    patient_exists = db.query(Patient).filter(Patient.id == resolved_patient_id).first()
    if not patient_exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient with ID {resolved_patient_id} not found.",
        )

    # Read uploaded bytes
    file_bytes = await file.read()
    if len(file_bytes) == 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Uploaded file is empty.",
        )
    if len(file_bytes) > 50 * 1024 * 1024:  # 50 MB limit
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File too large. Maximum 50 MB.",
        )

    clean_filename = file.filename or "uploaded_document"
    clean_label = (label.strip() if label else None) or None

    # Save to disk with proper MIME detection
    saved_file = save_file_to_disk(
        file_bytes=file_bytes,
        filename=clean_filename,
        mime_type=file.content_type,
    )

    # For images or lightweight files, generate base64 for instant preview fallback
    b64_encoded = None
    if len(file_bytes) <= 15 * 1024 * 1024:
        b64_encoded = f"data:{saved_file['mime_type']};base64,{base64.b64encode(file_bytes).decode('utf-8')}"

    doc_record = DocumentRecord(
        patient_id=resolved_patient_id,
        visit_id=resolved_visit_id if (resolved_visit_id and resolved_visit_id > 0) else None,
        filename=clean_filename,
        mime_type=saved_file["mime_type"],
        label=clean_label,
        file_url=saved_file["file_url"],
        file_path=saved_file["file_path"],
        image_base64=b64_encoded,
    )
    db.add(doc_record)
    db.commit()
    db.refresh(doc_record)

    # Run Emergency Medicine Clinical Triage AI evaluation on uploaded prescription/record
    is_img = saved_file["mime_type"].startswith("image/")
    try:
        triage_eval = evaluate_emergency_triage(
            text=f"{clean_label or ''} {clean_filename}",
            image_bytes=file_bytes if (is_img and len(file_bytes) <= 5 * 1024 * 1024) else None,
            mime_type=saved_file["mime_type"] if is_img else None,
        )
    except Exception as e:
        logger.warning("[Document Upload] Triage evaluation error: %s", e)
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
        if triage_eval.get("is_emergency"):
            alert_reason = f"Document Alert: {', '.join(triage_eval.get('detected_red_flags', [])) or triage_eval.get('clinical_rationale')}"
            rec_dept = triage_eval.get("recommended_department", "Emergency Medicine")

            v = None
            if resolved_visit_id:
                v = db.query(Visit).filter(Visit.id == resolved_visit_id).first()
            elif resolved_patient_id:
                v = (
                    db.query(Visit)
                    .filter(
                        Visit.patient_id == resolved_patient_id,
                        Visit.status.in_(["intake_in_progress", "triaged", "in_queue", "pending"]),
                    )
                    .order_by(Visit.id.desc())
                    .first()
                )
                if not v:
                    v = Visit(
                        patient_id=resolved_patient_id,
                        status="intake_in_progress",
                        urgency_flag=True,
                        urgency_reason=alert_reason,
                        department=rec_dept,
                    )
                    db.add(v)
                    db.flush()
                    doc_record.visit_id = v.id
                    db.commit()

            if v:
                v.urgency_flag = True
                v.urgency_reason = alert_reason
                if rec_dept:
                    v.department = rec_dept
                # Save turn description
                turn = IntakeTurn(
                    visit_id=v.id,
                    step="chief_complaint",
                    question="Uploaded Document Evaluation",
                    transcript=f"Uploaded '{clean_filename}': {triage_eval.get('clinical_rationale')}",
                    language="en",
                )
                db.add(turn)
                db.commit()
    except Exception as e:
        logger.warning("[Document Upload] Visit urgency update failed: %s", e)

    logger.info(
        "[Document Upload] Stored document ID %d for patient_id=%d, visit_id=%s, file='%s', mime='%s', emergency=%s",
        doc_record.id,
        doc_record.patient_id,
        doc_record.visit_id,
        doc_record.filename,
        doc_record.mime_type,
        triage_eval.get("is_emergency", False),
    )

    return DocumentUploadResponse(
        document_id=doc_record.id,
        patient_id=doc_record.patient_id,
        visit_id=doc_record.visit_id,
        filename=doc_record.filename,
        mime_type=doc_record.mime_type,
        label=doc_record.label,
        image_base64=doc_record.image_base64,
        file_url=f"/api/documents/{doc_record.id}/raw",
        download_url=f"/api/documents/{doc_record.id}/download",
        created_at=doc_record.created_at,
        is_emergency=triage_eval.get("is_emergency", False),
        triage_evaluation=triage_eval,
        message="Document uploaded and stored successfully.",
    )


# ---------------------------------------------------------------------------
# GET /api/documents/{document_id}/raw & /file (Serve raw file with Content-Type)
# ---------------------------------------------------------------------------
@router.get("/{document_id}/raw")
@router.get("/{document_id}/file")
def get_raw_document(document_id: int, db: Session = Depends(get_db)):
    """
    Serve raw binary content of a document with correct Content-Type and inline disposition.
    Supports images, PDFs, Word docs, text files, and any medical attachments.
    """
    doc = _find_document_model(document_id, db)
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document #{document_id} not found.",
        )

    content_bytes, actual_mime, filename = resolve_document_content(doc)
    if not content_bytes:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document #{document_id} content is empty or unreadable.",
        )

    headers = {
        "Content-Disposition": f'inline; filename="{filename}"',
        "Content-Type": actual_mime,
        "Cache-Control": "public, max-age=86400",
        "Access-Control-Allow-Origin": "*",
    }
    return Response(content=content_bytes, media_type=actual_mime, headers=headers)


# ---------------------------------------------------------------------------
# GET /api/documents/{document_id}/download (Serve document for attachment download)
# ---------------------------------------------------------------------------
@router.get("/{document_id}/download")
def download_document(document_id: int, db: Session = Depends(get_db)):
    """
    Serve document file with Content-Disposition: attachment for direct download.
    Forces download with original filename and correct extension.
    """
    doc = _find_document_model(document_id, db)
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document #{document_id} not found.",
        )

    content_bytes, actual_mime, filename = resolve_document_content(doc)
    if not content_bytes:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document #{document_id} content is empty or unreadable.",
        )

    headers = {
        "Content-Disposition": f'attachment; filename="{filename}"',
        "Content-Type": actual_mime,
        "Access-Control-Allow-Origin": "*",
    }
    return Response(content=content_bytes, media_type=actual_mime, headers=headers)


# ---------------------------------------------------------------------------
# GET /api/documents/patient/{patient_id} (All documents across visits)
# ---------------------------------------------------------------------------
@router.get("/patient/{patient_id}", response_model=PatientDocumentsResponse)
def get_patient_documents(patient_id: int, db: Session = Depends(get_db)):
    """
    Retrieve all documents ever uploaded for a given patient_id across all visits,
    sorted by upload date (most recent first).
    """
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient with ID {patient_id} not found.",
        )

    docs = (
        db.query(DocumentRecord)
        .filter(DocumentRecord.patient_id == patient_id)
        .order_by(DocumentRecord.created_at.desc(), DocumentRecord.id.desc())
        .all()
    )

    return PatientDocumentsResponse(
        patient_id=patient_id,
        documents=[DocumentRecordRead.model_validate(d) for d in docs],
        total=len(docs),
    )


# ---------------------------------------------------------------------------
# GET /api/documents/{visit_id} (Documents for a visit)
# ---------------------------------------------------------------------------
@router.get("/{visit_id}", response_model=DocumentListResponse)
@router.get("/visit/{visit_id}", response_model=DocumentListResponse)
def list_visit_documents(visit_id: int, db: Session = Depends(get_db)):
    """Return all document records for a visit, ordered by upload time (most recent first)."""
    visit = db.query(Visit).filter(Visit.id == visit_id).first()
    if not visit:
        return DocumentListResponse(visit_id=visit_id, documents=[], total=0)

    docs = (
        db.query(DocumentRecord)
        .filter(DocumentRecord.visit_id == visit_id)
        .order_by(DocumentRecord.created_at.desc(), DocumentRecord.id.desc())
        .all()
    )

    return DocumentListResponse(
        visit_id=visit_id,
        documents=[DocumentRecordRead.model_validate(d) for d in docs],
        total=len(docs),
    )
