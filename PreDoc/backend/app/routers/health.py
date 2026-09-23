import socket
from fastapi import APIRouter
from app.config import settings
from app.database import check_db_connection
from app.schemas.health import HealthResponse

router = APIRouter(tags=["Health"])


def get_local_lan_ip() -> str:
    """Detect the local machine IP on Wi-Fi/LAN for mobile device connectivity."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.5)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


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


@router.get("/api/network-info")
def get_network_info():
    """Returns local network LAN IP for mobile QR code scanning."""
    local_ip = get_local_lan_ip()
    return {
        "local_ip": local_ip,
        "frontend_port": 5173,
        "backend_port": 8000,
        "base_url": f"http://{local_ip}:5173",
    }

