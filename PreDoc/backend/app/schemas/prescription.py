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
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class MedicineSearchResult(BaseModel):
    name: str
    composition: str
    dosage: str
    uses: str
    side_effects: Optional[str] = ""
    manufacturer: Optional[str] = ""
    image_url: Optional[str] = ""
