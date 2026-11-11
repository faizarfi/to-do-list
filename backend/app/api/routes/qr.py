"""REST API endpoint for QR Code Generator (Tool #50)."""

from __future__ import annotations

import base64

from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse

from app.core.config import Settings, get_settings
from app.schemas.qr import QrGenerateRequest
from app.services import qr_service
from app.utils.file_security import cleanup_job_dir, create_job_dir
from app.utils.response_helpers import stream_result_and_cleanup

router = APIRouter(prefix="/qr", tags=["QR Code Generator"])


@router.post("/generate")
async def generate_qr_endpoint(
    payload: QrGenerateRequest,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #50: Generate customizable PNG or SVG QR codes."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        out_path, media_type, dl_name, qr_text = qr_service.generate_qr_file(job_dir, payload)
        encoded_payload = base64.b64encode(qr_text.encode("utf-8")).decode("ascii")
        return stream_result_and_cleanup(
            out_path,
            download_name=dl_name,
            media_type=media_type,
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-QR-Payload-B64": encoded_payload},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise

