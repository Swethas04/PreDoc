from typing import Literal, Optional, List
from pydantic import BaseModel
from datetime import datetime


class StartIntakeRequest(BaseModel):
    patient_name: str
    patient_age: Optional[int] = None
    language: Literal["en", "hi"] = "en"


class StartIntakeResponse(BaseModel):
    visit_id: int
    patient_id: int
    language: str
    first_step: str
    first_question: str
    steps: List[str]
    message: str
    input_type: str = "options"  # "options", "yesno", "text"
    step_input_types: Optional[dict[str, str]] = None


class IntakeTurnRead(BaseModel):
    id: int
    visit_id: int
    step: str
    question: str
    transcript: Optional[str]
    language: str
    created_at: Optional[datetime]

    model_config = {"from_attributes": True}


class UpdatePatientRequest(BaseModel):
    name: Optional[str] = None
    age: Optional[int] = None
    language: Optional[str] = None


class ParseDemographicsResponse(BaseModel):
    name: Optional[str] = None
    age: Optional[int] = None
    raw_transcript: str
    is_inaudible: bool = False


class IntakeRespondResponse(BaseModel):
    visit_id: int
    step: str
    question: str
    transcript: str
    language: str
    next_step: Optional[str]
    next_question: Optional[str]
    is_complete: bool
    turn_id: int
    urgency_flag: bool = False
    department: Optional[str] = None
    urgency_reason: Optional[str] = None
    matched_triggers: Optional[List[str]] = None
    is_inaudible: bool = False
    input_type: str = "text"  # "options", "yesno", "text"
    next_input_type: Optional[str] = None  # "options", "yesno", "text"


class IntakeTurnsResponse(BaseModel):
    visit_id: int
    turns: List[IntakeTurnRead]
    total: int
