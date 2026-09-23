import os
import logging
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.hospital_template import HospitalTemplate
from app.schemas.hospital_template import (
    HospitalTemplateCreate,
    HospitalTemplateUpdate,
    HospitalTemplateResponse,
)
from app.services.auth import get_current_actor
from app.services.document_storage import save_file_to_disk, UPLOAD_DIR

logger = logging.getLogger("predoc.templates_router")

router = APIRouter(prefix="/api/templates", tags=["Hospital Templates"])

# Default coordinates (in percentage 0-100%) for standard letterheads
DEFAULT_FIELD_POSITIONS: Dict[str, Dict[str, Any]] = {
    "patient_name": {
        "x": 12.0,
        "y": 18.5,
        "width": 35.0,
        "height": 4.0,
        "fontSize": 11.0,
        "fontColor": "#1A2B4C",
        "label": "Patient Name",
    },
    "age_gender": {
        "x": 12.0,
        "y": 23.0,
        "width": 25.0,
        "height": 4.0,
        "fontSize": 10.0,
        "fontColor": "#475569",
        "label": "Age & Gender",
    },
    "doctor_name": {
        "x": 62.0,
        "y": 18.5,
        "width": 30.0,
        "height": 4.0,
        "fontSize": 11.0,
        "fontColor": "#1A2B4C",
        "label": "Attending Doctor",
    },
    "date": {
        "x": 62.0,
        "y": 23.0,
        "width": 25.0,
        "height": 4.0,
        "fontSize": 10.0,
        "fontColor": "#475569",
        "label": "Prescription Date",
    },
    "visit_id": {
        "x": 62.0,
        "y": 27.5,
        "width": 20.0,
        "height": 4.0,
        "fontSize": 10.0,
        "fontColor": "#2F6FED",
        "label": "Visit / Token #",
    },
    "diagnosis": {
        "x": 12.0,
        "y": 28.5,
        "width": 45.0,
        "height": 5.0,
        "fontSize": 10.0,
        "fontColor": "#1A2B4C",
        "label": "Diagnosis / Impression",
    },
    "medicines_table": {
        "x": 10.0,
        "y": 38.0,
        "width": 80.0,
        "height": 35.0,
        "fontSize": 9.0,
        "fontColor": "#1A2B4C",
        "label": "Medicines & Rx Table",
    },
    "advice": {
        "x": 10.0,
        "y": 78.0,
        "width": 80.0,
        "height": 6.0,
        "fontSize": 9.5,
        "fontColor": "#334155",
        "label": "General / Dietary Advice",
    },
    "follow_up": {
        "x": 10.0,
        "y": 85.0,
        "width": 80.0,
        "height": 5.0,
        "fontSize": 9.5,
        "fontColor": "#334155",
        "label": "Follow-Up Instructions",
    },
}


@router.get("", response_model=List[HospitalTemplateResponse])
def list_templates(
    actor: Optional[dict] = Depends(get_current_actor),
    db: Session = Depends(get_db),
):
    """List all available prescription templates."""
    doctor_id = actor.get("user_id") if actor else None
    query = db.query(HospitalTemplate)
    if doctor_id:
        # Show doctor-specific templates first, followed by default ones
        templates = query.order_by(
            (HospitalTemplate.doctor_id == doctor_id).desc(),
            HospitalTemplate.is_default.desc(),
            HospitalTemplate.id.desc(),
        ).all()
    else:
        templates = query.order_by(HospitalTemplate.is_default.desc(), HospitalTemplate.id.desc()).all()

    return templates


@router.get("/active", response_model=Optional[HospitalTemplateResponse])
def get_active_template(
    actor: Optional[dict] = Depends(get_current_actor),
    db: Session = Depends(get_db),
):
    """Retrieve the current active default prescription letterhead template."""
    doctor_id = actor.get("user_id") if actor else None
    
    # 1. Look for doctor-specific default template
    if doctor_id:
        tmpl = (
            db.query(HospitalTemplate)
            .filter(HospitalTemplate.doctor_id == doctor_id, HospitalTemplate.is_default == True)
            .first()
        )
        if tmpl:
            return tmpl
        
        # 2. Or doctor's most recent template
        tmpl = (
            db.query(HospitalTemplate)
            .filter(HospitalTemplate.doctor_id == doctor_id)
            .order_by(HospitalTemplate.id.desc())
            .first()
        )
        if tmpl:
            return tmpl

    # 3. Global active default template
    tmpl = db.query(HospitalTemplate).filter(HospitalTemplate.is_default == True).first()
    if tmpl:
        return tmpl

    # 4. Any latest template
    return db.query(HospitalTemplate).order_by(HospitalTemplate.id.desc()).first()


@router.post("/upload")
async def upload_letterhead_file(
    file: UploadFile = File(...),
    actor: Optional[dict] = Depends(get_current_actor),
):
    """
    Upload a prescription letterhead file (PNG, JPG, WebP, PDF).
    Saves to the static upload directory and returns file URL, metadata,
    and initial default field coordinates.
    """
    content = await file.read()
    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty.",
        )

    saved = save_file_to_disk(
        file_bytes=content,
        filename=file.filename or "letterhead.png",
        mime_type=file.content_type,
    )

    return {
        "file_url": saved["file_url"],
        "file_path": saved["file_path"],
        "stored_filename": saved["stored_filename"],
        "original_filename": saved["original_filename"],
        "mime_type": saved["mime_type"],
        "file_size": saved["file_size"],
        "default_field_positions": DEFAULT_FIELD_POSITIONS,
    }


@router.post("", response_model=HospitalTemplateResponse)
def create_template(
    payload: HospitalTemplateCreate,
    actor: Optional[dict] = Depends(get_current_actor),
    db: Session = Depends(get_db),
):
    """Create a new hospital prescription template with visual field positions."""
    doctor_id = actor.get("user_id") if actor and actor.get("role") == "doctor" else None

    # If this template is set as default, reset other templates
    if payload.is_default:
        db.query(HospitalTemplate).update({HospitalTemplate.is_default: False})
        db.commit()

    template = HospitalTemplate(
        doctor_id=doctor_id,
        hospital_name=payload.hospital_name or "PreDoc Medical Center",
        name=payload.name or "Hospital Letterhead",
        template_file_url=payload.template_file_url,
        template_file_path=payload.template_file_path,
        preview_image_url=payload.preview_image_url,
        mime_type=payload.mime_type or "image/png",
        page_size=payload.page_size or "A4",
        field_positions_json=payload.field_positions_json or DEFAULT_FIELD_POSITIONS,
        is_default=payload.is_default,
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    logger.info("Created hospital template #%d (%s) is_default=%s", template.id, template.name, template.is_default)
    return template


@router.get("/{template_id}", response_model=HospitalTemplateResponse)
def get_template(
    template_id: int,
    db: Session = Depends(get_db),
):
    """Retrieve a single hospital template by ID."""
    tmpl = db.query(HospitalTemplate).filter(HospitalTemplate.id == template_id).first()
    if not tmpl:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Template with ID {template_id} not found.",
        )
    return tmpl


@router.put("/{template_id}", response_model=HospitalTemplateResponse)
def update_template(
    template_id: int,
    payload: HospitalTemplateUpdate,
    actor: Optional[dict] = Depends(get_current_actor),
    db: Session = Depends(get_db),
):
    """Update dynamic field positions or metadata for a template."""
    tmpl = db.query(HospitalTemplate).filter(HospitalTemplate.id == template_id).first()
    if not tmpl:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Template with ID {template_id} not found.",
        )

    if payload.is_default is True:
        # Reset default on other templates
        db.query(HospitalTemplate).filter(HospitalTemplate.id != template_id).update({HospitalTemplate.is_default: False})

    if payload.name is not None:
        tmpl.name = payload.name
    if payload.hospital_name is not None:
        tmpl.hospital_name = payload.hospital_name
    if payload.field_positions_json is not None:
        tmpl.field_positions_json = payload.field_positions_json
    if payload.page_size is not None:
        tmpl.page_size = payload.page_size
    if payload.is_default is not None:
        tmpl.is_default = payload.is_default

    db.commit()
    db.refresh(tmpl)
    logger.info("Updated hospital template #%d (%s)", tmpl.id, tmpl.name)
    return tmpl


@router.post("/{template_id}/set-default", response_model=HospitalTemplateResponse)
def set_template_default(
    template_id: int,
    db: Session = Depends(get_db),
):
    """Set the specified template as the default active prescription letterhead."""
    tmpl = db.query(HospitalTemplate).filter(HospitalTemplate.id == template_id).first()
    if not tmpl:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Template with ID {template_id} not found.",
        )

    # Reset others
    db.query(HospitalTemplate).update({HospitalTemplate.is_default: False})
    tmpl.is_default = True
    db.commit()
    db.refresh(tmpl)
    return tmpl


@router.delete("/{template_id}")
def delete_template(
    template_id: int,
    db: Session = Depends(get_db),
):
    """Delete a template."""
    tmpl = db.query(HospitalTemplate).filter(HospitalTemplate.id == template_id).first()
    if not tmpl:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Template with ID {template_id} not found.",
        )

    db.delete(tmpl)
    db.commit()
    return {"status": "success", "message": f"Template #{template_id} deleted."}
