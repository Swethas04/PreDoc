import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.patient import Patient
from app.schemas.auth import (
    LoginRequest,
    LoginResponse,
    UserInfo,
    PatientLoginRequest,
    PatientLoginResponse,
    PatientInfo,
)
from app.services.auth import (
    verify_password,
    verify_pin,
    create_access_token,
    create_patient_token,
    get_current_staff,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["Authentication"])


# ---------------------------------------------------------------------------
# POST /api/auth/login  (Staff)
# ---------------------------------------------------------------------------
@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    """
    Authenticate a staff member with username + password.
    Returns a signed JWT on success.
    Passwords are never stored in plaintext (bcrypt hashed).
    """
    user = db.query(User).filter(User.username == body.username).first()
    if not user or not verify_password(body.password, user.password_hash):
        logger.warning("[Auth] Failed login attempt for username: '%s'", body.username)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = create_access_token(user)
    logger.info("[Auth] Successful login: %s (%s)", user.username, user.role)
    return LoginResponse(
        access_token=token,
        token_type="bearer",
        user=UserInfo(id=user.id, username=user.username, role=user.role),
    )


# ---------------------------------------------------------------------------
# POST /api/auth/patient-login  (Patient kiosk — ID + PIN)
# ---------------------------------------------------------------------------
@router.post("/patient-login", response_model=PatientLoginResponse)
def patient_login(body: PatientLoginRequest, db: Session = Depends(get_db)):
    """
    Authenticate a returning patient with their Patient ID (PD-XXXXXX) and 4-digit PIN.
    Uses a generic error message to avoid disclosing whether the ID exists.
    Returns a patient-scoped JWT on success.
    """
    # Normalise code (uppercase, trimmed)
    code = (body.patient_code or "").strip().upper()
    pin = (body.pin or "").strip()

    patient = db.query(Patient).filter(Patient.patient_code == code).first()

    # Generic error — do NOT reveal whether the code exists
    _invalid = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Incorrect Patient ID or PIN. Please try again.",
    )

    if not patient or not patient.pin_hash:
        logger.warning("[Auth] Patient login: unknown code '%s'", code)
        raise _invalid

    if not verify_pin(pin, patient.pin_hash):
        logger.warning("[Auth] Patient login: wrong PIN for code '%s'", code)
        raise _invalid

    token = create_patient_token(patient)
    logger.info("[Auth] Patient authenticated: %s (id=%d)", patient.patient_code, patient.id)

    return PatientLoginResponse(
        access_token=token,
        token_type="bearer",
        patient=PatientInfo(
            id=patient.id,
            patient_code=patient.patient_code,
            name=patient.name,
            age=patient.age,
        ),
    )


# ---------------------------------------------------------------------------
# GET /api/auth/me
# ---------------------------------------------------------------------------
@router.get("/me", response_model=UserInfo)
def get_me(current_user: User = Depends(get_current_staff)):
    """Return the currently authenticated staff user's info."""
    return UserInfo(
        id=current_user.id,
        username=current_user.username,
        role=current_user.role,
    )


# ---------------------------------------------------------------------------
# POST /api/auth/logout
# ---------------------------------------------------------------------------
@router.post("/logout")
def logout():
    """
    Stateless JWT logout: instructs the client to discard its token.
    No server-side token invalidation (hackathon scope).
    """
    return {"message": "Logged out successfully. Please discard your token."}



