from typing import Optional, List, Any
from pydantic import BaseModel
from datetime import datetime


class MedicineItem(BaseModel):
    id: Optional[str] = None
    name: str
    composition: Optional[str] = ""
    dosage: Optional[str] = ""
    frequency: Optional[str] = "1-0-1 (Twice daily)"
    duration: Optional[str] = "5 days"
    instructions: Optional[str] = "After food"
    manufacturer: Optional[str] = ""
    image_url: Optional[str] = ""


class PrescriptionCreate(BaseModel):
    doctor_name: Optional[str] = "Dr. Attending Physician"
    diagnosis: Optional[str] = ""
    medicines: List[MedicineItem] = []
    general_advice: Optional[str] = ""
    follow_up: Optional[str] = ""


class PrescriptionResponse(BaseModel):
    id: int
    visit_id: int
    patient_id: Optional[int] = None
    doctor_name: Optional[str] = None
    diagnosis: Optional[str] = None
    medicines: List[MedicineItem]
    general_advice: Optional[str] = None
    follow_up: Optional[str] = None
    share_token: Optional[str] = None
    token_expires_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PublicPrescriptionView(BaseModel):
    id: int
    visit_id: int
    share_token: str
    patient_name: str = "Patient"
    patient_code: Optional[str] = None
    patient_age: Optional[int] = None
    patient_gender: Optional[str] = None
    doctor_name: Optional[str] = "Dr. Attending Physician"
    diagnosis: Optional[str] = None
    medicines: List[MedicineItem] = []
    general_advice: Optional[str] = None
    follow_up: Optional[str] = None
    issued_at: datetime
    expires_at: Optional[datetime] = None
    is_expired: bool = False
    is_verified: bool = True
    clinic_name: str = "PreDoc Healthcare Center"
    clinic_department: str = "Department of Internal Medicine & Clinical Triage"

    model_config = {"from_attributes": True}



class MedicineSearchResult(BaseModel):
    name: str
    composition: str
    dosage: str
    uses: str
    side_effects: Optional[str] = ""
    manufacturer: Optional[str] = ""
    image_url: Optional[str] = ""
