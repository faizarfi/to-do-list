"""REST API endpoints for all 12 Image Tools."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.responses import FileResponse

from app.core.config import Settings, get_settings
from app.core.exceptions import AppError
from app.schemas.image import (
    BulkResizeMode,
    CollageFitMode,
    CollageLayout,
    ColorPaletteResponse,
    ImageFilterPreset,
    ImageInfoResponse,
    ImageTargetFormat,
    ImageWatermarkPosition,
    ImageWatermarkType,
    PassportPhotoSize,
    RenameCaseMode,
    SocialMediaPreset,
)
from app.services import image_extra_service, image_service
from app.utils.file_security import (
    cleanup_job_dir,
    create_job_dir,
    read_and_validate_upload,
)
from app.utils.response_helpers import (
    IMAGE_ALLOWED_EXTENSIONS,
    IMAGE_ALLOWED_MIMES,
    stream_result_and_cleanup,
)

router = APIRouter(prefix="/images", tags=["Image Tools"])


async def _validate_image(upload: UploadFile, settings: Settings) -> tuple[str, bytes]:
    return await read_and_validate_upload(
        upload,
        allowed_extensions=IMAGE_ALLOWED_EXTENSIONS,
        allowed_mime_types=IMAGE_ALLOWED_MIMES,
        max_size_bytes=settings.max_upload_size_bytes,
    )


@router.post("/convert")
async def convert_images_endpoint(
    files: Annotated[list[UploadFile], File(...)],
    target_format: Annotated[ImageTargetFormat, Form()] = ImageTargetFormat.PNG,
    quality: Annotated[int, Form(ge=10, le=100)] = 88,
    lossless_webp: Annotated[bool, Form()] = False,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #16: Convert one or more images to JPG, PNG, WEBP, or TIFF."""
    if not files:
        raise AppError("Unggah minimal satu gambar.", code="NO_FILES_PROVIDED")

    job_dir = create_job_dir(settings.temp_dir)
    try:
        validated = [await _validate_image(item, settings) for item in files]
        out_path, media_type, download_name, count = image_service.convert_images(
            job_dir,
            validated,
            target_format=target_format,
            quality=quality,
            lossless_webp=lossless_webp,
        )
        return stream_result_and_cleanup(
            out_path,
            download_name=download_name,
            media_type=media_type,
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Output-Count": str(count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/compress")
async def compress_images_endpoint(
    files: Annotated[list[UploadFile], File(...)],
    quality: Annotated[int, Form(ge=10, le=95)] = 72,
    max_dimension: Annotated[int | None, Form(ge=64, le=10000)] = None,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #17: Compress multiple images while preserving formats."""
    if not files:
        raise AppError("Unggah minimal satu gambar.", code="NO_FILES_PROVIDED")

    job_dir = create_job_dir(settings.temp_dir)
    try:
        validated = [await _validate_image(item, settings) for item in files]
        (
            out_path,
            media_type,
            download_name,
            count,
            orig_total,
            proc_total,
        ) = image_service.compress_images(
            job_dir,
            validated,
            quality=quality,
            max_dimension=max_dimension,
        )
        return stream_result_and_cleanup(
            out_path,
            download_name=download_name,
            media_type=media_type,
            job_dir=job_dir,
            settings=settings,
            extra_headers={
                "X-Output-Count": str(count),
                "X-Original-Size": str(orig_total),
                "X-Processed-Size": str(proc_total),
            },
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/resize")
async def resize_image_endpoint(
    file: Annotated[UploadFile, File(...)],
    width: Annotated[int | None, Form(ge=1, le=12000)] = None,
    height: Annotated[int | None, Form(ge=1, le=12000)] = None,
    keep_aspect_ratio: Annotated[bool, Form()] = True,
    quality: Annotated[int, Form(ge=10, le=100)] = 90,
    output_format: Annotated[ImageTargetFormat | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #18: Resize a single image by pixel width and/or height."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_image(file, settings)
        out_path, media_type, download_name, out_w, out_h = image_service.resize_single_image(
            job_dir,
            data,
            name,
            width=width,
            height=height,
            keep_aspect_ratio=keep_aspect_ratio,
            quality=quality,
            output_format=output_format,
        )
        return stream_result_and_cleanup(
            out_path,
            download_name=download_name,
            media_type=media_type,
            job_dir=job_dir,
            settings=settings,
            extra_headers={
                "X-Image-Width": str(out_w),
                "X-Image-Height": str(out_h),
            },
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/bulk-resize")
async def bulk_resize_endpoint(
    files: Annotated[list[UploadFile], File(...)],
    mode: Annotated[BulkResizeMode, Form()] = BulkResizeMode.DIMENSIONS,
    width: Annotated[int | None, Form(ge=1, le=12000)] = None,
    height: Annotated[int | None, Form(ge=1, le=12000)] = None,
    keep_aspect_ratio: Annotated[bool, Form()] = True,
    scale_percent: Annotated[int, Form(ge=5, le=400)] = 50,
    quality: Annotated[int, Form(ge=10, le=100)] = 88,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #19: Resize multiple images simultaneously."""
    if not files:
        raise AppError("Unggah minimal satu gambar.", code="NO_FILES_PROVIDED")

    job_dir = create_job_dir(settings.temp_dir)
    try:
        validated = [await _validate_image(item, settings) for item in files]
        out_path, media_type, download_name, count = image_service.bulk_resize_images(
            job_dir,
            validated,
            mode=mode,
            width=width,
            height=height,
            keep_aspect_ratio=keep_aspect_ratio,
            scale_percent=scale_percent,
            quality=quality,
        )
        return stream_result_and_cleanup(
            out_path,
            download_name=download_name,
            media_type=media_type,
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Output-Count": str(count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/crop")
async def crop_image_endpoint(
    file: Annotated[UploadFile, File(...)],
    crop_x: Annotated[int | None, Form(ge=0)] = None,
    crop_y: Annotated[int | None, Form(ge=0)] = None,
    crop_width: Annotated[int | None, Form(ge=1)] = None,
    crop_height: Annotated[int | None, Form(ge=1)] = None,
    aspect_ratio: Annotated[str | None, Form()] = None,
    quality: Annotated[int, Form(ge=10, le=100)] = 92,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #20: Crop an image by pixel coordinates or aspect ratio."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_image(file, settings)
        out_path, media_type, download_name, out_w, out_h = image_service.crop_image(
            job_dir,
            data,
            name,
            crop_x=crop_x,
            crop_y=crop_y,
            crop_width=crop_width,
            crop_height=crop_height,
            aspect_ratio=aspect_ratio,
            quality=quality,
        )
        return stream_result_and_cleanup(
            out_path,
            download_name=download_name,
            media_type=media_type,
            job_dir=job_dir,
            settings=settings,
            extra_headers={
                "X-Image-Width": str(out_w),
                "X-Image-Height": str(out_h),
            },
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/rotate")
async def rotate_images_endpoint(
    files: Annotated[list[UploadFile], File(...)],
    angle: Annotated[int, Form(ge=-360, le=360)] = 90,
    flip_horizontal: Annotated[bool, Form()] = False,
    flip_vertical: Annotated[bool, Form()] = False,
    quality: Annotated[int, Form(ge=10, le=100)] = 90,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #21: Rotate and/or flip one or more images."""
    if not files:
        raise AppError("Unggah minimal satu gambar.", code="NO_FILES_PROVIDED")

    job_dir = create_job_dir(settings.temp_dir)
    try:
        validated = [await _validate_image(item, settings) for item in files]
        out_path, media_type, download_name, count = image_service.rotate_images(
            job_dir,
            validated,
            angle=angle,
            flip_horizontal=flip_horizontal,
            flip_vertical=flip_vertical,
            quality=quality,
        )
        return stream_result_and_cleanup(
            out_path,
            download_name=download_name,
            media_type=media_type,
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Output-Count": str(count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/dpi")
async def dpi_changer_endpoint(
    files: Annotated[list[UploadFile], File(...)],
    dpi_x: Annotated[int, Form(ge=30, le=1200)] = 300,
    dpi_y: Annotated[int | None, Form(ge=30, le=1200)] = None,
    quality: Annotated[int, Form(ge=10, le=100)] = 95,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #22: Change DPI metadata for one or more images."""
    if not files:
        raise AppError("Unggah minimal satu gambar.", code="NO_FILES_PROVIDED")

    job_dir = create_job_dir(settings.temp_dir)
    try:
        validated = [await _validate_image(item, settings) for item in files]
        out_path, media_type, download_name, count = image_service.change_dpi(
            job_dir,
            validated,
            dpi_x=dpi_x,
            dpi_y=dpi_y,
            quality=quality,
        )
        return stream_result_and_cleanup(
            out_path,
            download_name=download_name,
            media_type=media_type,
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Output-Count": str(count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/passport-photo")
async def passport_photo_endpoint(
    file: Annotated[UploadFile, File(...)],
    photo_size: Annotated[PassportPhotoSize, Form()] = PassportPhotoSize.SIZE_3X4,
    dpi: Annotated[int, Form()] = 300,
    background_hex: Annotated[str, Form()] = "#DC2626",
    apply_bg_to_alpha: Annotated[bool, Form()] = True,
    focus_x: Annotated[float, Form(ge=0.0, le=1.0)] = 0.5,
    focus_y: Annotated[float, Form(ge=0.0, le=1.0)] = 0.35,
    print_sheet: Annotated[bool, Form()] = False,
    output_format: Annotated[ImageTargetFormat, Form()] = ImageTargetFormat.JPG,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #23: Generate standard 2x3, 3x4, or 4x6 passport photos."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_image(file, settings)
        out_path, media_type, download_name, out_w, out_h = image_service.make_passport_photo(
            job_dir,
            data,
            name,
            photo_size=photo_size,
            dpi=dpi,
            background_hex=background_hex,
            apply_bg_to_alpha=apply_bg_to_alpha,
            focus_x=focus_x,
            focus_y=focus_y,
            print_sheet=print_sheet,
            output_format=output_format,
        )
        return stream_result_and_cleanup(
            out_path,
            download_name=download_name,
            media_type=media_type,
            job_dir=job_dir,
            settings=settings,
            extra_headers={
                "X-Image-Width": str(out_w),
                "X-Image-Height": str(out_h),
            },
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/bulk-rename")
async def bulk_rename_endpoint(
    files: Annotated[list[UploadFile], File(...)],
    prefix: Annotated[str, Form()] = "foto-",
    suffix: Annotated[str, Form()] = "",
    start_number: Annotated[int, Form(ge=0)] = 1,
    zero_pad: Annotated[int, Form(ge=1, le=8)] = 3,
    keep_original_name: Annotated[bool, Form()] = False,
    case_mode: Annotated[RenameCaseMode, Form()] = RenameCaseMode.ORIGINAL,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #24: Batch-rename uploaded images cleanly and return ZIP/file."""
    if not files:
        raise AppError("Unggah minimal satu gambar.", code="NO_FILES_PROVIDED")

    job_dir = create_job_dir(settings.temp_dir)
    try:
        validated = [await _validate_image(item, settings) for item in files]
        out_path, media_type, download_name, count = image_service.bulk_rename_images(
            job_dir,
            validated,
            prefix=prefix,
            suffix=suffix,
            start_number=start_number,
            zero_pad=zero_pad,
            keep_original_name=keep_original_name,
            case_mode=case_mode,
        )
        return stream_result_and_cleanup(
            out_path,
            download_name=download_name,
            media_type=media_type,
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Output-Count": str(count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/watermark")
async def watermark_images_endpoint(
    files: Annotated[list[UploadFile], File(...)],
    watermark_type: Annotated[ImageWatermarkType, Form()] = ImageWatermarkType.TEXT,
    text: Annotated[str, Form()] = "RuangKerja",
    font_size_pct: Annotated[int, Form(ge=2, le=25)] = 6,
    color_hex: Annotated[str, Form()] = "#FFFFFF",
    opacity: Annotated[float, Form(ge=0.05, le=1.0)] = 0.45,
    position: Annotated[ImageWatermarkPosition, Form()] = ImageWatermarkPosition.BOTTOM_RIGHT,
    logo_scale_pct: Annotated[int, Form(ge=5, le=75)] = 20,
    quality: Annotated[int, Form(ge=10, le=100)] = 90,
    watermark_image: Annotated[UploadFile | None, File()] = None,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #25: Add text or logo watermark onto one or more images."""
    if not files:
        raise AppError("Unggah minimal satu gambar.", code="NO_FILES_PROVIDED")

    job_dir = create_job_dir(settings.temp_dir)
    try:
        validated = [await _validate_image(item, settings) for item in files]
        logo_bytes: bytes | None = None
        if watermark_type == ImageWatermarkType.IMAGE:
            if watermark_image is None:
                raise AppError("Unggah gambar logo watermark.", code="MISSING_WATERMARK_IMAGE")
            _, logo_bytes = await _validate_image(watermark_image, settings)

        out_path, media_type, download_name, count = image_service.watermark_images(
            job_dir,
            validated,
            watermark_type=watermark_type,
            text=text,
            font_size_pct=font_size_pct,
            color_hex=color_hex,
            opacity=opacity,
            position=position,
            watermark_logo_bytes=logo_bytes,
            logo_scale_pct=logo_scale_pct,
            quality=quality,
        )
        return stream_result_and_cleanup(
            out_path,
            download_name=download_name,
            media_type=media_type,
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Output-Count": str(count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/collage")
async def collage_endpoint(
    files: Annotated[list[UploadFile], File(...)],
    layout: Annotated[CollageLayout, Form()] = CollageLayout.GRID,
    columns: Annotated[int, Form(ge=1, le=4)] = 2,
    cell_size_px: Annotated[int, Form(ge=120, le=1200)] = 500,
    gap_px: Annotated[int, Form(ge=0, le=80)] = 16,
    padding_px: Annotated[int, Form(ge=0, le=80)] = 24,
    background_hex: Annotated[str, Form()] = "#FFFFFF",
    fit_mode: Annotated[CollageFitMode, Form()] = CollageFitMode.COVER,
    output_format: Annotated[ImageTargetFormat, Form()] = ImageTargetFormat.JPG,
    quality: Annotated[int, Form(ge=10, le=100)] = 90,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #26: Combine 2–16 images into one collage."""
    if len(files) < 2:
        raise AppError("Unggah minimal 2 gambar untuk membuat kolase.", code="MINIMUM_TWO_FILES")

    job_dir = create_job_dir(settings.temp_dir)
    try:
        validated = [await _validate_image(item, settings) for item in files]
        out_path, media_type, download_name, out_w, out_h = image_service.create_collage(
            job_dir,
            validated,
            layout=layout,
            columns=columns,
            cell_size_px=cell_size_px,
            gap_px=gap_px,
            padding_px=padding_px,
            background_hex=background_hex,
            fit_mode=fit_mode,
            output_format=output_format,
            quality=quality,
        )
        return stream_result_and_cleanup(
            out_path,
            download_name=download_name,
            media_type=media_type,
            job_dir=job_dir,
            settings=settings,
            extra_headers={
                "X-Image-Width": str(out_w),
                "X-Image-Height": str(out_h),
            },
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/info", response_model=ImageInfoResponse)
async def image_info_endpoint(
    files: Annotated[list[UploadFile], File(...)],
    settings: Settings = Depends(get_settings),
) -> ImageInfoResponse:
    """Tool #27: Inspect size, dimensions, format, resolution, DPI, and EXIF."""
    if not files:
        raise AppError("Unggah minimal satu gambar.", code="NO_FILES_PROVIDED")

    validated = [await _validate_image(item, settings) for item in files]
    return image_service.inspect_images_info(validated)


@router.post("/adjust")
async def adjust_images_endpoint(
    files: Annotated[list[UploadFile], File(...)],
    brightness: Annotated[float, Form(ge=0.2, le=2.5)] = 1.0,
    contrast: Annotated[float, Form(ge=0.2, le=2.5)] = 1.0,
    saturation: Annotated[float, Form(ge=0.0, le=2.5)] = 1.0,
    sharpness: Annotated[float, Form(ge=0.0, le=3.0)] = 1.0,
    blur_radius: Annotated[float, Form(ge=0.0, le=10.0)] = 0.0,
    effect: Annotated[ImageFilterPreset, Form()] = ImageFilterPreset.NONE,
    output_format: Annotated[ImageTargetFormat | None, Form()] = None,
    quality: Annotated[int, Form(ge=10, le=100)] = 90,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #56: Apply tone adjustments and filter presets to images."""
    if not files:
        raise AppError("Unggah minimal satu gambar.", code="NO_FILES_PROVIDED")

    job_dir = create_job_dir(settings.temp_dir)
    try:
        validated = [await _validate_image(item, settings) for item in files]
        out_path, media_type, dl_name, count = image_extra_service.adjust_images(
            job_dir,
            validated,
            brightness=brightness,
            contrast=contrast,
            saturation=saturation,
            sharpness=sharpness,
            blur_radius=blur_radius,
            effect=effect,
            output_format=output_format,
            quality=quality,
        )
        return stream_result_and_cleanup(
            out_path,
            download_name=dl_name,
            media_type=media_type,
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Output-Count": str(count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/frame")
async def frame_images_endpoint(
    files: Annotated[list[UploadFile], File(...)],
    corner_radius_pct: Annotated[int, Form(ge=0, le=50)] = 12,
    border_px: Annotated[int, Form(ge=0, le=160)] = 0,
    border_color_hex: Annotated[str, Form()] = "#FFFFFF",
    output_format: Annotated[ImageTargetFormat, Form()] = ImageTargetFormat.PNG,
    quality: Annotated[int, Form(ge=10, le=100)] = 92,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #57: Add rounded corners and colored border frames to images."""
    if not files:
        raise AppError("Unggah minimal satu gambar.", code="NO_FILES_PROVIDED")

    job_dir = create_job_dir(settings.temp_dir)
    try:
        validated = [await _validate_image(item, settings) for item in files]
        out_path, media_type, dl_name, count = image_extra_service.frame_images(
            job_dir,
            validated,
            corner_radius_pct=corner_radius_pct,
            border_px=border_px,
            border_color_hex=border_color_hex,
            output_format=output_format,
            quality=quality,
        )
        return stream_result_and_cleanup(
            out_path,
            download_name=dl_name,
            media_type=media_type,
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Output-Count": str(count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/favicon-pack")
async def favicon_pack_endpoint(
    file: Annotated[UploadFile, File(...)],
    app_name: Annotated[str, Form()] = "RuangKerja App",
    theme_color_hex: Annotated[str, Form()] = "#0D7A68",
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #58: Generate complete web/mobile favicon pack (ICO, PNGs, site.webmanifest)."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_image(file, settings)
        zip_path, count = image_extra_service.generate_favicon_pack(
            job_dir,
            data,
            name,
            app_name=app_name,
            theme_color_hex=theme_color_hex,
        )
        return stream_result_and_cleanup(
            zip_path,
            download_name=zip_path.name,
            media_type="application/zip",
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Output-Count": str(count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/social-resize")
async def social_resize_endpoint(
    files: Annotated[list[UploadFile], File(...)],
    preset: Annotated[SocialMediaPreset, Form()] = SocialMediaPreset.IG_SQUARE,
    fit_mode: Annotated[CollageFitMode, Form()] = CollageFitMode.COVER,
    background_hex: Annotated[str, Form()] = "#FFFFFF",
    output_format: Annotated[ImageTargetFormat, Form()] = ImageTargetFormat.JPG,
    quality: Annotated[int, Form(ge=10, le=100)] = 90,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #59: Resize and crop images into standard social media dimensions."""
    if not files:
        raise AppError("Unggah minimal satu gambar.", code="NO_FILES_PROVIDED")

    job_dir = create_job_dir(settings.temp_dir)
    try:
        validated = [await _validate_image(item, settings) for item in files]
        out_path, media_type, dl_name, count, out_w, out_h = (
            image_extra_service.social_resize_images(
                job_dir,
                validated,
                preset=preset,
                fit_mode=fit_mode,
                background_hex=background_hex,
                output_format=output_format,
                quality=quality,
            )
        )
        return stream_result_and_cleanup(
            out_path,
            download_name=dl_name,
            media_type=media_type,
            job_dir=job_dir,
            settings=settings,
            extra_headers={
                "X-Output-Count": str(count),
                "X-Image-Width": str(out_w),
                "X-Image-Height": str(out_h),
            },
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/palette", response_model=ColorPaletteResponse)
async def extract_palette_endpoint(
    file: Annotated[UploadFile, File(...)],
    color_count: Annotated[int, Form(ge=2, le=12)] = 6,
    settings: Settings = Depends(get_settings),
) -> ColorPaletteResponse:
    """Tool #60: Extract dominant HEX and RGB color palette from an image."""
    name, data = await _validate_image(file, settings)
    return image_extra_service.extract_color_palette(
        data, name, color_count=color_count
    )


@router.post("/strip-exif")
async def strip_exif_endpoint(
    files: Annotated[list[UploadFile], File(...)],
    quality: Annotated[int, Form(ge=10, le=100)] = 92,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #61: Strip EXIF, GPS, and camera metadata from images."""
    if not files:
        raise AppError("Unggah minimal satu gambar.", code="NO_FILES_PROVIDED")

    job_dir = create_job_dir(settings.temp_dir)
    try:
        validated = [await _validate_image(item, settings) for item in files]
        out_path, media_type, dl_name, count = image_extra_service.strip_exif_metadata(
            job_dir, validated, quality=quality
        )
        return stream_result_and_cleanup(
            out_path,
            download_name=dl_name,
            media_type=media_type,
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Output-Count": str(count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise

