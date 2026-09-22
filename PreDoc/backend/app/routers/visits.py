import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.case_draft import CaseDraft
from app.models.document_record import DocumentRecord
from app.models.intake_turn import IntakeTurn
from app.models.patient import Patient
from app.models.user import User
from app.models.visit import Visit
from app.schemas.case_draft import (
    ApproveDraftRequest,
    CaseContextResponse,
    CaseDraftResponse,
    CaseDraftUpdateRequest,
    SOAPContent,
)
from app.services.auth import (
    get_current_staff,
    require_doctor,
    get_current_patient,
    get_current_actor,
    verify_visit_access,
)
from app.services.gemini import generate_soap_case_draft

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/visits", tags=["Visits & Case Drafts"])


# ---------------------------------------------------------------------------
# GET /api/visits/patient/my-visits (Patient-only: own visit history)
# ---------------------------------------------------------------------------
@router.get("/patient/my-visits")
def get_patient_my_visits(
    current_patient: Patient = Depends(get_current_patient),
    db: Session = Depends(get_db),
):
    """
    Returns all visits belonging to the authenticated patient.
    Enforces API-level access control: patients can strictly ONLY access their own records.
    """
    visits = (
        db.query(Visit)
        .filter(Visit.patient_id == current_patient.id)
        .order_by(Visit.id.desc())
        .all()
    )
    results = []
    for v in visits:
        draft = db.query(CaseDraft).filter(CaseDraft.visit_id == v.id).first()
        turn_count = db.query(IntakeTurn.id).filter(IntakeTurn.visit_id == v.id).count()
        doc_count = db.query(DocumentRecord.id).filter(DocumentRecord.visit_id == v.id).count()
        results.append({
            "visit_id": v.id,
            "patient_id": v.patient_id,
            "patient_name": current_patient.name,
            "patient_code": current_patient.patient_code,
            "status": v.status,
            "urgency_flag": v.urgency_flag,
            "department": v.department or "General Medicine",
            "urgency_reason": v.urgency_reason,
            "created_at": v.created_at.isoformat() if getattr(v, "created_at", None) else None,
            "turn_count": turn_count,
            "doc_count": doc_count,
            "has_draft": draft is not None and draft.content_json is not None,
            "is_approved": bool(draft.is_approved) if draft else False,
        })
    return {
        "patient": {
            "id": current_patient.id,
            "patient_code": current_patient.patient_code,
            "name": current_patient.name,
            "age": current_patient.age,
            "language": current_patient.language,
        },
        "visits": results,
        "total": len(results),
    }


# ---------------------------------------------------------------------------
# GET /api/visits/{id}/patient-summary (Patient-safe structured summary)
# ---------------------------------------------------------------------------
@router.get("/{id}/patient-summary")
def get_patient_visit_summary(
    id: int,
    db: Session = Depends(get_db),
    actor: Optional[dict] = Depends(get_current_actor),
):
    """
    Returns a patient-safe plain language summary of their intake and uploaded documents.
    Enforces API-level access control: patients can only access their own visit (403 otherwise).
    """
    visit = db.query(Visit).filter(Visit.id == id).first()
    if not visit:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Visit {id} not found")
    verify_visit_access(visit, actor)

    patient = visit.patient
    turns = db.query(IntakeTurn).filter(IntakeTurn.visit_id == id).order_by(IntakeTurn.id.asc()).all()
    docs = db.query(DocumentRecord).filter(DocumentRecord.visit_id == id).order_by(DocumentRecord.created_at.asc()).all()
    draft = db.query(CaseDraft).filter(CaseDraft.visit_id == id).first()

    return {
        "visit_id": visit.id,
        "patient": {
            "id": patient.id if patient else None,
            "patient_code": getattr(patient, "patient_code", None),
            "name": patient.name if patient else "Patient",
            "age": patient.age if patient else None,
            "language": patient.language if patient else "en",
        },
        "status": visit.status,
        "urgency_flag": visit.urgency_flag,
        "department": visit.department,
        "urgency_reason": visit.urgency_reason,
        "consent_given": getattr(visit, "consent_given", True),
        "consent_timestamp": visit.consent_timestamp.isoformat() if getattr(visit, "consent_timestamp", None) else None,
        "created_at": visit.created_at.isoformat() if getattr(visit, "created_at", None) else None,
        "turns": [
            {
                "id": t.id,
                "step": t.step,
                "question": t.question,
                "transcript": t.transcript,
                "language": t.language,
            }
            for t in turns
        ],
        "documents": [
            {
                "id": d.id,
                "filename": d.filename,
                "extracted_json": d.extracted_json,
                "created_at": d.created_at.isoformat() if d.created_at else None,
            }
            for d in docs
        ],
        "has_draft": draft is not None and draft.content_json is not None,
        "draft_summary": draft.content_json if draft else None,
    }


# ---------------------------------------------------------------------------
# POST /api/visits/{id}/generate-draft
# ---------------------------------------------------------------------------
@router.post("/{id}/generate-draft", response_model=CaseDraftResponse)
def generate_case_draft(id: int, db: Session = Depends(get_db), current_user: User = Depends(require_doctor)):
    """
    Synthesizes the intake interview transcript and extracted document data
    for visit {id} into a structured SOAP-style clinical case draft using Gemini.
    Every fact is grounded with a source reference (turn ID or document ID).
    Saves the result to the case_drafts table.
    """
    visit = db.query(Visit).filter(Visit.id == id).first()
    if not visit:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Visit with ID {id} not found.",
        )

    # Fetch all intake turns for this visit
    turns = (
        db.query(IntakeTurn)
        .filter(IntakeTurn.visit_id == id)
        .order_by(IntakeTurn.id.asc())
        .all()
    )

    # Fetch all extracted documents for this visit
    documents = (
        db.query(DocumentRecord)
        .filter(DocumentRecord.visit_id == id)
        .order_by(DocumentRecord.created_at.asc())
        .all()
    )

    # If neither turns nor documents exist, check if we have any data
    if not turns and not documents:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot generate draft for visit {id}: No intake transcript turns or medical documents found.",
        )

    # Call Gemini synthesis service
    content_dict, source_links_dict = generate_soap_case_draft(
        visit=visit,
        turns=turns,
        documents=documents,
    )

    # Save to case_drafts table (update if already exists, else create)
    draft = db.query(CaseDraft).filter(CaseDraft.visit_id == id).first()
    if draft:
        draft.content_json = content_dict
        draft.source_links_json = source_links_dict
        draft.is_approved = False
        draft.approved_at = None
        draft.approved_by = None
    else:
        draft = CaseDraft(
            visit_id=id,
            content_json=content_dict,
            source_links_json=source_links_dict,
            is_approved=False,
        )
        db.add(draft)

    # Update visit status
    visit.status = "draft_generated"
    db.commit()
    db.refresh(draft)

    patient_name = visit.patient.name if visit.patient else None

    return CaseDraftResponse(
        draft_id=draft.id,
        visit_id=draft.visit_id,
        content=SOAPContent.model_validate(content_dict),
        source_links=source_links_dict,
        patient_name=patient_name,
        is_approved=draft.is_approved,
        approved_at=draft.approved_at,
        approved_by=draft.approved_by,
        created_at=datetime.now(timezone.utc),
    )


# ---------------------------------------------------------------------------
# GET /api/visits/{id}/case
# ---------------------------------------------------------------------------
@router.get("/{id}/case", response_model=CaseContextResponse)
@router.get("/{id}/case-context", response_model=CaseContextResponse)
def get_case_context(id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_staff)):
    """
    Returns the complete case context for visit {id}, including patient info,
    current case draft (if generated), all intake turns, and uploaded documents with base64 images.
    Used by the review and doctor dashboard screens.
    """
    visit = db.query(Visit).filter(Visit.id == id).first()
    if not visit:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Visit with ID {id} not found.",
        )

    patient = visit.patient
    patient_dict = {
        "id": patient.id if patient else None,
        "name": patient.name if patient else "Unknown Patient",
        "age": patient.age if patient else None,
        "language": patient.language if patient else "en",
    }

    # Fetch turns
    turns = (
        db.query(IntakeTurn)
        .filter(IntakeTurn.visit_id == id)
        .order_by(IntakeTurn.id.asc())
        .all()
    )
    turns_list = [
        {
            "id": t.id,
            "step": t.step,
            "question": t.question,
            "transcript": t.transcript,
            "language": t.language,
            "created_at": t.created_at.isoformat() if t.created_at else None,
        }
        for t in turns
    ]

    # Fetch documents across DocumentRecord and PatientDocument
    doc_filter = (DocumentRecord.visit_id == id)
    if visit.patient_id:
        doc_filter = (DocumentRecord.patient_id == visit.patient_id) | (DocumentRecord.visit_id == id)

    doc_records = (
        db.query(DocumentRecord)
        .filter(doc_filter)
        .order_by(DocumentRecord.created_at.desc(), DocumentRecord.id.desc())
        .all()
    )

    patient_docs = []
    if getattr(visit, "patient_profile_id", None):
        patient_docs = (
            db.query(PatientDocument)
            .filter(
                (PatientDocument.patient_profile_id == visit.patient_profile_id) |
                (PatientDocument.visit_id == id)
            )
            .order_by(PatientDocument.uploaded_at.desc(), PatientDocument.id.desc())
            .all()
        )

    docs_list = []
    seen_ids = set()

    for d in doc_records:
        key = f"doc_{d.id}_{d.filename}"
        if key not in seen_ids:
            seen_ids.add(key)
            docs_list.append({
                "id": d.id,
                "filename": d.filename,
                "mime_type": d.mime_type,
                "label": d.label,
                "extracted_json": d.extracted_json,
                "raw_text": d.raw_text,
                "image_base64": d.image_base64,
                "file_url": d.file_url or f"/api/documents/{d.id}/raw",
                "download_url": f"/api/documents/{d.id}/download",
                "created_at": d.created_at.isoformat() if d.created_at else None,
            })

    for p in patient_docs:
        key = f"pdoc_{p.id}_{p.filename}"
        if key not in seen_ids:
            seen_ids.add(key)
            docs_list.append({
                "id": p.id,
                "patient_profile_id": p.patient_profile_id,
                "filename": p.filename,
                "mime_type": p.mime_type,
                "label": p.label,
                "image_base64": p.image_base64,
                "uploaded_by": p.uploaded_by,
                "file_url": p.file_url or f"/api/documents/{p.id}/raw",
                "download_url": f"/api/documents/{p.id}/download",
                "created_at": p.uploaded_at.isoformat() if p.uploaded_at else None,
            })

    # Fetch draft
    draft_record = db.query(CaseDraft).filter(CaseDraft.visit_id == id).first()
    draft_resp = None
    is_approved = False
    approved_at = None
    approved_by = None

    if draft_record and draft_record.content_json:
        is_approved = bool(draft_record.is_approved)
        approved_at = draft_record.approved_at
        approved_by = draft_record.approved_by
        draft_resp = CaseDraftResponse(
            draft_id=draft_record.id,
            visit_id=draft_record.visit_id,
            content=SOAPContent.model_validate(draft_record.content_json),
            source_links=draft_record.source_links_json or {},
            patient_name=patient_dict["name"],
            is_approved=is_approved,
            approved_at=approved_at,
            approved_by=approved_by,
            created_at=datetime.now(timezone.utc),
        )

    visit_dict = {
        "id": visit.id,
        "patient_id": visit.patient_id,
        "status": visit.status,
        "urgency_flag": visit.urgency_flag,
        "department": visit.department,
        "urgency_reason": visit.urgency_reason,
        "consent_given": getattr(visit, "consent_given", False),
        "consent_timestamp": visit.consent_timestamp.isoformat() if getattr(visit, "consent_timestamp", None) else None,
        "created_at": getattr(visit, "created_at", None),
    }

    return CaseContextResponse(
        visit_id=visit.id,
        visit=visit_dict,
        patient=patient_dict,
        draft=draft_resp,
        turns=turns_list,
        transcripts=turns_list,
        documents=docs_list,
        urgency_flag=visit.urgency_flag,
        department=visit.department,
        urgency_reason=visit.urgency_reason,
        consent_given=bool(getattr(visit, "consent_given", False)),
        consent_timestamp=getattr(visit, "consent_timestamp", None),
        is_approved=is_approved,
        approved_at=approved_at,
        approved_by=approved_by,
        status=visit.status,
    )


# ---------------------------------------------------------------------------
# PUT /api/visits/{id}/case-draft and /api/visits/{id}/draft (Doctor Inline Editing)
# ---------------------------------------------------------------------------
@router.put("/{id}/case-draft", response_model=CaseDraftResponse)
@router.put("/{id}/draft", response_model=CaseDraftResponse)
def update_case_draft(
    id: int,
    payload: CaseDraftUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_doctor),
):
    """
    Allows a doctor to modify any field in the generated SOAP draft inline.
    Updates the content_json and optional source_links_json in the case_drafts table.
    """
    visit = db.query(Visit).filter(Visit.id == id).first()
    if not visit:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Visit with ID {id} not found.",
        )

    draft = db.query(CaseDraft).filter(CaseDraft.visit_id == id).first()
    if draft and draft.is_approved:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot edit an approved case draft. The draft is locked as final.",
        )

    if not draft:
        # Create draft if not existing yet
        draft = CaseDraft(
            visit_id=id,
            content_json=payload.content.model_dump(),
            source_links_json=payload.source_links or {},
            is_approved=False,
        )
        db.add(draft)
    else:
        draft.content_json = payload.content.model_dump()
        if payload.source_links is not None:
            draft.source_links_json = payload.source_links

    if visit.status != "approved":
        visit.status = "draft_modified"

    db.commit()
    db.refresh(draft)

    return CaseDraftResponse(
        draft_id=draft.id,
        visit_id=draft.visit_id,
        content=SOAPContent.model_validate(draft.content_json),
        source_links=draft.source_links_json or {},
        patient_name=visit.patient.name if visit.patient else None,
        is_approved=draft.is_approved,
        approved_at=draft.approved_at,
        approved_by=draft.approved_by,
        created_at=datetime.now(timezone.utc),
    )


# ---------------------------------------------------------------------------
# POST /api/visits/{id}/approve (Doctor Final Approval & Locking)
# ---------------------------------------------------------------------------
@router.post("/{id}/approve", response_model=Dict[str, Any])
def approve_case_draft(
    id: int,
    body: Optional[ApproveDraftRequest] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_doctor),
):
    """
    Approve the case draft and lock it as final.
    Sets visit status to "approved" and locks the draft as final.
    Nothing should be treated as final until this happens.
    """
    visit = db.query(Visit).filter(Visit.id == id).first()
    if not visit:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Visit with ID {id} not found.",
        )

    draft = db.query(CaseDraft).filter(CaseDraft.visit_id == id).first()
    if not draft:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot approve visit without a generated case draft.",
        )

    doctor_name = (
        (body.approved_by if body and body.approved_by else None)
        or (body.doctor_name if body and body.doctor_name else None)
        or "Dr. Physician"
    ).strip()
    now = datetime.now(timezone.utc)

    # Set approved status and lock draft
    visit.status = "approved"
    draft.is_approved = True
    draft.approved_at = now
    draft.approved_by = doctor_name

    # Create consultation record for patient profile if associated
    if getattr(visit, "patient_profile_id", None):
        from app.models.consultation import Consultation
        notes_val = getattr(body, "notes", None) if body else None
        consultation = Consultation(
            patient_profile_id=visit.patient_profile_id,
            doctor_id=getattr(current_user, "id", None),
            doctor_name=doctor_name,
            visit_id=visit.id,
            consultation_date=now,
            consultation_time=now.strftime("%I:%M %p"),
            notes=notes_val or f"Case draft reviewed and approved as final by {doctor_name}.",
            case_draft_id=draft.id,
        )
        db.add(consultation)

    db.commit()
    db.refresh(visit)
    db.refresh(draft)

    return {
        "visit_id": visit.id,
        "visit_status": visit.status,
        "status": visit.status,
        "is_approved": True,
        "approved_at": now.isoformat(),
        "approved_by": doctor_name,
        "message": f"Case draft for Visit #{visit.id} approved and locked as final by {doctor_name}.",
    }


# ---------------------------------------------------------------------------
# GET /api/visits/doctor-queue
# ---------------------------------------------------------------------------
@router.get("/doctor-queue", response_model=List[Dict[str, Any]])
def get_doctor_queue(
    filter_status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff),
):
    """
    Returns all visits for the Doctor Dashboard (/doctor).
    Lists all visits with draft status, patient info, urgency flags, and approval state.
    """
    query = db.query(Visit).order_by(Visit.id.desc())

    if filter_status == "pending":
        query = query.filter(Visit.status != "approved")
    elif filter_status == "approved":
        query = query.filter(Visit.status == "approved")

    visits = query.all()
    results = []
    for v in visits:
        draft = db.query(CaseDraft).filter(CaseDraft.visit_id == v.id).first()
        has_draft = draft is not None and draft.content_json is not None
        is_approved = bool(draft.is_approved) if draft else (v.status == "approved")
        turn_count = db.query(IntakeTurn.id).filter(IntakeTurn.visit_id == v.id).count()
        doc_count = db.query(DocumentRecord.id).filter(DocumentRecord.visit_id == v.id).count()

        chief_complaint = None
        if draft and draft.content_json:
            cc_data = draft.content_json.get("chief_complaint")
            if isinstance(cc_data, list) and len(cc_data) > 0 and isinstance(cc_data[0], dict):
                chief_complaint = cc_data[0].get("fact")
            elif isinstance(cc_data, str):
                chief_complaint = cc_data
            elif isinstance(draft.content_json.get("subjective"), list) and len(draft.content_json.get("subjective")) > 0:
                chief_complaint = draft.content_json.get("subjective")[0].get("fact")

        results.append({
            "id": v.id,
            "visit_id": v.id,
            "patient_id": v.patient_id,
            "patient_name": v.patient.name if v.patient else "Unknown Patient",
            "patient_age": v.patient.age if v.patient else None,
            "language": v.patient.language if v.patient else "en",
            "status": v.status,
            "urgency_flag": v.urgency_flag,
            "department": v.department or "General Medicine",
            "urgency_reason": v.urgency_reason,
            "consent_given": bool(getattr(v, "consent_given", False)),
            "consent_timestamp": v.consent_timestamp.isoformat() if getattr(v, "consent_timestamp", None) else None,
            "has_draft": has_draft,
            "chief_complaint": chief_complaint,
            "is_approved": is_approved,
            "approved_at": draft.approved_at.isoformat() if draft and draft.approved_at else None,
            "approved_by": draft.approved_by if draft else None,
            "turn_count": turn_count,
            "doc_count": doc_count,
            "created_at": getattr(v, "created_at", None),
        })
    return results


# ---------------------------------------------------------------------------
# GET /api/visits/triage
# ---------------------------------------------------------------------------
@router.get("/triage", response_model=List[Dict[str, Any]])
def get_triage_feed(
    department: Optional[str] = None,
    all_visits: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff),
):
    """
    Returns real-time triage queue for clinical staff.
    By default returns all urgent visits (urgency_flag == True), ordered newest first.
    """
    query = db.query(Visit)
    if not all_visits:
        query = query.filter(Visit.urgency_flag == True)  # noqa: E712
    if department:
        query = query.filter(Visit.department.ilike(f"%{department}%"))

    urgent_visits = query.order_by(Visit.id.desc()).all()
    results = []
    for v in urgent_visits:
        latest_turn = (
            db.query(IntakeTurn)
            .filter(IntakeTurn.visit_id == v.id, IntakeTurn.transcript != None)  # noqa: E711
            .order_by(IntakeTurn.id.desc())
            .first()
        )
        turn_count = db.query(IntakeTurn.id).filter(IntakeTurn.visit_id == v.id).count()
        doc_count = db.query(DocumentRecord.id).filter(DocumentRecord.visit_id == v.id).count()
        draft = db.query(CaseDraft).filter(CaseDraft.visit_id == v.id).first()
        has_draft = draft is not None and draft.content_json is not None
        is_approved = bool(draft.is_approved) if draft else (v.status == "approved")

        results.append({
            "visit_id": v.id,
            "patient_id": v.patient_id,
            "patient_name": v.patient.name if v.patient else "Unknown",
            "patient_age": v.patient.age if v.patient else None,
            "language": v.patient.language if v.patient else "en",
            "status": v.status,
            "urgency_flag": v.urgency_flag,
            "department": v.department or "General Medicine",
            "urgency_reason": v.urgency_reason or "Urgent clinical attention flagged",
            "latest_step": latest_turn.step if latest_turn else None,
            "latest_transcript": latest_turn.transcript if latest_turn else None,
            "has_draft": has_draft,
            "is_approved": is_approved,
            "turn_count": turn_count,
            "doc_count": doc_count,
        })
    return results


# ---------------------------------------------------------------------------
# PATCH /api/visits/{id}/triage
# ---------------------------------------------------------------------------
@router.patch("/{id}/triage", response_model=Dict[str, Any])
def update_visit_triage(
    id: int,
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff),
):
    """
    Update visit triage status, urgency, or assigned department.
    Allows clinical staff to mark a case as triaged/reviewed or re-assign department.
    """
    visit = db.query(Visit).filter(Visit.id == id).first()
    if not visit:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Visit with ID {id} not found.",
        )

    if "urgency_flag" in payload:
        visit.urgency_flag = bool(payload["urgency_flag"])
    if "department" in payload:
        visit.department = str(payload["department"])
    if "status" in payload:
        visit.status = str(payload["status"])
    if "urgency_reason" in payload:
        visit.urgency_reason = str(payload["urgency_reason"])

    db.commit()
    db.refresh(visit)

    return {
        "visit_id": visit.id,
        "patient_name": visit.patient.name if visit.patient else "Unknown",
        "status": visit.status,
        "urgency_flag": visit.urgency_flag,
        "department": visit.department,
        "urgency_reason": visit.urgency_reason,
        "message": "Triage status updated successfully.",
    }


# ---------------------------------------------------------------------------
# GET /api/visits
# ---------------------------------------------------------------------------
@router.get("", response_model=List[Dict[str, Any]])
def list_visits(db: Session = Depends(get_db), current_user: User = Depends(get_current_staff)):
    """Return a list of recent visits with patient info, draft status, and summary counts."""
    visits = db.query(Visit).order_by(Visit.id.desc()).limit(20).all()
    results = []
    for v in visits:
        draft = db.query(CaseDraft).filter(CaseDraft.visit_id == v.id).first()
        has_draft = draft is not None and draft.content_json is not None
        is_approved = bool(draft.is_approved) if draft else (v.status == "approved")
        turn_count = (
            db.query(IntakeTurn.id).filter(IntakeTurn.visit_id == v.id).count()
        )
        doc_count = (
            db.query(DocumentRecord.id)
            .filter(DocumentRecord.visit_id == v.id)
            .count()
        )
        results.append({
            "visit_id": v.id,
            "patient_id": v.patient_id,
            "patient_name": v.patient.name if v.patient else "Unknown",
            "patient_age": v.patient.age if v.patient else None,
            "language": v.patient.language if v.patient else "en",
            "status": v.status,
            "urgency_flag": v.urgency_flag,
            "department": v.department,
            "urgency_reason": v.urgency_reason,
            "has_draft": has_draft,
            "is_approved": is_approved,
            "turn_count": turn_count,
            "doc_count": doc_count,
        })
    return results
