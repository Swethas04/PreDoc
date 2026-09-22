from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class PatientDocument(Base):
    __tablename__ = "patient_documents"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    patient_profile_id = Column(
        Integer,
        ForeignKey("patient_profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    visit_id = Column(
        Integer,
        ForeignKey("visits.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    filename = Column(String(512), nullable=False)
    mime_type = Column(String(100), nullable=False, default="image/jpeg")
    label = Column(String(255), nullable=True)
    file_url = Column(String(1024), nullable=True)
    file_path = Column(String(1024), nullable=True)
    image_base64 = Column(Text, nullable=True)
    uploaded_by = Column(String(100), nullable=True, default="patient")  # 'patient', 'doctor', or user_id
    uploaded_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    patient_profile = relationship("PatientProfile", back_populates="documents")
    visit = relationship("Visit", back_populates="patient_documents")

    def __repr__(self) -> str:
        return f"<PatientDocument(id={self.id}, patient_profile_id={self.patient_profile_id}, filename='{self.filename}', label='{self.label}')>"
