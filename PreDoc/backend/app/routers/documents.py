import logging
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.patient import Patient
from app.models.visit import Visit
from app.models.document_record import DocumentRecord
from app.schemas.document import (
    ExtractResponse,
    ExtractedData,
    DrugEntry,
    MeasurementEntry,
    DateEntry,
    DocumentRecordRead,
    DocumentListResponse,
)
from app.services.gemini import extract_medical_document

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/documents", tags=["Documents"])

ALLOWED_MIME_TYPES = {
    "image/jpeg", "image/jpg", "image/png", "image/webp",
    "image/heic", "image/heif", "image/gif", "image/bmp",
}


# ---------------------------------------------------------------------------
# POST /api/documents/extract
# ---------------------------------------------------------------------------
@router.post("/extract", response_model=ExtractResponse)
async def extract_document(
    visit_id: int = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """
    Upload a medical document image. Sends it to Gemini Vision for structured
    extraction (drugs, diagnoses, dates, measurements) with unit normalization.
    Stores the result against the visit_id and returns the structured JSON.
    """
    # Validate or auto-create visit
    visit = db.query(Visit).filter(Visit.id == visit_id).first() if visit_id and visit_id > 0 else None
    if not visit:
        # Create an intake patient & visit so upload always succeeds smoothly
        patient = Patient(name="Intake Patient", age=None, language="en")
        db.add(patient)
        db.flush()
        visit = Visit(patient_id=patient.id, status="intake_in_progress", urgency_flag=False)
        db.add(visit)
        db.commit()
        db.refresh(visit)
        visit_id = visit.id

    # Validate MIME type
    mime = (file.content_type or "").lower()
    if mime not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported file type '{mime}'. Accepted: JPEG, PNG, WebP, HEIC, GIF, BMP.",
        )

    # Read image bytes
    image_bytes = await file.read()
    if len(image_bytes) == 0:
        raise HTTPException(status_code=422, detail="Uploaded file is empty.")
    if len(image_bytes) > 20 * 1024 * 1024:  # 20 MB limit
        raise HTTPException(status_code=413, detail="File too large. Maximum 20 MB.")

    # Run Gemini Vision extraction
    try:
        extracted_dict, raw_text = extract_medical_document(image_bytes, mime)
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.error("Document extraction failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Extraction failed: {str(e)}")

    # Persist to database with base64 for side-by-side doctor review
    import base64
    b64_encoded = f"data:{mime};base64,{base64.b64encode(image_bytes).decode('utf-8')}"

    doc_record = DocumentRecord(
        visit_id=visit_id,
        filename=file.filename or "upload.jpg",
        mime_type=mime,
        extracted_json=extracted_dict,
        raw_text=raw_text,
        image_base64=b64_encoded,
    )
    db.add(doc_record)
    db.commit()
    db.refresh(doc_record)

    # Build typed response
    drugs = [
        DrugEntry(
            name=d.get("name", ""),
            dosage=d.get("dosage"),
            dosage_normalized=d.get("dosage_normalized"),
            frequency=d.get("frequency"),
        )
        for d in extracted_dict.get("drug_names", [])
    ]

    measurements = [
        MeasurementEntry(
            type=m.get("type", "Unknown"),
            raw=m.get("raw", ""),
            unit=m.get("unit"),
            normalized={k: v for k, v in m.items() if k not in ("type", "raw")},
        )
        for m in extracted_dict.get("measurements", [])
    ]

    dates = [
        DateEntry(
            label=d.get("label", "Date"),
            value=d.get("value", ""),
            timestamp_ms=d.get("timestamp_ms"),
        )
        for d in extracted_dict.get("dates", [])
        if isinstance(d, dict)
    ]

    return ExtractResponse(
        document_id=doc_record.id,
        visit_id=visit_id,
        filename=doc_record.filename,
        extracted=ExtractedData(
            drug_names=drugs,
            diagnoses=extracted_dict.get("diagnoses", []),
            dates=dates,
            measurements=measurements,
        ),
        raw_text=raw_text,
    )


# ---------------------------------------------------------------------------
# GET /api/documents/{visit_id}
# ---------------------------------------------------------------------------
@router.get("/{visit_id}", response_model=DocumentListResponse)
def list_documents(visit_id: int, db: Session = Depends(get_db)):
    """Return all extracted document records for a visit, ordered by upload time."""
    visit = db.query(Visit).filter(Visit.id == visit_id).first()
    if not visit:
        return DocumentListResponse(visit_id=visit_id, documents=[], total=0)

    docs = (
        db.query(DocumentRecord)
        .filter(DocumentRecord.visit_id == visit_id)
        .order_by(DocumentRecord.created_at.asc())
        .all()
    )

    return DocumentListResponse(
        visit_id=visit_id,
        documents=[DocumentRecordRead.model_validate(d) for d in docs],
        total=len(docs),
    )
