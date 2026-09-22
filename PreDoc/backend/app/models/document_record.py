from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy import JSON
from sqlalchemy.sql import func
from app.database import Base


class DocumentRecord(Base):
    __tablename__ = "document_records"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    visit_id = Column(
        Integer,
        ForeignKey("visits.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    filename = Column(String(512), nullable=False)
    mime_type = Column(String(100), nullable=False, default="image/jpeg")

    # Structured extraction from Gemini Vision
    # {
    #   "drug_names": [{"name": str, "dosage": str, "dosage_normalized": {"value": float, "unit": str}}],
    #   "diagnoses": [str],
    #   "dates": [{"label": str, "value": str (ISO 8601 or best-effort)}],
    #   "measurements": [{"type": str, "raw": str, ...normalized fields}]
    # }
    extracted_json = Column(JSON, nullable=True)

    # Raw Gemini text output before JSON parsing (useful for debugging)
    raw_text = Column(Text, nullable=True)

    # Base64 encoded preview/image data for side-by-side doctor review
    image_base64 = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationship
    visit = relationship("Visit", back_populates="document_records")

    def __repr__(self) -> str:
        return f"<DocumentRecord(id={self.id}, visit_id={self.visit_id}, filename='{self.filename}')>"
