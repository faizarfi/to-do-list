"""Additional Image Tools processing services (Tools #56–#61)."""

from __future__ import annotations

import json
import zipfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageOps

from app.core.exceptions import AppError
from app.schemas.image import (
    CollageFitMode,
    ColorPaletteResponse,
    ImageFilterPreset,
    ImageTargetFormat,
    PaletteColorItem,
    SocialMediaPreset,
)
from app.services.image_service import (
    FORMAT_TO_PILLOW,
    _infer_target_format,
    _open_image,
    _save_image_to_path,
)
from app.utils.file_security import sanitize_filename
from app.utils.response_helpers import package_outputs, parse_hex_color_rgb_int

SOCIAL_DIMENSIONS: dict[SocialMediaPreset, tuple[int, int]] = {
    SocialMediaPreset.IG_SQUARE: (1080, 1080),
    SocialMediaPreset.IG_PORTRAIT: (1080, 1350),
    SocialMediaPreset.IG_STORY: (1080, 1920),
    SocialMediaPreset.YT_THUMB: (1280, 720),
    SocialMediaPreset.LINKEDIN_BANNER: (1584, 396),
    SocialMediaPreset.X_HEADER: (1500, 500),
}


def _apply_sepia(img: Image.Image) -> Image.Image:
    has_alpha = img.mode == "RGBA"
    alpha = img.getchannel("A") if has_alpha else None
    gray = img.convert("L")
    # Classic warm sepia palette mapping
    sepia = ImageOps.colorize(gray, black="#2E1A0B", white="#F5E6C8")
    if has_alpha and alpha is not None:
        rgba = sepia.convert("RGBA")
        rgba.putalpha(alpha)
        return rgba
    return sepia


def adjust_images(
    job_dir: Path,
    images: list[tuple[str, bytes]],
    *,
    brightness: float = 1.0,
    contrast: float = 1.0,
    saturation: float = 1.0,
    sharpness: float = 1.0,
    blur_radius: float = 0.0,
    effect: ImageFilterPreset = ImageFilterPreset.NONE,
    output_format: ImageTargetFormat | None = None,
    quality: int = 90,
) -> tuple[Path, str, str, int]:
    """Tool #56: Adjust image brightness, contrast, saturation, sharpness, blur, and tone filters."""
    outputs: list[Path] = []
    single_mime = "image/png"

    for fname, data in images:
        raw = _open_image(data, fname)
        try:
            has_alpha = "A" in raw.mode
            work = raw.convert("RGBA") if has_alpha else raw.convert("RGB")
            alpha = work.getchannel("A") if has_alpha else None
            rgb = work.convert("RGB")

            if abs(brightness - 1.0) > 1e-3:
                rgb = ImageEnhance.Brightness(rgb).enhance(brightness)
            if abs(contrast - 1.0) > 1e-3:
                rgb = ImageEnhance.Contrast(rgb).enhance(contrast)
            if abs(saturation - 1.0) > 1e-3:
                rgb = ImageEnhance.Color(rgb).enhance(saturation)
            if abs(sharpness - 1.0) > 1e-3:
                rgb = ImageEnhance.Sharpness(rgb).enhance(sharpness)
            if blur_radius > 0.05:
                rgb = rgb.filter(ImageFilter.GaussianBlur(radius=blur_radius))

            if effect == ImageFilterPreset.GRAYSCALE:
                rgb = ImageOps.grayscale(rgb).convert("RGB")
            elif effect == ImageFilterPreset.SEPIA:
                rgb = _apply_sepia(rgb)
            elif effect == ImageFilterPreset.INVERT:
                rgb = ImageOps.invert(rgb)

            if has_alpha and alpha is not None:
                final_img = rgb.convert("RGBA")
                final_img.putalpha(alpha)
            else:
                final_img = rgb

            fmt = output_format or _infer_target_format(fname, raw.format)
            _, ext, single_mime = FORMAT_TO_PILLOW[fmt]
            stem = Path(sanitize_filename(fname)).stem or "gambar"
            out_path = job_dir / f"{stem}_filter{ext}"
            _save_image_to_path(final_img, out_path, fmt, quality=quality)
            outputs.append(out_path)
        finally:
            raw.close()

    out_path, media_type, dl_name = package_outputs(
        job_dir,
        outputs,
        single_media_type=single_mime,
        zip_filename="gambar-filter.zip",
    )
    return out_path, media_type, dl_name, len(outputs)


def frame_images(
    job_dir: Path,
    images: list[tuple[str, bytes]],
    *,
    corner_radius_pct: int = 12,
    border_px: int = 0,
    border_color_hex: str = "#FFFFFF",
    output_format: ImageTargetFormat = ImageTargetFormat.PNG,
    quality: int = 92,
) -> tuple[Path, str, str, int]:
    """Tool #57: Add rounded corners and/or colored padding border frames to images."""
    border_rgb = parse_hex_color_rgb_int(border_color_hex)
    outputs: list[Path] = []
    # Keep alpha transparency when rounding corners unless user specifically picks WEBP (also supports alpha)
    effective_fmt = (
        ImageTargetFormat.PNG
        if corner_radius_pct > 0 and output_format == ImageTargetFormat.JPG
        else output_format
    )
    _, ext, single_mime = FORMAT_TO_PILLOW[effective_fmt]

    for fname, data in images:
        raw = _open_image(data, fname)
        try:
            src = raw.convert("RGBA")
            if border_px > 0:
                framed = Image.new(
                    "RGBA",
                    (src.width + border_px * 2, src.height + border_px * 2),
                    (*border_rgb, 255),
                )
                framed.paste(src, (border_px, border_px), src)
                work = framed
            else:
                work = src

            if corner_radius_pct > 0:
                min_side = min(work.width, work.height)
                radius = max(1, int((min_side / 2.0) * (corner_radius_pct / 50.0)))
                mask = Image.new("L", work.size, 0)
                draw = ImageDraw.Draw(mask)
                draw.rounded_rectangle(
                    [(0, 0), (work.width - 1, work.height - 1)],
                    radius=radius,
                    fill=255,
                )
                rounded = Image.new("RGBA", work.size, (0, 0, 0, 0))
                rounded.paste(work, (0, 0), mask)
                work = rounded

            stem = Path(sanitize_filename(fname)).stem or "gambar"
            out_path = job_dir / f"{stem}_framed{ext}"
            _save_image_to_path(work, out_path, effective_fmt, quality=quality)
            outputs.append(out_path)
        finally:
            raw.close()

    out_path, media_type, dl_name = package_outputs(
        job_dir,
        outputs,
        single_media_type=single_mime,
        zip_filename="gambar-bingkai.zip",
    )
    return out_path, media_type, dl_name, len(outputs)


def generate_favicon_pack(
    job_dir: Path,
    data: bytes,
    filename: str,
    *,
    app_name: str = "RuangKerja App",
    theme_color_hex: str = "#0D7A68",
) -> tuple[Path, int]:
    """Tool #58: Generate multi-size favicons, Apple/Android icons, ICO, and site.webmanifest."""
    parse_hex_color_rgb_int(theme_color_hex)
    raw = _open_image(data, filename)
    zip_path = job_dir / "favicon-pack.zip"
    png_targets = [
        ("favicon-16x16.png", 16),
        ("favicon-32x32.png", 32),
        ("favicon-48x48.png", 48),
        ("apple-touch-icon.png", 180),
        ("android-chrome-192x192.png", 192),
        ("android-chrome-512x512.png", 512),
    ]

    try:
        square_base = ImageOps.pad(
            raw.convert("RGBA"),
            (512, 512),
            method=Image.Resampling.LANCZOS,
            color=(0, 0, 0, 0),
        )
        ico_path = job_dir / "favicon.ico"
        square_base.save(
            ico_path,
            format="ICO",
            sizes=[(16, 16), (32, 32), (48, 48)],
        )

        generated_files: list[Path] = [ico_path]
        for target_name, px in png_targets:
            resized = square_base.resize((px, px), Image.Resampling.LANCZOS)
            p = job_dir / target_name
            resized.save(p, format="PNG", optimize=True)
            generated_files.append(p)

        manifest_path = job_dir / "site.webmanifest"
        manifest_payload = {
            "name": app_name.strip() or "Web App",
            "short_name": (app_name.strip() or "App")[:16],
            "icons": [
                {"src": "/android-chrome-192x192.png", "sizes": "192x192", "type": "image/png"},
                {"src": "/android-chrome-512x512.png", "sizes": "512x512", "type": "image/png"},
            ],
            "theme_color": theme_color_hex.upper(),
            "background_color": "#ffffff",
            "display": "standalone",
        }
        manifest_path.write_text(json.dumps(manifest_payload, indent=2), encoding="utf-8")
        generated_files.append(manifest_path)

        with zipfile.ZipFile(zip_path, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
            for item in generated_files:
                zf.write(item, arcname=item.name)

        return zip_path, len(generated_files)
    finally:
        raw.close()


def social_resize_images(
    job_dir: Path,
    images: list[tuple[str, bytes]],
    *,
    preset: SocialMediaPreset = SocialMediaPreset.IG_SQUARE,
    fit_mode: CollageFitMode = CollageFitMode.COVER,
    background_hex: str = "#FFFFFF",
    output_format: ImageTargetFormat = ImageTargetFormat.JPG,
    quality: int = 90,
) -> tuple[Path, str, str, int, int, int]:
    """Tool #59: Fit images into standard social media aspect ratios and resolutions."""
    target_w, target_h = SOCIAL_DIMENSIONS[preset]
    bg_rgb = parse_hex_color_rgb_int(background_hex)
    _, ext, single_mime = FORMAT_TO_PILLOW[output_format]
    outputs: list[Path] = []

    for fname, data in images:
        raw = _open_image(data, fname)
        try:
            work = raw.convert("RGBA") if "A" in raw.mode else raw.convert("RGB")
            if fit_mode == CollageFitMode.COVER:
                fitted = ImageOps.fit(
                    work,
                    (target_w, target_h),
                    method=Image.Resampling.LANCZOS,
                    centering=(0.5, 0.5),
                )
            else:
                fitted = ImageOps.pad(
                    work.convert("RGB"),
                    (target_w, target_h),
                    method=Image.Resampling.LANCZOS,
                    color=bg_rgb,
                )
            stem = Path(sanitize_filename(fname)).stem or "social"
            out_path = job_dir / f"{stem}_{preset.value}{ext}"
            _save_image_to_path(fitted, out_path, output_format, quality=quality)
            outputs.append(out_path)
        finally:
            raw.close()

    out_path, media_type, dl_name = package_outputs(
        job_dir,
        outputs,
        single_media_type=single_mime,
        zip_filename=f"social-{preset.value}.zip",
    )
    return out_path, media_type, dl_name, len(outputs), target_w, target_h


def extract_color_palette(
    data: bytes,
    filename: str,
    *,
    color_count: int = 6,
) -> ColorPaletteResponse:
    """Tool #60: Extract dominant HEX/RGB colors from an image via adaptive quantization."""
    if color_count < 2 or color_count > 12:
        raise AppError("Jumlah warna palet harus antara 2 dan 12.", code="INVALID_COLOR_COUNT")

    raw = _open_image(data, filename)
    try:
        sample = raw.convert("RGB")
        sample.thumbnail((240, 240), Image.Resampling.LANCZOS)
        quantized = sample.quantize(colors=color_count, method=Image.Quantize.MEDIANCUT)
        palette = quantized.getpalette() or []
        counts = quantized.getcolors() or []
        total_pixels = sum(cnt for cnt, _ in counts) or 1

        counts.sort(key=lambda item: item[0], reverse=True)
        items: list[PaletteColorItem] = []
        for cnt, idx in counts[:color_count]:
            base = idx * 3
            if base + 2 >= len(palette):
                continue
            r, g, b = int(palette[base]), int(palette[base + 1]), int(palette[base + 2])
            hex_val = f"#{r:02X}{g:02X}{b:02X}"
            items.append(
                PaletteColorItem(
                    hex=hex_val,
                    r=r,
                    g=g,
                    b=b,
                    percent=round((cnt / total_pixels) * 100.0, 1),
                )
            )
        return ColorPaletteResponse(filename=filename, colors=items)
    finally:
        raw.close()


def strip_exif_metadata(
    job_dir: Path,
    images: list[tuple[str, bytes]],
    *,
    quality: int = 92,
) -> tuple[Path, str, str, int]:
    """Tool #61: Remove EXIF, GPS, and camera metadata while preserving pixel orientation."""
    outputs: list[Path] = []
    single_mime = "image/jpeg"

    for fname, data in images:
        raw = _open_image(data, fname, transpose=True)
        try:
            fmt = _infer_target_format(fname, raw.format)
            _, ext, single_mime = FORMAT_TO_PILLOW[fmt]
            # Recreate a fresh clean Image from raw pixel buffer to guarantee zero EXIF/XMP/IPTC tags
            clean = Image.new(raw.mode, raw.size)
            clean.putdata(list(raw.getdata()))
            stem = Path(sanitize_filename(fname)).stem or "gambar"
            out_path = job_dir / f"{stem}_clean{ext}"
            _save_image_to_path(clean, out_path, fmt, quality=quality)
            outputs.append(out_path)
        finally:
            raw.close()

    out_path, media_type, dl_name = package_outputs(
        job_dir,
        outputs,
        single_media_type=single_mime,
        zip_filename="gambar-tanpa-exif.zip",
    )
    return out_path, media_type, dl_name, len(outputs)
