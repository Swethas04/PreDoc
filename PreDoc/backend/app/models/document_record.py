from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class DocumentRecord(Base):
    __tablename__ = "document_records"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    patient_id = Column(
        Integer,
        ForeignKey("patients.id", ondelete="CASCADE"),
        nullable=True,
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

    # File paths & static URL
    file_url = Column(String(1024), nullable=True)
    file_path = Column(String(1024), nullable=True)

    # Base64 encoded file/image data for viewing
    image_base64 = Column(Text, nullable=True)
    raw_text = Column(Text, nullable=True)
    extracted_json = Column(JSON, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    patient = relationship("Patient", back_populates="document_records")
    visit = relationship("Visit", back_populates="document_records")

    def __repr__(self) -> str:
        return f"<DocumentRecord(id={self.id}, patient_id={self.patient_id}, visit_id={self.visit_id}, filename='{self.filename}', label='{self.label}')>"
