from typing import Any, Dict, List, Optional, Union
from pydantic import BaseModel, Field
from datetime import datetime


class SourceReference(BaseModel):
    model_config = {"extra": "allow"}
    type: Optional[str] = "turn"
    id: Optional[int] = None
    label: Optional[str] = None
    quote: Optional[str] = None
    turn_index: Optional[int] = None
    filename: Optional[str] = None


class DraftSectionItem(BaseModel):
    model_config = {"extra": "allow"}
    fact: Optional[str] = None
    finding: Optional[str] = None
    category: Optional[str] = None
    severity: Optional[str] = None
    date: Optional[str] = None
    title: Optional[str] = None
    details: Optional[str] = None
    department: Optional[str] = None
    source: Optional[Dict[str, Any]] = None


# Backward-compatible alias
SOAPItem = DraftSectionItem


class EightSectionDraftContent(BaseModel):
    model_config = {"extra": "allow"}
    clinical_summary: Optional[str] = None
    chief_complaint: Union[List[DraftSectionItem], str, None] = Field(default_factory=list)
    hpi: List[DraftSectionItem] = Field(default_factory=list)
    medical_history: List[DraftSectionItem] = Field(default_factory=list)
    medications: List[DraftSectionItem] = Field(default_factory=list)
    allergies: List[DraftSectionItem] = Field(default_factory=list)
    previous_investigations: List[DraftSectionItem] = Field(default_factory=list)
    timeline: Union[List[Dict[str, Any]], List[DraftSectionItem]] = Field(default_factory=list)
    red_flags: List[DraftSectionItem] = Field(default_factory=list)

    # Backward compatibility fields if needed by legacy callers
    subjective: Optional[List[Any]] = None
    objective: Optional[List[Any]] = None
    assessment: Optional[List[Any]] = None
    plan: Optional[List[Any]] = None


# Backward-compatible alias
SOAPContent = EightSectionDraftContent


class CaseDraftResponse(BaseModel):
    model_config = {"extra": "allow"}
    draft_id: int
    visit_id: int
    content: Union[EightSectionDraftContent, Dict[str, Any]]
    source_links: Dict[str, Any] = Field(default_factory=dict)
    patient_name: Optional[str] = None
    is_approved: bool = False
    approved_at: Optional[datetime] = None
    approved_by: Optional[str] = None
    created_at: Optional[datetime] = None


class CaseDraftUpdateRequest(BaseModel):
    model_config = {"extra": "allow"}
    content: Union[EightSectionDraftContent, Dict[str, Any]]
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
    consent_given: bool = False
    consent_timestamp: Optional[datetime] = None
    is_approved: bool = False
    approved_at: Optional[datetime] = None
    approved_by: Optional[str] = None
    status: str = "pending"
