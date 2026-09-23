from typing import Any, Dict, List, Optional
from pydantic import BaseModel, computed_field
from datetime import datetime


class DocumentRecordRead(BaseModel):
    id: int
    patient_id: int
    visit_id: Optional[int] = None
    filename: str
    mime_type: str = "image/jpeg"
    label: Optional[str] = None
    image_base64: Optional[str] = None
    created_at: Optional[datetime] = None

    @computed_field
    @property
    def file_url(self) -> str:
        return f"/api/documents/{self.id}/raw"

    @computed_field
    @property
    def download_url(self) -> str:
        return f"/api/documents/{self.id}/download"

    model_config = {"from_attributes": True}


class DocumentUploadResponse(BaseModel):
    status: str = "success"
    document_id: int
    patient_id: int
    visit_id: Optional[int] = None
    filename: str
    mime_type: str
    label: Optional[str] = None
    image_base64: Optional[str] = None
    file_url: Optional[str] = None
    download_url: Optional[str] = None
    created_at: Optional[datetime] = None
    is_emergency: bool = False
    triage_evaluation: Optional[Dict[str, Any]] = None
    message: str = "Document uploaded and stored successfully."


# Backward-compatible alias for any legacy callers
class ExtractResponse(BaseModel):
    status: str = "success"
    document_id: int
    patient_id: Optional[int] = None
    visit_id: Optional[int] = None
    filename: str
    label: Optional[str] = None
    image_base64: Optional[str] = None
    file_url: Optional[str] = None
    download_url: Optional[str] = None
    created_at: Optional[datetime] = None
    is_emergency: bool = False
    triage_evaluation: Optional[Dict[str, Any]] = None


class DocumentListResponse(BaseModel):
    visit_id: Optional[int] = None
    documents: List[DocumentRecordRead]
    total: int


class PatientDocumentsResponse(BaseModel):
    patient_id: int
    documents: List[DocumentRecordRead]
    total: int
