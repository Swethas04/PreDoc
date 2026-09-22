from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base


class Visit(Base):
    __tablename__ = "visits"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    patient_id = Column(Integer, ForeignKey("patients.id", ondelete="CASCADE"), nullable=True, index=True)
    status = Column(String(50), nullable=False, default="pending")
    urgency_flag = Column(Boolean, default=False, nullable=False)
    department = Column(String(100), nullable=True)
    urgency_reason = Column(String(255), nullable=True)
    consent_given = Column(Boolean, default=False, nullable=False)
    consent_timestamp = Column(DateTime, nullable=True)
    # Patient session isolation token (UUID4, generated at intake start)
    visit_token = Column(String(36), unique=True, nullable=True, index=True)

    patient_profile_id = Column(Integer, ForeignKey("patient_profiles.id", ondelete="SET NULL"), nullable=True, index=True)

    # Relationships
    patient = relationship("Patient", back_populates="visits")
    patient_profile = relationship("PatientProfile", back_populates="visits")
    case_drafts = relationship("CaseDraft", back_populates="visit", cascade="all, delete-orphan")
    intake_turns = relationship("IntakeTurn", back_populates="visit", cascade="all, delete-orphan")
    document_records = relationship("DocumentRecord", back_populates="visit", cascade="all, delete-orphan")
    patient_documents = relationship("PatientDocument", back_populates="visit")
    consultations = relationship("Consultation", back_populates="visit", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return (
            f"<Visit(id={self.id}, patient_id={self.patient_id}, status='{self.status}', "
            f"urgency_flag={self.urgency_flag}, department='{self.department}')>"
        )
