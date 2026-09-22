from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class Consultation(Base):
    __tablename__ = "consultations"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    patient_profile_id = Column(
        Integer,
        ForeignKey("patient_profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    doctor_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    doctor_name = Column(String(255), nullable=False, default="Attending Physician")
    visit_id = Column(
        Integer,
        ForeignKey("visits.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    consultation_date = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    consultation_time = Column(String(50), nullable=True)
    notes = Column(Text, nullable=True)
    case_draft_id = Column(
        Integer,
        ForeignKey("case_drafts.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    patient_profile = relationship("PatientProfile", back_populates="consultations")
    doctor = relationship("User", back_populates="consultations_conducted", foreign_keys=[doctor_id])
    visit = relationship("Visit", back_populates="consultations")
    case_draft = relationship("CaseDraft")

    def __repr__(self) -> str:
        return f"<Consultation(id={self.id}, patient_profile_id={self.patient_profile_id}, doctor_name='{self.doctor_name}', visit_id={self.visit_id})>"
