"""Comprehensive API and service tests for all 12 RuangKerja Image Tools."""

from __future__ import annotations

import io
import zipfile

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.core.config import get_settings
from app.main import app
from app.utils.file_security import count_active_job_dirs


def _make_image(
    fmt: str = "PNG",
    size: tuple[int, int] = (400, 300),
    color: tuple[int, ...] = (13, 122, 104, 255),
) -> bytes:
    mode = "RGBA" if fmt == "PNG" and len(color) == 4 else "RGB"
    img = Image.new(mode, size, color[:3] if mode == "RGB" else color)
    buf = io.BytesIO()
    img.save(buf, format=fmt)
    return buf.getvalue()


def test_tool_16_image_converter_single_and_batch() -> None:
    png_alpha = _make_image("PNG", (300, 200), (13, 122, 104, 180))
    webp_img = _make_image("WEBP", (240, 180), (45, 212, 191))

    with TestClient(app) as client:
        # Single PNG -> JPG (transparent flattened cleanly onto white)
        res_single = client.post(
            "/api/images/convert",
            files=[("files", ("logo transparan.png", png_alpha, "image/png"))],
            data={"target_format": "jpg", "quality": "90"},
        )
        assert res_single.status_code == 200
        assert res_single.headers["content-type"] == "image/jpeg"
        with Image.open(io.BytesIO(res_single.content)) as im:
            assert im.format == "JPEG"
            assert im.size == (300, 200)

        # Multi-file -> ZIP of WEBP
        res_zip = client.post(
            "/api/images/convert",
            files=[
                ("files", ("a.png", png_alpha, "image/png")),
                ("files", ("b.webp", webp_img, "image/webp")),
            ],
            data={"target_format": "tiff"},
        )
        assert res_zip.status_code == 200
        assert res_zip.headers["content-type"] == "application/zip"
        with zipfile.ZipFile(io.BytesIO(res_zip.content)) as zf:
            assert len(zf.namelist()) == 2
            with Image.open(io.BytesIO(zf.read(zf.namelist()[0]))) as im:
                assert im.format == "TIFF"


def test_tool_17_image_compressor() -> None:
    # Noisy gradient-like photo compresses significantly at lower quality
    img = Image.effect_noise((600, 600), 60).convert("RGB")
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=98)
    raw = buf.getvalue()

    with TestClient(app) as client:
        res = client.post(
            "/api/images/compress",
            files=[("files", ("foto besar.jpg", raw, "image/jpeg"))],
            data={"quality": "45", "max_dimension": "400"},
        )
    assert res.status_code == 200
    assert int(res.headers["x-processed-size"]) < len(raw)
    with Image.open(io.BytesIO(res.content)) as im:
        assert max(im.size) == 400


def test_tool_18_and_19_single_and_bulk_resize() -> None:
    img1 = _make_image("PNG", (800, 400))
    img2 = _make_image("JPEG", (600, 600), (20, 120, 100))

    with TestClient(app) as client:
        # #18 Single resize keeping aspect ratio
        res1 = client.post(
            "/api/images/resize",
            files={"file": ("banner.png", img1, "image/png")},
            data={"width": "400", "keep_aspect_ratio": "true"},
        )
        assert res1.status_code == 200
        with Image.open(io.BytesIO(res1.content)) as im:
            assert im.size == (400, 200)

        # #19 Bulk resize by percentage
        res_bulk = client.post(
            "/api/images/bulk-resize",
            files=[
                ("files", ("one.png", img1, "image/png")),
                ("files", ("two.jpg", img2, "image/jpeg")),
            ],
            data={"mode": "percentage", "scale_percent": "50"},
        )
        assert res_bulk.status_code == 200
        with zipfile.ZipFile(io.BytesIO(res_bulk.content)) as zf:
            names = sorted(zf.namelist())
            assert len(names) == 2
            with Image.open(io.BytesIO(zf.read(names[0]))) as im1:
                assert im1.size == (400, 200)
            with Image.open(io.BytesIO(zf.read(names[1]))) as im2:
                assert im2.size == (300, 300)


def test_tool_20_crop_image_and_bounds_check() -> None:
    img = _make_image("PNG", (500, 400))
    with TestClient(app) as client:
        res_ratio = client.post(
            "/api/images/crop",
            files={"file": ("foto.png", img, "image/png")},
            data={"aspect_ratio": "1:1"},
        )
        assert res_ratio.status_code == 200
        with Image.open(io.BytesIO(res_ratio.content)) as im:
            assert im.size == (400, 400)

        res_box = client.post(
            "/api/images/crop",
            files={"file": ("foto.png", img, "image/png")},
            data={"crop_x": "50", "crop_y": "40", "crop_width": "200", "crop_height": "150"},
        )
        assert res_box.status_code == 200
        with Image.open(io.BytesIO(res_box.content)) as im:
            assert im.size == (200, 150)

        bad_box = client.post(
            "/api/images/crop",
            files={"file": ("foto.png", img, "image/png")},
            data={"crop_x": "400", "crop_y": "10", "crop_width": "200", "crop_height": "100"},
        )
        assert bad_box.status_code == 400
        assert bad_box.json()["error"]["code"] == "CROP_OUT_OF_BOUNDS"


def test_tool_21_rotate_and_flip() -> None:
    img = _make_image("PNG", (300, 150))
    with TestClient(app) as client:
        res = client.post(
            "/api/images/rotate",
            files=[("files", ("rect.png", img, "image/png"))],
            data={"angle": "90", "flip_horizontal": "true"},
        )
    assert res.status_code == 200
    with Image.open(io.BytesIO(res.content)) as im:
        assert im.size == (150, 300)


def test_tool_22_dpi_changer() -> None:
    img = _make_image("JPEG", (200, 200), (15, 118, 110))
    with TestClient(app) as client:
        res = client.post(
            "/api/images/dpi",
            files=[("files", ("cetak.jpg", img, "image/jpeg"))],
            data={"dpi_x": "300", "dpi_y": "300"},
        )
    assert res.status_code == 200
    with Image.open(io.BytesIO(res.content)) as im:
        assert im.info.get("dpi") == (300, 300)


@pytest.mark.parametrize(
    ("size_key", "expected_px"),
    [
        ("2x3", (236, 354)),
        ("3x4", (354, 472)),
        ("4x6", (472, 709)),
    ],
)
def test_tool_23_passport_photo_sizes_and_sheet(
    size_key: str, expected_px: tuple[int, int]
) -> None:
    img = _make_image("PNG", (600, 800), (20, 120, 100, 255))
    with TestClient(app) as client:
        res = client.post(
            "/api/images/passport-photo",
            files={"file": ("wajah.png", img, "image/png")},
            data={"photo_size": size_key, "dpi": "300", "print_sheet": "false"},
        )
    assert res.status_code == 200
    with Image.open(io.BytesIO(res.content)) as im:
        assert im.size == expected_px

    with TestClient(app) as client:
        res_sheet = client.post(
            "/api/images/passport-photo",
            files={"file": ("wajah.png", img, "image/png")},
            data={"photo_size": "3x4", "dpi": "300", "print_sheet": "true"},
        )
    assert res_sheet.status_code == 200
    with Image.open(io.BytesIO(res_sheet.content)) as im:
        assert im.width > 1700 and im.height > 1100


def test_tool_24_bulk_rename() -> None:
    img1 = _make_image("PNG", (100, 100))
    img2 = _make_image("JPEG", (100, 100), (10, 80, 70))
    with TestClient(app) as client:
        res = client.post(
            "/api/images/bulk-rename",
            files=[
                ("files", ("IMG 0091.png", img1, "image/png")),
                ("files", ("Foto Produk.jpg", img2, "image/jpeg")),
            ],
            data={"prefix": "katalog-", "suffix": "-web", "start_number": "1", "zero_pad": "3"},
        )
    assert res.status_code == 200
    with zipfile.ZipFile(io.BytesIO(res.content)) as zf:
        assert sorted(zf.namelist()) == ["katalog-001-web.png", "katalog-002-web.jpg"]


def test_tool_25_and_26_image_watermark_and_collage() -> None:
    img1 = _make_image("PNG", (400, 300), (15, 118, 110, 255))
    img2 = _make_image("JPEG", (300, 300), (240, 240, 240))
    logo = _make_image("PNG", (80, 40), (255, 255, 255, 220))

    with TestClient(app) as client:
        # #25 Text watermark
        wm_text = client.post(
            "/api/images/watermark",
            files=[("files", ("foto.png", img1, "image/png"))],
            data={"watermark_type": "text", "text": "RuangKerja", "position": "tile"},
        )
        assert wm_text.status_code == 200

        # #25 Image logo watermark
        wm_img = client.post(
            "/api/images/watermark",
            files=[
                ("files", ("foto.png", img1, "image/png")),
                ("watermark_image", ("logo.png", logo, "image/png")),
            ],
            data={"watermark_type": "image", "opacity": "0.5"},
        )
        assert wm_img.status_code == 200

        # #26 Collage (2 columns, 2 images)
        collage = client.post(
            "/api/images/collage",
            files=[
                ("files", ("a.png", img1, "image/png")),
                ("files", ("b.jpg", img2, "image/jpeg")),
            ],
            data={"layout": "grid", "columns": "2", "cell_size_px": "300", "gap_px": "10", "padding_px": "20"},
        )
        assert collage.status_code == 200
        with Image.open(io.BytesIO(collage.content)) as im:
            assert im.size == (650, 340)


def test_tool_27_image_information_and_temp_cleanup() -> None:
    img = _make_image("PNG", (1280, 720), (13, 122, 104, 200))
    with TestClient(app) as client:
        res = client.post(
            "/api/images/info",
            files=[("files", ("wallpaper 16_9.png", img, "image/png"))],
        )
    assert res.status_code == 200
    data = res.json()
    assert data["count"] == 1
    item = data["items"][0]
    assert item["width"] == 1280
    assert item["height"] == 720
    assert item["aspect_ratio"] == "16:9"
    assert item["has_alpha"] is True
    assert count_active_job_dirs(get_settings().temp_dir) == 0

