from typing import List, Optional
from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str
    message: str
    app_name: str
    environment: str
    database_connected: bool
    version: Optional[str] = "0.1.0"
    gemini_configured: bool = False
    gemini_key_preview: Optional[str] = None
    cors_origins: Optional[List[str]] = None
