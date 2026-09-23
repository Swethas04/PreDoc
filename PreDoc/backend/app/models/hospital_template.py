from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, JSON, Boolean, Text
from sqlalchemy.orm import relationship
from app.database import Base


class HospitalTemplate(Base):
    __tablename__ = "hospital_templates"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    doctor_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    hospital_name = Column(String(255), nullable=True, default="PreDoc Medical Center")
    name = Column(String(255), nullable=False, default="Hospital Letterhead")
    template_file_url = Column(String(1024), nullable=False)
    template_file_path = Column(String(1024), nullable=True)
    preview_image_url = Column(String(1024), nullable=True)
    mime_type = Column(String(100), nullable=False, default="image/png")
    page_size = Column(String(20), default="A4")  # "A4" | "LETTER"
    field_positions_json = Column(JSON, nullable=False)  # Dictionary of field {x, y, width, fontSize, ...}
    is_default = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    doctor = relationship("User", foreign_keys=[doctor_id])

    def __repr__(self) -> str:
        return f"<HospitalTemplate(id={self.id}, name='{self.name}', default={self.is_default})>"
