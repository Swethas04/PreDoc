from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, JSON, Text
from sqlalchemy.orm import relationship
from app.database import Base


class Prescription(Base):
    __tablename__ = "prescriptions"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    visit_id = Column(Integer, ForeignKey("visits.id", ondelete="CASCADE"), nullable=False, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id", ondelete="SET NULL"), nullable=True, index=True)
    doctor_name = Column(String(255), nullable=True, default="Dr. Attending Physician")
    diagnosis = Column(String(500), nullable=True)
    medicines = Column(JSON, nullable=False, default=list)  # List of prescribed medicine items
    general_advice = Column(Text, nullable=True)
    follow_up = Column(String(255), nullable=True)
    share_token = Column(String(64), unique=True, index=True, nullable=True)
    token_expires_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    visit = relationship("Visit", back_populates="prescriptions")
    patient = relationship("Patient", back_populates="prescriptions")

    def __repr__(self) -> str:
        return f"<Prescription(id={self.id}, visit_id={self.visit_id}, doctor='{self.doctor_name}')>"
