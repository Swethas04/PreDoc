from fastapi import APIRouter
from app.config import settings
from app.database import check_db_connection
from app.schemas.health import HealthResponse

router = APIRouter(tags=["Health"])


@router.get("/health", response_model=HealthResponse)
@router.get("/api/health", response_model=HealthResponse)
def get_health():
    """Health-check endpoint returning service health, database, and Gemini key status."""
    db_ok = check_db_connection()
    gemini_key = settings.GEMINI_API_KEY
    has_gemini = bool(gemini_key and len(gemini_key) > 5)
    key_preview = f"{gemini_key[:8]}...({len(gemini_key)} chars)" if has_gemini else "Not set"
    cors_list = settings.CORS_ORIGINS if isinstance(settings.CORS_ORIGINS, list) else [settings.CORS_ORIGINS]

    return HealthResponse(
        status="healthy",
        message="PreDoc backend connected",
        app_name=settings.APP_NAME,
        environment=settings.ENVIRONMENT,
        database_connected=db_ok,
        version="0.1.0",
        gemini_configured=has_gemini,
        gemini_key_preview=key_preview,
        cors_origins=cors_list,
    )
