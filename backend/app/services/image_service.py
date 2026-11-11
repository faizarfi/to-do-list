"""Core image manipulation and conversion services for all 12 Image Tools."""

from __future__ import annotations

import io
import math
from pathlib import Path

from PIL import ExifTags, Image, ImageDraw, ImageFont, ImageOps

from app.core.exceptions import AppError
from app.schemas.image import (
    BulkResizeMode,
    CollageFitMode,
    CollageLayout,
    ImageInfoResponse,
    ImageMetadataItem,
    ImageTargetFormat,
    ImageWatermarkPosition,
    ImageWatermarkType,
    PassportPhotoSize,
    RenameCaseMode,
)
from app.utils.file_security import sanitize_filename
from app.utils.response_helpers import package_outputs, parse_hex_color_rgb_int

MM_TO_INCH = 1.0 / 25.4

PASSPORT_MM_MAP: dict[PassportPhotoSize, tuple[float, float]] = {
    PassportPhotoSize.SIZE_2X3: (20.0, 30.0),
    PassportPhotoSize.SIZE_3X4: (30.0, 40.0),
    PassportPhotoSize.SIZE_4X6: (40.0, 60.0),
}

FORMAT_TO_PILLOW: dict[ImageTargetFormat, tuple[str, str, str]] = {
    ImageTargetFormat.JPG: ("JPEG", ".jpg", "image/jpeg"),
    ImageTargetFormat.PNG: ("PNG", ".png", "image/png"),
    ImageTargetFormat.WEBP: ("WEBP", ".webp", "image/webp"),
    ImageTargetFormat.TIFF: ("TIFF", ".tiff", "image/tiff"),
}


def _open_image(data: bytes, filename: str, *, transpose: bool = True) -> Image.Image:
    try:
        raw = Image.open(io.BytesIO(data))
        raw.load()
        if transpose:
            return ImageOps.exif_transpose(raw)
        return raw
    except Exception as exc:
        raise AppError(
            f"File gambar '{filename}' rusak atau tidak dapat dibuka.",
            code="CORRUPTED_IMAGE",
        ) from exc


def _flatten_to_rgb(img: Image.Image, bg_rgb: tuple[int, int, int] = (255, 255, 255)) -> Image.Image:
    if img.mode in ("RGBA", "LA", "PA"):
        rgba = img.convert("RGBA")
        canvas = Image.new("RGB", rgba.size, bg_rgb)
        canvas.paste(rgba, mask=rgba.split()[3])
        return canvas
    if img.mode == "P":
        rgba = img.convert("RGBA")
        canvas = Image.new("RGB", rgba.size, bg_rgb)
        canvas.paste(rgba, mask=rgba.split()[3])
        return canvas
    if img.mode == "RGB":
        return img
    return img.convert("RGB")


def _infer_target_format(filename: str, pillow_format: str | None = None) -> ImageTargetFormat:
    ext = Path(filename).suffix.lower()
    if ext in {".jpg", ".jpeg"} or pillow_format == "JPEG":
        return ImageTargetFormat.JPG
    if ext == ".webp" or pillow_format == "WEBP":
        return ImageTargetFormat.WEBP
    if ext in {".tif", ".tiff"} or pillow_format == "TIFF":
        return ImageTargetFormat.TIFF
    return ImageTargetFormat.PNG


def _save_image_to_path(
    img: Image.Image,
    out_path: Path,
    target_format: ImageTargetFormat,
    *,
    quality: int = 85,
    dpi: tuple[int, int] | None = None,
    lossless_webp: bool = False,
) -> None:
    pillow_fmt, _, _ = FORMAT_TO_PILLOW[target_format]
    save_kwargs: dict[str, object] = {}

    to_save = img
    if target_format == ImageTargetFormat.JPG:
        to_save = _flatten_to_rgb(img)
        save_kwargs["quality"] = quality
        save_kwargs["optimize"] = True
        save_kwargs["progressive"] = True
    elif target_format == ImageTargetFormat.PNG:
        save_kwargs["optimize"] = True
    elif target_format == ImageTargetFormat.WEBP:
        save_kwargs["quality"] = quality
        save_kwargs["lossless"] = lossless_webp
    elif target_format == ImageTargetFormat.TIFF:
        save_kwargs["compression"] = "tiff_deflate"

    if dpi is not None and target_format != ImageTargetFormat.WEBP:
        save_kwargs["dpi"] = dpi

    to_save.save(out_path, format=pillow_fmt, **save_kwargs)


def _unique_output_path(job_dir: Path, desired_name: str) -> Path:
    candidate = job_dir / desired_name
    if not candidate.exists():
        return candidate
    stem = candidate.stem
    suffix = candidate.suffix
    counter = 2
    while (job_dir / f"{stem}_{counter}{suffix}").exists():
        counter += 1
    return job_dir / f"{stem}_{counter}{suffix}"


def convert_images(
    job_dir: Path,
    images: list[tuple[str, bytes]],
    *,
    target_format: ImageTargetFormat,
    quality: int = 88,
    lossless_webp: bool = False,
) -> tuple[Path, str, str, int]:
    """Tool #16: Convert one or more images into JPG, PNG, WEBP, or TIFF."""
    if not images:
        raise AppError("Unggah minimal satu file gambar.", code="NO_FILES_PROVIDED")

    _, ext, single_mime = FORMAT_TO_PILLOW[target_format]
    output_files: list[Path] = []

    for fname, data in images:
        img = _open_image(data, fname)
        try:
            stem = Path(fname).stem or "gambar"
            out_path = _unique_output_path(job_dir, f"{stem}{ext}")
            _save_image_to_path(
                img,
                out_path,
                target_format,
                quality=quality,
                lossless_webp=lossless_webp,
            )
            output_files.append(out_path)
        finally:
            img.close()

    res_path, media_type, download_name = package_outputs(
        job_dir,
        output_files,
        single_media_type=single_mime,
        zip_filename=f"konversi-{target_format.value}.zip",
    )
    return res_path, media_type, download_name, len(output_files)


def compress_images(
    job_dir: Path,
    images: list[tuple[str, bytes]],
    *,
    quality: int = 72,
    max_dimension: int | None = None,
) -> tuple[Path, str, str, int, int, int]:
    """Tool #17: Compress multiple images while preserving their formats."""
    if not images:
        raise AppError("Unggah minimal satu file gambar.", code="NO_FILES_PROVIDED")

    output_files: list[Path] = []
    total_original = sum(len(data) for _, data in images)
    total_processed = 0
    last_mime = "image/jpeg"

    for fname, data in images:
        img = _open_image(data, fname)
        try:
            fmt = _infer_target_format(fname, img.format)
            _, ext, mime = FORMAT_TO_PILLOW[fmt]
            last_mime = mime

            working = img.copy()
            if max_dimension and max(working.size) > max_dimension:
                working.thumbnail((max_dimension, max_dimension), Image.Resampling.LANCZOS)

            if fmt == ImageTargetFormat.PNG and quality <= 80 and working.mode in ("RGB", "RGBA"):
                # Color quantization helps reduce heavy PNG sizes cleanly
                colors = max(32, min(256, int(quality * 2.8)))
                working = working.quantize(colors=colors, method=Image.Quantize.FASTOCTREE)

            stem = Path(fname).stem or "gambar"
            out_path = _unique_output_path(job_dir, f"{stem}_compressed{ext}")
            _save_image_to_path(working, out_path, fmt, quality=quality)

            # Keep original bytes if already maximally compressed and not resized
            if out_path.stat().st_size > len(data) and not max_dimension:
                out_path.write_bytes(data)

            total_processed += out_path.stat().st_size
            output_files.append(out_path)
        finally:
            img.close()

    res_path, media_type, download_name = package_outputs(
        job_dir,
        output_files,
        single_media_type=last_mime,
        zip_filename="gambar-terkompres.zip",
    )
    return res_path, media_type, download_name, len(output_files), total_original, total_processed


def _compute_target_size(
    orig_w: int,
    orig_h: int,
    width: int | None,
    height: int | None,
    keep_aspect_ratio: bool,
) -> tuple[int, int]:
    if not width and not height:
        raise AppError("Masukkan lebar atau tinggi gambar dalam piksel.", code="MISSING_DIMENSIONS")

    if keep_aspect_ratio:
        if width and height:
            scale = min(width / orig_w, height / orig_h)
            return max(1, round(orig_w * scale)), max(1, round(orig_h * scale))
        if width:
            return max(1, width), max(1, round(orig_h * (width / orig_w)))
        assert height is not None
        return max(1, round(orig_w * (height / orig_h))), max(1, height)

    target_w = width or orig_w
    target_h = height or orig_h
    return max(1, target_w), max(1, target_h)


def resize_single_image(
    job_dir: Path,
    data: bytes,
    filename: str,
    *,
    width: int | None = None,
    height: int | None = None,
    keep_aspect_ratio: bool = True,
    quality: int = 90,
    output_format: ImageTargetFormat | None = None,
) -> tuple[Path, str, str, int, int]:
    """Tool #18: Resize a single image to exact or proportional pixel dimensions."""
    img = _open_image(data, filename)
    try:
        target_w, target_h = _compute_target_size(
            img.width, img.height, width, height, keep_aspect_ratio
        )
        if target_w > 12000 or target_h > 12000:
            raise AppError("Dimensi gambar tujuan maksimal 12000 piksel.", code="DIMENSIONS_TOO_LARGE")

        resized = img.resize((target_w, target_h), Image.Resampling.LANCZOS)
        fmt = output_format or _infer_target_format(filename, img.format)
        _, ext, mime = FORMAT_TO_PILLOW[fmt]
        stem = Path(filename).stem or "gambar"
        out_path = job_dir / f"{stem}_{target_w}x{target_h}{ext}"
        _save_image_to_path(resized, out_path, fmt, quality=quality)
        return out_path, mime, out_path.name, target_w, target_h
    finally:
        img.close()


def bulk_resize_images(
    job_dir: Path,
    images: list[tuple[str, bytes]],
    *,
    mode: BulkResizeMode = BulkResizeMode.DIMENSIONS,
    width: int | None = None,
    height: int | None = None,
    keep_aspect_ratio: bool = True,
    scale_percent: int = 50,
    quality: int = 88,
) -> tuple[Path, str, str, int]:
    """Tool #19: Resize multiple images simultaneously by pixel bounds or percentage."""
    if not images:
        raise AppError("Unggah minimal satu file gambar.", code="NO_FILES_PROVIDED")

    output_files: list[Path] = []
    last_mime = "image/jpeg"

    for fname, data in images:
        img = _open_image(data, fname)
        try:
            if mode == BulkResizeMode.PERCENTAGE:
                if scale_percent < 5 or scale_percent > 400:
                    raise AppError("Skala persentase harus antara 5% dan 400%.", code="INVALID_SCALE")
                target_w = max(1, round(img.width * (scale_percent / 100.0)))
                target_h = max(1, round(img.height * (scale_percent / 100.0)))
            else:
                target_w, target_h = _compute_target_size(
                    img.width, img.height, width, height, keep_aspect_ratio
                )

            if target_w > 12000 or target_h > 12000:
                raise AppError("Dimensi gambar hasil melebihi batas 12000 piksel.", code="DIMENSIONS_TOO_LARGE")

            resized = img.resize((target_w, target_h), Image.Resampling.LANCZOS)
            fmt = _infer_target_format(fname, img.format)
            _, ext, mime = FORMAT_TO_PILLOW[fmt]
            last_mime = mime
            stem = Path(fname).stem or "gambar"
            out_path = _unique_output_path(job_dir, f"{stem}_{target_w}x{target_h}{ext}")
            _save_image_to_path(resized, out_path, fmt, quality=quality)
            output_files.append(out_path)
        finally:
            img.close()

    res_path, media_type, download_name = package_outputs(
        job_dir,
        output_files,
        single_media_type=last_mime,
        zip_filename="bulk-resized.zip",
    )
    return res_path, media_type, download_name, len(output_files)


def crop_image(
    job_dir: Path,
    data: bytes,
    filename: str,
    *,
    crop_x: int | None = None,
    crop_y: int | None = None,
    crop_width: int | None = None,
    crop_height: int | None = None,
    aspect_ratio: str | None = None,
    quality: int = 92,
) -> tuple[Path, str, str, int, int]:
    """Tool #20: Crop an image either by explicit pixel box or centered aspect ratio."""
    img = _open_image(data, filename)
    try:
        if crop_width is not None and crop_height is not None:
            x = max(0, crop_x or 0)
            y = max(0, crop_y or 0)
            if crop_width < 1 or crop_height < 1:
                raise AppError("Lebar dan tinggi area potong minimal 1 piksel.", code="INVALID_CROP_BOX")
            if x + crop_width > img.width or y + crop_height > img.height:
                raise AppError(
                    f"Area potong ({x}+{crop_width}, {y}+{crop_height}) melebihi dimensi gambar ({img.width}×{img.height}).",
                    code="CROP_OUT_OF_BOUNDS",
                )
            box = (x, y, x + crop_width, y + crop_height)
        elif aspect_ratio and ":" in aspect_ratio:
            try:
                rw_str, rh_str = aspect_ratio.split(":", 1)
                rw, rh = float(rw_str), float(rh_str)
                if rw <= 0 or rh <= 0:
                    raise ValueError
            except ValueError as exc:
                raise AppError("Format rasio potong tidak valid.", code="INVALID_ASPECT_RATIO") from exc

            target_ratio = rw / rh
            src_ratio = img.width / img.height
            if src_ratio > target_ratio:
                new_h = img.height
                new_w = max(1, round(new_h * target_ratio))
            else:
                new_w = img.width
                new_h = max(1, round(new_w / target_ratio))
            x = (img.width - new_w) // 2
            y = (img.height - new_h) // 2
            box = (x, y, x + new_w, y + new_h)
        else:
            raise AppError("Tentukan koordinat potong atau rasio aspek.", code="MISSING_CROP_PARAMS")

        cropped = img.crop(box)
        fmt = _infer_target_format(filename, img.format)
        _, ext, mime = FORMAT_TO_PILLOW[fmt]
        stem = Path(filename).stem or "gambar"
        out_path = job_dir / f"{stem}_cropped{ext}"
        _save_image_to_path(cropped, out_path, fmt, quality=quality)
        return out_path, mime, out_path.name, cropped.width, cropped.height
    finally:
        img.close()


def rotate_images(
    job_dir: Path,
    images: list[tuple[str, bytes]],
    *,
    angle: int = 90,
    flip_horizontal: bool = False,
    flip_vertical: bool = False,
    quality: int = 90,
) -> tuple[Path, str, str, int]:
    """Tool #21: Rotate (clockwise degrees) and/or flip one or more images."""
    if not images:
        raise AppError("Unggah minimal satu file gambar.", code="NO_FILES_PROVIDED")

    output_files: list[Path] = []
    last_mime = "image/jpeg"
    norm_angle = angle % 360

    for fname, data in images:
        img = _open_image(data, fname)
        try:
            working = img.copy()
            if flip_horizontal:
                working = ImageOps.mirror(working)
            if flip_vertical:
                working = ImageOps.flip(working)
            if norm_angle == 90:
                working = working.transpose(Image.Transpose.ROTATE_270)
            elif norm_angle == 180:
                working = working.transpose(Image.Transpose.ROTATE_180)
            elif norm_angle == 270:
                working = working.transpose(Image.Transpose.ROTATE_90)
            elif norm_angle != 0:
                working = working.rotate(-norm_angle, expand=True, resample=Image.Resampling.BICUBIC)

            fmt = _infer_target_format(fname, img.format)
            _, ext, mime = FORMAT_TO_PILLOW[fmt]
            last_mime = mime
            stem = Path(fname).stem or "gambar"
            out_path = _unique_output_path(job_dir, f"{stem}_rotated{ext}")
            _save_image_to_path(working, out_path, fmt, quality=quality)
            output_files.append(out_path)
        finally:
            img.close()

    res_path, media_type, download_name = package_outputs(
        job_dir,
        output_files,
        single_media_type=last_mime,
        zip_filename="gambar-diputar.zip",
    )
    return res_path, media_type, download_name, len(output_files)


def change_dpi(
    job_dir: Path,
    images: list[tuple[str, bytes]],
    *,
    dpi_x: int = 300,
    dpi_y: int | None = None,
    quality: int = 95,
) -> tuple[Path, str, str, int]:
    """Tool #22: Update physical DPI metadata across JPG, PNG, and TIFF images."""
    if not images:
        raise AppError("Unggah minimal satu file gambar.", code="NO_FILES_PROVIDED")

    target_dpi_y = dpi_y or dpi_x
    if dpi_x < 30 or dpi_x > 1200 or target_dpi_y < 30 or target_dpi_y > 1200:
        raise AppError("Nilai DPI harus antara 30 dan 1200.", code="INVALID_DPI")

    output_files: list[Path] = []
    last_mime = "image/jpeg"

    for fname, data in images:
        img = _open_image(data, fname)
        try:
            fmt = _infer_target_format(fname, img.format)
            if fmt == ImageTargetFormat.WEBP:
                # WEBP does not store physical DPI tags reliably; convert to PNG
                fmt = ImageTargetFormat.PNG
            _, ext, mime = FORMAT_TO_PILLOW[fmt]
            last_mime = mime
            stem = Path(fname).stem or "gambar"
            out_path = _unique_output_path(job_dir, f"{stem}_{dpi_x}dpi{ext}")
            _save_image_to_path(
                img,
                out_path,
                fmt,
                quality=quality,
                dpi=(dpi_x, target_dpi_y),
            )
            output_files.append(out_path)
        finally:
            img.close()

    res_path, media_type, download_name = package_outputs(
        job_dir,
        output_files,
        single_media_type=last_mime,
        zip_filename=f"gambar-{dpi_x}dpi.zip",
    )
    return res_path, media_type, download_name, len(output_files)


def make_passport_photo(
    job_dir: Path,
    data: bytes,
    filename: str,
    *,
    photo_size: PassportPhotoSize = PassportPhotoSize.SIZE_3X4,
    dpi: int = 300,
    background_hex: str = "#DC2626",
    apply_bg_to_alpha: bool = True,
    focus_x: float = 0.5,
    focus_y: float = 0.35,
    print_sheet: bool = False,
    output_format: ImageTargetFormat = ImageTargetFormat.JPG,
) -> tuple[Path, str, str, int, int]:
    """Tool #23: Generate standard 2x3, 3x4, or 4x6 passport photos (single or 4R sheet)."""
    if dpi not in (150, 300, 600):
        raise AppError("DPI pas foto harus 150, 300, atau 600.", code="INVALID_DPI")

    w_mm, h_mm = PASSPORT_MM_MAP[photo_size]
    target_w = max(1, round(w_mm * MM_TO_INCH * dpi))
    target_h = max(1, round(h_mm * MM_TO_INCH * dpi))
    bg_rgb = parse_hex_color_rgb_int(background_hex)

    img = _open_image(data, filename)
    try:
        working = _flatten_to_rgb(img, bg_rgb) if apply_bg_to_alpha else _flatten_to_rgb(img)
        fitted = ImageOps.fit(
            working,
            (target_w, target_h),
            method=Image.Resampling.LANCZOS,
            centering=(min(max(focus_x, 0.0), 1.0), min(max(focus_y, 0.0), 1.0)),
        )

        if print_sheet:
            # 4R sheet: 102 x 152 mm (landscape 152 x 102 mm)
            sheet_w = round(152.0 * MM_TO_INCH * dpi)
            sheet_h = round(102.0 * MM_TO_INCH * dpi)
            gap = round(3.0 * MM_TO_INCH * dpi)
            sheet = Image.new("RGB", (sheet_w, sheet_h), (255, 255, 255))

            cols = max(1, (sheet_w - gap) // (target_w + gap))
            rows = max(1, (sheet_h - gap) // (target_h + gap))
            total_grid_w = cols * target_w + (cols - 1) * gap
            total_grid_h = rows * target_h + (rows - 1) * gap
            start_x = (sheet_w - total_grid_w) // 2
            start_y = (sheet_h - total_grid_h) // 2

            for r in range(rows):
                for c in range(cols):
                    px = start_x + c * (target_w + gap)
                    py = start_y + r * (target_h + gap)
                    sheet.paste(fitted, (px, py))
            final_img = sheet
        else:
            final_img = fitted

        _, ext, mime = FORMAT_TO_PILLOW[output_format]
        stem = Path(filename).stem or "pasfoto"
        suffix = f"_{photo_size.value}_sheet4r" if print_sheet else f"_{photo_size.value}"
        out_path = job_dir / f"{stem}{suffix}{ext}"
        _save_image_to_path(
            final_img, out_path, output_format, quality=95, dpi=(dpi, dpi)
        )
        return out_path, mime, out_path.name, final_img.width, final_img.height
    finally:
        img.close()


def bulk_rename_images(
    job_dir: Path,
    images: list[tuple[str, bytes]],
    *,
    prefix: str = "file-",
    suffix: str = "",
    start_number: int = 1,
    zero_pad: int = 3,
    keep_original_name: bool = False,
    case_mode: RenameCaseMode = RenameCaseMode.ORIGINAL,
) -> tuple[Path, str, str, int]:
    """Tool #24: Batch-rename files safely with numbering, prefix/suffix, and collision guard."""
    if not images:
        raise AppError("Unggah minimal satu file gambar.", code="NO_FILES_PROVIDED")
    if zero_pad < 1 or zero_pad > 8:
        raise AppError("Digit padding nomor urut harus antara 1 dan 8.", code="INVALID_PADDING")

    output_files: list[Path] = []
    last_mime = "application/octet-stream"

    for idx, (fname, data) in enumerate(images):
        orig_path = Path(fname)
        orig_stem = orig_path.stem
        orig_ext = orig_path.suffix.lower()
        number_str = str(start_number + idx).zfill(zero_pad)

        base = f"{prefix}{orig_stem}_{number_str}{suffix}" if keep_original_name else f"{prefix}{number_str}{suffix}"
        if case_mode == RenameCaseMode.LOWERCASE:
            base = base.lower()
            orig_ext = orig_ext.lower()
        elif case_mode == RenameCaseMode.UPPERCASE:
            base = base.upper()
            orig_ext = orig_ext.upper()

        safe_name = sanitize_filename(f"{base}{orig_ext}", fallback=f"file_{number_str}{orig_ext}")
        out_path = _unique_output_path(job_dir, safe_name)
        out_path.write_bytes(data)
        output_files.append(out_path)

        fmt = _infer_target_format(safe_name)
        last_mime = FORMAT_TO_PILLOW[fmt][2]

    res_path, media_type, download_name = package_outputs(
        job_dir,
        output_files,
        single_media_type=last_mime,
        zip_filename="bulk-renamed.zip",
    )
    return res_path, media_type, download_name, len(output_files)


def watermark_images(
    job_dir: Path,
    images: list[tuple[str, bytes]],
    *,
    watermark_type: ImageWatermarkType = ImageWatermarkType.TEXT,
    text: str = "RuangKerja",
    font_size_pct: int = 6,
    color_hex: str = "#FFFFFF",
    opacity: float = 0.45,
    position: ImageWatermarkPosition = ImageWatermarkPosition.BOTTOM_RIGHT,
    watermark_logo_bytes: bytes | None = None,
    logo_scale_pct: int = 20,
    quality: int = 90,
) -> tuple[Path, str, str, int]:
    """Tool #25: Stamp text or transparent logo watermark onto one or more images."""
    if not images:
        raise AppError("Unggah minimal satu file gambar.", code="NO_FILES_PROVIDED")
    if opacity < 0.05 or opacity > 1.0:
        raise AppError("Opasitas watermark harus antara 0.05 dan 1.0.", code="INVALID_OPACITY")

    logo_rgba: Image.Image | None = None
    if watermark_type == ImageWatermarkType.IMAGE:
        if not watermark_logo_bytes:
            raise AppError("Unggah gambar/logo untuk watermark gambar.", code="MISSING_WATERMARK_IMAGE")
        raw_logo = _open_image(watermark_logo_bytes, "watermark-logo.png").convert("RGBA")
        r, g, b, a = raw_logo.split()
        a = a.point(lambda px: int(px * opacity))
        logo_rgba = Image.merge("RGBA", (r, g, b, a))

    rgb = parse_hex_color_rgb_int(color_hex)
    output_files: list[Path] = []
    last_mime = "image/png"

    try:
        for fname, data in images:
            base_img = _open_image(data, fname)
            try:
                rgba_base = base_img.convert("RGBA")
                overlay = Image.new("RGBA", rgba_base.size, (0, 0, 0, 0))
                w, h = rgba_base.size
                margin = max(12, round(min(w, h) * 0.03))

                if watermark_type == ImageWatermarkType.TEXT:
                    clean_text = text.strip()
                    if not clean_text:
                        raise AppError("Teks watermark tidak boleh kosong.", code="EMPTY_WATERMARK_TEXT")
                    font_px = max(14, round(min(w, h) * (font_size_pct / 100.0)))
                    font = ImageFont.load_default(size=font_px)
                    draw = ImageDraw.Draw(overlay)
                    bbox = draw.textbbox((0, 0), clean_text, font=font)
                    tw = bbox[2] - bbox[0]
                    th = bbox[3] - bbox[1]
                    alpha_int = round(opacity * 255)
                    fill = (*rgb, alpha_int)

                    if position == ImageWatermarkPosition.TILE:
                        step_x = max(tw + 48, 80)
                        step_y = max(th + 48, 80)
                        for py in range(margin, h, step_y):
                            for px in range(margin, w, step_x):
                                draw.text((px, py), clean_text, font=font, fill=fill)
                    else:
                        coords = {
                            ImageWatermarkPosition.CENTER: ((w - tw) // 2, (h - th) // 2),
                            ImageWatermarkPosition.TOP_LEFT: (margin, margin),
                            ImageWatermarkPosition.TOP_RIGHT: (max(margin, w - tw - margin), margin),
                            ImageWatermarkPosition.BOTTOM_LEFT: (margin, max(margin, h - th - margin)),
                            ImageWatermarkPosition.BOTTOM_RIGHT: (
                                max(margin, w - tw - margin),
                                max(margin, h - th - margin),
                            ),
                        }
                        px, py = coords[position]
                        draw.text((px, py), clean_text, font=font, fill=fill)
                else:
                    assert logo_rgba is not None
                    target_logo_w = max(16, round(w * (logo_scale_pct / 100.0)))
                    aspect = logo_rgba.height / max(logo_rgba.width, 1)
                    target_logo_h = max(16, round(target_logo_w * aspect))
                    if target_logo_h > h * 0.85:
                        target_logo_h = round(h * 0.85)
                        target_logo_w = max(16, round(target_logo_h / max(aspect, 0.01)))
                    resized_logo = logo_rgba.resize(
                        (target_logo_w, target_logo_h), Image.Resampling.LANCZOS
                    )

                    if position == ImageWatermarkPosition.TILE:
                        step_x = target_logo_w + 32
                        step_y = target_logo_h + 32
                        for py in range(margin, h, step_y):
                            for px in range(margin, w, step_x):
                                overlay.paste(resized_logo, (px, py), resized_logo)
                    else:
                        coords = {
                            ImageWatermarkPosition.CENTER: (
                                (w - target_logo_w) // 2,
                                (h - target_logo_h) // 2,
                            ),
                            ImageWatermarkPosition.TOP_LEFT: (margin, margin),
                            ImageWatermarkPosition.TOP_RIGHT: (
                                max(margin, w - target_logo_w - margin),
                                margin,
                            ),
                            ImageWatermarkPosition.BOTTOM_LEFT: (
                                margin,
                                max(margin, h - target_logo_h - margin),
                            ),
                            ImageWatermarkPosition.BOTTOM_RIGHT: (
                                max(margin, w - target_logo_w - margin),
                                max(margin, h - target_logo_h - margin),
                            ),
                        }
                        px, py = coords[position]
                        overlay.paste(resized_logo, (px, py), resized_logo)

                combined = Image.alpha_composite(rgba_base, overlay)
                fmt = _infer_target_format(fname, base_img.format)
                _, ext, mime = FORMAT_TO_PILLOW[fmt]
                last_mime = mime
                stem = Path(fname).stem or "gambar"
                out_path = _unique_output_path(job_dir, f"{stem}_watermarked{ext}")
                _save_image_to_path(combined, out_path, fmt, quality=quality)
                output_files.append(out_path)
            finally:
                base_img.close()
    finally:
        if logo_rgba is not None:
            logo_rgba.close()

    res_path, media_type, download_name = package_outputs(
        job_dir,
        output_files,
        single_media_type=last_mime,
        zip_filename="gambar-watermark.zip",
    )
    return res_path, media_type, download_name, len(output_files)


def create_collage(
    job_dir: Path,
    images: list[tuple[str, bytes]],
    *,
    layout: CollageLayout = CollageLayout.GRID,
    columns: int = 2,
    cell_size_px: int = 500,
    gap_px: int = 16,
    padding_px: int = 24,
    background_hex: str = "#FFFFFF",
    fit_mode: CollageFitMode = CollageFitMode.COVER,
    output_format: ImageTargetFormat = ImageTargetFormat.JPG,
    quality: int = 90,
) -> tuple[Path, str, str, int, int]:
    """Tool #26: Combine 2–16 images into a clean grid, horizontal, or vertical collage."""
    if len(images) < 2:
        raise AppError("Unggah minimal 2 gambar untuk membuat kolase.", code="MINIMUM_TWO_FILES")
    if len(images) > 16:
        raise AppError("Kolase mendukung maksimal 16 gambar sekaligus.", code="TOO_MANY_FILES")

    bg_rgb = parse_hex_color_rgb_int(background_hex)
    count = len(images)
    if layout == CollageLayout.HORIZONTAL:
        cols, rows = count, 1
    elif layout == CollageLayout.VERTICAL:
        cols, rows = 1, count
    else:
        cols = max(1, min(columns, count, 4))
        rows = math.ceil(count / cols)

    cell_w = max(120, min(cell_size_px, 1200))
    cell_h = cell_w
    canvas_w = padding_px * 2 + cols * cell_w + max(0, cols - 1) * gap_px
    canvas_h = padding_px * 2 + rows * cell_h + max(0, rows - 1) * gap_px
    collage = Image.new("RGB", (canvas_w, canvas_h), bg_rgb)

    for idx, (fname, data) in enumerate(images):
        img = _open_image(data, fname)
        try:
            rgb_img = _flatten_to_rgb(img, bg_rgb)
            if fit_mode == CollageFitMode.COVER:
                cell_img = ImageOps.fit(rgb_img, (cell_w, cell_h), method=Image.Resampling.LANCZOS)
            else:
                cell_img = ImageOps.pad(
                    rgb_img, (cell_w, cell_h), method=Image.Resampling.LANCZOS, color=bg_rgb
                )
            row = idx // cols
            col = idx % cols
            px = padding_px + col * (cell_w + gap_px)
            py = padding_px + row * (cell_h + gap_px)
            collage.paste(cell_img, (px, py))
        finally:
            img.close()

    _, ext, mime = FORMAT_TO_PILLOW[output_format]
    out_path = job_dir / f"kolase-ruangkerja{ext}"
    _save_image_to_path(collage, out_path, output_format, quality=quality)
    return out_path, mime, out_path.name, canvas_w, canvas_h


def _format_exif_value(value: object) -> str:
    if isinstance(value, bytes):
        return f"<{len(value)} bytes>"
    if isinstance(value, tuple):
        return ", ".join(str(x) for x in value[:6])
    return str(value)[:160]


def inspect_images_info(images: list[tuple[str, bytes]]) -> ImageInfoResponse:
    """Tool #27: Inspect dimensions, format, color mode, resolution, and DPI metadata."""
    if not images:
        raise AppError("Unggah minimal satu file gambar.", code="NO_FILES_PROVIDED")

    items: list[ImageMetadataItem] = []
    for fname, data in images:
        raw = _open_image(data, fname, transpose=False)
        try:
            dpi_tuple = raw.info.get("dpi")
            dpi_x = round(float(dpi_tuple[0]), 1) if isinstance(dpi_tuple, tuple) and len(dpi_tuple) >= 2 else None
            dpi_y = round(float(dpi_tuple[1]), 1) if isinstance(dpi_tuple, tuple) and len(dpi_tuple) >= 2 else None

            exif_dict: dict[str, str] = {}
            try:
                raw_exif = raw.getexif()
                if raw_exif:
                    for tag_id, val in raw_exif.items():
                        tag_name = str(ExifTags.TAGS.get(tag_id, tag_id))
                        if tag_name in {"MakerNote", "UserComment"}:
                            continue
                        exif_dict[tag_name] = _format_exif_value(val)
                        if len(exif_dict) >= 20:
                            break
            except Exception:
                pass

            transposed = ImageOps.exif_transpose(raw)
            w, h = transposed.width, transposed.height
            divisor = math.gcd(w, h) or 1
            ratio_str = f"{w // divisor}:{h // divisor}"
            fmt_label = raw.format or Path(fname).suffix.lstrip(".").upper() or "IMAGE"
            mime = Image.MIME.get(fmt_label, f"image/{fmt_label.lower()}")
            has_alpha = "A" in transposed.mode or (
                transposed.mode == "P" and "transparency" in raw.info
            )

            items.append(
                ImageMetadataItem(
                    filename=fname,
                    file_size_bytes=len(data),
                    format=fmt_label,
                    mime_type=mime,
                    width=w,
                    height=h,
                    megapixels=round((w * h) / 1_000_000, 2),
                    aspect_ratio=ratio_str,
                    color_mode=transposed.mode,
                    has_alpha=has_alpha,
                    dpi_x=dpi_x,
                    dpi_y=dpi_y,
                    exif=exif_dict,
                )
            )
        finally:
            raw.close()

    return ImageInfoResponse(count=len(items), items=items)

