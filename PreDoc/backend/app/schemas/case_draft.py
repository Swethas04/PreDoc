from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from datetime import datetime


class SourceReference(BaseModel):
    model_config = {"extra": "allow"}
    type: Optional[str] = "transcript"
    id: Optional[int] = None
    label: Optional[str] = None
    quote: Optional[str] = None
    turn_index: Optional[int] = None
    filename: Optional[str] = None


class SOAPItem(BaseModel):
    model_config = {"extra": "allow"}
    fact: Optional[str] = None
    finding: Optional[str] = None
    diagnosis: Optional[str] = None
    step: Optional[str] = None
    category: Optional[str] = None
    source: Optional[Dict[str, Any]] = None


class SOAPContent(BaseModel):
    model_config = {"extra": "allow"}
    chief_complaint: Optional[str] = None
    subjective: List[SOAPItem] = Field(default_factory=list)
    objective: List[SOAPItem] = Field(default_factory=list)
    assessment: List[SOAPItem] = Field(default_factory=list)
    plan: List[SOAPItem] = Field(default_factory=list)
    clinical_summary: Optional[str] = None


class CaseDraftResponse(BaseModel):
    model_config = {"extra": "allow"}
    draft_id: int
    visit_id: int
    content: SOAPContent
    source_links: Dict[str, Any] = Field(default_factory=dict)
    patient_name: Optional[str] = None
    is_approved: bool = False
    approved_at: Optional[datetime] = None
    approved_by: Optional[str] = None
    created_at: Optional[datetime] = None


class CaseDraftUpdateRequest(BaseModel):
    model_config = {"extra": "allow"}
    content: SOAPContent
    source_links: Optional[Dict[str, Any]] = None


class ApproveDraftRequest(BaseModel):
    model_config = {"extra": "allow"}
    doctor_name: Optional[str] = "Dr. Reviewer"
    approved_by: Optional[str] = None
    notes: Optional[str] = None


class CaseContextResponse(BaseModel):
    model_config = {"extra": "allow"}
    visit_id: int
    visit: Optional[Dict[str, Any]] = None
    patient: Dict[str, Any]
    draft: Optional[CaseDraftResponse] = None
    turns: List[Dict[str, Any]] = Field(default_factory=list)
    transcripts: Optional[List[Dict[str, Any]]] = None
    documents: List[Dict[str, Any]] = Field(default_factory=list)
    urgency_flag: bool = False
    department: Optional[str] = None
    urgency_reason: Optional[str] = None
    is_approved: bool = False
    approved_at: Optional[datetime] = None
    approved_by: Optional[str] = None
    status: str = "pending"
