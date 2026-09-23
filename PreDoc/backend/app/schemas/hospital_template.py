from datetime import datetime
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field, ConfigDict


class FieldPosition(BaseModel):
    x: float = Field(..., description="X coordinate as a percentage of template width (0 to 100)")
    y: float = Field(..., description="Y coordinate as a percentage of template height (0 to 100)")
    width: Optional[float] = Field(None, description="Optional width as percentage of template width")
    height: Optional[float] = Field(None, description="Optional height as percentage of template height")
    fontSize: Optional[float] = Field(None, description="Font size in points")
    fontColor: Optional[str] = Field(None, description="Hex or CSS color")
    label: Optional[str] = Field(None, description="Descriptive label for visual editor")


class HospitalTemplateBase(BaseModel):
    name: str = Field("Main Hospital Letterhead", max_length=255)
    hospital_name: Optional[str] = Field("PreDoc Medical Center", max_length=255)
    template_file_url: str = Field(..., description="URL path to uploaded letterhead file")
    template_file_path: Optional[str] = Field(None, description="Local disk path to file")
    preview_image_url: Optional[str] = Field(None, description="Preview image URL if PDF")
    mime_type: str = Field("image/png", max_length=100)
    page_size: str = Field("A4", description="Page size: A4 or LETTER")
    field_positions_json: Dict[str, Any] = Field(..., description="Positions for each dynamic field")
    is_default: bool = Field(False, description="Whether this is the active default template")


class HospitalTemplateCreate(HospitalTemplateBase):
    pass


class HospitalTemplateUpdate(BaseModel):
    name: Optional[str] = None
    hospital_name: Optional[str] = None
    field_positions_json: Optional[Dict[str, Any]] = None
    page_size: Optional[str] = None
    is_default: Optional[bool] = None


class HospitalTemplateResponse(HospitalTemplateBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    doctor_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime

