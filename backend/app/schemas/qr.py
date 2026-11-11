"""Pydantic schemas and enums for QR Code Generator endpoints."""

from __future__ import annotations

from enum import Enum
from pydantic import BaseModel, Field


class QrContentType(str, Enum):
    """Supported QR payload templates."""

    TEXT = "text"
    URL = "url"
    PHONE = "phone"
    EMAIL = "email"
    WIFI = "wifi"


class QrOutputFormat(str, Enum):
    """Supported QR export formats."""

    PNG = "png"
    SVG = "svg"


class WifiEncryption(str, Enum):
    """Wi-Fi QR encryption standards."""

    WPA = "WPA"
    WEP = "WEP"
    NOPASS = "nopass"


class QrGenerateRequest(BaseModel):
    """Request payload for QR generation."""

    content_type: QrContentType = QrContentType.TEXT
    text: str = ""
    url: str = ""
    phone: str = ""
    email_to: str = ""
    email_subject: str = ""
    email_body: str = ""
    wifi_ssid: str = ""
    wifi_password: str = ""
    wifi_encryption: WifiEncryption = WifiEncryption.WPA
    wifi_hidden: bool = False
    size_px: int = Field(default=400, ge=128, le=2048)
    border: int = Field(default=4, ge=1, le=10)
    fill_color: str = "#0F172A"
    back_color: str = "#FFFFFF"
    output_format: QrOutputFormat = QrOutputFormat.PNG

