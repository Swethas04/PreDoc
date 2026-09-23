from typing import Literal, Optional, List
from pydantic import BaseModel
from datetime import datetime


class StartIntakeRequest(BaseModel):
    patient_name: str
    patient_age: Optional[int] = None
    language: Literal["en", "hi"] = "en"
    consent_given: bool = True
    consent_timestamp: Optional[datetime] = None
    patient_code: Optional[str] = None  # for returning patient
    pin: Optional[str] = None           # for returning patient


class ConsentUpdateRequest(BaseModel):
    consent_given: bool = True
    consent_timestamp: Optional[datetime] = None


class StartIntakeResponse(BaseModel):
    visit_id: int
    visit_token: Optional[str] = None
    patient_id: int
    patient_code: Optional[str] = None
    pin: Optional[str] = None            # returned once for new patients; None for returning
    is_returning: bool = False
    patient_token: Optional[str] = None  # JWT for the patient session
    language: str
    first_step: str
    first_question: str
    steps: List[str]
    message: str
    input_type: str = "options"  # "options", "yesno", "text"
    step_input_types: Optional[dict[str, str]] = None
    consent_given: bool = True
    consent_timestamp: Optional[datetime] = None


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
    # Adaptive questioning: list of step IDs to inject after 'duration' (e.g. ["fever_details"])
    # Only populated when step == "chief_complaint" and relevant symptoms detected in voice transcript
    suggested_adaptive_steps: Optional[List[str]] = None


class IntakeTurnsResponse(BaseModel):
    visit_id: int
    turns: List[IntakeTurnRead]
    total: int
