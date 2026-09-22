import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import init_db, seed_staff_users
from app.routers.health import router as health_router
from app.routers.intake import router as intake_router
from app.routers.documents import router as documents_router
from app.routers.visits import router as visits_router
from app.routers.auth import router as auth_router
from app.routers.patient_profiles import router as patient_profiles_router
from app.routers.consultations import router as consultations_router
from app.routers.prescriptions import router as prescriptions_router

logger = logging.getLogger("predoc.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize DB tables and migrations
    init_db()
    logger.info("[Startup] Database initialized.")
    # Seed demo staff accounts (idempotent)
    seed_staff_users()
    gemini_key = settings.GEMINI_API_KEY
    if gemini_key:
        logger.info("[Startup] Gemini API Key is loaded (length: %d, prefix: %s...)", len(gemini_key), gemini_key[:8])
    else:
        logger.warning("[Startup] WARNING: GEMINI_API_KEY is empty or missing in .env!")
    logger.info("[Startup] CORS enabled for origins: %s and localhost/127.0.0.1 regex", settings.CORS_ORIGINS)
    yield


app = FastAPI(
    title=settings.APP_NAME,
    version="0.1.0",
    description="PreDoc Clinical Pre-Consultation Backend API",
    lifespan=lifespan,
)

# CORS Middleware configuration
cors_origins = settings.CORS_ORIGINS if isinstance(settings.CORS_ORIGINS, list) else [settings.CORS_ORIGINS]
# Ensure localhost/127.0.0.1 origins are present
for dev_origin in ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000", "http://127.0.0.1:3000"]:
    if dev_origin not in cors_origins:
        cors_origins.append(dev_origin)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth_router)
app.include_router(health_router)
app.include_router(intake_router)
app.include_router(documents_router)
app.include_router(visits_router)
app.include_router(patient_profiles_router)
app.include_router(consultations_router)
app.include_router(prescriptions_router)

# Mount static uploads directory for direct browser viewing
from fastapi.staticfiles import StaticFiles
from app.services.document_storage import UPLOAD_DIR
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


@app.post("/api/seed-demo-data")
def trigger_seed_demo_data():
    """Trigger seeding of 3 realistic demo patients into the active database."""
    try:
        from seed_demo_data import seed_demo_patients
        result = seed_demo_patients()
        return result
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.get("/")
def root():
    return {
        "message": "Welcome to PreDoc API",
        "docs_url": "/docs",
        "health_check": "/api/health",
        "seed_demo_data": "POST /api/seed-demo-data",
    }
