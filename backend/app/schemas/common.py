"""Common response models for health checks and errors."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class ErrorDetail(BaseModel):
    """Structured error detail returned by API exception handlers."""

    code: str
    message: str
    detail: Any = None


class ApiErrorResponse(BaseModel):
    """Top-level error envelope."""

    success: bool = False
    error: ErrorDetail


class EngineStatus(BaseModel):
    """Availability status for a backend processing library or binary."""

    name: str
    available: bool
    version: str | None = None
    note: str | None = None


class TempStorageStatus(BaseModel):
    """Information about temporary job storage health."""

    path: str
    writable: bool
    active_job_dirs: int
    ttl_seconds: int


class HealthResponse(BaseModel):
    """Response returned by GET /api/health."""

    status: str = Field(description="healthy or degraded")
    app_name: str
    version: str
    environment: str
    python_version: str
    timestamp: datetime
    max_upload_size_mb: int
    temp_storage: TempStorageStatus
    engines: list[EngineStatus]


class CategoryReadiness(BaseModel):
    """Backend readiness summary per tool category."""

    category: str
    endpoint_prefix: str
    ready_for_phase: int
    phase_implemented: bool
    required_engines_ready: bool
    notes: str | None = None


class CapabilitiesResponse(BaseModel):
    """Response returned by GET /api/health/capabilities."""

    phase: int = 1
    categories: list[CategoryReadiness]

