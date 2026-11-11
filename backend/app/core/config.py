"""Application configuration managed via environment variables."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Annotated, Any

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    """Typed settings loaded from environment variables or backend/.env."""

    model_config = SettingsConfigDict(
        env_file=str(BACKEND_ROOT / ".env"),
        env_prefix="RUANGKERJA_",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "RuangKerja API"
    app_version: str = "0.1.0"
    env: str = "development"
    host: str = "127.0.0.1"
    port: int = 8000
    api_prefix: str = "/api"

    cors_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:3000", "http://127.0.0.1:3000"]
    )
    max_upload_size_mb: int = Field(default=50, ge=1, le=500)
    temp_dir: Path = Field(default=BACKEND_ROOT / "temp")
    temp_ttl_seconds: int = Field(default=1800, ge=60, le=86400)
    tesseract_cmd: str | None = None

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: Any) -> list[str]:
        """Accept either a JSON array or a comma-separated string."""
        if isinstance(value, str):
            stripped = value.strip()
            if not stripped:
                return []
            if stripped.startswith("["):
                import json

                parsed = json.loads(stripped)
                return [str(item).strip() for item in parsed if str(item).strip()]
            return [origin.strip() for origin in stripped.split(",") if origin.strip()]
        if isinstance(value, list):
            return [str(item).strip() for item in value if str(item).strip()]
        return ["http://localhost:3000", "http://127.0.0.1:3000"]

    @field_validator("temp_dir", mode="before")
    @classmethod
    def resolve_temp_dir(cls, value: Any) -> Path:
        """Ensure temp_dir is always resolved relative to the backend root if relative."""
        path = Path(value) if not isinstance(value, Path) else value
        if not path.is_absolute():
            return (BACKEND_ROOT / path).resolve()
        return path.resolve()

    @property
    def max_upload_size_bytes(self) -> int:
        """Maximum single upload file size in bytes."""
        return self.max_upload_size_mb * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    """Return cached application settings instance."""
    return Settings()
