"""Unit tests for file validation, filename sanitization, and temp cleanup."""

from __future__ import annotations

import io
import os
import time
from pathlib import Path

import pytest
from fastapi import UploadFile
from starlette.datastructures import Headers

from app.core.exceptions import AppError
from app.utils.file_security import (
    cleanup_expired_temp_dirs,
    cleanup_job_dir,
    create_job_dir,
    read_and_validate_upload,
    sanitize_filename,
)


def _make_upload(filename: str, content: bytes, content_type: str) -> UploadFile:
    return UploadFile(
        file=io.BytesIO(content),
        filename=filename,
        headers=Headers({"content-type": content_type}),
    )


def test_sanitize_filename_preserves_spaces_and_strips_traversal() -> None:
    assert sanitize_filename("../../Laporan Keuangan 2026 (Final).pdf") == "Laporan Keuangan 2026 (Final).pdf"
    assert sanitize_filename("C:\\Users\\test\\dokumen kerja.png") == "dokumen kerja.png"
    assert sanitize_filename("CON.pdf") == "_CON.pdf"
    assert sanitize_filename("..") == "file"
    assert sanitize_filename(None) == "file"


def test_job_dir_lifecycle_and_expiration(tmp_path: Path) -> None:
    job_dir = create_job_dir(tmp_path)
    assert job_dir.exists()
    assert job_dir.parent == tmp_path.resolve()

    # Fresh directory should not be deleted by TTL cleanup
    removed_fresh = cleanup_expired_temp_dirs(tmp_path, ttl_seconds=3600)
    assert removed_fresh == 0
    assert job_dir.exists()

    # Backdate mtime to simulate expired job directory
    old_time = time.time() - 7200
    os.utime(job_dir, (old_time, old_time))
    removed_expired = cleanup_expired_temp_dirs(tmp_path, ttl_seconds=3600)
    assert removed_expired == 1
    assert not job_dir.exists()

    second_job = create_job_dir(tmp_path)
    cleanup_job_dir(second_job, tmp_path)
    assert not second_job.exists()


@pytest.mark.asyncio
async def test_validate_upload_accepts_valid_pdf() -> None:
    upload = _make_upload("laporan akhir 2026.pdf", b"%PDF-1.7\n%valid", "application/pdf")
    name, data = await read_and_validate_upload(
        upload,
        allowed_extensions={".pdf"},
        allowed_mime_types={"application/pdf"},
        max_size_bytes=1024 * 1024,
    )
    assert name == "laporan akhir 2026.pdf"
    assert data.startswith(b"%PDF-")


@pytest.mark.asyncio
async def test_validate_upload_rejects_empty_file() -> None:
    upload = _make_upload("kosong.pdf", b"", "application/pdf")
    with pytest.raises(AppError) as exc_info:
        await read_and_validate_upload(
            upload,
            allowed_extensions={".pdf"},
            allowed_mime_types={"application/pdf"},
            max_size_bytes=1024 * 1024,
        )
    assert exc_info.value.code == "EMPTY_FILE"


@pytest.mark.asyncio
async def test_validate_upload_rejects_oversized_file() -> None:
    upload = _make_upload("besar.pdf", b"%PDF-" + b"A" * 2048, "application/pdf")
    with pytest.raises(AppError) as exc_info:
        await read_and_validate_upload(
            upload,
            allowed_extensions={".pdf"},
            allowed_mime_types={"application/pdf"},
            max_size_bytes=1024,
        )
    assert exc_info.value.code == "FILE_TOO_LARGE"


@pytest.mark.asyncio
async def test_validate_upload_rejects_forged_signature() -> None:
    upload = _make_upload("palsu.pdf", b"#!/bin/sh\nrm -rf /", "application/pdf")
    with pytest.raises(AppError) as exc_info:
        await read_and_validate_upload(
            upload,
            allowed_extensions={".pdf"},
            allowed_mime_types={"application/pdf"},
            max_size_bytes=1024 * 1024,
        )
    assert exc_info.value.code == "INVALID_FILE_SIGNATURE"


@pytest.mark.asyncio
async def test_validate_upload_rejects_bad_extension() -> None:
    upload = _make_upload("script.exe", b"MZ...", "application/octet-stream")
    with pytest.raises(AppError) as exc_info:
        await read_and_validate_upload(
            upload,
            allowed_extensions={".pdf"},
            allowed_mime_types={"application/pdf"},
            max_size_bytes=1024 * 1024,
        )
    assert exc_info.value.code == "INVALID_FILE_EXTENSION"

