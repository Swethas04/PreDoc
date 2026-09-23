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
            # 20. prescriptions.share_token
            try:
                conn.execute(text("ALTER TABLE prescriptions ADD COLUMN share_token VARCHAR(64)"))
            except Exception:
                pass
            # 21. prescriptions.token_expires_at
            try:
                conn.execute(text("ALTER TABLE prescriptions ADD COLUMN token_expires_at TIMESTAMP"))
            except Exception:
                pass
            # 22. hospital_templates columns
            try:
                conn.execute(text("ALTER TABLE hospital_templates ADD COLUMN preview_image_url VARCHAR(1024)"))
            except Exception:
                pass
            try:
                conn.execute(text("ALTER TABLE hospital_templates ADD COLUMN is_default BOOLEAN DEFAULT 0"))
            except Exception:
                pass

        # 22. SQLite document_records: make visit_id nullable if it was created with NOT NULL
        if "sqlite" in db_url:
            with engine.begin() as conn:
                try:
                    pragma_info = conn.execute(text("PRAGMA table_info(document_records)")).fetchall()
                    visit_id_col = next((c for c in pragma_info if c[1] == "visit_id"), None)
                    if visit_id_col and visit_id_col[3] == 1:  # notnull == 1
                        logger.info("[DB] Migrating SQLite document_records to make visit_id nullable...")
                        conn.execute(text("PRAGMA foreign_keys=off;"))
                        conn.execute(text("""
                            CREATE TABLE IF NOT EXISTS document_records_new (
                                id INTEGER PRIMARY KEY AUTOINCREMENT,
                                patient_id INTEGER,
                                visit_id INTEGER,
                                filename VARCHAR(512) NOT NULL,
                                mime_type VARCHAR(100) NOT NULL DEFAULT 'image/jpeg',
                                label VARCHAR(255),
                                file_url VARCHAR(1024),
                                file_path VARCHAR(1024),
                                image_base64 TEXT,
                                raw_text TEXT,
                                extracted_json JSON,
                                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                                FOREIGN KEY(patient_id) REFERENCES patients(id) ON DELETE CASCADE,
                                FOREIGN KEY(visit_id) REFERENCES visits(id) ON DELETE SET NULL
                            );
                        """))
                        conn.execute(text("""
                            INSERT INTO document_records_new (id, patient_id, visit_id, filename, mime_type, label, file_url, file_path, image_base64, raw_text, extracted_json, created_at)
                            SELECT id, patient_id, visit_id, filename, mime_type, label, file_url, file_path, image_base64, raw_text, extracted_json, created_at FROM document_records;
                        """))
                        conn.execute(text("DROP TABLE document_records;"))
                        conn.execute(text("ALTER TABLE document_records_new RENAME TO document_records;"))
                        conn.execute(text("PRAGMA foreign_keys=on;"))
                        logger.info("[DB] SQLite document_records migration completed successfully.")
                except Exception as ex:
                    logger.warning("[DB] Could not migrate SQLite document_records table: %s", ex)

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
