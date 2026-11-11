"""QR Code generation service supporting PNG and SVG formats (Tool #50)."""

from __future__ import annotations

import urllib.parse
from pathlib import Path

import qrcode
import qrcode.image.svg
from PIL import Image

from app.core.exceptions import AppError
from app.schemas.qr import QrContentType, QrGenerateRequest, QrOutputFormat, WifiEncryption
from app.utils.response_helpers import parse_hex_color_rgb_int


def _escape_wifi_field(val: str) -> str:
    return val.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace(":", "\\:")


def build_qr_payload(req: QrGenerateRequest) -> str:
    """Build standardized QR content string from structured template inputs."""
    if req.content_type == QrContentType.TEXT:
        text = req.text.strip()
        if not text:
            raise AppError("Masukkan teks untuk dibuat menjadi QR Code.", code="EMPTY_QR_TEXT")
        return text

    if req.content_type == QrContentType.URL:
        url = req.url.strip()
        if not url:
            raise AppError("Masukkan URL tujuan.", code="EMPTY_QR_URL")
        if not (url.startswith("http://") or url.startswith("https://")):
            url = f"https://{url}"
        return url

    if req.content_type == QrContentType.PHONE:
        phone = req.phone.strip().replace(" ", "")
        if not phone:
            raise AppError("Masukkan nomor telepon.", code="EMPTY_QR_PHONE")
        return f"tel:{phone}"

    if req.content_type == QrContentType.EMAIL:
        recipient = req.email_to.strip()
        if not recipient:
            raise AppError("Masukkan alamat email penerima.", code="EMPTY_QR_EMAIL")
        params: dict[str, str] = {}
        if req.email_subject.strip():
            params["subject"] = req.email_subject.strip()
        if req.email_body.strip():
            params["body"] = req.email_body.strip()
        query = urllib.parse.urlencode(params)
        return f"mailto:{recipient}?{query}" if query else f"mailto:{recipient}"

    # WIFI
    ssid = req.wifi_ssid.strip()
    if not ssid:
        raise AppError("Masukkan nama jaringan Wi-Fi (SSID).", code="EMPTY_WIFI_SSID")
    enc = req.wifi_encryption.value
    pwd = "" if req.wifi_encryption == WifiEncryption.NOPASS else _escape_wifi_field(req.wifi_password)
    hidden_flag = "true" if req.wifi_hidden else "false"
    return f"WIFI:T:{enc};S:{_escape_wifi_field(ssid)};P:{pwd};H:{hidden_flag};;"


def generate_qr_file(job_dir: Path, req: QrGenerateRequest) -> tuple[Path, str, str, str]:
    """Generate a PNG or SVG QR code inside job_dir."""
    payload = build_qr_payload(req)
    fill_rgb = parse_hex_color_rgb_int(req.fill_color)
    back_rgb = parse_hex_color_rgb_int(req.back_color)

    if req.output_format == QrOutputFormat.SVG:
        qr = qrcode.QRCode(
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=10,
            border=req.border,
        )
        qr.add_data(payload)
        qr.make(fit=True)
        svg_img = qr.make_image(image_factory=qrcode.image.svg.SvgPathImage)
        raw_svg = svg_img.to_string(encoding="unicode")

        # Apply user foreground/background colors and explicit target size cleanly
        fill_hex = f"#{fill_rgb[0]:02x}{fill_rgb[1]:02x}{fill_rgb[2]:02x}"
        back_hex = f"#{back_rgb[0]:02x}{back_rgb[1]:02x}{back_rgb[2]:02x}"
        styled_svg = raw_svg.replace(
            'fill="#000000"', f'fill="{fill_hex}"'
        ).replace(
            "<path ",
            f'<rect width="100%" height="100%" fill="{back_hex}" /><path ',
            1,
        )
        styled_svg = styled_svg.replace(
            "<svg ",
            f'<svg width="{req.size_px}" height="{req.size_px}" ',
            1,
        )
        out_path = job_dir / "qrcode-ruangkerja.svg"
        out_path.write_text(styled_svg, encoding="utf-8")
        return out_path, "image/svg+xml", out_path.name, payload

    qr = qrcode.QRCode(
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=max(4, req.size_px // 30),
        border=req.border,
    )
    qr.add_data(payload)
    qr.make(fit=True)
    pil_qr = qr.make_image(fill_color=fill_rgb, back_color=back_rgb).convert("RGB")
    resized = pil_qr.resize((req.size_px, req.size_px), Image.Resampling.NEAREST)
    out_path = job_dir / "qrcode-ruangkerja.png"
    resized.save(out_path, format="PNG", optimize=True)
    return out_path, "image/png", out_path.name, payload

