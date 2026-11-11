"""Unit & API tests for QR Code Generator endpoint (Tool #50)."""

from __future__ import annotations

import base64
import io

from fastapi.testclient import TestClient
from PIL import Image

from app.core.config import get_settings
from app.main import app
from app.utils.file_security import count_active_job_dirs


def test_qr_generate_png_and_svg_for_all_types() -> None:
    with TestClient(app) as client:
        # 1) URL PNG with custom color and size
        res_png = client.post(
            "/api/qr/generate",
            json={
                "content_type": "url",
                "url": "ruangkerja.local",
                "size_px": 320,
                "fill_color": "#0D7A68",
                "back_color": "#FFFFFF",
                "output_format": "png",
            },
        )
        assert res_png.status_code == 200
        assert res_png.headers["content-type"] == "image/png"
        decoded = base64.b64decode(res_png.headers["x-qr-payload-b64"]).decode("utf-8")
        assert decoded == "https://ruangkerja.local"
        with Image.open(io.BytesIO(res_png.content)) as im:
            assert im.size == (320, 320)

        # 2) Wi-Fi SVG
        res_svg = client.post(
            "/api/qr/generate",
            json={
                "content_type": "wifi",
                "wifi_ssid": "RuangKerja_Office",
                "wifi_password": "Sandi;123",
                "wifi_encryption": "WPA",
                "size_px": 256,
                "fill_color": "#0F172A",
                "back_color": "#FFFFFF",
                "output_format": "svg",
            },
        )
        assert res_svg.status_code == 200
        assert res_svg.headers["content-type"] == "image/svg+xml"
        svg_text = res_svg.content.decode("utf-8")
        assert "<svg" in svg_text
        assert 'fill="#0f172a"' in svg_text.lower()
        wifi_payload = base64.b64decode(res_svg.headers["x-qr-payload-b64"]).decode("utf-8")
        assert wifi_payload.startswith("WIFI:T:WPA;S:RuangKerja_Office;P:Sandi\\;123;")

        # 3) Phone & Email payloads
        res_phone = client.post(
            "/api/qr/generate",
            json={"content_type": "phone", "phone": "+62 812-3456-7890", "output_format": "png"},
        )
        assert res_phone.status_code == 200
        assert base64.b64decode(res_phone.headers["x-qr-payload-b64"]).decode("utf-8") == "tel:+62812-3456-7890"

        res_email = client.post(
            "/api/qr/generate",
            json={
                "content_type": "email",
                "email_to": "tim@ruangkerja.local",
                "email_subject": "Halo",
                "output_format": "png",
            },
        )
        assert res_email.status_code == 200
        email_payload = base64.b64decode(res_email.headers["x-qr-payload-b64"]).decode("utf-8")
        assert email_payload == "mailto:tim@ruangkerja.local?subject=Halo"

        # 4) Empty text and invalid hex color rejected cleanly
        bad = client.post(
            "/api/qr/generate",
            json={"content_type": "text", "text": "   "},
        )
        assert bad.status_code == 400
        assert bad.json()["error"]["code"] == "EMPTY_QR_TEXT"

        bad_color = client.post(
            "/api/qr/generate",
            json={"content_type": "text", "text": "test", "fill_color": "not-a-hex"},
        )
        assert bad_color.status_code == 400

    assert count_active_job_dirs(get_settings().temp_dir) == 0
