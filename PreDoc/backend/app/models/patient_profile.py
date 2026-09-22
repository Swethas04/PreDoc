from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class PatientProfile(Base):
    __tablename__ = "patient_profiles"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), unique=True, nullable=True, index=True)
    name = Column(String(255), nullable=False)
    age = Column(Integer, nullable=True)
    gender = Column(String(50), nullable=True)
    phone = Column(String(50), nullable=True)
    language = Column(String(100), nullable=True, default="en")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    user = relationship("User", back_populates="patient_profile")
    documents = relationship(
        "PatientDocument",
        back_populates="patient_profile",
        cascade="all, delete-orphan",
        order_by="desc(PatientDocument.uploaded_at)",
    )
    consultations = relationship(
        "Consultation",
        back_populates="patient_profile",
        cascade="all, delete-orphan",
        order_by="desc(Consultation.consultation_date)",
    )
    visits = relationship("Visit", back_populates="patient_profile", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<PatientProfile(id={self.id}, user_id={self.user_id}, name='{self.name}', age={self.age})>"
