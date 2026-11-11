"""Pydantic schemas for Utility, Business PDF, Barcode, YAML, and Checksum endpoints."""

from __future__ import annotations

from enum import Enum
from pydantic import BaseModel, Field


class InvoiceItemInput(BaseModel):
    """Single invoice line item."""

    description: str = Field(..., min_length=1, max_length=200)
    quantity: float = Field(default=1.0, gt=0)
    unit_price: float = Field(default=0.0, ge=0)


class InvoicePdfRequest(BaseModel):
    """Request payload for Tool #74: Invoice & Receipt PDF Generator."""

    document_type: str = Field(default="INVOICE", max_length=40)
    invoice_number: str = Field(..., min_length=1, max_length=60)
    issue_date: str = Field(..., min_length=4, max_length=30)
    due_date: str = ""
    sender_name: str = Field(..., min_length=1, max_length=120)
    sender_details: str = ""
    client_name: str = Field(..., min_length=1, max_length=120)
    client_details: str = ""
    currency: str = Field(default="IDR", max_length=10)
    items: list[InvoiceItemInput] = Field(..., min_length=1, max_length=100)
    discount_percent: float = Field(default=0.0, ge=0, le=100)
    tax_percent: float = Field(default=11.0, ge=0, le=100)
    notes: str = ""
    accent_color: str = "#0D7A68"


class BarcodeType(str, Enum):
    """Supported standard barcode symbologies."""

    CODE128 = "code128"
    EAN13 = "ean13"
    EAN8 = "ean8"


class BarcodeOutputFormat(str, Enum):
    """Supported barcode export formats."""

    PNG = "png"
    SVG = "svg"


class BarcodeGenerateRequest(BaseModel):
    """Request payload for Tool #75: Barcode Generator."""

    value: str = Field(..., min_length=1, max_length=80)
    barcode_type: BarcodeType = BarcodeType.CODE128
    output_format: BarcodeOutputFormat = BarcodeOutputFormat.SVG
    scale: int = Field(default=3, ge=1, le=6)
    height_px: int = Field(default=120, ge=48, le=320)
    show_text: bool = True
    fill_color: str = "#0F172A"
    back_color: str = "#FFFFFF"


class YamlJsonDirection(str, Enum):
    """Conversion direction for Tool #89."""

    JSON_TO_YAML = "json_to_yaml"
    YAML_TO_JSON = "yaml_to_json"


class YamlJsonRequest(BaseModel):
    """Request payload for Tool #89: JSON <-> YAML Converter."""

    content: str = Field(..., min_length=1)
    direction: YamlJsonDirection = YamlJsonDirection.JSON_TO_YAML
    indent: int = Field(default=2, ge=2, le=8)


class YamlJsonResponse(BaseModel):
    """Response returned by POST /api/utility/yaml-json."""

    output: str
    direction: YamlJsonDirection


class FileHashResponse(BaseModel):
    """Response returned by POST /api/utility/hash-file."""

    filename: str
    file_size_bytes: int
    md5: str
    sha1: str
    sha256: str
    sha512: str
    expected_match: bool | None = None

