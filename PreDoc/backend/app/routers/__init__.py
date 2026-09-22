from app.routers.health import router as health_router
from app.routers.intake import router as intake_router
from app.routers.documents import router as documents_router
from app.routers.visits import router as visits_router

__all__ = ["health_router", "intake_router", "documents_router", "visits_router"]

