"""RuangKerja FastAPI application entry point."""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager, suppress
from typing import AsyncIterator

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import Settings, get_settings
from app.core.exceptions import register_exception_handlers
from app.core.logging import configure_logging
from app.utils.file_security import cleanup_expired_temp_dirs, ensure_temp_root

logger = logging.getLogger("ruangkerja.main")


async def _periodic_temp_cleanup(settings: Settings) -> None:
    """Periodically prune expired temporary job directories."""
    interval_seconds = min(300, max(60, settings.temp_ttl_seconds // 3))
    while True:
        await asyncio.sleep(interval_seconds)
        removed = cleanup_expired_temp_dirs(settings.temp_dir, settings.temp_ttl_seconds)
        if removed:
            logger.info("Cleaned up %d expired temporary job directory(ies).", removed)


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    settings = get_settings()
    configure_logging(settings.env)

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        ensure_temp_root(settings.temp_dir)
        removed = cleanup_expired_temp_dirs(settings.temp_dir, settings.temp_ttl_seconds)
        if removed:
            logger.info("Startup cleanup removed %d expired temp job directory(ies).", removed)
        cleanup_task = asyncio.create_task(_periodic_temp_cleanup(settings))
        try:
            yield
        finally:
            cleanup_task.cancel()
            with suppress(asyncio.CancelledError):
                await cleanup_task

    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description="Backend pemrosesan file lokal dan aman untuk RuangKerja.",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["*"],
        expose_headers=[
            "Content-Disposition",
            "X-Result-Page-Count",
            "X-Original-Size",
            "X-Processed-Size",
            "X-Output-Count",
            "X-OCR-Preview-B64",
            "X-Image-Width",
            "X-Image-Height",
            "X-Original-Row-Count",
            "X-Processed-Row-Count",
            "X-Removed-Count",
            "X-QR-Payload-B64",
        ],
    )

    @app.middleware("http")
    async def add_security_headers(request: Request, call_next) -> Response:
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response

    register_exception_handlers(app)
    app.include_router(api_router, prefix=settings.api_prefix)

    @app.get("/", include_in_schema=False)
    async def root() -> dict[str, str]:
        return {
            "service": settings.app_name,
            "version": settings.app_version,
            "health": f"{settings.api_prefix}/health",
            "docs": "/docs",
        }

    return app


app = create_app()

