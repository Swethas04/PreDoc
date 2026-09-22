from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from app.database import Base


class CaseDraft(Base):
    __tablename__ = "case_drafts"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    visit_id = Column(Integer, ForeignKey("visits.id", ondelete="CASCADE"), nullable=False, index=True)
    content_json = Column(JSON, nullable=True)
    source_links_json = Column(JSON, nullable=True)
    is_approved = Column(Boolean, default=False, nullable=False)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    approved_by = Column(String(255), nullable=True)

    # Relationship to visit
    visit = relationship("Visit", back_populates="case_drafts")

    def __repr__(self) -> str:
        return f"<CaseDraft(id={self.id}, visit_id={self.visit_id}, is_approved={self.is_approved})>"
