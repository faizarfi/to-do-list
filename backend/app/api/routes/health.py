"""Health and system diagnostics endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.core.config import Settings, get_settings
from app.schemas.common import CapabilitiesResponse, HealthResponse
from app.services.health_service import build_capabilities_response, build_health_response

router = APIRouter(prefix="/health", tags=["Health"])


@router.get(
    "",
    response_model=HealthResponse,
    summary="Periksa kesehatan server FastAPI dan kesiapan pustaka pemrosesan",
)
async def get_health(settings: Settings = Depends(get_settings)) -> HealthResponse:
    """Return runtime status, temp storage info, and installed processing engine versions."""
    return build_health_response(settings)


@router.get(
    "/capabilities",
    response_model=CapabilitiesResponse,
    summary="Ringkasan kesiapan modul backend per kategori",
)
async def get_capabilities(settings: Settings = Depends(get_settings)) -> CapabilitiesResponse:
    """Return readiness summary for upcoming feature phases."""
    return build_capabilities_response(settings)

