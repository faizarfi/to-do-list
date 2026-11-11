"""File validation, filename sanitization, and isolated job-directory management."""

from __future__ import annotations

import logging
import os
import re
import shutil
import time
import uuid
from pathlib import Path
from typing import Iterable

from fastapi import UploadFile, status

from app.core.exceptions import AppError

logger = logging.getLogger("ruangkerja.file_security")

_WINDOWS_RESERVED_NAMES = {
    "CON",
    "PRN",
    "AUX",
    "NUL",
    *(f"COM{i}" for i in range(1, 10)),
    *(f"LPT{i}" for i in range(1, 10)),
}

_SAFE_CHAR_RE = re.compile(r"[^\w.\- ()]+", re.UNICODE)
_MULTI_SPACE_RE = re.compile(r"\s+")

_MAGIC_SIGNATURES: dict[str, tuple[bytes, ...]] = {
    ".pdf": (b"%PDF-",),
    ".png": (b"\x89PNG\r\n\x1a\n",),
    ".jpg": (b"\xff\xd8\xff",),
    ".jpeg": (b"\xff\xd8\xff",),
    ".tif": (b"II*\x00", b"MM\x00*"),
    ".tiff": (b"II*\x00", b"MM\x00*"),
    ".xlsx": (b"PK\x03\x04", b"PK\x05\x06"),
    ".xls": (b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1",),
}


def sanitize_filename(filename: str | None, fallback: str = "file") -> str:
    """
    Sanitize an uploaded filename safely while preserving spaces and common characters.

    Blocks directory traversal, control characters, and Windows reserved device names.
    """
    if not filename:
        return fallback

    # Normalize slashes and take only the final path component
    normalized = filename.replace("\\", "/").split("/")[-1]
    normalized = normalized.replace("\x00", "").strip()

    if not normalized or normalized in {".", ".."}:
        return fallback

    path = Path(normalized)
    raw_stem = path.stem
    raw_ext = path.suffix

    clean_stem = _SAFE_CHAR_RE.sub("_", raw_stem)
    clean_stem = _MULTI_SPACE_RE.sub(" ", clean_stem).strip(" .")
    clean_ext = re.sub(r"[^a-zA-Z0-9.]", "", raw_ext)

    if not clean_stem:
        clean_stem = fallback

    if clean_stem.upper() in _WINDOWS_RESERVED_NAMES:
        clean_stem = f"_{clean_stem}"

    # Cap filename length safely while keeping extension
    clean_stem = clean_stem[:140].strip()
    clean_ext = clean_ext[:16]
    return f"{clean_stem}{clean_ext}"


def ensure_temp_root(temp_dir: Path) -> Path:
    """Ensure the root temporary directory exists and return its resolved path."""
    resolved = temp_dir.resolve()
    resolved.mkdir(parents=True, exist_ok=True)
    return resolved


def create_job_dir(temp_dir: Path) -> Path:
    """Create a unique isolated directory for a single file-processing job."""
    root = ensure_temp_root(temp_dir)
    job_id = uuid.uuid4().hex
    job_dir = (root / job_id).resolve()
    if job_dir.parent != root:
        raise AppError(
            "Gagal membuat direktori kerja sementara yang aman.",
            code="TEMP_DIR_ERROR",
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
    job_dir.mkdir(parents=True, exist_ok=False)
    return job_dir


def cleanup_job_dir(job_dir: Path, temp_dir: Path) -> None:
    """Delete a job temporary directory safely if it lives inside temp_dir."""
    try:
        root = temp_dir.resolve()
        target = job_dir.resolve()
        if target != root and root in target.parents and target.exists():
            shutil.rmtree(target, ignore_errors=True)
    except OSError as exc:
        logger.warning("Failed to clean job directory %s: %s", job_dir, exc)


def cleanup_expired_temp_dirs(temp_dir: Path, ttl_seconds: int) -> int:
    """Remove temporary job directories older than ttl_seconds."""
    root = ensure_temp_root(temp_dir)
    cutoff = time.time() - ttl_seconds
    removed = 0

    for entry in root.iterdir():
        if not entry.is_dir():
            continue
        try:
            mtime = entry.stat().st_mtime
            if mtime < cutoff:
                shutil.rmtree(entry, ignore_errors=True)
                removed += 1
        except OSError as exc:
            logger.warning("Could not inspect/remove temp dir %s: %s", entry, exc)

    return removed


def count_active_job_dirs(temp_dir: Path) -> int:
    """Count current subdirectories inside the temporary root."""
    if not temp_dir.exists():
        return 0
    return sum(1 for entry in temp_dir.iterdir() if entry.is_dir())


def check_magic_bytes(extension: str, data: bytes) -> bool:
    """Verify file header magic bytes match the declared extension."""
    ext = extension.lower()
    if ext == ".webp":
        return len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP"
    if ext == ".csv":
        # CSV should be text without binary NUL bytes
        return b"\x00" not in data[:4096]
    signatures = _MAGIC_SIGNATURES.get(ext)
    if not signatures:
        return True
    return any(data.startswith(sig) for sig in signatures)


async def read_and_validate_upload(
    upload: UploadFile,
    *,
    allowed_extensions: Iterable[str],
    allowed_mime_types: Iterable[str] | None = None,
    max_size_bytes: int,
    verify_magic: bool = True,
) -> tuple[str, bytes]:
    """
    Read an UploadFile safely up to max_size_bytes and validate extension, MIME, and contents.

    Returns (sanitized_filename, file_bytes).
    """
    ext_set = {ext.lower() if ext.startswith(".") else f".{ext.lower()}" for ext in allowed_extensions}
    safe_name = sanitize_filename(upload.filename)
    ext = Path(safe_name).suffix.lower()

    if ext not in ext_set:
        allowed_label = ", ".join(sorted(ext_set))
        raise AppError(
            f"Format file '{ext or 'tanpa ekstensi'}' tidak didukung. Format yang diizinkan: {allowed_label}.",
            code="INVALID_FILE_EXTENSION",
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    if allowed_mime_types is not None and upload.content_type:
        mime_set = {m.lower() for m in allowed_mime_types}
        content_type = upload.content_type.split(";")[0].strip().lower()
        # Allow generic octet-stream only if magic bytes will verify the content
        if content_type not in mime_set and not (
            verify_magic and content_type == "application/octet-stream"
        ):
            raise AppError(
                f"Tipe MIME file '{content_type}' tidak sesuai dengan format yang diizinkan.",
                code="INVALID_MIME_TYPE",
                status_code=status.HTTP_400_BAD_REQUEST,
            )

    # Read in chunks to prevent memory exhaustion on oversized uploads
    chunk_size = 1024 * 1024  # 1 MiB
    chunks: list[bytes] = []
    total_read = 0

    while True:
        chunk = await upload.read(chunk_size)
        if not chunk:
            break
        total_read += len(chunk)
        if total_read > max_size_bytes:
            max_mb = max_size_bytes // (1024 * 1024)
            raise AppError(
                f"Ukuran file '{safe_name}' melebihi batas maksimal {max_mb} MB.",
                code="FILE_TOO_LARGE",
                status_code=getattr(status, "HTTP_413_CONTENT_TOO_LARGE", 413),
            )
        chunks.append(chunk)

    data = b"".join(chunks)
    if len(data) == 0:
        raise AppError(
            f"File '{safe_name}' kosong (0 byte) dan tidak dapat diproses.",
            code="EMPTY_FILE",
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    if verify_magic and not check_magic_bytes(ext, data):
        raise AppError(
            f"Isi file '{safe_name}' tidak valid atau rusak untuk format {ext.upper()}.",
            code="INVALID_FILE_SIGNATURE",
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    return safe_name, data


def is_dir_writable(path: Path) -> bool:
    """Verify the target directory exists and is writable."""
    try:
        ensure_temp_root(path)
        probe = path / f".write_probe_{os.getpid()}_{uuid.uuid4().hex[:8]}"
        probe.write_bytes(b"ok")
        probe.unlink(missing_ok=True)
        return True
    except OSError:
        return False
