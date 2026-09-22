from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    username = Column(String(80), unique=True, nullable=True, index=True)
    email = Column(String(255), unique=True, nullable=True, index=True)
    name = Column(String(255), nullable=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(50), nullable=False, default="nurse")  # "doctor" | "nurse" | "patient"
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Profile & consultation linkages
    patient_profile = relationship("PatientProfile", back_populates="user", uselist=False, cascade="all, delete-orphan")
    consultations_conducted = relationship("Consultation", back_populates="doctor", foreign_keys="Consultation.doctor_id")

    def __repr__(self) -> str:
        ident = self.username or self.email or self.id
        return f"<User(id={self.id}, ident='{ident}', role='{self.role}')>"
