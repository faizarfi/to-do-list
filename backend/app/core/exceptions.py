"""Consistent application exceptions and FastAPI error handlers."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

logger = logging.getLogger("ruangkerja.exceptions")


class AppError(Exception):
    """Base domain exception converted into a clean user-friendly JSON error."""

    def __init__(
        self,
        message: str,
        *,
        code: str = "APP_ERROR",
        status_code: int = status.HTTP_400_BAD_REQUEST,
        detail: Any = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code
        self.detail = detail


def _error_payload(code: str, message: str, detail: Any = None) -> dict[str, Any]:
    return {
        "success": False,
        "error": {
            "code": code,
            "message": message,
            "detail": detail,
        },
    }


def register_exception_handlers(app: FastAPI) -> None:
    """Attach global exception handlers to the FastAPI instance."""

    @app.exception_handler(AppError)
    async def handle_app_error(_request: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=_error_payload(exc.code, exc.message, exc.detail),
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(
        _request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=_error_payload(
                code="VALIDATION_ERROR",
                message="Data atau parameter yang dikirim tidak valid.",
                detail=exc.errors(),
            ),
        )

    @app.exception_handler(Exception)
    async def handle_unexpected_error(_request: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled backend exception: %s", exc)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=_error_payload(
                code="INTERNAL_SERVER_ERROR",
                message="Terjadi kesalahan internal saat memproses permintaan. Silakan coba lagi.",
            ),
        )

