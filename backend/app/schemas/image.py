"""Pydantic schemas and enums for Image Tools endpoints."""

from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class ImageTargetFormat(str, Enum):
    """Supported output image formats."""

    JPG = "jpg"
    PNG = "png"
    WEBP = "webp"
    TIFF = "tiff"


class BulkResizeMode(str, Enum):
    """Resize calculation mode for batch resizing."""

    DIMENSIONS = "dimensions"
    PERCENTAGE = "percentage"


class PassportPhotoSize(str, Enum):
    """Standard Indonesian ID / passport photo sizes in cm."""

    SIZE_2X3 = "2x3"
    SIZE_3X4 = "3x4"
    SIZE_4X6 = "4x6"


class RenameCaseMode(str, Enum):
    """Filename casing transformations for bulk rename."""

    ORIGINAL = "original"
    LOWERCASE = "lowercase"
    UPPERCASE = "uppercase"


class ImageWatermarkType(str, Enum):
    """Watermark source types."""

    TEXT = "text"
    IMAGE = "image"


class ImageWatermarkPosition(str, Enum):
    """Watermark anchor positions."""

    CENTER = "center"
    TOP_LEFT = "top_left"
    TOP_RIGHT = "top_right"
    BOTTOM_LEFT = "bottom_left"
    BOTTOM_RIGHT = "bottom_right"
    TILE = "tile"


class CollageLayout(str, Enum):
    """Collage arrangement modes."""

    GRID = "grid"
    HORIZONTAL = "horizontal"
    VERTICAL = "vertical"


class CollageFitMode(str, Enum):
    """How images fill collage cells."""

    COVER = "cover"
    CONTAIN = "contain"


class ImageMetadataItem(BaseModel):
    """Detailed technical metadata for one uploaded image."""

    filename: str
    file_size_bytes: int
    format: str
    mime_type: str
    width: int = Field(ge=1)
    height: int = Field(ge=1)
    megapixels: float
    aspect_ratio: str
    color_mode: str
    has_alpha: bool
    dpi_x: float | None = None
    dpi_y: float | None = None
    exif: dict[str, Any] = Field(default_factory=dict)


class ImageInfoResponse(BaseModel):
    """Response returned by POST /api/images/info."""

    count: int
    items: list[ImageMetadataItem]


class ImageFilterPreset(str, Enum):
    """Built-in color/tone effects for Tool #56."""

    NONE = "none"
    GRAYSCALE = "grayscale"
    SEPIA = "sepia"
    INVERT = "invert"


class SocialMediaPreset(str, Enum):
    """Target social media canvas presets for Tool #59."""

    IG_SQUARE = "ig_square"
    IG_PORTRAIT = "ig_portrait"
    IG_STORY = "ig_story"
    YT_THUMB = "yt_thumb"
    LINKEDIN_BANNER = "linkedin_banner"
    X_HEADER = "x_header"


class PaletteColorItem(BaseModel):
    """Extracted dominant color entry."""

    hex: str
    r: int = Field(ge=0, le=255)
    g: int = Field(ge=0, le=255)
    b: int = Field(ge=0, le=255)
    percent: float


class ColorPaletteResponse(BaseModel):
    """Response returned by POST /api/images/palette."""

    filename: str
    colors: list[PaletteColorItem]

