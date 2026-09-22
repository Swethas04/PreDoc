from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class IntakeTurn(Base):
    __tablename__ = "intake_turns"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    visit_id = Column(
        Integer,
        ForeignKey("visits.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    step = Column(String(50), nullable=False)          # e.g. "chief_complaint"
    question = Column(Text, nullable=False)            # AI question asked to patient
    transcript = Column(Text, nullable=True)           # Patient's transcribed response
    language = Column(String(10), nullable=False, default="en")  # "en" or "hi"
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationship
    visit = relationship("Visit", back_populates="intake_turns")

    def __repr__(self) -> str:
        return f"<IntakeTurn(id={self.id}, visit_id={self.visit_id}, step='{self.step}', lang='{self.language}')>"
