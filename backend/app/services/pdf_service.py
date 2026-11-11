"""Core processing services for all 15 RuangKerja PDF & Document tools."""

from __future__ import annotations

import base64
import io
import shutil
from pathlib import Path
from typing import Literal

import pymupdf
import pytesseract
from fastapi import status
from PIL import Image, ImageOps
from pypdf import PdfWriter
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas as rl_canvas

from app.core.exceptions import AppError
from app.schemas.pdf import (
    CompressionLevel,
    FitMode,
    Orientation,
    PageNumberPosition,
    PaperSize,
    PdfInspectResponse,
    PdfPageInfo,
    SplitMode,
    WatermarkPosition,
    WatermarkType,
)
from app.services.pdf_common import (
    MM_TO_PT,
    compute_box_placement,
    open_pymupdf_doc,
    open_pypdf_reader,
    package_outputs,
    parse_hex_color,
    parse_page_selection,
    parse_split_ranges,
    resolve_paper_dimensions_pt,
)


def inspect_pdf(
    data: bytes,
    filename: str,
    *,
    password: str | None = None,
    max_thumbs: int = 60,
) -> PdfInspectResponse:
    """Inspect PDF metadata and render lightweight thumbnails for visual page tools."""
    doc = open_pymupdf_doc(data, filename, password)
    try:
        pages: list[PdfPageInfo] = []
        for idx in range(doc.page_count):
            page = doc.load_page(idx)
            rect = page.rect
            thumb_url: str | None = None
            if idx < max_thumbs:
                zoom = min(140.0 / max(rect.width, 1.0), 1.0)
                pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=False)
                img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                buf = io.BytesIO()
                img.save(buf, format="JPEG", quality=70)
                encoded = base64.b64encode(buf.getvalue()).decode("ascii")
                thumb_url = f"data:image/jpeg;base64,{encoded}"

            pages.append(
                PdfPageInfo(
                    page_number=idx + 1,
                    width_pt=round(rect.width, 2),
                    height_pt=round(rect.height, 2),
                    rotation=page.rotation,
                    thumbnail_data_url=thumb_url,
                )
            )

        return PdfInspectResponse(
            filename=filename,
            file_size_bytes=len(data),
            page_count=doc.page_count,
            is_encrypted=doc.is_encrypted,
            pages=pages,
        )
    finally:
        doc.close()


def _prepare_pil_image_for_pdf(image_bytes: bytes, filename: str, quality: int) -> tuple[bytes, int, int]:
    """Decode, normalize orientation/alpha, and recompress an image for PDF embedding."""
    try:
        with Image.open(io.BytesIO(image_bytes)) as raw_img:
            transposed = ImageOps.exif_transpose(raw_img)
            if transposed.mode in ("RGBA", "LA", "PA"):
                rgba = transposed.convert("RGBA")
                background = Image.new("RGB", rgba.size, (255, 255, 255))
                background.paste(rgba, mask=rgba.split()[3])
                rgb = background
            elif transposed.mode == "P":
                rgba = transposed.convert("RGBA")
                background = Image.new("RGB", rgba.size, (255, 255, 255))
                background.paste(rgba, mask=rgba.split()[3])
                rgb = background
            else:
                rgb = transposed.convert("RGB")

            width, height = rgb.size
            buf = io.BytesIO()
            rgb.save(buf, format="JPEG", quality=quality, optimize=True)
            return buf.getvalue(), width, height
    except Exception as exc:
        raise AppError(
            f"File gambar '{filename}' rusak atau tidak dapat diproses.",
            code="CORRUPTED_IMAGE",
        ) from exc


def images_to_pdf(
    job_dir: Path,
    images: list[tuple[str, bytes]],
    *,
    paper_size: PaperSize = PaperSize.A4,
    custom_width_mm: float = 210.0,
    custom_height_mm: float = 297.0,
    orientation: Orientation = Orientation.PORTRAIT,
    margin_mm: float = 10.0,
    fit_mode: FitMode = FitMode.FIT,
    quality: int = 85,
    output_filename: str = "hasil-gambar.pdf",
) -> tuple[Path, int]:
    """Convert one or more images into a PDF document with layout and quality controls."""
    if not images:
        raise AppError("Pilih minimal satu file gambar.", code="NO_FILES_PROVIDED")

    if margin_mm < 0 or margin_mm > 60:
        raise AppError("Margin harus berada antara 0 mm dan 60 mm.", code="INVALID_MARGIN")

    margin_pt = margin_mm * MM_TO_PT
    out_path = job_dir / output_filename

    pdf_canvas = rl_canvas.Canvas(str(out_path))
    for img_name, img_bytes in images:
        jpeg_bytes, img_w, img_h = _prepare_pil_image_for_pdf(img_bytes, img_name, quality)
        page_w, page_h = resolve_paper_dimensions_pt(
            paper_size,
            custom_width_mm=custom_width_mm,
            custom_height_mm=custom_height_mm,
            orientation=orientation,
            source_width_pt=float(img_w),
            source_height_pt=float(img_h),
        )
        box_w = page_w - 2.0 * margin_pt
        box_h = page_h - 2.0 * margin_pt
        if box_w <= 10 or box_h <= 10:
            raise AppError(
                "Margin terlalu besar untuk ukuran kertas yang dipilih.",
                code="MARGIN_EXCEEDS_PAPER",
            )

        offset_x, offset_y, draw_w, draw_h = compute_box_placement(
            float(img_w), float(img_h), box_w, box_h, fit_mode
        )

        pdf_canvas.setPageSize((page_w, page_h))
        pdf_canvas.saveState()
        clip_path = pdf_canvas.beginPath()
        clip_path.rect(margin_pt, margin_pt, box_w, box_h)
        pdf_canvas.clipPath(clip_path, stroke=0, fill=0)
        pdf_canvas.drawImage(
            ImageReader(io.BytesIO(jpeg_bytes)),
            margin_pt + offset_x,
            margin_pt + offset_y,
            width=draw_w,
            height=draw_h,
            preserveAspectRatio=False,
        )
        pdf_canvas.restoreState()
        pdf_canvas.showPage()

    pdf_canvas.save()
    return out_path, len(images)


def pdf_to_images(
    job_dir: Path,
    data: bytes,
    filename: str,
    *,
    image_format: Literal["jpg", "png"],
    dpi: int = 150,
    quality: int = 85,
    transparent: bool = False,
    pages_spec: str | None = None,
    password: str | None = None,
) -> tuple[Path, str, str, int]:
    """Export selected PDF pages to JPG or PNG files (single file or ZIP)."""
    if dpi < 72 or dpi > 300:
        raise AppError("DPI harus antara 72 dan 300.", code="INVALID_DPI")

    doc = open_pymupdf_doc(data, filename, password)
    stem = Path(filename).stem or "halaman"
    output_files: list[Path] = []
    zoom = dpi / 72.0
    matrix = pymupdf.Matrix(zoom, zoom)

    try:
        selected_pages = parse_page_selection(pages_spec, doc.page_count, deduplicate=True)
        use_alpha = image_format == "png" and transparent

        for page_num in selected_pages:
            page = doc.load_page(page_num - 1)
            pix = page.get_pixmap(matrix=matrix, alpha=use_alpha)
            mode = "RGBA" if use_alpha else "RGB"
            pil_img = Image.frombytes(mode, [pix.width, pix.height], pix.samples)
            out_file = job_dir / f"{stem}_hal-{page_num:03d}.{image_format}"
            if image_format == "jpg":
                pil_img.save(out_file, format="JPEG", quality=quality, optimize=True)
            else:
                pil_img.save(out_file, format="PNG", optimize=True)
            output_files.append(out_file)
    finally:
        doc.close()

    single_mime = "image/jpeg" if image_format == "jpg" else "image/png"
    zip_name = f"{stem}_{image_format}.zip"
    result_path, media_type, download_name = package_outputs(
        job_dir,
        output_files,
        single_media_type=single_mime,
        zip_filename=zip_name,
    )
    return result_path, media_type, download_name, len(output_files)


def merge_pdfs(
    job_dir: Path,
    files: list[tuple[str, bytes]],
    *,
    passwords: list[str | None] | None = None,
) -> tuple[Path, int]:
    """Merge two or more PDF documents into a single PDF in exact given order."""
    if len(files) < 2:
        raise AppError(
            "Unggah minimal 2 file PDF untuk digabungkan.",
            code="MINIMUM_TWO_FILES",
        )

    writer = PdfWriter()
    total_pages = 0

    for idx, (fname, data) in enumerate(files):
        pwd = passwords[idx] if passwords and idx < len(passwords) else None
        reader = open_pypdf_reader(data, fname, pwd)
        for page in reader.pages:
            writer.add_page(page)
            total_pages += 1

    out_path = job_dir / "gabungan.pdf"
    with out_path.open("wb") as handle:
        writer.write(handle)

    return out_path, total_pages


def split_pdf(
    job_dir: Path,
    data: bytes,
    filename: str,
    *,
    mode: SplitMode,
    ranges_spec: str | None = None,
    every_n: int = 1,
    password: str | None = None,
) -> tuple[Path, str, str, int]:
    """Split a PDF by explicit page ranges, fixed chunk size, or single pages."""
    reader = open_pypdf_reader(data, filename, password)
    total_pages = len(reader.pages)
    stem = Path(filename).stem or "dokumen"

    if mode == SplitMode.RANGES:
        groups = parse_split_ranges(ranges_spec or "", total_pages)
    elif mode == SplitMode.EVERY_N:
        if every_n < 1:
            raise AppError("Jumlah halaman per bagian minimal 1.", code="INVALID_SPLIT_SIZE")
        groups = [
            list(range(start, min(start + every_n, total_pages + 1)))
            for start in range(1, total_pages + 1, every_n)
        ]
    else:
        groups = [[page_num] for page_num in range(1, total_pages + 1)]

    output_files: list[Path] = []
    for idx, page_nums in enumerate(groups, start=1):
        writer = PdfWriter()
        for page_num in page_nums:
            writer.add_page(reader.pages[page_num - 1])
        part_path = job_dir / f"{stem}_bagian-{idx:02d}.pdf"
        with part_path.open("wb") as handle:
            writer.write(handle)
        output_files.append(part_path)

    result_path, media_type, download_name = package_outputs(
        job_dir,
        output_files,
        single_media_type="application/pdf",
        zip_filename=f"{stem}_split.zip",
    )
    return result_path, media_type, download_name, len(output_files)


def compress_pdf(
    job_dir: Path,
    data: bytes,
    filename: str,
    *,
    level: CompressionLevel = CompressionLevel.MEDIUM,
    password: str | None = None,
) -> tuple[Path, int, int, int]:
    """Compress a PDF by cleaning objects, deflating streams, and optionally downsampling images."""
    doc = open_pymupdf_doc(data, filename, password)
    stem = Path(filename).stem or "dokumen"
    out_path = job_dir / f"{stem}_compressed.pdf"
    original_size = len(data)
    page_count = doc.page_count

    try:
        if level in (CompressionLevel.MEDIUM, CompressionLevel.HIGH):
            target_max_dim = 1600 if level == CompressionLevel.MEDIUM else 1100
            jpeg_quality = 75 if level == CompressionLevel.MEDIUM else 52
            seen_xrefs: set[int] = set()

            for page_idx in range(doc.page_count):
                page = doc.load_page(page_idx)
                for img_info in page.get_images(full=True):
                    xref = img_info[0]
                    if xref in seen_xrefs:
                        continue
                    seen_xrefs.add(xref)
                    try:
                        extracted = doc.extract_image(xref)
                    except Exception:
                        continue
                    img_bytes = extracted.get("image")
                    if not img_bytes:
                        continue
                    try:
                        with Image.open(io.BytesIO(img_bytes)) as pil_img:
                            if pil_img.mode in ("RGBA", "LA", "P"):
                                # Keep alpha PNGs lightly recompressed rather than losing transparency
                                buf = io.BytesIO()
                                pil_img.save(buf, format="PNG", optimize=True)
                                candidate = buf.getvalue()
                            else:
                                rgb = pil_img.convert("RGB")
                                if max(rgb.size) > target_max_dim:
                                    rgb.thumbnail(
                                        (target_max_dim, target_max_dim),
                                        Image.Resampling.LANCZOS,
                                    )
                                buf = io.BytesIO()
                                rgb.save(buf, format="JPEG", quality=jpeg_quality, optimize=True)
                                candidate = buf.getvalue()

                        if len(candidate) < len(img_bytes):
                            page.replace_image(xref, stream=candidate)
                    except Exception:
                        continue

        garbage_level = 3 if level == CompressionLevel.LOW else 4
        doc.save(
            str(out_path),
            garbage=garbage_level,
            deflate=True,
            clean=True,
        )
    finally:
        doc.close()

    processed_size = out_path.stat().st_size
    if processed_size > original_size and not password:
        # Keep original when PDF is already maximally compressed
        out_path.write_bytes(data)
        processed_size = original_size

    return out_path, page_count, original_size, processed_size


def rotate_pdf(
    job_dir: Path,
    data: bytes,
    filename: str,
    *,
    angle: int = 90,
    pages_spec: str | None = None,
    page_rotations: dict[int, int] | None = None,
    password: str | None = None,
) -> tuple[Path, int]:
    """Rotate selected pages (or per-page rotation map) by multiples of 90 degrees."""
    reader = open_pypdf_reader(data, filename, password)
    total_pages = len(reader.pages)
    writer = PdfWriter()

    if page_rotations:
        for p_num, rot in page_rotations.items():
            if p_num < 1 or p_num > total_pages:
                raise AppError(f"Nomor halaman {p_num} di luar batas (1–{total_pages}).", code="PAGE_OUT_OF_RANGE")
            if rot % 90 != 0:
                raise AppError("Sudut rotasi harus kelipatan 90 derajat.", code="INVALID_ROTATION")
        rot_map = page_rotations
    else:
        if angle % 90 != 0:
            raise AppError("Sudut rotasi harus kelipatan 90 derajat.", code="INVALID_ROTATION")
        selected = set(parse_page_selection(pages_spec, total_pages, deduplicate=True))
        rot_map = {p_num: angle for p_num in selected}

    for idx, page in enumerate(reader.pages, start=1):
        delta = rot_map.get(idx, 0) % 360
        if delta:
            page.rotate(delta)
        writer.add_page(page)

    stem = Path(filename).stem or "dokumen"
    out_path = job_dir / f"{stem}_rotated.pdf"
    with out_path.open("wb") as handle:
        writer.write(handle)

    return out_path, total_pages


def reorder_pdf(
    job_dir: Path,
    data: bytes,
    filename: str,
    *,
    order: list[int],
    password: str | None = None,
) -> tuple[Path, int]:
    """Reorder PDF pages according to an explicit 1-based page list."""
    reader = open_pypdf_reader(data, filename, password)
    total_pages = len(reader.pages)

    if not order:
        raise AppError("Urutan halaman tidak boleh kosong.", code="EMPTY_ORDER")

    for page_num in order:
        if page_num < 1 or page_num > total_pages:
            raise AppError(
                f"Nomor halaman {page_num} tidak valid untuk dokumen {total_pages} halaman.",
                code="PAGE_OUT_OF_RANGE",
            )

    writer = PdfWriter()
    for page_num in order:
        writer.add_page(reader.pages[page_num - 1])

    stem = Path(filename).stem or "dokumen"
    out_path = job_dir / f"{stem}_reordered.pdf"
    with out_path.open("wb") as handle:
        writer.write(handle)

    return out_path, len(order)


def delete_pdf_pages(
    job_dir: Path,
    data: bytes,
    filename: str,
    *,
    pages_spec: str,
    password: str | None = None,
) -> tuple[Path, int]:
    """Remove specified pages from a PDF while ensuring at least one page remains."""
    reader = open_pypdf_reader(data, filename, password)
    total_pages = len(reader.pages)
    if not pages_spec or not pages_spec.strip():
        raise AppError("Pilih minimal satu halaman untuk dihapus.", code="NO_PAGES_SELECTED")

    to_delete = set(parse_page_selection(pages_spec, total_pages, deduplicate=True))
    remaining = [p for p in range(1, total_pages + 1) if p not in to_delete]

    if not remaining:
        raise AppError(
            "Tidak dapat menghapus seluruh halaman. Sisakan minimal 1 halaman.",
            code="CANNOT_DELETE_ALL_PAGES",
        )

    writer = PdfWriter()
    for page_num in remaining:
        writer.add_page(reader.pages[page_num - 1])

    stem = Path(filename).stem or "dokumen"
    out_path = job_dir / f"{stem}_deleted.pdf"
    with out_path.open("wb") as handle:
        writer.write(handle)

    return out_path, len(remaining)


def extract_pdf_pages(
    job_dir: Path,
    data: bytes,
    filename: str,
    *,
    pages_spec: str,
    password: str | None = None,
) -> tuple[Path, int]:
    """Extract specific pages from a PDF into a new document."""
    reader = open_pypdf_reader(data, filename, password)
    total_pages = len(reader.pages)
    if not pages_spec or not pages_spec.strip():
        raise AppError("Masukkan nomor atau rentang halaman yang ingin diambil.", code="NO_PAGES_SELECTED")

    selected = parse_page_selection(pages_spec, total_pages, deduplicate=True)
    writer = PdfWriter()
    for page_num in selected:
        writer.add_page(reader.pages[page_num - 1])

    stem = Path(filename).stem or "dokumen"
    out_path = job_dir / f"{stem}_extracted.pdf"
    with out_path.open("wb") as handle:
        writer.write(handle)

    return out_path, len(selected)


def _build_text_watermark_overlay(
    width_pt: float,
    height_pt: float,
    *,
    text: str,
    font_size: int,
    rgb: tuple[float, float, float],
    opacity: float,
    rotation: int,
    position: WatermarkPosition,
) -> bytes:
    buf = io.BytesIO()
    c = rl_canvas.Canvas(buf, pagesize=(width_pt, height_pt))
    c.setFillColorRGB(*rgb, alpha=opacity)
    c.setFont("Helvetica-Bold", font_size)

    margin = 36.0
    if position == WatermarkPosition.TILE:
        step_x = max(140.0, font_size * max(len(text), 4) * 0.75)
        step_y = max(120.0, font_size * 3.5)
        y = margin
        while y < height_pt + step_y:
            x = margin
            while x < width_pt + step_x:
                c.saveState()
                c.translate(x, y)
                c.rotate(rotation)
                c.drawCentredString(0, 0, text)
                c.restoreState()
                x += step_x
            y += step_y
    else:
        coords = {
            WatermarkPosition.CENTER: (width_pt / 2.0, height_pt / 2.0),
            WatermarkPosition.TOP_LEFT: (margin + font_size * 2, height_pt - margin - font_size),
            WatermarkPosition.TOP_RIGHT: (width_pt - margin - font_size * 2, height_pt - margin - font_size),
            WatermarkPosition.BOTTOM_LEFT: (margin + font_size * 2, margin + font_size),
            WatermarkPosition.BOTTOM_RIGHT: (width_pt - margin - font_size * 2, margin + font_size),
        }
        cx, cy = coords[position]
        c.saveState()
        c.translate(cx, cy)
        c.rotate(rotation)
        c.drawCentredString(0, -font_size * 0.35, text)
        c.restoreState()

    c.showPage()
    c.save()
    return buf.getvalue()


def _prepare_watermark_image(image_bytes: bytes, opacity: float) -> tuple[bytes, int, int]:
    try:
        with Image.open(io.BytesIO(image_bytes)) as img:
            rgba = ImageOps.exif_transpose(img).convert("RGBA")
            r, g, b, a = rgba.split()
            scaled_alpha = a.point(lambda px: int(px * opacity))
            merged = Image.merge("RGBA", (r, g, b, scaled_alpha))
            buf = io.BytesIO()
            merged.save(buf, format="PNG")
            return buf.getvalue(), merged.width, merged.height
    except Exception as exc:
        raise AppError(
            "Gambar watermark rusak atau formatnya tidak valid.",
            code="INVALID_WATERMARK_IMAGE",
        ) from exc


def watermark_pdf(
    job_dir: Path,
    data: bytes,
    filename: str,
    *,
    watermark_type: WatermarkType = WatermarkType.TEXT,
    text: str = "CONFIDENTIAL",
    font_size: int = 36,
    color_hex: str = "#0D7A68",
    opacity: float = 0.25,
    rotation: int = 35,
    position: WatermarkPosition = WatermarkPosition.CENTER,
    watermark_image_bytes: bytes | None = None,
    image_scale: float = 0.35,
    pages_spec: str | None = None,
    password: str | None = None,
) -> tuple[Path, int]:
    """Apply a text or image watermark overlay to selected PDF pages."""
    if opacity < 0.05 or opacity > 1.0:
        raise AppError("Opasitas watermark harus antara 0.05 dan 1.0.", code="INVALID_OPACITY")

    doc = open_pymupdf_doc(data, filename, password)
    stem = Path(filename).stem or "dokumen"
    out_path = job_dir / f"{stem}_watermarked.pdf"

    try:
        selected = set(parse_page_selection(pages_spec, doc.page_count, deduplicate=True))
        if watermark_type == WatermarkType.TEXT:
            clean_text = text.strip()
            if not clean_text:
                raise AppError("Teks watermark tidak boleh kosong.", code="EMPTY_WATERMARK_TEXT")
            rgb = parse_hex_color(color_hex)

            for page_num in selected:
                page = doc.load_page(page_num - 1)
                overlay_bytes = _build_text_watermark_overlay(
                    page.rect.width,
                    page.rect.height,
                    text=clean_text,
                    font_size=font_size,
                    rgb=rgb,
                    opacity=opacity,
                    rotation=rotation,
                    position=position,
                )
                overlay_doc = pymupdf.open(stream=overlay_bytes, filetype="pdf")
                try:
                    page.show_pdf_page(page.rect, overlay_doc, 0, overlay=True)
                finally:
                    overlay_doc.close()
        else:
            if not watermark_image_bytes:
                raise AppError("Unggah gambar logo untuk watermark gambar.", code="MISSING_WATERMARK_IMAGE")
            png_bytes, img_w, img_h = _prepare_watermark_image(watermark_image_bytes, opacity)
            aspect = img_h / max(img_w, 1)

            for page_num in selected:
                page = doc.load_page(page_num - 1)
                pw, ph = page.rect.width, page.rect.height
                draw_w = max(24.0, pw * min(max(image_scale, 0.08), 0.9))
                draw_h = draw_w * aspect
                if draw_h > ph * 0.85:
                    draw_h = ph * 0.85
                    draw_w = draw_h / max(aspect, 0.01)

                margin = 24.0
                if position == WatermarkPosition.TILE:
                    step_x = draw_w + 48.0
                    step_y = draw_h + 48.0
                    y = margin
                    while y < ph:
                        x = margin
                        while x < pw:
                            rect = pymupdf.Rect(x, y, x + draw_w, y + draw_h)
                            page.insert_image(rect, stream=png_bytes, overlay=True)
                            x += step_x
                        y += step_y
                else:
                    rects = {
                        WatermarkPosition.CENTER: pymupdf.Rect(
                            (pw - draw_w) / 2, (ph - draw_h) / 2, (pw + draw_w) / 2, (ph + draw_h) / 2
                        ),
                        WatermarkPosition.TOP_LEFT: pymupdf.Rect(
                            margin, margin, margin + draw_w, margin + draw_h
                        ),
                        WatermarkPosition.TOP_RIGHT: pymupdf.Rect(
                            pw - margin - draw_w, margin, pw - margin, margin + draw_h
                        ),
                        WatermarkPosition.BOTTOM_LEFT: pymupdf.Rect(
                            margin, ph - margin - draw_h, margin + draw_w, ph - margin
                        ),
                        WatermarkPosition.BOTTOM_RIGHT: pymupdf.Rect(
                            pw - margin - draw_w, ph - margin - draw_h, pw - margin, ph - margin
                        ),
                    }
                    page.insert_image(rects[position], stream=png_bytes, overlay=True)

        doc.save(str(out_path), deflate=True)
        return out_path, doc.page_count
    finally:
        doc.close()


def add_page_numbers(
    job_dir: Path,
    data: bytes,
    filename: str,
    *,
    position: PageNumberPosition = PageNumberPosition.BOTTOM_CENTER,
    format_template: str = "Halaman {page} dari {total}",
    start_number: int = 1,
    skip_first_page: bool = False,
    font_size: int = 11,
    margin_mm: float = 12.0,
    color_hex: str = "#334155",
    password: str | None = None,
) -> tuple[Path, int]:
    """Stamp formatted page numbers across PDF pages."""
    if start_number < 1:
        raise AppError("Nomor awal halaman minimal 1.", code="INVALID_START_NUMBER")

    doc = open_pymupdf_doc(data, filename, password)
    rgb = parse_hex_color(color_hex)
    margin_pt = max(4.0, margin_mm) * MM_TO_PT
    stem = Path(filename).stem or "dokumen"
    out_path = job_dir / f"{stem}_numbered.pdf"

    try:
        total_pages = doc.page_count
        total_display = start_number + total_pages - 1 - (1 if skip_first_page else 0)

        for idx in range(total_pages):
            if skip_first_page and idx == 0:
                continue

            page = doc.load_page(idx)
            pw, ph = page.rect.width, page.rect.height
            display_num = start_number + idx - (1 if skip_first_page else 0)
            label = (
                format_template.replace("{page}", str(display_num))
                .replace("{total}", str(max(total_display, display_num)))
            )

            buf = io.BytesIO()
            c = rl_canvas.Canvas(buf, pagesize=(pw, ph))
            c.setFillColorRGB(*rgb)
            c.setFont("Helvetica", font_size)

            y = margin_pt if position.value.startswith("bottom") else ph - margin_pt - font_size * 0.6
            if position.value.endswith("left"):
                c.drawString(margin_pt, y, label)
            elif position.value.endswith("right"):
                c.drawRightString(pw - margin_pt, y, label)
            else:
                c.drawCentredString(pw / 2.0, y, label)

            c.showPage()
            c.save()

            overlay_doc = pymupdf.open(stream=buf.getvalue(), filetype="pdf")
            try:
                page.show_pdf_page(page.rect, overlay_doc, 0, overlay=True)
            finally:
                overlay_doc.close()

        doc.save(str(out_path), deflate=True)
        return out_path, total_pages
    finally:
        doc.close()


def resize_pdf(
    job_dir: Path,
    data: bytes,
    filename: str,
    *,
    paper_size: PaperSize = PaperSize.A4,
    custom_width_mm: float = 210.0,
    custom_height_mm: float = 297.0,
    orientation: Orientation = Orientation.AUTO,
    margin_mm: float = 10.0,
    fit_mode: FitMode = FitMode.FIT,
    password: str | None = None,
) -> tuple[Path, int]:
    """Resize PDF pages to target standard or custom paper dimensions with margin & fit/fill."""
    if margin_mm < 0 or margin_mm > 60:
        raise AppError("Margin harus antara 0 mm dan 60 mm.", code="INVALID_MARGIN")

    doc_in = open_pymupdf_doc(data, filename, password)
    doc_out = pymupdf.open()
    margin_pt = margin_mm * MM_TO_PT
    stem = Path(filename).stem or "dokumen"
    out_path = job_dir / f"{stem}_resized.pdf"

    try:
        for idx in range(doc_in.page_count):
            src_page = doc_in.load_page(idx)
            src_rect = src_page.rect
            target_w, target_h = resolve_paper_dimensions_pt(
                paper_size,
                custom_width_mm=custom_width_mm,
                custom_height_mm=custom_height_mm,
                orientation=orientation,
                source_width_pt=src_rect.width,
                source_height_pt=src_rect.height,
            )

            box_w = target_w - 2.0 * margin_pt
            box_h = target_h - 2.0 * margin_pt
            if box_w <= 10 or box_h <= 10:
                raise AppError(
                    "Margin terlalu besar untuk ukuran kertas tujuan.",
                    code="MARGIN_EXCEEDS_PAPER",
                )

            out_page = doc_out.new_page(width=target_w, height=target_h)
            target_rect = pymupdf.Rect(
                margin_pt, margin_pt, target_w - margin_pt, target_h - margin_pt
            )

            if fit_mode == FitMode.FIT:
                out_page.show_pdf_page(target_rect, doc_in, idx, keep_proportion=True)
            else:
                src_ratio = src_rect.width / max(src_rect.height, 1.0)
                box_ratio = box_w / max(box_h, 1.0)
                if src_ratio > box_ratio:
                    crop_w = src_rect.height * box_ratio
                    x0 = src_rect.x0 + (src_rect.width - crop_w) / 2.0
                    clip = pymupdf.Rect(x0, src_rect.y0, x0 + crop_w, src_rect.y1)
                else:
                    crop_h = src_rect.width / box_ratio
                    y0 = src_rect.y0 + (src_rect.height - crop_h) / 2.0
                    clip = pymupdf.Rect(src_rect.x0, y0, src_rect.x1, y0 + crop_h)
                out_page.show_pdf_page(
                    target_rect, doc_in, idx, keep_proportion=True, clip=clip
                )

        doc_out.save(str(out_path), deflate=True)
        return out_path, doc_out.page_count
    finally:
        doc_out.close()
        doc_in.close()


def ocr_pdf(
    job_dir: Path,
    data: bytes,
    filename: str,
    *,
    language: str = "ind+eng",
    dpi: int = 200,
    password: str | None = None,
    tesseract_cmd: str | None = None,
) -> tuple[Path, int, str]:
    """Convert scanned PDF pages into a searchable PDF using Tesseract OCR."""
    resolved_cmd = tesseract_cmd or shutil.which("tesseract")
    if not resolved_cmd:
        raise AppError(
            "Tesseract OCR belum terpasang di sistem server. Instal Tesseract OCR atau atur RUANGKERJA_TESSERACT_CMD di backend/.env untuk menggunakan fitur OCR PDF.",
            code="TESSERACT_NOT_INSTALLED",
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    pytesseract.pytesseract.tesseract_cmd = resolved_cmd
    doc = open_pymupdf_doc(data, filename, password)
    merged_doc = pymupdf.open()
    extracted_snippets: list[str] = []
    zoom = dpi / 72.0
    matrix = pymupdf.Matrix(zoom, zoom)
    stem = Path(filename).stem or "dokumen"
    out_path = job_dir / f"{stem}_ocr.pdf"

    try:
        for idx in range(doc.page_count):
            page = doc.load_page(idx)
            pix = page.get_pixmap(matrix=matrix, alpha=False)
            pil_img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)

            try:
                page_pdf_bytes = pytesseract.image_to_pdf_or_hocr(
                    pil_img, lang=language, extension="pdf"
                )
                text = pytesseract.image_to_string(pil_img, lang=language).strip()
                if text:
                    extracted_snippets.append(text[:300])
            except pytesseract.TesseractError as exc:
                raise AppError(
                    f"Gagal menjalankan OCR (bahasa '{language}'): {exc}",
                    code="OCR_PROCESSING_ERROR",
                ) from exc

            ocr_page_doc = pymupdf.open(stream=page_pdf_bytes, filetype="pdf")
            try:
                merged_doc.insert_pdf(ocr_page_doc)
            finally:
                ocr_page_doc.close()

        merged_doc.save(str(out_path), deflate=True)
        preview_text = "\n\n".join(extracted_snippets)[:600]
        return out_path, merged_doc.page_count, preview_text
    finally:
        merged_doc.close()
        doc.close()

