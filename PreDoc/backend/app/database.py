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

        logger.info("Database tables and column migrations initialized successfully.")
    except Exception as e:
        logger.warning(
            "Could not initialize database tables automatically: %s",
            e,
        )
