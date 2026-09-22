from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime


class ConsultationCreate(BaseModel):
    patient_profile_id: int
    doctor_id: Optional[int] = None
    doctor_name: Optional[str] = "Attending Physician"
    visit_id: int
    consultation_date: Optional[datetime] = None
    consultation_time: Optional[str] = None
    notes: Optional[str] = None
    case_draft_id: Optional[int] = None


class ConsultationRead(BaseModel):
    id: int
    patient_profile_id: int
    doctor_id: Optional[int] = None
    doctor_name: str
    visit_id: int
    consultation_date: datetime
    consultation_time: Optional[str] = None
    notes: Optional[str] = None
    case_draft_id: Optional[int] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class ConsultationListResponse(BaseModel):
    patient_profile_id: int
    consultations: List[ConsultationRead]
    total: int
