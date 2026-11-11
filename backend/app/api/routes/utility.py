"""REST API endpoints for Business PDF, Barcode, YAML<->JSON, and File Checksum (#74, #75, #89, #92)."""

from __future__ import annotations

import base64
import hashlib
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, UploadFile, status
from fastapi.responses import FileResponse

from app.core.config import Settings, get_settings
from app.core.exceptions import AppError
from app.schemas.utility import (
    BarcodeGenerateRequest,
    FileHashResponse,
    InvoicePdfRequest,
    YamlJsonRequest,
    YamlJsonResponse,
)
from app.services import utility_service
from app.utils.file_security import cleanup_job_dir, create_job_dir, sanitize_filename
from app.utils.response_helpers import stream_result_and_cleanup

router = APIRouter(prefix="/utility", tags=["Utilitas & Bisnis"])


@router.post("/invoice-pdf")
async def invoice_pdf_endpoint(
    payload: InvoicePdfRequest,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #74: Generate a professional Invoice / Receipt PDF via ReportLab."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        out_path, total = utility_service.generate_invoice_pdf(job_dir, payload)
        return stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Invoice-Total": str(total)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/barcode")
async def barcode_endpoint(
    payload: BarcodeGenerateRequest,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #75: Generate Code 128, EAN-13, or EAN-8 barcodes as SVG or PNG."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        out_path, media_type, dl_name, canonical = utility_service.generate_barcode_file(
            job_dir, payload
        )
        encoded = base64.b64encode(canonical.encode("utf-8")).decode("ascii")
        return stream_result_and_cleanup(
            out_path,
            download_name=dl_name,
            media_type=media_type,
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-QR-Payload-B64": encoded},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/yaml-json", response_model=YamlJsonResponse)
async def yaml_json_endpoint(payload: YamlJsonRequest) -> YamlJsonResponse:
    """Tool #89: Convert between JSON and YAML."""
    converted = utility_service.convert_yaml_json(
        payload.content, direction=payload.direction, indent=payload.indent
    )
    return YamlJsonResponse(output=converted, direction=payload.direction)


@router.post("/hash-file", response_model=FileHashResponse)
async def hash_file_endpoint(
    file: Annotated[UploadFile, File(...)],
    expected_hash: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> FileHashResponse:
    """Tool #92: Stream-hash an uploaded file (MD5, SHA-1, SHA-256, SHA-512) without persisting."""
    safe_name = sanitize_filename(file.filename)
    md5 = hashlib.md5()
    sha1 = hashlib.sha1()
    sha256 = hashlib.sha256()
    sha512 = hashlib.sha512()
    total = 0
    max_bytes = settings.max_upload_size_bytes

    while True:
        chunk = await file.read(1024 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total > max_bytes:
            raise AppError(
                f"Ukuran file '{safe_name}' melebihi batas {settings.max_upload_size_mb} MB.",
                code="FILE_TOO_LARGE",
                status_code=getattr(status, "HTTP_413_CONTENT_TOO_LARGE", 413),
            )
        md5.update(chunk)
        sha1.update(chunk)
        sha256.update(chunk)
        sha512.update(chunk)

    if total == 0:
        raise AppError(f"File '{safe_name}' kosong (0 byte).", code="EMPTY_FILE")

    digests = {
        "md5": md5.hexdigest(),
        "sha1": sha1.hexdigest(),
        "sha256": sha256.hexdigest(),
        "sha512": sha512.hexdigest(),
    }
    expected_match: bool | None = None
    if expected_hash and expected_hash.strip():
        target = expected_hash.strip().lower()
        expected_match = target in digests.values()

    return FileHashResponse(
        filename=safe_name,
        file_size_bytes=total,
        expected_match=expected_match,
        **digests,
    )

