"""Central API router combining all feature routers."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.routes import calculator, health, images, pdf, qr, spreadsheets, utility

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(pdf.router)
api_router.include_router(images.router)
api_router.include_router(spreadsheets.router)
api_router.include_router(calculator.router)
api_router.include_router(qr.router)
api_router.include_router(utility.router)

