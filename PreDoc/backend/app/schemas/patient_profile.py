from typing import Optional, List, Dict, Any
from pydantic import BaseModel, computed_field
from datetime import datetime
from app.schemas.consultation import ConsultationRead


class PatientProfileCreateOrUpdate(BaseModel):
    name: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    phone: Optional[str] = None
    language: Optional[str] = "en"


class PatientProfileRead(BaseModel):
    id: int
    user_id: Optional[int] = None
    name: str
    age: Optional[int] = None
    gender: Optional[str] = None
    phone: Optional[str] = None
    language: Optional[str] = "en"
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class PatientDocumentRead(BaseModel):
    id: int
    patient_profile_id: int
    visit_id: Optional[int] = None
    filename: str
    mime_type: str = "image/jpeg"
    label: Optional[str] = None
    image_base64: Optional[str] = None
    uploaded_by: Optional[str] = "patient"
    uploaded_at: Optional[datetime] = None

    @computed_field
    @property
    def file_url(self) -> str:
        return f"/api/documents/{self.id}/raw"

    @computed_field
    @property
    def download_url(self) -> str:
        return f"/api/documents/{self.id}/download"

    model_config = {"from_attributes": True}


class PatientDocumentUploadResponse(BaseModel):
    status: str = "success"
    id: int
    patient_profile_id: int
    visit_id: Optional[int] = None
    filename: str
    mime_type: str
    label: Optional[str] = None
    image_base64: Optional[str] = None
    file_url: Optional[str] = None
    download_url: Optional[str] = None
    uploaded_by: Optional[str] = "patient"
    uploaded_at: Optional[datetime] = None
    is_emergency: bool = False
    triage_evaluation: Optional[Dict[str, Any]] = None
    message: str = "Document uploaded successfully against patient profile."


class PatientDocumentsListResponse(BaseModel):
    patient_profile_id: int
    documents: List[PatientDocumentRead]
    total: int


class PatientProfileDetailResponse(BaseModel):
    id: int
    user_id: Optional[int] = None
    name: str
    age: Optional[int] = None
    gender: Optional[str] = None
    phone: Optional[str] = None
    language: Optional[str] = "en"
    created_at: Optional[datetime] = None
    documents: List[PatientDocumentRead] = []
    consultations: List[ConsultationRead] = []
    total_visits: int = 0
