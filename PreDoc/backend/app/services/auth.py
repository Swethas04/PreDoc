"""
Authentication service: bcrypt password hashing + JWT token management.

Hackathon scope: HS256 JWT with configurable expiry.
Known limitations: no refresh tokens, no rate limiting, no audit logs.
"""
import logging
import random
import string
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
import bcrypt
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.user import User
from app.schemas.auth import TokenPayload, PatientTokenPayload

logger = logging.getLogger(__name__)

# Bearer token extractor (extracts from Authorization header)
_bearer_scheme = HTTPBearer(auto_error=False)


# ---------------------------------------------------------------------------
# Password helpers (Native bcrypt — never stores plaintext passwords)
# ---------------------------------------------------------------------------

def hash_password(plain: str) -> str:
    """Hash a plaintext password with bcrypt (truncated to 72 bytes per bcrypt spec)."""
    pw_bytes = plain.encode("utf-8")[:72]
    return bcrypt.hashpw(pw_bytes, bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """Verify a plaintext password against a bcrypt hash."""
    try:
        pw_bytes = plain.encode("utf-8")[:72]
        hash_bytes = hashed.encode("utf-8")
        return bcrypt.checkpw(pw_bytes, hash_bytes)
    except Exception as exc:
        logger.warning("[Auth] Password verification failed: %s", exc)
        return False


# PIN helpers (same bcrypt mechanism, 4-digit PINs)
hash_pin = hash_password
verify_pin = verify_password


# ---------------------------------------------------------------------------
# Patient ID helpers
# ---------------------------------------------------------------------------

_CODE_CHARS = string.ascii_uppercase + string.digits  # A-Z 0-9


def generate_patient_code() -> str:
    """Generate a unique-looking PD-XXXXXX code (6 alphanumeric chars)."""
    suffix = "".join(random.choices(_CODE_CHARS, k=6))
    return f"PD-{suffix}"


def generate_pin() -> str:
    """Generate a random 4-digit PIN string."""
    return f"{random.randint(0, 9999):04d}"


# ---------------------------------------------------------------------------
# JWT helpers
# ---------------------------------------------------------------------------

def create_access_token(user: User) -> str:
    """Create a signed JWT for a staff user."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
    payload = {
        "sub": user.username,
        "role": user.role,
        "user_id": user.id,
        "exp": expire,
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_patient_token(patient) -> str:
    """Create a signed JWT for a patient (8-hour expiry, role=patient)."""
    expire = datetime.now(timezone.utc) + timedelta(hours=8)
    payload = {
        "sub": patient.patient_code,
        "role": "patient",
        "patient_id": patient.id,
        "exp": expire,
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> TokenPayload:
    """Decode and validate a staff JWT; raises 401 on any failure."""
    try:
        raw = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        return TokenPayload(sub=raw["sub"], role=raw["role"], user_id=raw["user_id"])
    except JWTError as exc:
        logger.warning("[Auth] JWT decode failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )


def decode_patient_token(token: str) -> PatientTokenPayload:
    """Decode and validate a patient JWT; raises 401 on any failure."""
    try:
        raw = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        if raw.get("role") != "patient":
            raise JWTError("Not a patient token")
        return PatientTokenPayload(sub=raw["sub"], role="patient", patient_id=raw["patient_id"])
    except JWTError as exc:
        logger.warning("[Auth] Patient JWT decode failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired patient token.",
            headers={"WWW-Authenticate": "Bearer"},
        )


# ---------------------------------------------------------------------------
# FastAPI dependency: require authenticated staff
# ---------------------------------------------------------------------------

def get_current_staff(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    """
    FastAPI dependency that validates the Bearer JWT and returns the User ORM object.
    Raises 401 if token is missing or invalid.
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please log in as staff.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = decode_access_token(credentials.credentials)
    user = db.query(User).filter(User.username == payload.sub).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account not found.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def require_doctor(user: User = Depends(get_current_staff)) -> User:
    """Dependency: require role == 'doctor'. Returns 403 for nurses."""
    if user.role != "doctor":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This action requires Doctor role.",
        )
    return user


# ---------------------------------------------------------------------------
# FastAPI dependency: require authenticated patient
# ---------------------------------------------------------------------------

def get_current_patient(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer_scheme),
    db: Session = Depends(get_db),
):
    """
    FastAPI dependency that validates a patient Bearer JWT and returns the Patient ORM object.
    Raises 401 if token is missing, invalid, or not a patient token.
    """
    from app.models.patient import Patient  # avoid circular import

    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Patient authentication required.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = decode_patient_token(credentials.credentials)
    patient = db.query(Patient).filter(Patient.id == payload.patient_id).first()
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Patient record not found.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return patient


# ---------------------------------------------------------------------------
# Cross-role Access Control Helpers
# ---------------------------------------------------------------------------

def get_current_actor(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer_scheme),
) -> Optional[dict]:
    """
    Optional dependency: decodes whatever token is presented (staff or patient).
    Returns None if no token was provided.
    Raises 401 if a token was provided but is invalid or expired.
    """
    if credentials is None:
        return None
    token = credentials.credentials
    try:
        raw = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        return raw
    except JWTError as exc:
        logger.warning("[Auth] Actor token validation failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token.",
            headers={"WWW-Authenticate": "Bearer"},
        )


def verify_visit_access(
    visit,
    actor: Optional[dict],
):
    """
    Enforces access control on a visit record:
    - Staff (doctor / nurse): unrestricted access to any visit.
    - Patient: can ONLY access their own visit (visit.patient_id == token.patient_id).
      Raises 403 Forbidden if the visit belongs to a different patient.
    """
    if actor is None:
        return  # No token provided (e.g. initial kiosk steps before token)

    role = actor.get("role")
    if role in ("doctor", "nurse"):
        return  # Staff have access to any patient's records

    if role == "patient":
        token_patient_id = actor.get("patient_id")
        if token_patient_id is not None and visit.patient_id != token_patient_id:
            logger.warning(
                "[Auth] 403 Forbidden: Patient %s attempted to access visit %s (belongs to patient %s)",
                token_patient_id, visit.id, visit.patient_id,
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: You can only access your own visit records.",
            )


# ---------------------------------------------------------------------------
# Seeding demo accounts
# ---------------------------------------------------------------------------

DEMO_USERS = [
    {"username": "doctor_demo", "password": "doctor123", "role": "doctor"},
    {"username": "nurse_demo",  "password": "nurse123",  "role": "nurse"},
]


def seed_staff_users(db: Session) -> None:
    """Create demo staff accounts if they don't exist yet."""
    for u in DEMO_USERS:
        existing = db.query(User).filter(User.username == u["username"]).first()
        if not existing:
            new_user = User(
                username=u["username"],
                password_hash=hash_password(u["password"]),
                role=u["role"],
            )
            db.add(new_user)
            logger.info("[Auth] Seeded demo user: %s (%s)", u["username"], u["role"])
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        logger.warning("[Auth] Could not seed demo users: %s", e)



