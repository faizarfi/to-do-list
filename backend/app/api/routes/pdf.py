"""REST API endpoints for all 15 PDF & Document processing tools."""

from __future__ import annotations

import base64
import json
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

from app.core.config import Settings, get_settings
from app.core.exceptions import AppError
from app.schemas.pdf import (
    CompressionLevel,
    FitMode,
    MarkdownToPdfRequest,
    Orientation,
    PageNumberPosition,
    PaperSize,
    PdfInspectResponse,
    PdfMetadataResponse,
    PdfTextExtractResponse,
    SplitMode,
    WatermarkPosition,
    WatermarkType,
)
from app.services import pdf_extra_service, pdf_service
from app.services.pdf_common import (
    IMAGE_ALLOWED_EXTENSIONS,
    IMAGE_ALLOWED_MIMES,
    PDF_ALLOWED_EXTENSIONS,
    PDF_ALLOWED_MIMES,
)
from app.utils.file_security import (
    cleanup_job_dir,
    create_job_dir,
    read_and_validate_upload,
)

router = APIRouter(prefix="/pdf", tags=["PDF & Dokumen"])


def _stream_result_and_cleanup(
    file_path: Path,
    *,
    download_name: str,
    media_type: str,
    job_dir: Path,
    settings: Settings,
    extra_headers: dict[str, str] | None = None,
) -> FileResponse:
    headers = dict(extra_headers or {})
    return FileResponse(
        path=str(file_path),
        media_type=media_type,
        filename=download_name,
        headers=headers,
        background=BackgroundTask(cleanup_job_dir, job_dir, settings.temp_dir),
    )


async def _validate_pdf_upload(
    upload: UploadFile, settings: Settings
) -> tuple[str, bytes]:
    return await read_and_validate_upload(
        upload,
        allowed_extensions=PDF_ALLOWED_EXTENSIONS,
        allowed_mime_types=PDF_ALLOWED_MIMES,
        max_size_bytes=settings.max_upload_size_bytes,
    )


async def _validate_image_upload(
    upload: UploadFile, settings: Settings
) -> tuple[str, bytes]:
    return await read_and_validate_upload(
        upload,
        allowed_extensions=IMAGE_ALLOWED_EXTENSIONS,
        allowed_mime_types=IMAGE_ALLOWED_MIMES,
        max_size_bytes=settings.max_upload_size_bytes,
    )


@router.post("/inspect", response_model=PdfInspectResponse)
async def inspect_pdf_endpoint(
    file: Annotated[UploadFile, File(...)],
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> PdfInspectResponse:
    """Inspect page count, page dimensions, and render thumbnail previews."""
    filename, data = await _validate_pdf_upload(file, settings)
    return pdf_service.inspect_pdf(data, filename, password=password)


@router.post("/images-to-pdf")
async def images_to_pdf_endpoint(
    files: Annotated[list[UploadFile], File(...)],
    paper_size: Annotated[PaperSize, Form()] = PaperSize.A4,
    custom_width_mm: Annotated[float, Form()] = 210.0,
    custom_height_mm: Annotated[float, Form()] = 297.0,
    orientation: Annotated[Orientation, Form()] = Orientation.PORTRAIT,
    margin_mm: Annotated[float, Form()] = 10.0,
    fit_mode: Annotated[FitMode, Form()] = FitMode.FIT,
    quality: Annotated[int, Form(ge=10, le=100)] = 85,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #1: Convert multiple JPG/PNG/image files into a single PDF document."""
    if not files:
        raise AppError("Unggah minimal satu gambar.", code="NO_FILES_PROVIDED")

    job_dir = create_job_dir(settings.temp_dir)
    try:
        validated_images = [await _validate_image_upload(item, settings) for item in files]
        out_path, page_count = pdf_service.images_to_pdf(
            job_dir,
            validated_images,
            paper_size=paper_size,
            custom_width_mm=custom_width_mm,
            custom_height_mm=custom_height_mm,
            orientation=orientation,
            margin_mm=margin_mm,
            fit_mode=fit_mode,
            quality=quality,
            output_filename="gambar-ke-pdf.pdf",
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name="gambar-ke-pdf.pdf",
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Result-Page-Count": str(page_count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise



@router.post("/extract-text", response_model=PdfTextExtractResponse)
async def extract_pdf_text_endpoint(
    file: Annotated[UploadFile, File(...)],
    pages: Annotated[str | None, Form()] = None,
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> PdfTextExtractResponse:
    """Tool #51: Extract readable text from a PDF document."""
    name, data = await _validate_pdf_upload(file, settings)
    return pdf_extra_service.extract_pdf_text(
        data, name, pages_spec=pages, password=password
    )


@router.post("/protect")
async def protect_pdf_endpoint(
    file: Annotated[UploadFile, File(...)],
    user_password: Annotated[str, Form(...)],
    owner_password: Annotated[str | None, Form()] = None,
    allow_printing: Annotated[bool, Form()] = True,
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #52: Protect PDF with AES-256 password encryption."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_pdf_upload(file, settings)
        out_path, page_count = pdf_extra_service.protect_pdf(
            job_dir,
            data,
            name,
            user_password=user_password,
            owner_password=owner_password,
            allow_printing=allow_printing,
            password=password,
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Result-Page-Count": str(page_count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/unlock")
async def unlock_pdf_endpoint(
    file: Annotated[UploadFile, File(...)],
    password: Annotated[str, Form(...)],
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #53: Remove password protection using the authorized password."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_pdf_upload(file, settings)
        out_path, page_count = pdf_extra_service.unlock_pdf(
            job_dir, data, name, password=password
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Result-Page-Count": str(page_count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/metadata/read", response_model=PdfMetadataResponse)
async def read_pdf_metadata_endpoint(
    file: Annotated[UploadFile, File(...)],
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> PdfMetadataResponse:
    """Tool #54 (read): Read metadata fields of a PDF document."""
    name, data = await _validate_pdf_upload(file, settings)
    return pdf_extra_service.read_pdf_metadata(data, name, password=password)


@router.post("/metadata/update")
async def update_pdf_metadata_endpoint(
    file: Annotated[UploadFile, File(...)],
    title: Annotated[str, Form()] = "",
    author: Annotated[str, Form()] = "",
    subject: Annotated[str, Form()] = "",
    keywords: Annotated[str, Form()] = "",
    creator: Annotated[str, Form()] = "",
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #54 (update): Save updated PDF metadata properties."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_pdf_upload(file, settings)
        out_path, page_count = pdf_extra_service.update_pdf_metadata(
            job_dir,
            data,
            name,
            title=title,
            author=author,
            subject=subject,
            keywords=keywords,
            creator=creator,
            password=password,
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Result-Page-Count": str(page_count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/markdown-to-pdf")
async def markdown_to_pdf_endpoint(
    payload: MarkdownToPdfRequest,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #55: Convert Markdown content into a formatted PDF document."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        out_path = pdf_extra_service.markdown_to_pdf(
            job_dir,
            payload.markdown_text,
            document_title=payload.document_title,
            paper_size=payload.paper_size,
            margin_mm=payload.margin_mm,
            font_size=payload.font_size,
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/image-to-pdf")
async def single_image_to_pdf_endpoint(
    file: Annotated[UploadFile, File(...)],
    paper_size: Annotated[PaperSize, Form()] = PaperSize.A4,
    custom_width_mm: Annotated[float, Form()] = 210.0,
    custom_height_mm: Annotated[float, Form()] = 297.0,
    orientation: Annotated[Orientation, Form()] = Orientation.PORTRAIT,
    margin_mm: Annotated[float, Form()] = 10.0,
    fit_mode: Annotated[FitMode, Form()] = FitMode.FIT,
    quality: Annotated[int, Form(ge=10, le=100)] = 85,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #2: Convert a single image file into a PDF document."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_image_upload(file, settings)
        download_name = f"{Path(name).stem or 'gambar'}.pdf"
        out_path, page_count = pdf_service.images_to_pdf(
            job_dir,
            [(name, data)],
            paper_size=paper_size,
            custom_width_mm=custom_width_mm,
            custom_height_mm=custom_height_mm,
            orientation=orientation,
            margin_mm=margin_mm,
            fit_mode=fit_mode,
            quality=quality,
            output_filename=download_name,
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=download_name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Result-Page-Count": str(page_count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise



@router.post("/extract-text", response_model=PdfTextExtractResponse)
async def extract_pdf_text_endpoint(
    file: Annotated[UploadFile, File(...)],
    pages: Annotated[str | None, Form()] = None,
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> PdfTextExtractResponse:
    """Tool #51: Extract readable text from a PDF document."""
    name, data = await _validate_pdf_upload(file, settings)
    return pdf_extra_service.extract_pdf_text(
        data, name, pages_spec=pages, password=password
    )


@router.post("/protect")
async def protect_pdf_endpoint(
    file: Annotated[UploadFile, File(...)],
    user_password: Annotated[str, Form(...)],
    owner_password: Annotated[str | None, Form()] = None,
    allow_printing: Annotated[bool, Form()] = True,
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #52: Protect PDF with AES-256 password encryption."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_pdf_upload(file, settings)
        out_path, page_count = pdf_extra_service.protect_pdf(
            job_dir,
            data,
            name,
            user_password=user_password,
            owner_password=owner_password,
            allow_printing=allow_printing,
            password=password,
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Result-Page-Count": str(page_count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/unlock")
async def unlock_pdf_endpoint(
    file: Annotated[UploadFile, File(...)],
    password: Annotated[str, Form(...)],
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #53: Remove password protection using the authorized password."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_pdf_upload(file, settings)
        out_path, page_count = pdf_extra_service.unlock_pdf(
            job_dir, data, name, password=password
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Result-Page-Count": str(page_count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/metadata/read", response_model=PdfMetadataResponse)
async def read_pdf_metadata_endpoint(
    file: Annotated[UploadFile, File(...)],
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> PdfMetadataResponse:
    """Tool #54 (read): Read metadata fields of a PDF document."""
    name, data = await _validate_pdf_upload(file, settings)
    return pdf_extra_service.read_pdf_metadata(data, name, password=password)


@router.post("/metadata/update")
async def update_pdf_metadata_endpoint(
    file: Annotated[UploadFile, File(...)],
    title: Annotated[str, Form()] = "",
    author: Annotated[str, Form()] = "",
    subject: Annotated[str, Form()] = "",
    keywords: Annotated[str, Form()] = "",
    creator: Annotated[str, Form()] = "",
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #54 (update): Save updated PDF metadata properties."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_pdf_upload(file, settings)
        out_path, page_count = pdf_extra_service.update_pdf_metadata(
            job_dir,
            data,
            name,
            title=title,
            author=author,
            subject=subject,
            keywords=keywords,
            creator=creator,
            password=password,
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Result-Page-Count": str(page_count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/markdown-to-pdf")
async def markdown_to_pdf_endpoint(
    payload: MarkdownToPdfRequest,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #55: Convert Markdown content into a formatted PDF document."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        out_path = pdf_extra_service.markdown_to_pdf(
            job_dir,
            payload.markdown_text,
            document_title=payload.document_title,
            paper_size=payload.paper_size,
            margin_mm=payload.margin_mm,
            font_size=payload.font_size,
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/to-jpg")
async def pdf_to_jpg_endpoint(
    file: Annotated[UploadFile, File(...)],
    dpi: Annotated[int, Form(ge=72, le=300)] = 150,
    quality: Annotated[int, Form(ge=10, le=100)] = 85,
    pages: Annotated[str | None, Form()] = None,
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #3: Export PDF pages into JPG images (single JPG or ZIP)."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_pdf_upload(file, settings)
        out_path, media_type, download_name, count = pdf_service.pdf_to_images(
            job_dir,
            data,
            name,
            image_format="jpg",
            dpi=dpi,
            quality=quality,
            pages_spec=pages,
            password=password,
        )
        return _stream_result_and_cleanup(
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



@router.post("/extract-text", response_model=PdfTextExtractResponse)
async def extract_pdf_text_endpoint(
    file: Annotated[UploadFile, File(...)],
    pages: Annotated[str | None, Form()] = None,
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> PdfTextExtractResponse:
    """Tool #51: Extract readable text from a PDF document."""
    name, data = await _validate_pdf_upload(file, settings)
    return pdf_extra_service.extract_pdf_text(
        data, name, pages_spec=pages, password=password
    )


@router.post("/protect")
async def protect_pdf_endpoint(
    file: Annotated[UploadFile, File(...)],
    user_password: Annotated[str, Form(...)],
    owner_password: Annotated[str | None, Form()] = None,
    allow_printing: Annotated[bool, Form()] = True,
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #52: Protect PDF with AES-256 password encryption."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_pdf_upload(file, settings)
        out_path, page_count = pdf_extra_service.protect_pdf(
            job_dir,
            data,
            name,
            user_password=user_password,
            owner_password=owner_password,
            allow_printing=allow_printing,
            password=password,
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Result-Page-Count": str(page_count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/unlock")
async def unlock_pdf_endpoint(
    file: Annotated[UploadFile, File(...)],
    password: Annotated[str, Form(...)],
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #53: Remove password protection using the authorized password."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_pdf_upload(file, settings)
        out_path, page_count = pdf_extra_service.unlock_pdf(
            job_dir, data, name, password=password
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Result-Page-Count": str(page_count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/metadata/read", response_model=PdfMetadataResponse)
async def read_pdf_metadata_endpoint(
    file: Annotated[UploadFile, File(...)],
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> PdfMetadataResponse:
    """Tool #54 (read): Read metadata fields of a PDF document."""
    name, data = await _validate_pdf_upload(file, settings)
    return pdf_extra_service.read_pdf_metadata(data, name, password=password)


@router.post("/metadata/update")
async def update_pdf_metadata_endpoint(
    file: Annotated[UploadFile, File(...)],
    title: Annotated[str, Form()] = "",
    author: Annotated[str, Form()] = "",
    subject: Annotated[str, Form()] = "",
    keywords: Annotated[str, Form()] = "",
    creator: Annotated[str, Form()] = "",
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #54 (update): Save updated PDF metadata properties."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_pdf_upload(file, settings)
        out_path, page_count = pdf_extra_service.update_pdf_metadata(
            job_dir,
            data,
            name,
            title=title,
            author=author,
            subject=subject,
            keywords=keywords,
            creator=creator,
            password=password,
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Result-Page-Count": str(page_count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/markdown-to-pdf")
async def markdown_to_pdf_endpoint(
    payload: MarkdownToPdfRequest,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #55: Convert Markdown content into a formatted PDF document."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        out_path = pdf_extra_service.markdown_to_pdf(
            job_dir,
            payload.markdown_text,
            document_title=payload.document_title,
            paper_size=payload.paper_size,
            margin_mm=payload.margin_mm,
            font_size=payload.font_size,
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/to-png")
async def pdf_to_png_endpoint(
    file: Annotated[UploadFile, File(...)],
    dpi: Annotated[int, Form(ge=72, le=300)] = 150,
    transparent: Annotated[bool, Form()] = False,
    pages: Annotated[str | None, Form()] = None,
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #4: Export PDF pages into PNG images (single PNG or ZIP)."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_pdf_upload(file, settings)
        out_path, media_type, download_name, count = pdf_service.pdf_to_images(
            job_dir,
            data,
            name,
            image_format="png",
            dpi=dpi,
            transparent=transparent,
            pages_spec=pages,
            password=password,
        )
        return _stream_result_and_cleanup(
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



@router.post("/extract-text", response_model=PdfTextExtractResponse)
async def extract_pdf_text_endpoint(
    file: Annotated[UploadFile, File(...)],
    pages: Annotated[str | None, Form()] = None,
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> PdfTextExtractResponse:
    """Tool #51: Extract readable text from a PDF document."""
    name, data = await _validate_pdf_upload(file, settings)
    return pdf_extra_service.extract_pdf_text(
        data, name, pages_spec=pages, password=password
    )


@router.post("/protect")
async def protect_pdf_endpoint(
    file: Annotated[UploadFile, File(...)],
    user_password: Annotated[str, Form(...)],
    owner_password: Annotated[str | None, Form()] = None,
    allow_printing: Annotated[bool, Form()] = True,
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #52: Protect PDF with AES-256 password encryption."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_pdf_upload(file, settings)
        out_path, page_count = pdf_extra_service.protect_pdf(
            job_dir,
            data,
            name,
            user_password=user_password,
            owner_password=owner_password,
            allow_printing=allow_printing,
            password=password,
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Result-Page-Count": str(page_count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/unlock")
async def unlock_pdf_endpoint(
    file: Annotated[UploadFile, File(...)],
    password: Annotated[str, Form(...)],
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #53: Remove password protection using the authorized password."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_pdf_upload(file, settings)
        out_path, page_count = pdf_extra_service.unlock_pdf(
            job_dir, data, name, password=password
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Result-Page-Count": str(page_count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/metadata/read", response_model=PdfMetadataResponse)
async def read_pdf_metadata_endpoint(
    file: Annotated[UploadFile, File(...)],
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> PdfMetadataResponse:
    """Tool #54 (read): Read metadata fields of a PDF document."""
    name, data = await _validate_pdf_upload(file, settings)
    return pdf_extra_service.read_pdf_metadata(data, name, password=password)


@router.post("/metadata/update")
async def update_pdf_metadata_endpoint(
    file: Annotated[UploadFile, File(...)],
    title: Annotated[str, Form()] = "",
    author: Annotated[str, Form()] = "",
    subject: Annotated[str, Form()] = "",
    keywords: Annotated[str, Form()] = "",
    creator: Annotated[str, Form()] = "",
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #54 (update): Save updated PDF metadata properties."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_pdf_upload(file, settings)
        out_path, page_count = pdf_extra_service.update_pdf_metadata(
            job_dir,
            data,
            name,
            title=title,
            author=author,
            subject=subject,
            keywords=keywords,
            creator=creator,
            password=password,
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Result-Page-Count": str(page_count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/markdown-to-pdf")
async def markdown_to_pdf_endpoint(
    payload: MarkdownToPdfRequest,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #55: Convert Markdown content into a formatted PDF document."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        out_path = pdf_extra_service.markdown_to_pdf(
            job_dir,
            payload.markdown_text,
            document_title=payload.document_title,
            paper_size=payload.paper_size,
            margin_mm=payload.margin_mm,
            font_size=payload.font_size,
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/merge")
async def merge_pdf_endpoint(
    files: Annotated[list[UploadFile], File(...)],
    passwords_json: Annotated[str | None, Form()] = None,
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #5: Merge multiple PDF documents in order."""
    if len(files) < 2:
        raise AppError("Unggah minimal 2 file PDF untuk digabungkan.", code="MINIMUM_TWO_FILES")

    parsed_passwords: list[str | None] | None = None
    if passwords_json:
        try:
            raw_list = json.loads(passwords_json)
            if isinstance(raw_list, list):
                parsed_passwords = [str(p) if p else None for p in raw_list]
        except json.JSONDecodeError as exc:
            raise AppError("Format daftar password tidak valid.", code="INVALID_JSON") from exc
    elif password:
        parsed_passwords = [password for _ in files]

    job_dir = create_job_dir(settings.temp_dir)
    try:
        validated = [await _validate_pdf_upload(item, settings) for item in files]
        out_path, total_pages = pdf_service.merge_pdfs(
            job_dir, validated, passwords=parsed_passwords
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name="pdf-gabungan.pdf",
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Result-Page-Count": str(total_pages)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise



@router.post("/extract-text", response_model=PdfTextExtractResponse)
async def extract_pdf_text_endpoint(
    file: Annotated[UploadFile, File(...)],
    pages: Annotated[str | None, Form()] = None,
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> PdfTextExtractResponse:
    """Tool #51: Extract readable text from a PDF document."""
    name, data = await _validate_pdf_upload(file, settings)
    return pdf_extra_service.extract_pdf_text(
        data, name, pages_spec=pages, password=password
    )


@router.post("/protect")
async def protect_pdf_endpoint(
    file: Annotated[UploadFile, File(...)],
    user_password: Annotated[str, Form(...)],
    owner_password: Annotated[str | None, Form()] = None,
    allow_printing: Annotated[bool, Form()] = True,
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #52: Protect PDF with AES-256 password encryption."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_pdf_upload(file, settings)
        out_path, page_count = pdf_extra_service.protect_pdf(
            job_dir,
            data,
            name,
            user_password=user_password,
            owner_password=owner_password,
            allow_printing=allow_printing,
            password=password,
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Result-Page-Count": str(page_count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/unlock")
async def unlock_pdf_endpoint(
    file: Annotated[UploadFile, File(...)],
    password: Annotated[str, Form(...)],
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #53: Remove password protection using the authorized password."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_pdf_upload(file, settings)
        out_path, page_count = pdf_extra_service.unlock_pdf(
            job_dir, data, name, password=password
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Result-Page-Count": str(page_count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/metadata/read", response_model=PdfMetadataResponse)
async def read_pdf_metadata_endpoint(
    file: Annotated[UploadFile, File(...)],
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> PdfMetadataResponse:
    """Tool #54 (read): Read metadata fields of a PDF document."""
    name, data = await _validate_pdf_upload(file, settings)
    return pdf_extra_service.read_pdf_metadata(data, name, password=password)


@router.post("/metadata/update")
async def update_pdf_metadata_endpoint(
    file: Annotated[UploadFile, File(...)],
    title: Annotated[str, Form()] = "",
    author: Annotated[str, Form()] = "",
    subject: Annotated[str, Form()] = "",
    keywords: Annotated[str, Form()] = "",
    creator: Annotated[str, Form()] = "",
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #54 (update): Save updated PDF metadata properties."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_pdf_upload(file, settings)
        out_path, page_count = pdf_extra_service.update_pdf_metadata(
            job_dir,
            data,
            name,
            title=title,
            author=author,
            subject=subject,
            keywords=keywords,
            creator=creator,
            password=password,
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Result-Page-Count": str(page_count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/markdown-to-pdf")
async def markdown_to_pdf_endpoint(
    payload: MarkdownToPdfRequest,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #55: Convert Markdown content into a formatted PDF document."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        out_path = pdf_extra_service.markdown_to_pdf(
            job_dir,
            payload.markdown_text,
            document_title=payload.document_title,
            paper_size=payload.paper_size,
            margin_mm=payload.margin_mm,
            font_size=payload.font_size,
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/split")
async def split_pdf_endpoint(
    file: Annotated[UploadFile, File(...)],
    mode: Annotated[SplitMode, Form()] = SplitMode.RANGES,
    ranges: Annotated[str | None, Form()] = None,
    every_n: Annotated[int, Form(ge=1)] = 1,
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #6: Split a PDF by page ranges, fixed chunk size, or single pages."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_pdf_upload(file, settings)
        out_path, media_type, download_name, part_count = pdf_service.split_pdf(
            job_dir,
            data,
            name,
            mode=mode,
            ranges_spec=ranges,
            every_n=every_n,
            password=password,
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=download_name,
            media_type=media_type,
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Output-Count": str(part_count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise



@router.post("/extract-text", response_model=PdfTextExtractResponse)
async def extract_pdf_text_endpoint(
    file: Annotated[UploadFile, File(...)],
    pages: Annotated[str | None, Form()] = None,
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> PdfTextExtractResponse:
    """Tool #51: Extract readable text from a PDF document."""
    name, data = await _validate_pdf_upload(file, settings)
    return pdf_extra_service.extract_pdf_text(
        data, name, pages_spec=pages, password=password
    )


@router.post("/protect")
async def protect_pdf_endpoint(
    file: Annotated[UploadFile, File(...)],
    user_password: Annotated[str, Form(...)],
    owner_password: Annotated[str | None, Form()] = None,
    allow_printing: Annotated[bool, Form()] = True,
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #52: Protect PDF with AES-256 password encryption."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_pdf_upload(file, settings)
        out_path, page_count = pdf_extra_service.protect_pdf(
            job_dir,
            data,
            name,
            user_password=user_password,
            owner_password=owner_password,
            allow_printing=allow_printing,
            password=password,
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Result-Page-Count": str(page_count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/unlock")
async def unlock_pdf_endpoint(
    file: Annotated[UploadFile, File(...)],
    password: Annotated[str, Form(...)],
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #53: Remove password protection using the authorized password."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_pdf_upload(file, settings)
        out_path, page_count = pdf_extra_service.unlock_pdf(
            job_dir, data, name, password=password
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Result-Page-Count": str(page_count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/metadata/read", response_model=PdfMetadataResponse)
async def read_pdf_metadata_endpoint(
    file: Annotated[UploadFile, File(...)],
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> PdfMetadataResponse:
    """Tool #54 (read): Read metadata fields of a PDF document."""
    name, data = await _validate_pdf_upload(file, settings)
    return pdf_extra_service.read_pdf_metadata(data, name, password=password)


@router.post("/metadata/update")
async def update_pdf_metadata_endpoint(
    file: Annotated[UploadFile, File(...)],
    title: Annotated[str, Form()] = "",
    author: Annotated[str, Form()] = "",
    subject: Annotated[str, Form()] = "",
    keywords: Annotated[str, Form()] = "",
    creator: Annotated[str, Form()] = "",
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #54 (update): Save updated PDF metadata properties."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_pdf_upload(file, settings)
        out_path, page_count = pdf_extra_service.update_pdf_metadata(
            job_dir,
            data,
            name,
            title=title,
            author=author,
            subject=subject,
            keywords=keywords,
            creator=creator,
            password=password,
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Result-Page-Count": str(page_count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/markdown-to-pdf")
async def markdown_to_pdf_endpoint(
    payload: MarkdownToPdfRequest,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #55: Convert Markdown content into a formatted PDF document."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        out_path = pdf_extra_service.markdown_to_pdf(
            job_dir,
            payload.markdown_text,
            document_title=payload.document_title,
            paper_size=payload.paper_size,
            margin_mm=payload.margin_mm,
            font_size=payload.font_size,
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/compress")
async def compress_pdf_endpoint(
    file: Annotated[UploadFile, File(...)],
    level: Annotated[CompressionLevel, Form()] = CompressionLevel.MEDIUM,
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #7: Compress a PDF file to reduce file size."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_pdf_upload(file, settings)
        out_path, page_count, orig_size, proc_size = pdf_service.compress_pdf(
            job_dir, data, name, level=level, password=password
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
            extra_headers={
                "X-Result-Page-Count": str(page_count),
                "X-Original-Size": str(orig_size),
                "X-Processed-Size": str(proc_size),
            },
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise



@router.post("/extract-text", response_model=PdfTextExtractResponse)
async def extract_pdf_text_endpoint(
    file: Annotated[UploadFile, File(...)],
    pages: Annotated[str | None, Form()] = None,
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> PdfTextExtractResponse:
    """Tool #51: Extract readable text from a PDF document."""
    name, data = await _validate_pdf_upload(file, settings)
    return pdf_extra_service.extract_pdf_text(
        data, name, pages_spec=pages, password=password
    )


@router.post("/protect")
async def protect_pdf_endpoint(
    file: Annotated[UploadFile, File(...)],
    user_password: Annotated[str, Form(...)],
    owner_password: Annotated[str | None, Form()] = None,
    allow_printing: Annotated[bool, Form()] = True,
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #52: Protect PDF with AES-256 password encryption."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_pdf_upload(file, settings)
        out_path, page_count = pdf_extra_service.protect_pdf(
            job_dir,
            data,
            name,
            user_password=user_password,
            owner_password=owner_password,
            allow_printing=allow_printing,
            password=password,
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Result-Page-Count": str(page_count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/unlock")
async def unlock_pdf_endpoint(
    file: Annotated[UploadFile, File(...)],
    password: Annotated[str, Form(...)],
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #53: Remove password protection using the authorized password."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_pdf_upload(file, settings)
        out_path, page_count = pdf_extra_service.unlock_pdf(
            job_dir, data, name, password=password
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Result-Page-Count": str(page_count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/metadata/read", response_model=PdfMetadataResponse)
async def read_pdf_metadata_endpoint(
    file: Annotated[UploadFile, File(...)],
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> PdfMetadataResponse:
    """Tool #54 (read): Read metadata fields of a PDF document."""
    name, data = await _validate_pdf_upload(file, settings)
    return pdf_extra_service.read_pdf_metadata(data, name, password=password)


@router.post("/metadata/update")
async def update_pdf_metadata_endpoint(
    file: Annotated[UploadFile, File(...)],
    title: Annotated[str, Form()] = "",
    author: Annotated[str, Form()] = "",
    subject: Annotated[str, Form()] = "",
    keywords: Annotated[str, Form()] = "",
    creator: Annotated[str, Form()] = "",
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #54 (update): Save updated PDF metadata properties."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_pdf_upload(file, settings)
        out_path, page_count = pdf_extra_service.update_pdf_metadata(
            job_dir,
            data,
            name,
            title=title,
            author=author,
            subject=subject,
            keywords=keywords,
            creator=creator,
            password=password,
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Result-Page-Count": str(page_count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/markdown-to-pdf")
async def markdown_to_pdf_endpoint(
    payload: MarkdownToPdfRequest,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #55: Convert Markdown content into a formatted PDF document."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        out_path = pdf_extra_service.markdown_to_pdf(
            job_dir,
            payload.markdown_text,
            document_title=payload.document_title,
            paper_size=payload.paper_size,
            margin_mm=payload.margin_mm,
            font_size=payload.font_size,
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/rotate")
async def rotate_pdf_endpoint(
    file: Annotated[UploadFile, File(...)],
    angle: Annotated[int, Form()] = 90,
    pages: Annotated[str | None, Form()] = None,
    page_rotations_json: Annotated[str | None, Form()] = None,
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #8: Rotate selected pages or per-page angles in a PDF."""
    rotations_map: dict[int, int] | None = None
    if page_rotations_json:
        try:
            raw_obj = json.loads(page_rotations_json)
            if not isinstance(raw_obj, dict):
                raise ValueError("Expected JSON object")
            rotations_map = {int(k): int(v) for k, v in raw_obj.items()}
        except (ValueError, json.JSONDecodeError) as exc:
            raise AppError("Format rotasi per halaman tidak valid.", code="INVALID_JSON") from exc

    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_pdf_upload(file, settings)
        out_path, page_count = pdf_service.rotate_pdf(
            job_dir,
            data,
            name,
            angle=angle,
            pages_spec=pages,
            page_rotations=rotations_map,
            password=password,
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Result-Page-Count": str(page_count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise



@router.post("/extract-text", response_model=PdfTextExtractResponse)
async def extract_pdf_text_endpoint(
    file: Annotated[UploadFile, File(...)],
    pages: Annotated[str | None, Form()] = None,
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> PdfTextExtractResponse:
    """Tool #51: Extract readable text from a PDF document."""
    name, data = await _validate_pdf_upload(file, settings)
    return pdf_extra_service.extract_pdf_text(
        data, name, pages_spec=pages, password=password
    )


@router.post("/protect")
async def protect_pdf_endpoint(
    file: Annotated[UploadFile, File(...)],
    user_password: Annotated[str, Form(...)],
    owner_password: Annotated[str | None, Form()] = None,
    allow_printing: Annotated[bool, Form()] = True,
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #52: Protect PDF with AES-256 password encryption."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_pdf_upload(file, settings)
        out_path, page_count = pdf_extra_service.protect_pdf(
            job_dir,
            data,
            name,
            user_password=user_password,
            owner_password=owner_password,
            allow_printing=allow_printing,
            password=password,
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Result-Page-Count": str(page_count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/unlock")
async def unlock_pdf_endpoint(
    file: Annotated[UploadFile, File(...)],
    password: Annotated[str, Form(...)],
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #53: Remove password protection using the authorized password."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_pdf_upload(file, settings)
        out_path, page_count = pdf_extra_service.unlock_pdf(
            job_dir, data, name, password=password
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Result-Page-Count": str(page_count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/metadata/read", response_model=PdfMetadataResponse)
async def read_pdf_metadata_endpoint(
    file: Annotated[UploadFile, File(...)],
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> PdfMetadataResponse:
    """Tool #54 (read): Read metadata fields of a PDF document."""
    name, data = await _validate_pdf_upload(file, settings)
    return pdf_extra_service.read_pdf_metadata(data, name, password=password)


@router.post("/metadata/update")
async def update_pdf_metadata_endpoint(
    file: Annotated[UploadFile, File(...)],
    title: Annotated[str, Form()] = "",
    author: Annotated[str, Form()] = "",
    subject: Annotated[str, Form()] = "",
    keywords: Annotated[str, Form()] = "",
    creator: Annotated[str, Form()] = "",
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #54 (update): Save updated PDF metadata properties."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_pdf_upload(file, settings)
        out_path, page_count = pdf_extra_service.update_pdf_metadata(
            job_dir,
            data,
            name,
            title=title,
            author=author,
            subject=subject,
            keywords=keywords,
            creator=creator,
            password=password,
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Result-Page-Count": str(page_count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/markdown-to-pdf")
async def markdown_to_pdf_endpoint(
    payload: MarkdownToPdfRequest,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #55: Convert Markdown content into a formatted PDF document."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        out_path = pdf_extra_service.markdown_to_pdf(
            job_dir,
            payload.markdown_text,
            document_title=payload.document_title,
            paper_size=payload.paper_size,
            margin_mm=payload.margin_mm,
            font_size=payload.font_size,
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/reorder")
async def reorder_pdf_endpoint(
    file: Annotated[UploadFile, File(...)],
    order_json: Annotated[str, Form(...)],
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #9: Reorder PDF pages according to an explicit page order array."""
    try:
        parsed = json.loads(order_json)
        if not isinstance(parsed, list) or not all(isinstance(x, int) for x in parsed):
            raise ValueError("Invalid list")
    except (ValueError, json.JSONDecodeError) as exc:
        raise AppError("Format urutan halaman harus berupa array angka.", code="INVALID_ORDER") from exc

    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_pdf_upload(file, settings)
        out_path, page_count = pdf_service.reorder_pdf(
            job_dir, data, name, order=parsed, password=password
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Result-Page-Count": str(page_count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise



@router.post("/extract-text", response_model=PdfTextExtractResponse)
async def extract_pdf_text_endpoint(
    file: Annotated[UploadFile, File(...)],
    pages: Annotated[str | None, Form()] = None,
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> PdfTextExtractResponse:
    """Tool #51: Extract readable text from a PDF document."""
    name, data = await _validate_pdf_upload(file, settings)
    return pdf_extra_service.extract_pdf_text(
        data, name, pages_spec=pages, password=password
    )


@router.post("/protect")
async def protect_pdf_endpoint(
    file: Annotated[UploadFile, File(...)],
    user_password: Annotated[str, Form(...)],
    owner_password: Annotated[str | None, Form()] = None,
    allow_printing: Annotated[bool, Form()] = True,
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #52: Protect PDF with AES-256 password encryption."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_pdf_upload(file, settings)
        out_path, page_count = pdf_extra_service.protect_pdf(
            job_dir,
            data,
            name,
            user_password=user_password,
            owner_password=owner_password,
            allow_printing=allow_printing,
            password=password,
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Result-Page-Count": str(page_count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/unlock")
async def unlock_pdf_endpoint(
    file: Annotated[UploadFile, File(...)],
    password: Annotated[str, Form(...)],
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #53: Remove password protection using the authorized password."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_pdf_upload(file, settings)
        out_path, page_count = pdf_extra_service.unlock_pdf(
            job_dir, data, name, password=password
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Result-Page-Count": str(page_count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/metadata/read", response_model=PdfMetadataResponse)
async def read_pdf_metadata_endpoint(
    file: Annotated[UploadFile, File(...)],
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> PdfMetadataResponse:
    """Tool #54 (read): Read metadata fields of a PDF document."""
    name, data = await _validate_pdf_upload(file, settings)
    return pdf_extra_service.read_pdf_metadata(data, name, password=password)


@router.post("/metadata/update")
async def update_pdf_metadata_endpoint(
    file: Annotated[UploadFile, File(...)],
    title: Annotated[str, Form()] = "",
    author: Annotated[str, Form()] = "",
    subject: Annotated[str, Form()] = "",
    keywords: Annotated[str, Form()] = "",
    creator: Annotated[str, Form()] = "",
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #54 (update): Save updated PDF metadata properties."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_pdf_upload(file, settings)
        out_path, page_count = pdf_extra_service.update_pdf_metadata(
            job_dir,
            data,
            name,
            title=title,
            author=author,
            subject=subject,
            keywords=keywords,
            creator=creator,
            password=password,
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Result-Page-Count": str(page_count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/markdown-to-pdf")
async def markdown_to_pdf_endpoint(
    payload: MarkdownToPdfRequest,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #55: Convert Markdown content into a formatted PDF document."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        out_path = pdf_extra_service.markdown_to_pdf(
            job_dir,
            payload.markdown_text,
            document_title=payload.document_title,
            paper_size=payload.paper_size,
            margin_mm=payload.margin_mm,
            font_size=payload.font_size,
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/delete-pages")
async def delete_pdf_pages_endpoint(
    file: Annotated[UploadFile, File(...)],
    pages: Annotated[str, Form(...)],
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #10: Delete selected pages from a PDF document."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_pdf_upload(file, settings)
        out_path, page_count = pdf_service.delete_pdf_pages(
            job_dir, data, name, pages_spec=pages, password=password
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Result-Page-Count": str(page_count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise



@router.post("/extract-text", response_model=PdfTextExtractResponse)
async def extract_pdf_text_endpoint(
    file: Annotated[UploadFile, File(...)],
    pages: Annotated[str | None, Form()] = None,
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> PdfTextExtractResponse:
    """Tool #51: Extract readable text from a PDF document."""
    name, data = await _validate_pdf_upload(file, settings)
    return pdf_extra_service.extract_pdf_text(
        data, name, pages_spec=pages, password=password
    )


@router.post("/protect")
async def protect_pdf_endpoint(
    file: Annotated[UploadFile, File(...)],
    user_password: Annotated[str, Form(...)],
    owner_password: Annotated[str | None, Form()] = None,
    allow_printing: Annotated[bool, Form()] = True,
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #52: Protect PDF with AES-256 password encryption."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_pdf_upload(file, settings)
        out_path, page_count = pdf_extra_service.protect_pdf(
            job_dir,
            data,
            name,
            user_password=user_password,
            owner_password=owner_password,
            allow_printing=allow_printing,
            password=password,
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Result-Page-Count": str(page_count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/unlock")
async def unlock_pdf_endpoint(
    file: Annotated[UploadFile, File(...)],
    password: Annotated[str, Form(...)],
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #53: Remove password protection using the authorized password."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_pdf_upload(file, settings)
        out_path, page_count = pdf_extra_service.unlock_pdf(
            job_dir, data, name, password=password
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Result-Page-Count": str(page_count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/metadata/read", response_model=PdfMetadataResponse)
async def read_pdf_metadata_endpoint(
    file: Annotated[UploadFile, File(...)],
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> PdfMetadataResponse:
    """Tool #54 (read): Read metadata fields of a PDF document."""
    name, data = await _validate_pdf_upload(file, settings)
    return pdf_extra_service.read_pdf_metadata(data, name, password=password)


@router.post("/metadata/update")
async def update_pdf_metadata_endpoint(
    file: Annotated[UploadFile, File(...)],
    title: Annotated[str, Form()] = "",
    author: Annotated[str, Form()] = "",
    subject: Annotated[str, Form()] = "",
    keywords: Annotated[str, Form()] = "",
    creator: Annotated[str, Form()] = "",
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #54 (update): Save updated PDF metadata properties."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_pdf_upload(file, settings)
        out_path, page_count = pdf_extra_service.update_pdf_metadata(
            job_dir,
            data,
            name,
            title=title,
            author=author,
            subject=subject,
            keywords=keywords,
            creator=creator,
            password=password,
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Result-Page-Count": str(page_count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/markdown-to-pdf")
async def markdown_to_pdf_endpoint(
    payload: MarkdownToPdfRequest,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #55: Convert Markdown content into a formatted PDF document."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        out_path = pdf_extra_service.markdown_to_pdf(
            job_dir,
            payload.markdown_text,
            document_title=payload.document_title,
            paper_size=payload.paper_size,
            margin_mm=payload.margin_mm,
            font_size=payload.font_size,
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/extract-pages")
async def extract_pdf_pages_endpoint(
    file: Annotated[UploadFile, File(...)],
    pages: Annotated[str, Form(...)],
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #11: Extract selected pages from a PDF into a new document."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_pdf_upload(file, settings)
        out_path, page_count = pdf_service.extract_pdf_pages(
            job_dir, data, name, pages_spec=pages, password=password
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Result-Page-Count": str(page_count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise



@router.post("/extract-text", response_model=PdfTextExtractResponse)
async def extract_pdf_text_endpoint(
    file: Annotated[UploadFile, File(...)],
    pages: Annotated[str | None, Form()] = None,
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> PdfTextExtractResponse:
    """Tool #51: Extract readable text from a PDF document."""
    name, data = await _validate_pdf_upload(file, settings)
    return pdf_extra_service.extract_pdf_text(
        data, name, pages_spec=pages, password=password
    )


@router.post("/protect")
async def protect_pdf_endpoint(
    file: Annotated[UploadFile, File(...)],
    user_password: Annotated[str, Form(...)],
    owner_password: Annotated[str | None, Form()] = None,
    allow_printing: Annotated[bool, Form()] = True,
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #52: Protect PDF with AES-256 password encryption."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_pdf_upload(file, settings)
        out_path, page_count = pdf_extra_service.protect_pdf(
            job_dir,
            data,
            name,
            user_password=user_password,
            owner_password=owner_password,
            allow_printing=allow_printing,
            password=password,
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Result-Page-Count": str(page_count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/unlock")
async def unlock_pdf_endpoint(
    file: Annotated[UploadFile, File(...)],
    password: Annotated[str, Form(...)],
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #53: Remove password protection using the authorized password."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_pdf_upload(file, settings)
        out_path, page_count = pdf_extra_service.unlock_pdf(
            job_dir, data, name, password=password
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Result-Page-Count": str(page_count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/metadata/read", response_model=PdfMetadataResponse)
async def read_pdf_metadata_endpoint(
    file: Annotated[UploadFile, File(...)],
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> PdfMetadataResponse:
    """Tool #54 (read): Read metadata fields of a PDF document."""
    name, data = await _validate_pdf_upload(file, settings)
    return pdf_extra_service.read_pdf_metadata(data, name, password=password)


@router.post("/metadata/update")
async def update_pdf_metadata_endpoint(
    file: Annotated[UploadFile, File(...)],
    title: Annotated[str, Form()] = "",
    author: Annotated[str, Form()] = "",
    subject: Annotated[str, Form()] = "",
    keywords: Annotated[str, Form()] = "",
    creator: Annotated[str, Form()] = "",
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #54 (update): Save updated PDF metadata properties."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_pdf_upload(file, settings)
        out_path, page_count = pdf_extra_service.update_pdf_metadata(
            job_dir,
            data,
            name,
            title=title,
            author=author,
            subject=subject,
            keywords=keywords,
            creator=creator,
            password=password,
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Result-Page-Count": str(page_count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/markdown-to-pdf")
async def markdown_to_pdf_endpoint(
    payload: MarkdownToPdfRequest,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #55: Convert Markdown content into a formatted PDF document."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        out_path = pdf_extra_service.markdown_to_pdf(
            job_dir,
            payload.markdown_text,
            document_title=payload.document_title,
            paper_size=payload.paper_size,
            margin_mm=payload.margin_mm,
            font_size=payload.font_size,
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/watermark")
async def watermark_pdf_endpoint(
    file: Annotated[UploadFile, File(...)],
    watermark_type: Annotated[WatermarkType, Form()] = WatermarkType.TEXT,
    text: Annotated[str, Form()] = "CONFIDENTIAL",
    font_size: Annotated[int, Form(ge=8, le=120)] = 36,
    color_hex: Annotated[str, Form()] = "#0D7A68",
    opacity: Annotated[float, Form(ge=0.05, le=1.0)] = 0.25,
    rotation: Annotated[int, Form(ge=-180, le=180)] = 35,
    position: Annotated[WatermarkPosition, Form()] = WatermarkPosition.CENTER,
    image_scale: Annotated[float, Form(ge=0.05, le=0.95)] = 0.35,
    pages: Annotated[str | None, Form()] = None,
    password: Annotated[str | None, Form()] = None,
    watermark_image: Annotated[UploadFile | None, File()] = None,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #12: Add text or image watermark to a PDF document."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_pdf_upload(file, settings)
        wm_image_bytes: bytes | None = None
        if watermark_type == WatermarkType.IMAGE:
            if watermark_image is None:
                raise AppError("Unggah gambar watermark terlebih dahulu.", code="MISSING_WATERMARK_IMAGE")
            _, wm_image_bytes = await _validate_image_upload(watermark_image, settings)

        out_path, page_count = pdf_service.watermark_pdf(
            job_dir,
            data,
            name,
            watermark_type=watermark_type,
            text=text,
            font_size=font_size,
            color_hex=color_hex,
            opacity=opacity,
            rotation=rotation,
            position=position,
            watermark_image_bytes=wm_image_bytes,
            image_scale=image_scale,
            pages_spec=pages,
            password=password,
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Result-Page-Count": str(page_count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise



@router.post("/extract-text", response_model=PdfTextExtractResponse)
async def extract_pdf_text_endpoint(
    file: Annotated[UploadFile, File(...)],
    pages: Annotated[str | None, Form()] = None,
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> PdfTextExtractResponse:
    """Tool #51: Extract readable text from a PDF document."""
    name, data = await _validate_pdf_upload(file, settings)
    return pdf_extra_service.extract_pdf_text(
        data, name, pages_spec=pages, password=password
    )


@router.post("/protect")
async def protect_pdf_endpoint(
    file: Annotated[UploadFile, File(...)],
    user_password: Annotated[str, Form(...)],
    owner_password: Annotated[str | None, Form()] = None,
    allow_printing: Annotated[bool, Form()] = True,
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #52: Protect PDF with AES-256 password encryption."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_pdf_upload(file, settings)
        out_path, page_count = pdf_extra_service.protect_pdf(
            job_dir,
            data,
            name,
            user_password=user_password,
            owner_password=owner_password,
            allow_printing=allow_printing,
            password=password,
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Result-Page-Count": str(page_count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/unlock")
async def unlock_pdf_endpoint(
    file: Annotated[UploadFile, File(...)],
    password: Annotated[str, Form(...)],
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #53: Remove password protection using the authorized password."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_pdf_upload(file, settings)
        out_path, page_count = pdf_extra_service.unlock_pdf(
            job_dir, data, name, password=password
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Result-Page-Count": str(page_count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/metadata/read", response_model=PdfMetadataResponse)
async def read_pdf_metadata_endpoint(
    file: Annotated[UploadFile, File(...)],
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> PdfMetadataResponse:
    """Tool #54 (read): Read metadata fields of a PDF document."""
    name, data = await _validate_pdf_upload(file, settings)
    return pdf_extra_service.read_pdf_metadata(data, name, password=password)


@router.post("/metadata/update")
async def update_pdf_metadata_endpoint(
    file: Annotated[UploadFile, File(...)],
    title: Annotated[str, Form()] = "",
    author: Annotated[str, Form()] = "",
    subject: Annotated[str, Form()] = "",
    keywords: Annotated[str, Form()] = "",
    creator: Annotated[str, Form()] = "",
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #54 (update): Save updated PDF metadata properties."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_pdf_upload(file, settings)
        out_path, page_count = pdf_extra_service.update_pdf_metadata(
            job_dir,
            data,
            name,
            title=title,
            author=author,
            subject=subject,
            keywords=keywords,
            creator=creator,
            password=password,
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Result-Page-Count": str(page_count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/markdown-to-pdf")
async def markdown_to_pdf_endpoint(
    payload: MarkdownToPdfRequest,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #55: Convert Markdown content into a formatted PDF document."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        out_path = pdf_extra_service.markdown_to_pdf(
            job_dir,
            payload.markdown_text,
            document_title=payload.document_title,
            paper_size=payload.paper_size,
            margin_mm=payload.margin_mm,
            font_size=payload.font_size,
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/page-numbers")
async def page_number_pdf_endpoint(
    file: Annotated[UploadFile, File(...)],
    position: Annotated[PageNumberPosition, Form()] = PageNumberPosition.BOTTOM_CENTER,
    format_template: Annotated[str, Form()] = "Halaman {page} dari {total}",
    start_number: Annotated[int, Form(ge=1)] = 1,
    skip_first_page: Annotated[bool, Form()] = False,
    font_size: Annotated[int, Form(ge=6, le=32)] = 11,
    margin_mm: Annotated[float, Form(ge=4, le=40)] = 12.0,
    color_hex: Annotated[str, Form()] = "#334155",
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #13: Add automatic page numbering to PDF pages."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_pdf_upload(file, settings)
        out_path, page_count = pdf_service.add_page_numbers(
            job_dir,
            data,
            name,
            position=position,
            format_template=format_template,
            start_number=start_number,
            skip_first_page=skip_first_page,
            font_size=font_size,
            margin_mm=margin_mm,
            color_hex=color_hex,
            password=password,
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Result-Page-Count": str(page_count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise



@router.post("/extract-text", response_model=PdfTextExtractResponse)
async def extract_pdf_text_endpoint(
    file: Annotated[UploadFile, File(...)],
    pages: Annotated[str | None, Form()] = None,
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> PdfTextExtractResponse:
    """Tool #51: Extract readable text from a PDF document."""
    name, data = await _validate_pdf_upload(file, settings)
    return pdf_extra_service.extract_pdf_text(
        data, name, pages_spec=pages, password=password
    )


@router.post("/protect")
async def protect_pdf_endpoint(
    file: Annotated[UploadFile, File(...)],
    user_password: Annotated[str, Form(...)],
    owner_password: Annotated[str | None, Form()] = None,
    allow_printing: Annotated[bool, Form()] = True,
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #52: Protect PDF with AES-256 password encryption."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_pdf_upload(file, settings)
        out_path, page_count = pdf_extra_service.protect_pdf(
            job_dir,
            data,
            name,
            user_password=user_password,
            owner_password=owner_password,
            allow_printing=allow_printing,
            password=password,
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Result-Page-Count": str(page_count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/unlock")
async def unlock_pdf_endpoint(
    file: Annotated[UploadFile, File(...)],
    password: Annotated[str, Form(...)],
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #53: Remove password protection using the authorized password."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_pdf_upload(file, settings)
        out_path, page_count = pdf_extra_service.unlock_pdf(
            job_dir, data, name, password=password
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Result-Page-Count": str(page_count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/metadata/read", response_model=PdfMetadataResponse)
async def read_pdf_metadata_endpoint(
    file: Annotated[UploadFile, File(...)],
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> PdfMetadataResponse:
    """Tool #54 (read): Read metadata fields of a PDF document."""
    name, data = await _validate_pdf_upload(file, settings)
    return pdf_extra_service.read_pdf_metadata(data, name, password=password)


@router.post("/metadata/update")
async def update_pdf_metadata_endpoint(
    file: Annotated[UploadFile, File(...)],
    title: Annotated[str, Form()] = "",
    author: Annotated[str, Form()] = "",
    subject: Annotated[str, Form()] = "",
    keywords: Annotated[str, Form()] = "",
    creator: Annotated[str, Form()] = "",
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #54 (update): Save updated PDF metadata properties."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_pdf_upload(file, settings)
        out_path, page_count = pdf_extra_service.update_pdf_metadata(
            job_dir,
            data,
            name,
            title=title,
            author=author,
            subject=subject,
            keywords=keywords,
            creator=creator,
            password=password,
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Result-Page-Count": str(page_count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/markdown-to-pdf")
async def markdown_to_pdf_endpoint(
    payload: MarkdownToPdfRequest,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #55: Convert Markdown content into a formatted PDF document."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        out_path = pdf_extra_service.markdown_to_pdf(
            job_dir,
            payload.markdown_text,
            document_title=payload.document_title,
            paper_size=payload.paper_size,
            margin_mm=payload.margin_mm,
            font_size=payload.font_size,
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/resize")
async def resize_pdf_endpoint(
    file: Annotated[UploadFile, File(...)],
    paper_size: Annotated[PaperSize, Form()] = PaperSize.A4,
    custom_width_mm: Annotated[float, Form()] = 210.0,
    custom_height_mm: Annotated[float, Form()] = 297.0,
    orientation: Annotated[Orientation, Form()] = Orientation.AUTO,
    margin_mm: Annotated[float, Form(ge=0, le=60)] = 10.0,
    fit_mode: Annotated[FitMode, Form()] = FitMode.FIT,
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #14: Resize PDF pages to standard or custom paper dimensions."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_pdf_upload(file, settings)
        out_path, page_count = pdf_service.resize_pdf(
            job_dir,
            data,
            name,
            paper_size=paper_size,
            custom_width_mm=custom_width_mm,
            custom_height_mm=custom_height_mm,
            orientation=orientation,
            margin_mm=margin_mm,
            fit_mode=fit_mode,
            password=password,
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Result-Page-Count": str(page_count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise



@router.post("/extract-text", response_model=PdfTextExtractResponse)
async def extract_pdf_text_endpoint(
    file: Annotated[UploadFile, File(...)],
    pages: Annotated[str | None, Form()] = None,
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> PdfTextExtractResponse:
    """Tool #51: Extract readable text from a PDF document."""
    name, data = await _validate_pdf_upload(file, settings)
    return pdf_extra_service.extract_pdf_text(
        data, name, pages_spec=pages, password=password
    )


@router.post("/protect")
async def protect_pdf_endpoint(
    file: Annotated[UploadFile, File(...)],
    user_password: Annotated[str, Form(...)],
    owner_password: Annotated[str | None, Form()] = None,
    allow_printing: Annotated[bool, Form()] = True,
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #52: Protect PDF with AES-256 password encryption."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_pdf_upload(file, settings)
        out_path, page_count = pdf_extra_service.protect_pdf(
            job_dir,
            data,
            name,
            user_password=user_password,
            owner_password=owner_password,
            allow_printing=allow_printing,
            password=password,
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Result-Page-Count": str(page_count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/unlock")
async def unlock_pdf_endpoint(
    file: Annotated[UploadFile, File(...)],
    password: Annotated[str, Form(...)],
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #53: Remove password protection using the authorized password."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_pdf_upload(file, settings)
        out_path, page_count = pdf_extra_service.unlock_pdf(
            job_dir, data, name, password=password
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Result-Page-Count": str(page_count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/metadata/read", response_model=PdfMetadataResponse)
async def read_pdf_metadata_endpoint(
    file: Annotated[UploadFile, File(...)],
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> PdfMetadataResponse:
    """Tool #54 (read): Read metadata fields of a PDF document."""
    name, data = await _validate_pdf_upload(file, settings)
    return pdf_extra_service.read_pdf_metadata(data, name, password=password)


@router.post("/metadata/update")
async def update_pdf_metadata_endpoint(
    file: Annotated[UploadFile, File(...)],
    title: Annotated[str, Form()] = "",
    author: Annotated[str, Form()] = "",
    subject: Annotated[str, Form()] = "",
    keywords: Annotated[str, Form()] = "",
    creator: Annotated[str, Form()] = "",
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #54 (update): Save updated PDF metadata properties."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_pdf_upload(file, settings)
        out_path, page_count = pdf_extra_service.update_pdf_metadata(
            job_dir,
            data,
            name,
            title=title,
            author=author,
            subject=subject,
            keywords=keywords,
            creator=creator,
            password=password,
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Result-Page-Count": str(page_count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/markdown-to-pdf")
async def markdown_to_pdf_endpoint(
    payload: MarkdownToPdfRequest,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #55: Convert Markdown content into a formatted PDF document."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        out_path = pdf_extra_service.markdown_to_pdf(
            job_dir,
            payload.markdown_text,
            document_title=payload.document_title,
            paper_size=payload.paper_size,
            margin_mm=payload.margin_mm,
            font_size=payload.font_size,
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/ocr")
async def ocr_pdf_endpoint(
    file: Annotated[UploadFile, File(...)],
    language: Annotated[str, Form()] = "ind+eng",
    dpi: Annotated[int, Form(ge=100, le=300)] = 200,
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #15: Convert scanned PDF into searchable PDF via Tesseract OCR."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_pdf_upload(file, settings)
        out_path, page_count, preview_text = pdf_service.ocr_pdf(
            job_dir,
            data,
            name,
            language=language,
            dpi=dpi,
            password=password,
            tesseract_cmd=settings.tesseract_cmd,
        )
        encoded_preview = base64.b64encode(preview_text.encode("utf-8")).decode("ascii")
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
            extra_headers={
                "X-Result-Page-Count": str(page_count),
                "X-OCR-Preview-B64": encoded_preview,
            },
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise

@router.post("/extract-text", response_model=PdfTextExtractResponse)
async def extract_pdf_text_endpoint(
    file: Annotated[UploadFile, File(...)],
    pages: Annotated[str | None, Form()] = None,
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> PdfTextExtractResponse:
    """Tool #51: Extract readable text from a PDF document."""
    name, data = await _validate_pdf_upload(file, settings)
    return pdf_extra_service.extract_pdf_text(
        data, name, pages_spec=pages, password=password
    )


@router.post("/protect")
async def protect_pdf_endpoint(
    file: Annotated[UploadFile, File(...)],
    user_password: Annotated[str, Form(...)],
    owner_password: Annotated[str | None, Form()] = None,
    allow_printing: Annotated[bool, Form()] = True,
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #52: Protect PDF with AES-256 password encryption."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_pdf_upload(file, settings)
        out_path, page_count = pdf_extra_service.protect_pdf(
            job_dir,
            data,
            name,
            user_password=user_password,
            owner_password=owner_password,
            allow_printing=allow_printing,
            password=password,
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Result-Page-Count": str(page_count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/unlock")
async def unlock_pdf_endpoint(
    file: Annotated[UploadFile, File(...)],
    password: Annotated[str, Form(...)],
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #53: Remove password protection using the authorized password."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_pdf_upload(file, settings)
        out_path, page_count = pdf_extra_service.unlock_pdf(
            job_dir, data, name, password=password
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Result-Page-Count": str(page_count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/metadata/read", response_model=PdfMetadataResponse)
async def read_pdf_metadata_endpoint(
    file: Annotated[UploadFile, File(...)],
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> PdfMetadataResponse:
    """Tool #54 (read): Read metadata fields of a PDF document."""
    name, data = await _validate_pdf_upload(file, settings)
    return pdf_extra_service.read_pdf_metadata(data, name, password=password)


@router.post("/metadata/update")
async def update_pdf_metadata_endpoint(
    file: Annotated[UploadFile, File(...)],
    title: Annotated[str, Form()] = "",
    author: Annotated[str, Form()] = "",
    subject: Annotated[str, Form()] = "",
    keywords: Annotated[str, Form()] = "",
    creator: Annotated[str, Form()] = "",
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #54 (update): Save updated PDF metadata properties."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_pdf_upload(file, settings)
        out_path, page_count = pdf_extra_service.update_pdf_metadata(
            job_dir,
            data,
            name,
            title=title,
            author=author,
            subject=subject,
            keywords=keywords,
            creator=creator,
            password=password,
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Result-Page-Count": str(page_count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/markdown-to-pdf")
async def markdown_to_pdf_endpoint(
    payload: MarkdownToPdfRequest,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #55: Convert Markdown content into a formatted PDF document."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        out_path = pdf_extra_service.markdown_to_pdf(
            job_dir,
            payload.markdown_text,
            document_title=payload.document_title,
            paper_size=payload.paper_size,
            margin_mm=payload.margin_mm,
            font_size=payload.font_size,
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise

@router.post("/extract-text", response_model=PdfTextExtractResponse)
async def extract_pdf_text_endpoint(
    file: Annotated[UploadFile, File(...)],
    pages: Annotated[str | None, Form()] = None,
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> PdfTextExtractResponse:
    """Tool #51: Extract readable text from a PDF document."""
    name, data = await _validate_pdf_upload(file, settings)
    return pdf_extra_service.extract_pdf_text(
        data, name, pages_spec=pages, password=password
    )


@router.post("/protect")
async def protect_pdf_endpoint(
    file: Annotated[UploadFile, File(...)],
    user_password: Annotated[str, Form(...)],
    owner_password: Annotated[str | None, Form()] = None,
    allow_printing: Annotated[bool, Form()] = True,
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #52: Protect PDF with AES-256 password encryption."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_pdf_upload(file, settings)
        out_path, page_count = pdf_extra_service.protect_pdf(
            job_dir,
            data,
            name,
            user_password=user_password,
            owner_password=owner_password,
            allow_printing=allow_printing,
            password=password,
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Result-Page-Count": str(page_count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/unlock")
async def unlock_pdf_endpoint(
    file: Annotated[UploadFile, File(...)],
    password: Annotated[str, Form(...)],
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #53: Remove password protection using the authorized password."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_pdf_upload(file, settings)
        out_path, page_count = pdf_extra_service.unlock_pdf(
            job_dir, data, name, password=password
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Result-Page-Count": str(page_count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/metadata/read", response_model=PdfMetadataResponse)
async def read_pdf_metadata_endpoint(
    file: Annotated[UploadFile, File(...)],
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> PdfMetadataResponse:
    """Tool #54 (read): Read metadata fields of a PDF document."""
    name, data = await _validate_pdf_upload(file, settings)
    return pdf_extra_service.read_pdf_metadata(data, name, password=password)


@router.post("/metadata/update")
async def update_pdf_metadata_endpoint(
    file: Annotated[UploadFile, File(...)],
    title: Annotated[str, Form()] = "",
    author: Annotated[str, Form()] = "",
    subject: Annotated[str, Form()] = "",
    keywords: Annotated[str, Form()] = "",
    creator: Annotated[str, Form()] = "",
    password: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #54 (update): Save updated PDF metadata properties."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_pdf_upload(file, settings)
        out_path, page_count = pdf_extra_service.update_pdf_metadata(
            job_dir,
            data,
            name,
            title=title,
            author=author,
            subject=subject,
            keywords=keywords,
            creator=creator,
            password=password,
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Result-Page-Count": str(page_count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/markdown-to-pdf")
async def markdown_to_pdf_endpoint(
    payload: MarkdownToPdfRequest,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #55: Convert Markdown content into a formatted PDF document."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        out_path = pdf_extra_service.markdown_to_pdf(
            job_dir,
            payload.markdown_text,
            document_title=payload.document_title,
            paper_size=payload.paper_size,
            margin_mm=payload.margin_mm,
            font_size=payload.font_size,
        )
        return _stream_result_and_cleanup(
            out_path,
            download_name=out_path.name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise

