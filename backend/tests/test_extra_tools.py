"""Comprehensive API tests for all new backend tools (#51-#66, #74, #75, #89, #92)."""

from __future__ import annotations

import hashlib
import io
import json
import zipfile

import openpyxl
import pymupdf
from fastapi.testclient import TestClient
from PIL import Image

from app.core.config import get_settings
from app.main import app
from app.utils.file_security import count_active_job_dirs


def _make_sample_pdf(text: str = "Halo RuangKerja 100") -> bytes:
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text((72, 72), text)
    data = doc.tobytes()
    doc.close()
    return data


def _make_sample_png(color: tuple[int, int, int] = (13, 122, 104)) -> bytes:
    im = Image.new("RGB", (180, 120), color)
    buf = io.BytesIO()
    im.save(buf, format="PNG")
    return buf.getvalue()


def _make_sample_xlsx() -> bytes:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Penjualan"
    ws.append(["Nama", "Kota", "Total"])
    ws.append(["Budi", "Jakarta", 100])
    ws.append(["Ani", "Bandung", 250])
    buf = io.BytesIO()
    wb.save(buf)
    wb.close()
    return buf.getvalue()


def test_pdf_extra_tools_51_to_55() -> None:
    pdf_data = _make_sample_pdf("Rahasia Proyek RuangKerja")

    with TestClient(app) as client:
        # #51 Extract Text
        ext = client.post(
            "/api/pdf/extract-text",
            files={"file": ("doc.pdf", pdf_data, "application/pdf")},
        )
        assert ext.status_code == 200
        assert "Rahasia Proyek RuangKerja" in ext.json()["full_text"]

        # #52 Protect PDF
        prot = client.post(
            "/api/pdf/protect",
            files={"file": ("doc.pdf", pdf_data, "application/pdf")},
            data={"user_password": "rahasia123"},
        )
        assert prot.status_code == 200
        protected_bytes = prot.content
        check_enc = pymupdf.open(stream=protected_bytes, filetype="pdf")
        assert bool(check_enc.needs_pass) is True
        check_enc.close()

        # #53 Unlock PDF requires authorized password
        wrong_unlock = client.post(
            "/api/pdf/unlock",
            files={"file": ("doc.pdf", protected_bytes, "application/pdf")},
            data={"password": "salah"},
        )
        assert wrong_unlock.status_code == 401

        good_unlock = client.post(
            "/api/pdf/unlock",
            files={"file": ("doc.pdf", protected_bytes, "application/pdf")},
            data={"password": "rahasia123"},
        )
        assert good_unlock.status_code == 200
        check_open = pymupdf.open(stream=good_unlock.content, filetype="pdf")
        assert bool(check_open.needs_pass) is False
        check_open.close()

        # #54 Metadata update & read
        upd = client.post(
            "/api/pdf/metadata/update",
            files={"file": ("doc.pdf", pdf_data, "application/pdf")},
            data={"title": "Laporan Resmi", "author": "Tim RuangKerja", "keywords": "pdf,office"},
        )
        assert upd.status_code == 200
        read_meta = client.post(
            "/api/pdf/metadata/read",
            files={"file": ("updated.pdf", upd.content, "application/pdf")},
        )
        assert read_meta.status_code == 200
        assert read_meta.json()["title"] == "Laporan Resmi"
        assert read_meta.json()["author"] == "Tim RuangKerja"

        # #55 Markdown to PDF
        md_res = client.post(
            "/api/pdf/markdown-to-pdf",
            json={
                "markdown_text": "# Judul Dokumen\n\nParagraf **penting** dan `kode`.\n\n- Item satu\n- Item dua",
                "document_title": "Catatan Kerja",
            },
        )
        assert md_res.status_code == 200
        md_doc = pymupdf.open(stream=md_res.content, filetype="pdf")
        assert "Judul Dokumen" in md_doc.load_page(0).get_text()
        md_doc.close()

    assert count_active_job_dirs(get_settings().temp_dir) == 0


def test_image_extra_tools_56_to_61() -> None:
    png_data = _make_sample_png()

    with TestClient(app) as client:
        # #56 Adjust filters
        adj = client.post(
            "/api/images/adjust",
            files=[("files", ("foto.png", png_data, "image/png"))],
            data={"brightness": "1.2", "effect": "grayscale"},
        )
        assert adj.status_code == 200

        # #57 Frame / rounded corners
        frm = client.post(
            "/api/images/frame",
            files=[("files", ("foto.png", png_data, "image/png"))],
            data={"corner_radius_pct": "15", "border_px": "10"},
        )
        assert frm.status_code == 200
        with Image.open(io.BytesIO(frm.content)) as im:
            assert im.size == (200, 140)

        # #58 Favicon Pack
        fav = client.post(
            "/api/images/favicon-pack",
            files={"file": ("logo.png", png_data, "image/png")},
            data={"app_name": "RuangKerja"},
        )
        assert fav.status_code == 200
        with zipfile.ZipFile(io.BytesIO(fav.content)) as zf:
            names = set(zf.namelist())
            assert {"favicon.ico", "apple-touch-icon.png", "site.webmanifest"}.issubset(names)

        # #59 Social Resize
        soc = client.post(
            "/api/images/social-resize",
            files=[("files", ("foto.png", png_data, "image/png"))],
            data={"preset": "ig_square"},
        )
        assert soc.status_code == 200
        with Image.open(io.BytesIO(soc.content)) as im:
            assert im.size == (1080, 1080)

        # #60 Palette Extractor
        pal = client.post(
            "/api/images/palette",
            files={"file": ("foto.png", png_data, "image/png")},
            data={"color_count": "4"},
        )
        assert pal.status_code == 200
        assert pal.json()["colors"][0]["hex"] == "#0D7A68"

        # #61 Strip EXIF
        jpg_buf = io.BytesIO()
        im_exif = Image.new("RGB", (60, 60), (200, 100, 50))
        exif = im_exif.getexif()
        exif[0x010F] = "SecretCameraBrand"
        im_exif.save(jpg_buf, format="JPEG", exif=exif.tobytes())
        stripped = client.post(
            "/api/images/strip-exif",
            files=[("files", ("cam.jpg", jpg_buf.getvalue(), "image/jpeg"))],
        )
        assert stripped.status_code == 200
        with Image.open(io.BytesIO(stripped.content)) as clean_im:
            assert len(clean_im.getexif()) == 0

    assert count_active_job_dirs(get_settings().temp_dir) == 0


def test_spreadsheet_and_utility_extra_tools() -> None:
    xlsx_data = _make_sample_xlsx()

    with TestClient(app) as client:
        # #62 JSON to Excel
        j2x = client.post(
            "/api/spreadsheets/json-to-excel",
            data={"json_text": json.dumps([{"nama": "Dina", "profil": {"kota": "Solo"}, "kode": "007"}])},
        )
        assert j2x.status_code == 200
        wb = openpyxl.load_workbook(io.BytesIO(j2x.content))
        assert wb.active["B2"].value == "Solo"
        wb.close()

        # #63 To JSON
        x2j = client.post(
            "/api/spreadsheets/to-json",
            files={"file": ("sales.xlsx", xlsx_data, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        )
        assert x2j.status_code == 200
        parsed_records = json.loads(x2j.json()["json_text"])
        assert parsed_records[0]["Total"] == 100

        # #64 Find & Replace
        fr = client.post(
            "/api/spreadsheets/find-replace",
            files={"file": ("sales.xlsx", xlsx_data, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
            data={"find_text": "Jakarta", "replace_text": "DKI Jakarta"},
        )
        assert fr.status_code == 200
        assert fr.headers["x-removed-count"] == "1"

        # #65 Column Transform (Merge)
        ct = client.post(
            "/api/spreadsheets/column-transform",
            files={"file": ("sales.xlsx", xlsx_data, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
            data={"mode": "merge", "source_columns": "Nama, Kota", "separator": " - ", "new_column_name": "Label"},
        )
        assert ct.status_code == 200
        wb_ct = openpyxl.load_workbook(io.BytesIO(ct.content))
        assert wb_ct.active["D2"].value == "Budi - Jakarta"
        wb_ct.close()

        # #66 Summary stats
        sm = client.post(
            "/api/spreadsheets/summary",
            files={"file": ("sales.xlsx", xlsx_data, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        )
        assert sm.status_code == 200
        total_col = next(c for c in sm.json()["columns"] if c["column_name"] == "Total")
        assert total_col["sum_value"] == 350.0
        assert total_col["mean_value"] == 175.0

        # #74 Invoice PDF
        inv = client.post(
            "/api/utility/invoice-pdf",
            json={
                "invoice_number": "INV-2026-001",
                "issue_date": "2026-11-11",
                "sender_name": "Studio RuangKerja",
                "client_name": "PT Maju Bersama",
                "currency": "IDR",
                "items": [{"description": "Jasa Desain UI", "quantity": 2, "unit_price": 1500000}],
                "discount_percent": 0,
                "tax_percent": 11,
            },
        )
        assert inv.status_code == 200
        inv_doc = pymupdf.open(stream=inv.content, filetype="pdf")
        assert "INV-2026-001" in inv_doc.load_page(0).get_text()
        inv_doc.close()

        # #75 Barcode SVG & EAN-13 PNG
        bc_svg = client.post(
            "/api/utility/barcode",
            json={"value": "RK-2026", "barcode_type": "code128", "output_format": "svg"},
        )
        assert bc_svg.status_code == 200
        assert "<svg" in bc_svg.content.decode("utf-8")

        bc_ean = client.post(
            "/api/utility/barcode",
            json={"value": "899123456789", "barcode_type": "ean13", "output_format": "png"},
        )
        assert bc_ean.status_code == 200
        assert bc_ean.headers["content-type"] == "image/png"

        # #89 YAML <-> JSON
        y_res = client.post(
            "/api/utility/yaml-json",
            json={"content": '{"app": "RuangKerja", "tools": 100}', "direction": "json_to_yaml"},
        )
        assert y_res.status_code == 200
        assert "tools: 100" in y_res.json()["output"]

        # #92 File Hash
        payload_bytes = b"RuangKerja-Checksum-Test"
        expected_sha256 = hashlib.sha256(payload_bytes).hexdigest()
        hf = client.post(
            "/api/utility/hash-file",
            files={"file": ("sample.bin", payload_bytes, "application/octet-stream")},
            data={"expected_hash": expected_sha256},
        )
        assert hf.status_code == 200
        assert hf.json()["sha256"] == expected_sha256
        assert hf.json()["expected_match"] is True

    assert count_active_job_dirs(get_settings().temp_dir) == 0
