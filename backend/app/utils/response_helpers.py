"""Shared file-response streaming, ZIP packaging, and color parsing helpers."""

from __future__ import annotations

import re
import zipfile
from pathlib import Path
from typing import Iterable

from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

from app.core.config import Settings
from app.core.exceptions import AppError
from app.utils.file_security import cleanup_job_dir

IMAGE_ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff"}
IMAGE_ALLOWED_MIMES = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/tiff",
}


def parse_hex_color(color_hex: str) -> tuple[float, float, float]:
    """Convert '#RRGGBB' into normalized (r, g, b) floats in [0.0, 1.0]."""
    cleaned = color_hex.strip().lstrip("#")
    if not re.fullmatch(r"[0-9a-fA-F]{6}", cleaned):
        raise AppError(
            f"Format warna '{color_hex}' tidak valid. Gunakan format hex seperti #0D7A68.",
            code="INVALID_COLOR",
        )
    r = int(cleaned[0:2], 16) / 255.0
    g = int(cleaned[2:4], 16) / 255.0
    b = int(cleaned[4:6], 16) / 255.0
    return (r, g, b)


def parse_hex_color_rgb_int(color_hex: str) -> tuple[int, int, int]:
    """Convert '#RRGGBB' into integer (R, G, B) tuple in [0, 255]."""
    r, g, b = parse_hex_color(color_hex)
    return (round(r * 255), round(g * 255), round(b * 255))


def package_outputs(
    job_dir: Path,
    output_files: Iterable[Path],
    *,
    single_media_type: str,
    zip_filename: str,
) -> tuple[Path, str, str]:
    """Return a single file directly or package multiple files into a ZIP archive."""
    files = list(output_files)
    if not files:
        raise AppError("Tidak ada file output yang dihasilkan.", code="EMPTY_OUTPUT")

    if len(files) == 1:
        return files[0], single_media_type, files[0].name

    zip_path = job_dir / zip_filename
    with zipfile.ZipFile(zip_path, mode="w", compression=zipfile.ZIP_DEFLATED) as archive:
        for file_path in files:
            archive.write(file_path, arcname=file_path.name)

    return zip_path, "application/zip", zip_filename


def stream_result_and_cleanup(
    file_path: Path,
    *,
    download_name: str,
    media_type: str,
    job_dir: Path,
    settings: Settings,
    extra_headers: dict[str, str] | None = None,
) -> FileResponse:
    """Return a FileResponse and delete the isolated temp job_dir once finished."""
    return FileResponse(
        path=str(file_path),
        media_type=media_type,
        filename=download_name,
        headers=dict(extra_headers or {}),
        background=BackgroundTask(cleanup_job_dir, job_dir, settings.temp_dir),
    )

