import os
from functools import lru_cache
from typing import List, Union
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    APP_NAME: str = "PreDoc API"
    ENVIRONMENT: str = "development"
    DATABASE_URL: str = "postgresql://postgres:postgrespassword@localhost:5432/predoc"
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    CORS_ORIGINS: Union[str, List[str]] = "http://localhost:5173,http://127.0.0.1:5173"
    GEMINI_API_KEY: str = ""

    # JWT Authentication
    JWT_SECRET_KEY: str = "predoc-hackathon-jwt-secret-2026-change-in-prod"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 480

    @field_validator("CORS_ORIGINS", mode="after")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v

    model_config = SettingsConfigDict(
        env_file=(".env", "backend/.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
