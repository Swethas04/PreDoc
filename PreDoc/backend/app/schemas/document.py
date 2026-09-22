from typing import Any, Dict, List, Optional
from pydantic import BaseModel
from datetime import datetime


class DrugEntry(BaseModel):
    name: str
    dosage: Optional[str] = None
    dosage_normalized: Optional[Dict[str, Any]] = None
    frequency: Optional[str] = None


class MeasurementEntry(BaseModel):
    type: str
    raw: str
    unit: Optional[str] = None
    # Type-specific normalized fields stored flat in dict
    normalized: Optional[Dict[str, Any]] = None


class DateEntry(BaseModel):
    label: str
    value: str                    # ISO 8601 date string or best-effort
    timestamp_ms: Optional[int] = None   # Unix ms for chart x-axis


class ExtractedData(BaseModel):
    drug_names: List[DrugEntry] = []
    diagnoses: List[str] = []
    dates: List[DateEntry] = []
    measurements: List[MeasurementEntry] = []


class ExtractResponse(BaseModel):
    document_id: int
    visit_id: int
    filename: str
    extracted: ExtractedData
    raw_text: Optional[str] = None
    image_base64: Optional[str] = None


class DocumentRecordRead(BaseModel):
    id: int
    visit_id: int
    filename: str
    mime_type: str
    extracted_json: Optional[Dict[str, Any]] = None
    raw_text: Optional[str] = None
    image_base64: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class DocumentListResponse(BaseModel):
    visit_id: int
    documents: List[DocumentRecordRead]
    total: int
