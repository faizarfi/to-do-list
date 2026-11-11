"""Shared PDF parsing, validation, geometry, and packaging utilities."""

from __future__ import annotations

import re
import zipfile
from pathlib import Path
from typing import Iterable

import pymupdf
from fastapi import status
from pypdf import PdfReader
from pypdf.errors import PdfReadError

from app.core.exceptions import AppError
from app.schemas.pdf import FitMode, Orientation, PaperSize

MM_TO_PT = 72.0 / 25.4

PAPER_DIMENSIONS_MM: dict[PaperSize, tuple[float, float]] = {
    PaperSize.A4: (210.0, 297.0),
    PaperSize.A3: (297.0, 420.0),
    PaperSize.LETTER: (215.9, 279.4),
    PaperSize.LEGAL: (215.9, 355.6),
}

PDF_ALLOWED_EXTENSIONS = {".pdf"}
PDF_ALLOWED_MIMES = {"application/pdf", "application/x-pdf"}

IMAGE_ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff"}
IMAGE_ALLOWED_MIMES = {
    "image/jpeg",
    "image/jpg",
    "image/pjpeg",
    "image/png",
    "image/x-png",
    "image/webp",
    "image/tiff",
}

_RANGE_TOKEN_RE = re.compile(r"^(\d+)(?:-(\d+))?$")


def resolve_paper_dimensions_pt(
    paper_size: PaperSize,
    *,
    custom_width_mm: float = 210.0,
    custom_height_mm: float = 297.0,
    orientation: Orientation = Orientation.PORTRAIT,
    source_width_pt: float | None = None,
    source_height_pt: float | None = None,
) -> tuple[float, float]:
    """Return (width_pt, height_pt) for the requested paper size and orientation."""
    if paper_size == PaperSize.CUSTOM:
        if custom_width_mm < 20 or custom_width_mm > 2000:
            raise AppError(
                "Lebar kertas custom harus antara 20 mm dan 2000 mm.",
                code="INVALID_PAPER_SIZE",
            )
        if custom_height_mm < 20 or custom_height_mm > 2000:
            raise AppError(
                "Tinggi kertas custom harus antara 20 mm dan 2000 mm.",
                code="INVALID_PAPER_SIZE",
            )
        width_pt = custom_width_mm * MM_TO_PT
        height_pt = custom_height_mm * MM_TO_PT
    else:
        w_mm, h_mm = PAPER_DIMENSIONS_MM[paper_size]
        width_pt = w_mm * MM_TO_PT
        height_pt = h_mm * MM_TO_PT

    if orientation == Orientation.AUTO and source_width_pt and source_height_pt:
        is_src_landscape = source_width_pt > source_height_pt
        is_target_landscape = width_pt > height_pt
        if is_src_landscape != is_target_landscape:
            width_pt, height_pt = height_pt, width_pt
    elif orientation == Orientation.LANDSCAPE and width_pt < height_pt:
        width_pt, height_pt = height_pt, width_pt
    elif orientation == Orientation.PORTRAIT and width_pt > height_pt:
        width_pt, height_pt = height_pt, width_pt

    return width_pt, height_pt


def parse_page_selection(spec: str | None, total_pages: int, *, deduplicate: bool = True) -> list[int]:
    """
    Parse a 1-based page selection expression like '1, 3-5, 2' into page numbers.

    Returns all pages [1..total_pages] when spec is empty or whitespace.
    """
    if total_pages <= 0:
        raise AppError("Dokumen PDF tidak memiliki halaman.", code="EMPTY_PDF")

    if not spec or not spec.strip():
        return list(range(1, total_pages + 1))

    selected: list[int] = []
    seen: set[int] = set()

    for raw_part in spec.split(","):
        token = raw_part.strip()
        if not token:
            continue
        match = _RANGE_TOKEN_RE.match(token)
        if not match:
            raise AppError(
                f"Format rentang halaman '{token}' tidak valid. Contoh yang benar: 1-3, 5.",
                code="INVALID_PAGE_RANGE",
            )
        start = int(match.group(1))
        end = int(match.group(2)) if match.group(2) is not None else start

        if start < 1 or end < 1 or start > total_pages or end > total_pages:
            raise AppError(
                f"Nomor halaman '{token}' di luar batas dokumen (1–{total_pages}).",
                code="PAGE_OUT_OF_RANGE",
            )

        step = 1 if start <= end else -1
        for page_num in range(start, end + step, step):
            if deduplicate:
                if page_num not in seen:
                    seen.add(page_num)
                    selected.append(page_num)
            else:
                selected.append(page_num)

    if not selected:
        raise AppError("Pilih minimal 1 halaman untuk diproses.", code="NO_PAGES_SELECTED")

    return selected


def parse_split_ranges(spec: str, total_pages: int) -> list[list[int]]:
    """Parse comma-separated split groups like '1-3, 4-6' into separate page lists."""
    if not spec or not spec.strip():
        raise AppError(
            "Masukkan rentang halaman pemisahan, misalnya '1-2, 3-5'.",
            code="INVALID_SPLIT_RANGE",
        )

    groups: list[list[int]] = []
    for raw_part in spec.split(","):
        token = raw_part.strip()
        if not token:
            continue
        pages = parse_page_selection(token, total_pages, deduplicate=True)
        groups.append(pages)

    if not groups:
        raise AppError("Rentang pemisahan halaman tidak valid.", code="INVALID_SPLIT_RANGE")

    return groups


def open_pymupdf_doc(
    data: bytes,
    filename: str,
    password: str | None = None,
) -> pymupdf.Document:
    """Open PDF safely with PyMuPDF and enforce authorized password handling."""
    try:
        doc = pymupdf.open(stream=data, filetype="pdf")
    except Exception as exc:
        raise AppError(
            f"File PDF '{filename}' rusak atau tidak dapat dibaca.",
            code="CORRUPTED_PDF",
            status_code=status.HTTP_400_BAD_REQUEST,
        ) from exc

    if doc.needs_pass:
        if not password:
            doc.close()
            raise AppError(
                f"Dokumen '{filename}' dilindungi password. Masukkan password yang sah untuk memproses file ini.",
                code="PDF_PASSWORD_REQUIRED",
                status_code=status.HTTP_401_UNAUTHORIZED,
            )
        if not doc.authenticate(password):
            doc.close()
            raise AppError(
                f"Password untuk '{filename}' tidak sesuai.",
                code="PDF_INVALID_PASSWORD",
                status_code=status.HTTP_401_UNAUTHORIZED,
            )

    if doc.page_count <= 0:
        doc.close()
        raise AppError(
            f"File PDF '{filename}' tidak memiliki halaman.",
            code="EMPTY_PDF",
        )

    return doc


def open_pypdf_reader(
    data: bytes,
    filename: str,
    password: str | None = None,
) -> PdfReader:
    """Open PDF safely with pypdf and enforce authorized password handling."""
    import io

    try:
        reader = PdfReader(io.BytesIO(data), strict=False)
    except (PdfReadError, Exception) as exc:
        raise AppError(
            f"File PDF '{filename}' rusak atau bukan dokumen PDF yang valid.",
            code="CORRUPTED_PDF",
            status_code=status.HTTP_400_BAD_REQUEST,
        ) from exc

    if reader.is_encrypted:
        if not password:
            raise AppError(
                f"Dokumen '{filename}' dilindungi password. Masukkan password yang sah untuk memproses file ini.",
                code="PDF_PASSWORD_REQUIRED",
                status_code=status.HTTP_401_UNAUTHORIZED,
            )
        result = reader.decrypt(password)
        if result == 0:
            raise AppError(
                f"Password untuk '{filename}' tidak sesuai.",
                code="PDF_INVALID_PASSWORD",
                status_code=status.HTTP_401_UNAUTHORIZED,
            )

    if len(reader.pages) <= 0:
        raise AppError(
            f"File PDF '{filename}' tidak memiliki halaman.",
            code="EMPTY_PDF",
        )

    return reader


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


def compute_box_placement(
    src_w: float,
    src_h: float,
    box_w: float,
    box_h: float,
    fit_mode: FitMode,
) -> tuple[float, float, float, float]:
    """Compute (offset_x, offset_y, draw_w, draw_h) inside a target box."""
    if src_w <= 0 or src_h <= 0 or box_w <= 0 or box_h <= 0:
        raise AppError("Dimensi gambar atau area cetak tidak valid.", code="INVALID_DIMENSIONS")

    scale_x = box_w / src_w
    scale_y = box_h / src_h
    scale = min(scale_x, scale_y) if fit_mode == FitMode.FIT else max(scale_x, scale_y)

    draw_w = src_w * scale
    draw_h = src_h * scale
    offset_x = (box_w - draw_w) / 2.0
    offset_y = (box_h - draw_h) / 2.0
    return offset_x, offset_y, draw_w, draw_h


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

