import os
import logging
from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker
from app.config import settings

logger = logging.getLogger(__name__)

# SQLAlchemy Declarative Base
Base = declarative_base()

# SQLAlchemy Engine with resilient fallback
connect_args = {}
db_url = settings.DATABASE_URL

if db_url.startswith("sqlite"):
    connect_args["check_same_thread"] = False
    connect_args["timeout"] = 30.0

try:
    db_echo = os.getenv("DB_ECHO", "false").lower() == "true"
    engine = create_engine(
        db_url,
        echo=db_echo,
        connect_args=connect_args,
        pool_pre_ping=True,
    )
    # Test connection if not sqlite
    if not db_url.startswith("sqlite"):
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
except Exception as e:
    logger.warning(
        "Could not connect to configured DATABASE_URL (%s). Falling back to local SQLite: %s",
        db_url,
        e,
    )
    db_url = "sqlite:///./predoc.db"
    connect_args = {"check_same_thread": False, "timeout": 30.0}
    db_echo = os.getenv("DB_ECHO", "false").lower() == "true"
    engine = create_engine(
        db_url,
        echo=db_echo,
        connect_args=connect_args,
    )

# Session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    """Dependency for providing a database session in FastAPI endpoints."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def check_db_connection() -> bool:
    """Utility to test database connectivity without throwing unhandled exceptions."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception as e:
        logger.warning("Database connection check failed: %s", e)
        return False


def init_db():
    """Create database tables and apply lightweight column migrations if needed."""
    try:
        import app.models  # noqa: F401
        Base.metadata.create_all(bind=engine)

        # Apply backward-compatible migrations for SQLite or PostgreSQL
        with engine.begin() as conn:
            # 1. visits.urgency_reason
            try:
                conn.execute(text("ALTER TABLE visits ADD COLUMN urgency_reason VARCHAR(255)"))
            except Exception:
                pass
            # 2. case_drafts.is_approved
            try:
                conn.execute(text("ALTER TABLE case_drafts ADD COLUMN is_approved BOOLEAN DEFAULT 0"))
            except Exception:
                pass
            # 3. case_drafts.approved_at
            try:
                conn.execute(text("ALTER TABLE case_drafts ADD COLUMN approved_at TIMESTAMP"))
            except Exception:
                pass
            # 4. case_drafts.approved_by
            try:
                conn.execute(text("ALTER TABLE case_drafts ADD COLUMN approved_by VARCHAR(255)"))
            except Exception:
                pass
            # 5. document_records.image_base64
            try:
                conn.execute(text("ALTER TABLE document_records ADD COLUMN image_base64 TEXT"))
            except Exception:
                pass
            # 6. visits.consent_given
            try:
                conn.execute(text("ALTER TABLE visits ADD COLUMN consent_given BOOLEAN DEFAULT 0"))
            except Exception:
                pass
            # 7. visits.consent_timestamp
            try:
                conn.execute(text("ALTER TABLE visits ADD COLUMN consent_timestamp TIMESTAMP"))
            except Exception:
                pass
            # 8. visits.visit_token (patient session isolation)
            try:
                conn.execute(text("ALTER TABLE visits ADD COLUMN visit_token VARCHAR(36)"))
            except Exception:
                pass
            # 9. patients.patient_code (PD-XXXXXX unique identity)
            try:
                conn.execute(text("ALTER TABLE patients ADD COLUMN patient_code VARCHAR(12)"))
            except Exception:
                pass
            # 10. patients.pin_hash (bcrypt-hashed 4-digit PIN)
            try:
                conn.execute(text("ALTER TABLE patients ADD COLUMN pin_hash VARCHAR(128)"))
            except Exception:
                pass
            # 11. visits.patient_profile_id
            try:
                conn.execute(text("ALTER TABLE visits ADD COLUMN patient_profile_id INTEGER"))
            except Exception:
                pass
            # 12. users.email
            try:
                conn.execute(text("ALTER TABLE users ADD COLUMN email VARCHAR(255)"))
            except Exception:
                pass
            # 13. users.name
            try:
                conn.execute(text("ALTER TABLE users ADD COLUMN name VARCHAR(255)"))
            except Exception:
                pass
            # 14. users.created_at
            try:
                conn.execute(text("ALTER TABLE users ADD COLUMN created_at TIMESTAMP"))
            except Exception:
                pass
            # 15. document_records.patient_id
            try:
                conn.execute(text("ALTER TABLE document_records ADD COLUMN patient_id INTEGER"))
            except Exception:
                pass
            # 16. document_records.label
            try:
                conn.execute(text("ALTER TABLE document_records ADD COLUMN label VARCHAR(255)"))
            except Exception:
                pass
            # 17. document_records.file_url
            try:
                conn.execute(text("ALTER TABLE document_records ADD COLUMN file_url VARCHAR(1024)"))
            except Exception:
                pass
            # 18. document_records.file_path
            try:
                conn.execute(text("ALTER TABLE document_records ADD COLUMN file_path VARCHAR(1024)"))
            except Exception:
                pass
            # 19. patient_documents.file_path
            try:
                conn.execute(text("ALTER TABLE patient_documents ADD COLUMN file_path VARCHAR(1024)"))
            except Exception:
                pass

        logger.info("Database tables and column migrations initialized successfully.")
    except Exception as e:
        logger.warning(
            "Could not initialize database tables automatically: %s",
            e,
        )


def seed_staff_users() -> None:
    """Seed demo staff accounts (doctor_demo, nurse_demo) if they don't exist."""
    try:
        from app.services.auth import seed_staff_users as _seed
        db = SessionLocal()
        try:
            _seed(db)
        finally:
            db.close()
    except Exception as e:
        logger.warning("[DB] Could not seed staff users: %s", e)
