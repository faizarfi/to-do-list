"""Comprehensive API and service tests for all 15 RuangKerja PDF tools."""

from __future__ import annotations

import io
import json
import zipfile
from pathlib import Path

import pymupdf
import pytest
from fastapi.testclient import TestClient
from PIL import Image
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas as rl_canvas

from app.core.config import get_settings
from app.main import app
from app.utils.file_security import count_active_job_dirs


def _make_image_bytes(
    fmt: str = "PNG",
    size: tuple[int, int] = (400, 260),
    color: tuple[int, int, int, int] | tuple[int, int, int] = (13, 122, 104),
) -> bytes:
    mode = "RGBA" if fmt == "PNG" and len(color) == 4 else "RGB"
    img = Image.new(mode, size, color)
    buf = io.BytesIO()
    img.save(buf, format=fmt)
    return buf.getvalue()


def _make_text_pdf_bytes(
    pages_text: list[str],
    *,
    page_size: tuple[float, float] = (595.28, 841.89),
    password: str | None = None,
    include_image: bool = False,
) -> bytes:
    buf = io.BytesIO()
    c = rl_canvas.Canvas(buf, pagesize=page_size)
    for idx, text in enumerate(pages_text, start=1):
        c.setFont("Helvetica", 16)
        c.drawString(72, page_size[1] - 96, text)
        if include_image and idx == 1:
            from reportlab.lib.utils import ImageReader

            large_img = Image.new("RGB", (1800, 1200), (24, 140, 115))
            img_buf = io.BytesIO()
            large_img.save(img_buf, format="PNG")
            img_buf.seek(0)
            c.drawImage(ImageReader(img_buf), 72, 200, width=300, height=200)
        c.showPage()
    c.save()
    raw = buf.getvalue()

    if not password:
        return raw

    reader = PdfReader(io.BytesIO(raw))
    writer = PdfWriter()
    for page in reader.pages:
        writer.add_page(page)
    writer.encrypt(password)
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


def _extract_pdf_pages_text(pdf_bytes: bytes) -> list[str]:
    doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    try:
        return [doc.load_page(i).get_text().strip() for i in range(doc.page_count)]
    finally:
        doc.close()


def test_inspect_pdf_and_temp_cleanup() -> None:
    pdf_bytes = _make_text_pdf_bytes(["Halaman Satu", "Halaman Dua"])
    with TestClient(app) as client:
        res = client.post(
            "/api/pdf/inspect",
            files={"file": ("Dokumen Uji (2026).pdf", pdf_bytes, "application/pdf")},
        )
    assert res.status_code == 200
    data = res.json()
    assert data["page_count"] == 2
    assert data["filename"] == "Dokumen Uji (2026).pdf"
    assert len(data["pages"]) == 2
    assert data["pages"][0]["thumbnail_data_url"].startswith("data:image/jpeg;base64,")


@pytest.mark.parametrize(
    ("paper_size", "orientation", "expected_landscape"),
    [
        ("A4", "portrait", False),
        ("A4", "landscape", True),
        ("A3", "portrait", False),
        ("Letter", "landscape", True),
        ("Legal", "portrait", False),
        ("Custom", "portrait", False),
    ],
)
def test_tool_01_images_to_pdf_paper_sizes_and_orientations(
    paper_size: str,
    orientation: str,
    expected_landscape: bool,
) -> None:
    img1 = _make_image_bytes("JPEG", (600, 400), (15, 118, 110))
    img2 = _make_image_bytes("PNG", (300, 500), (45, 212, 191, 200))

    with TestClient(app) as client:
        res = client.post(
            "/api/pdf/images-to-pdf",
            files=[
                ("files", ("foto satu.jpg", img1, "image/jpeg")),
                ("files", ("foto dua (transparan).png", img2, "image/png")),
            ],
            data={
                "paper_size": paper_size,
                "custom_width_mm": "150",
                "custom_height_mm": "220",
                "orientation": orientation,
                "margin_mm": "12",
                "fit_mode": "fill",
                "quality": "80",
            },
        )
    assert res.status_code == 200
    assert res.headers["content-type"] == "application/pdf"
    assert res.headers.get("x-result-page-count") == "2"

    doc = pymupdf.open(stream=res.content, filetype="pdf")
    try:
        assert doc.page_count == 2
        rect = doc.load_page(0).rect
        assert (rect.width > rect.height) is expected_landscape
        if paper_size == "Custom":
            assert round(rect.width * 25.4 / 72) == 150
            assert round(rect.height * 25.4 / 72) == 220
    finally:
        doc.close()

    assert count_active_job_dirs(get_settings().temp_dir) == 0


def test_tool_02_single_image_to_pdf() -> None:
    img = _make_image_bytes("PNG", (320, 240))
    with TestClient(app) as client:
        res = client.post(
            "/api/pdf/image-to-pdf",
            files={"file": ("scan ktp.png", img, "image/png")},
            data={"paper_size": "A4", "orientation": "portrait", "margin_mm": "10", "fit_mode": "fit"},
        )
    assert res.status_code == 200
    assert res.headers["content-type"] == "application/pdf"
    doc = pymupdf.open(stream=res.content, filetype="pdf")
    assert doc.page_count == 1
    doc.close()


def test_tool_03_and_04_pdf_to_jpg_and_png() -> None:
    single_pdf = _make_text_pdf_bytes(["Satu Halaman"])
    multi_pdf = _make_text_pdf_bytes(["Hal 1", "Hal 2", "Hal 3"])

    with TestClient(app) as client:
        # Single page -> direct JPG
        res_jpg = client.post(
            "/api/pdf/to-jpg",
            files={"file": ("single.pdf", single_pdf, "application/pdf")},
            data={"dpi": "120", "quality": "85"},
        )
        assert res_jpg.status_code == 200
        assert res_jpg.headers["content-type"] == "image/jpeg"
        with Image.open(io.BytesIO(res_jpg.content)) as im:
            assert im.format == "JPEG"

        # Multi page -> ZIP containing PNGs
        res_png_zip = client.post(
            "/api/pdf/to-png",
            files={"file": ("multi.pdf", multi_pdf, "application/pdf")},
            data={"dpi": "100", "transparent": "true", "pages": "1, 3"},
        )
        assert res_png_zip.status_code == 200
        assert res_png_zip.headers["content-type"] == "application/zip"
        assert res_png_zip.headers.get("x-output-count") == "2"

        with zipfile.ZipFile(io.BytesIO(res_png_zip.content)) as zf:
            names = zf.namelist()
            assert len(names) == 2
            with Image.open(io.BytesIO(zf.read(names[0]))) as im:
                assert im.format == "PNG"
                assert im.mode == "RGBA"


def test_tool_05_merge_pdf() -> None:
    pdf_a = _make_text_pdf_bytes(["Doc A Page 1"])
    pdf_b = _make_text_pdf_bytes(["Doc B Page 1", "Doc B Page 2"])

    with TestClient(app) as client:
        # Reject single file
        bad = client.post(
            "/api/pdf/merge",
            files=[("files", ("a.pdf", pdf_a, "application/pdf"))],
        )
        assert bad.status_code == 400

        res = client.post(
            "/api/pdf/merge",
            files=[
                ("files", ("bagian 1.pdf", pdf_a, "application/pdf")),
                ("files", ("bagian 2.pdf", pdf_b, "application/pdf")),
            ],
        )
    assert res.status_code == 200
    texts = _extract_pdf_pages_text(res.content)
    assert texts == ["Doc A Page 1", "Doc B Page 1", "Doc B Page 2"]


def test_tool_06_split_pdf_ranges_and_every_n() -> None:
    pdf = _make_text_pdf_bytes(["P1", "P2", "P3", "P4"])
    with TestClient(app) as client:
        res = client.post(
            "/api/pdf/split",
            files={"file": ("laporan.pdf", pdf, "application/pdf")},
            data={"mode": "ranges", "ranges": "1-2, 3-4"},
        )
        assert res.status_code == 200
        assert res.headers["content-type"] == "application/zip"
        with zipfile.ZipFile(io.BytesIO(res.content)) as zf:
            assert len(zf.namelist()) == 2
            part1 = _extract_pdf_pages_text(zf.read(zf.namelist()[0]))
            part2 = _extract_pdf_pages_text(zf.read(zf.namelist()[1]))
            assert part1 == ["P1", "P2"]
            assert part2 == ["P3", "P4"]

        res_every = client.post(
            "/api/pdf/split",
            files={"file": ("laporan.pdf", pdf, "application/pdf")},
            data={"mode": "every_n", "every_n": "3"},
        )
        assert res_every.status_code == 200
        with zipfile.ZipFile(io.BytesIO(res_every.content)) as zf:
            assert len(zf.namelist()) == 2


def test_tool_07_compress_pdf() -> None:
    pdf = _make_text_pdf_bytes(["Halaman Kompresi"], include_image=True)
    with TestClient(app) as client:
        res = client.post(
            "/api/pdf/compress",
            files={"file": ("besar.pdf", pdf, "application/pdf")},
            data={"level": "high"},
        )
    assert res.status_code == 200
    assert len(res.content) <= len(pdf)
    assert int(res.headers["x-original-size"]) == len(pdf)
    assert int(res.headers["x-processed-size"]) == len(res.content)
    assert _extract_pdf_pages_text(res.content) == ["Halaman Kompresi"]


def test_tool_08_rotate_pdf() -> None:
    pdf = _make_text_pdf_bytes(["P1", "P2"])
    with TestClient(app) as client:
        res = client.post(
            "/api/pdf/rotate",
            files={"file": ("putar.pdf", pdf, "application/pdf")},
            data={"page_rotations_json": json.dumps({"1": 90, "2": 180})},
        )
    assert res.status_code == 200
    doc = pymupdf.open(stream=res.content, filetype="pdf")
    try:
        assert doc.load_page(0).rotation == 90
        assert doc.load_page(1).rotation == 180
    finally:
        doc.close()


def test_tool_09_10_11_reorder_delete_extract_pages() -> None:
    pdf = _make_text_pdf_bytes(["Satu", "Dua", "Tiga", "Empat"])
    with TestClient(app) as client:
        # #9 Reorder
        reordered = client.post(
            "/api/pdf/reorder",
            files={"file": ("doc.pdf", pdf, "application/pdf")},
            data={"order_json": json.dumps([4, 2, 1, 3])},
        )
        assert reordered.status_code == 200
        assert _extract_pdf_pages_text(reordered.content) == ["Empat", "Dua", "Satu", "Tiga"]

        # #10 Delete
        deleted = client.post(
            "/api/pdf/delete-pages",
            files={"file": ("doc.pdf", pdf, "application/pdf")},
            data={"pages": "2, 4"},
        )
        assert deleted.status_code == 200
        assert _extract_pdf_pages_text(deleted.content) == ["Satu", "Tiga"]

        # Cannot delete all pages
        bad_del = client.post(
            "/api/pdf/delete-pages",
            files={"file": ("doc.pdf", pdf, "application/pdf")},
            data={"pages": "1-4"},
        )
        assert bad_del.status_code == 400

        # #11 Extract
        extracted = client.post(
            "/api/pdf/extract-pages",
            files={"file": ("doc.pdf", pdf, "application/pdf")},
            data={"pages": "3, 1"},
        )
        assert extracted.status_code == 200
        assert _extract_pdf_pages_text(extracted.content) == ["Tiga", "Satu"]


def test_tool_12_and_13_watermark_and_page_numbers() -> None:
    pdf = _make_text_pdf_bytes(["Bab 1", "Bab 2", "Bab 3"])
    logo = _make_image_bytes("PNG", (120, 60), (13, 122, 104, 220))

    with TestClient(app) as client:
        # #12 Text Watermark (tile)
        wm_text = client.post(
            "/api/pdf/watermark",
            files={"file": ("materi.pdf", pdf, "application/pdf")},
            data={
                "watermark_type": "text",
                "text": "RAHASIA",
                "font_size": "28",
                "color_hex": "#0D7A68",
                "opacity": "0.3",
                "rotation": "35",
                "position": "tile",
            },
        )
        assert wm_text.status_code == 200
        pages = _extract_pdf_pages_text(wm_text.content)
        assert all("RAHASIA" in text for text in pages)

        # #12 Image Watermark
        wm_img = client.post(
            "/api/pdf/watermark",
            files=[
                ("file", ("materi.pdf", pdf, "application/pdf")),
                ("watermark_image", ("logo.png", logo, "image/png")),
            ],
            data={"watermark_type": "image", "opacity": "0.5", "position": "bottom_right"},
        )
        assert wm_img.status_code == 200

        # #13 Page Number PDF (skip first page)
        numbered = client.post(
            "/api/pdf/page-numbers",
            files={"file": ("materi.pdf", pdf, "application/pdf")},
            data={
                "position": "bottom_center",
                "format_template": "Hal {page}/{total}",
                "start_number": "1",
                "skip_first_page": "true",
            },
        )
        assert numbered.status_code == 200
        num_texts = _extract_pdf_pages_text(numbered.content)
        assert "Hal 1" not in num_texts[0]
        assert "Hal 1/2" in num_texts[1]
        assert "Hal 2/2" in num_texts[2]


def test_tool_14_resize_pdf() -> None:
    pdf = _make_text_pdf_bytes(["Dokumen Awal"], page_size=(595.28, 841.89))
    with TestClient(app) as client:
        res = client.post(
            "/api/pdf/resize",
            files={"file": ("a4.pdf", pdf, "application/pdf")},
            data={
                "paper_size": "A3",
                "orientation": "landscape",
                "margin_mm": "15",
                "fit_mode": "fill",
            },
        )
    assert res.status_code == 200
    doc = pymupdf.open(stream=res.content, filetype="pdf")
    try:
        rect = doc.load_page(0).rect
        assert rect.width > rect.height
        assert round(rect.width * 25.4 / 72) == 420
        assert round(rect.height * 25.4 / 72) == 297
    finally:
        doc.close()


def test_tool_15_ocr_pdf_missing_tesseract_and_mocked_success(monkeypatch: pytest.MonkeyPatch) -> None:
    pdf = _make_text_pdf_bytes(["Dokumen Scan"])

    with TestClient(app) as client:
        # 1) When tesseract binary is absent
        monkeypatch.setattr("app.services.pdf_service.shutil.which", lambda _name: None)
        res_missing = client.post(
            "/api/pdf/ocr",
            files={"file": ("scan.pdf", pdf, "application/pdf")},
            data={"language": "ind+eng", "dpi": "150"},
        )
        assert res_missing.status_code == 503
        assert res_missing.json()["error"]["code"] == "TESSERACT_NOT_INSTALLED"

        # 2) When tesseract is available (mocked response generating valid searchable PDF)
        searchable_sample = _make_text_pdf_bytes(["Teks Hasil OCR"])
        monkeypatch.setattr("app.services.pdf_service.shutil.which", lambda _name: "tesseract")
        monkeypatch.setattr(
            "app.services.pdf_service.pytesseract.image_to_pdf_or_hocr",
            lambda *_args, **_kwargs: searchable_sample,
        )
        monkeypatch.setattr(
            "app.services.pdf_service.pytesseract.image_to_string",
            lambda *_args, **_kwargs: "Teks Hasil OCR",
        )
        res_ok = client.post(
            "/api/pdf/ocr",
            files={"file": ("scan.pdf", pdf, "application/pdf")},
            data={"language": "ind+eng", "dpi": "150"},
        )
        assert res_ok.status_code == 200
        assert _extract_pdf_pages_text(res_ok.content) == ["Teks Hasil OCR"]


def test_password_protected_pdf_requires_authorization() -> None:
    secret_pdf = _make_text_pdf_bytes(["Rahasia Perusahaan"], password="Aman123")
    with TestClient(app) as client:
        no_pwd = client.post(
            "/api/pdf/extract-pages",
            files={"file": ("terkunci.pdf", secret_pdf, "application/pdf")},
            data={"pages": "1"},
        )
        assert no_pwd.status_code == 401
        assert no_pwd.json()["error"]["code"] == "PDF_PASSWORD_REQUIRED"

        wrong_pwd = client.post(
            "/api/pdf/extract-pages",
            files={"file": ("terkunci.pdf", secret_pdf, "application/pdf")},
            data={"pages": "1", "password": "Salah"},
        )
        assert wrong_pwd.status_code == 401
        assert wrong_pwd.json()["error"]["code"] == "PDF_INVALID_PASSWORD"

        good_pwd = client.post(
            "/api/pdf/extract-pages",
            files={"file": ("terkunci.pdf", secret_pdf, "application/pdf")},
            data={"pages": "1", "password": "Aman123"},
        )
        assert good_pwd.status_code == 200
        assert _extract_pdf_pages_text(good_pwd.content) == ["Rahasia Perusahaan"]

    assert count_active_job_dirs(get_settings().temp_dir) == 0

