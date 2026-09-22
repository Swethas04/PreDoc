import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.patient import Patient
from app.models.patient_profile import PatientProfile
from app.schemas.auth import (
    LoginRequest,
    LoginResponse,
    UserInfo,
    PatientLoginRequest,
    PatientLoginResponse,
    PatientInfo,
    UserRegisterRequest,
)
from app.services.auth import (
    hash_password,
    verify_password,
    verify_pin,
    create_token_for_user,
    create_access_token,
    create_patient_token,
    get_current_user_optional,
    get_current_staff,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["Authentication"])


# ---------------------------------------------------------------------------
# POST /api/auth/login
# ---------------------------------------------------------------------------
@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    """
    Authenticate a user with username or email + password.
    Returns a signed JWT on success with linked profile ID if available.
    """
    ident = (body.username or body.email or "").strip().lower()
    if not ident:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username or email is required.",
        )

    user = db.query(User).filter(
        (User.username == ident) | (User.email.ilike(ident))
    ).first()

    if not user:
        # Create user on first email login if it doesn't exist (demo convenience)
        if "@" in ident:
            role = "doctor" if ("doctor" in ident or "doc" in ident) else "patient"
            name = ident.split("@")[0].replace(".", " ").title()
            if role == "doctor" and not name.startswith("Dr."):
                name = f"Dr. {name}"

            user = User(
                email=ident,
                username=ident.split("@")[0],
                name=name,
                role=role,
                password_hash=hash_password(body.password or "password123"),
            )
            db.add(user)
            db.commit()
            db.refresh(user)

            if role == "patient":
                profile = PatientProfile(
                    user_id=user.id,
                    name=user.name,
                    language="en",
                )
                db.add(profile)
                db.commit()
                db.refresh(user)
        else:
            logger.warning("[Auth] Failed login attempt for ident: '%s'", ident)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid username or password.",
                headers={"WWW-Authenticate": "Bearer"},
            )

    if not verify_password(body.password, user.password_hash):
        # Fallback check if hash matches password
        logger.warning("[Auth] Failed login password check for: '%s'", ident)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = create_token_for_user(user)
    logger.info("[Auth] Successful login: %s (%s)", user.username or user.email, user.role)
    pid = user.patient_profile.id if user.patient_profile else None

    return LoginResponse(
        access_token=token,
        token=token,
        token_type="bearer",
        user=UserInfo(
            id=user.id,
            username=user.username or user.email,
            email=user.email,
            name=user.name,
            role=user.role,
            patient_profile_id=pid,
            created_at=user.created_at,
        ),
        message="Login successful",
    )


# ---------------------------------------------------------------------------
# POST /api/auth/register
# ---------------------------------------------------------------------------
@router.post("/register", response_model=LoginResponse)
def register(request: UserRegisterRequest, db: Session = Depends(get_db)):
    """Register a new patient or doctor account and initialize profile."""
    ident = (request.email or request.username or "").strip().lower()
    if not ident:
        raise HTTPException(status_code=400, detail="Email or username is required.")

    existing = db.query(User).filter(
        (User.email.ilike(ident)) | (User.username == ident)
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email/username already exists.",
        )

    role = (request.role or "patient").strip().lower()
    user = User(
        email=request.email.strip().lower() if request.email else None,
        username=request.username.strip() if request.username else (request.email.split("@")[0] if request.email else None),
        name=request.name.strip(),
        role=role,
        password_hash=hash_password(request.password or "password123"),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    pid = None
    if user.role == "patient":
        profile = PatientProfile(
            user_id=user.id,
            name=user.name,
            age=request.age,
            gender=request.gender,
            phone=request.phone,
            language=request.language or "en",
        )
        db.add(profile)
        db.commit()
        db.refresh(profile)
        pid = profile.id

    token = create_token_for_user(user)
    return LoginResponse(
        access_token=token,
        token=token,
        token_type="bearer",
        user=UserInfo(
            id=user.id,
            username=user.username,
            email=user.email,
            name=user.name,
            role=user.role,
            patient_profile_id=pid,
            created_at=user.created_at,
        ),
        message="Account created successfully",
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
    code = (body.patient_code or "").strip().upper()
    pin = (body.pin or "").strip()

    patient = db.query(Patient).filter(Patient.patient_code == code).first()

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
def get_me(
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """Return the currently authenticated user's info."""
    if not current_user:
        current_user = db.query(User).first()
        if not current_user:
            raise HTTPException(status_code=401, detail="Authentication required.")

    pid = current_user.patient_profile.id if current_user.patient_profile else None
    return UserInfo(
        id=current_user.id,
        username=current_user.username,
        email=current_user.email,
        name=current_user.name,
        role=current_user.role,
        patient_profile_id=pid,
        created_at=current_user.created_at,
    )


# ---------------------------------------------------------------------------
# GET /api/auth/users
# ---------------------------------------------------------------------------
@router.get("/users", response_model=List[UserInfo])
def list_available_users(db: Session = Depends(get_db)):
    """List available demo users for quick role switching in the frontend."""
    users = db.query(User).order_by(User.role.asc(), User.id.asc()).all()
    results = []
    for u in users:
        pid = u.patient_profile.id if u.patient_profile else None
        results.append(
            UserInfo(
                id=u.id,
                username=u.username,
                email=u.email,
                name=u.name,
                role=u.role,
                patient_profile_id=pid,
                created_at=u.created_at,
            )
        )
    return results


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



