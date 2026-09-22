from typing import Optional, Any
from datetime import datetime
from pydantic import BaseModel


class LoginRequest(BaseModel):
    username: Optional[str] = None
    email: Optional[str] = None
    password: str = "password123"


class UserLoginRequest(BaseModel):
    email: Optional[str] = None
    username: Optional[str] = None
    password: str = "password123"


class UserRegisterRequest(BaseModel):
    email: Optional[str] = None
    username: Optional[str] = None
    name: str
    role: str = "patient"  # 'patient' | 'doctor' | 'nurse'
    password: str = "password123"
    age: Optional[int] = None
    gender: Optional[str] = None
    phone: Optional[str] = None
    language: Optional[str] = "en"


class UserInfo(BaseModel):
    id: int
    username: Optional[str] = None
    email: Optional[str] = None
    name: Optional[str] = None
    role: str = "nurse"
    patient_profile_id: Optional[int] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


UserRead = UserInfo


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    token: Optional[str] = None
    user: UserInfo
    message: str = "Authentication successful"


AuthResponse = LoginResponse


class TokenPayload(BaseModel):
    sub: str          # username (staff) or patient_code (patient)
    role: str
    user_id: int


# ---------------------------------------------------------------------------
# Patient identity schemas
# ---------------------------------------------------------------------------

class PatientLoginRequest(BaseModel):
    patient_code: str   # e.g. "PD-A3F9K2"
    pin: str            # 4-digit PIN (plaintext, verified against hash)


class PatientInfo(BaseModel):
    id: int
    patient_code: str
    name: str
    age: Optional[int] = None

    model_config = {"from_attributes": True}


class PatientLoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    patient: PatientInfo


class PatientTokenPayload(BaseModel):
    sub: str          # patient_code
    role: str = "patient"
    patient_id: int
