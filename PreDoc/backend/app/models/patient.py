from sqlalchemy import Column, Integer, String
from sqlalchemy.orm import relationship
from app.database import Base


class Patient(Base):
    __tablename__ = "patients"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(255), nullable=False)
    age = Column(Integer, nullable=True)
    language = Column(String(100), nullable=True)

    # Persistent patient identity (ID + PIN system)
    patient_code = Column(String(12), unique=True, nullable=True, index=True)  # e.g. "PD-A3F9K2"
    pin_hash = Column(String(128), nullable=True)  # bcrypt hash of 4-digit PIN

    # Relationship to visits
    visits = relationship("Visit", back_populates="patient", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<Patient(id={self.id}, name='{self.name}', age={self.age}, patient_code='{self.patient_code}')>"
