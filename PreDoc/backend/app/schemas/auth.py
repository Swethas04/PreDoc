from typing import Literal, Optional
from pydantic import BaseModel


class LoginRequest(BaseModel):
    username: str
    password: str


class UserInfo(BaseModel):
    id: int
    username: str
    role: Literal["doctor", "nurse"]

    model_config = {"from_attributes": True}


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserInfo


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
