"""Pydantic schemas and enums for PDF & Document processing endpoints."""

from __future__ import annotations

from enum import Enum
from pydantic import BaseModel, Field


class PaperSize(str, Enum):
    """Supported standard and custom paper sizes."""

    A4 = "A4"
    A3 = "A3"
    LETTER = "Letter"
    LEGAL = "Legal"
    CUSTOM = "Custom"


class Orientation(str, Enum):
    """Page orientation options."""

    PORTRAIT = "portrait"
    LANDSCAPE = "landscape"
    AUTO = "auto"


class FitMode(str, Enum):
    """Content placement mode inside target page margins."""

    FIT = "fit"
    FILL = "fill"


class CompressionLevel(str, Enum):
    """PDF compression aggressiveness."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class SplitMode(str, Enum):
    """PDF split strategies."""

    RANGES = "ranges"
    EVERY_N = "every_n"
    ALL_PAGES = "all_pages"


class WatermarkType(str, Enum):
    """Supported watermark content types."""

    TEXT = "text"
    IMAGE = "image"


class WatermarkPosition(str, Enum):
    """Watermark anchor positions on a page."""

    CENTER = "center"
    TOP_LEFT = "top_left"
    TOP_RIGHT = "top_right"
    BOTTOM_LEFT = "bottom_left"
    BOTTOM_RIGHT = "bottom_right"
    TILE = "tile"


class PageNumberPosition(str, Enum):
    """Page numbering placement options."""

    BOTTOM_CENTER = "bottom_center"
    BOTTOM_RIGHT = "bottom_right"
    BOTTOM_LEFT = "bottom_left"
    TOP_CENTER = "top_center"
    TOP_RIGHT = "top_right"
    TOP_LEFT = "top_left"


class PdfPageInfo(BaseModel):
    """Metadata and optional thumbnail for a single PDF page."""

    page_number: int = Field(ge=1)
    width_pt: float
    height_pt: float
    rotation: int
    thumbnail_data_url: str | None = None


class PdfInspectResponse(BaseModel):
    """Response returned by POST /api/pdf/inspect."""

    filename: str
    file_size_bytes: int
    page_count: int
    is_encrypted: bool
    pages: list[PdfPageInfo]


class PdfExtractedPageText(BaseModel):
    """Extracted text for one page."""

    page_number: int = Field(ge=1)
    text: str


class PdfTextExtractResponse(BaseModel):
    """Response returned by POST /api/pdf/extract-text."""

    filename: str
    page_count: int
    total_chars: int
    pages: list[PdfExtractedPageText]
    full_text: str


class PdfMetadataResponse(BaseModel):
    """Response returned by POST /api/pdf/metadata/read."""

    filename: str
    page_count: int
    title: str = ""
    author: str = ""
    subject: str = ""
    keywords: str = ""
    creator: str = ""
    producer: str = ""


class MarkdownToPdfRequest(BaseModel):
    """JSON body for POST /api/pdf/markdown-to-pdf."""

    markdown_text: str = Field(..., min_length=1)
    document_title: str = ""
    paper_size: PaperSize = PaperSize.A4
    margin_mm: float = Field(default=18.0, ge=5.0, le=45.0)
    font_size: int = Field(default=10, ge=8, le=16)

