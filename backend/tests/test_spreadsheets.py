"""Comprehensive API and service tests for all 9 Excel & Data Tools (#28-#36)."""

from __future__ import annotations

import datetime as dt
import io
import zipfile

import openpyxl
import pymupdf
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import app
from app.utils.file_security import count_active_job_dirs


def _make_xlsx_bytes(sheets: dict[str, list[list[object]]]) -> bytes:
    wb = openpyxl.Workbook()
    wb.remove(wb.active)
    for title, rows in sheets.items():
        ws = wb.create_sheet(title=title)
        for row in rows:
            ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    wb.close()
    return buf.getvalue()


def test_tool_28_excel_viewer_preserves_dates_ints_and_leading_zeros() -> None:
    xlsx = _make_xlsx_bytes(
        {
            "Penjualan": [
                ["Kode", "Tanggal", "Jumlah", "Harga"],
                ["00123", dt.date(2026, 11, 11), 5, 12500.5],
                ["081299", dt.date(2026, 11, 12), 2, 10000],
            ],
            "Ringkasan": [["Total", "Nilai"], ["Item", 7]],
        }
    )

    with TestClient(app) as client:
        res = client.post(
            "/api/spreadsheets/view",
            files={"file": ("data penjualan (2026).xlsx", xlsx, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        )
    assert res.status_code == 200
    payload = res.json()
    assert len(payload["sheets"]) == 2
    sheet1 = payload["sheets"][0]
    assert sheet1["headers"] == ["Kode", "Tanggal", "Jumlah", "Harga"]
    assert sheet1["rows"][0] == ["00123", "2026-11-11", "5", "12500.5"]
    assert sheet1["rows"][1] == ["081299", "2026-11-12", "2", "10000"]


def test_tool_29_and_30_excel_csv_roundtrip_preserves_leading_zeros() -> None:
    xlsx = _make_xlsx_bytes(
        {
            "Pelanggan": [
                ["NIK", "Nama", "Daftar"],
                ["009876", "Budi Santoso", dt.date(2026, 5, 1)],
            ],
            "Cabang": [["Kode", "Kota"], ["01", "Jakarta"]],
        }
    )
    csv_semicolon = "Telepon;Nama;Qty\n08123456789;Siti Aminah;3\n005;Andi;10\n".encode("utf-8")

    with TestClient(app) as client:
        # #29 Excel -> CSV (all sheets -> ZIP)
        res_csv_zip = client.post(
            "/api/spreadsheets/excel-to-csv",
            files={"file": ("pelanggan.xlsx", xlsx, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
            data={"all_sheets": "true", "delimiter": ";"},
        )
        assert res_csv_zip.status_code == 200
        assert res_csv_zip.headers["content-type"] == "application/zip"
        with zipfile.ZipFile(io.BytesIO(res_csv_zip.content)) as zf:
            assert len(zf.namelist()) == 2
            content = zf.read(zf.namelist()[0]).decode("utf-8-sig")
            assert "009876;Budi Santoso;2026-05-01" in content

        # #30 CSV -> Excel (auto-detect semicolon, keep leading zeros!)
        res_xlsx = client.post(
            "/api/spreadsheets/csv-to-excel",
            files={"file": ("kontak.csv", csv_semicolon, "text/csv")},
            data={"delimiter": "auto", "preserve_leading_zeros": "true"},
        )
        assert res_xlsx.status_code == 200
        wb = openpyxl.load_workbook(io.BytesIO(res_xlsx.content))
        ws = wb.active
        assert ws["A2"].value == "08123456789"
        assert ws["A3"].value == "005"
        assert ws["C2"].value == 3
        wb.close()


def test_tool_31_and_32_merge_excel_and_merge_csv() -> None:
    wb1 = _make_xlsx_bytes({"Jan": [["Produk", "Qty"], ["Buku", 10]]})
    wb2 = _make_xlsx_bytes({"Feb": [["Produk", "Qty"], ["Pena", 20]]})

    csv1 = "Nama,Kota\nAni,Bandung\n".encode("utf-8")
    csv2 = "Kota,Nama\nSurabaya,Budi\n".encode("utf-8")

    with TestClient(app) as client:
        # #31 Merge Excel separate sheets
        m_sep = client.post(
            "/api/spreadsheets/merge-excel",
            files=[
                ("files", ("jan.xlsx", wb1, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")),
                ("files", ("feb.xlsx", wb2, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")),
            ],
            data={"mode": "separate_sheets"},
        )
        assert m_sep.status_code == 200
        merged_wb = openpyxl.load_workbook(io.BytesIO(m_sep.content))
        assert merged_wb.sheetnames == ["jan", "feb"]
        merged_wb.close()

        # #31 Merge Excel append rows
        m_rows = client.post(
            "/api/spreadsheets/merge-excel",
            files=[
                ("files", ("jan.xlsx", wb1, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")),
                ("files", ("feb.xlsx", wb2, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")),
            ],
            data={"mode": "append_rows", "include_source_column": "true"},
        )
        assert m_rows.status_code == 200
        rows_wb = openpyxl.load_workbook(io.BytesIO(m_rows.content))
        assert rows_wb.active.max_row == 3
        rows_wb.close()

        # #32 Merge CSV aligning mismatched column order by header
        m_csv = client.post(
            "/api/spreadsheets/merge-csv",
            files=[
                ("files", ("a.csv", csv1, "text/csv")),
                ("files", ("b.csv", csv2, "text/csv")),
            ],
            data={"align_by_header": "true", "include_bom": "false"},
        )
        assert m_csv.status_code == 200
        lines = m_csv.content.decode("utf-8").strip().splitlines()
        assert lines == ["Nama,Kota", "Ani,Bandung", "Budi,Surabaya"]


def test_tool_33_34_35_dedupe_split_and_clean() -> None:
    wb_dirty = _make_xlsx_bytes(
        {
            "Data": [
                ["Nama", "Email", "Nilai"],
                ["  budi   santoso ", "budi@example.com", 90],
                ["BUDI SANTOSO", "budi@example.com", 85],
                [None, None, None],
                ["  siti  aminah", "siti@example.com", 95],
            ],
            "Cadangan": [["Catatan"], ["OK"]],
        }
    )

    with TestClient(app) as client:
        # #33 Remove Duplicate by Email keeping last
        dedupe = client.post(
            "/api/spreadsheets/remove-duplicates",
            files={"file": ("data.xlsx", wb_dirty, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
            data={"columns": "Email", "keep": "last"},
        )
        assert dedupe.status_code == 200
        assert dedupe.headers["x-removed-count"] == "1"

        # #34 Split Excel by sheet
        split_res = client.post(
            "/api/spreadsheets/split-excel",
            files={"file": ("multi.xlsx", wb_dirty, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        )
        assert split_res.status_code == 200
        assert split_res.headers["content-type"] == "application/zip"
        with zipfile.ZipFile(io.BytesIO(split_res.content)) as zf:
            assert len(zf.namelist()) == 2

        # #35 Data Cleaner (trim spaces, title case on strings, drop empty rows, keep numbers!)
        cleaned = client.post(
            "/api/spreadsheets/clean",
            files={"file": ("kotor.xlsx", wb_dirty, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
            data={"trim_spaces": "true", "text_case": "title", "drop_empty_rows": "true"},
        )
        assert cleaned.status_code == 200
        clean_wb = openpyxl.load_workbook(io.BytesIO(cleaned.content))
        ws = clean_wb["Data"]
        assert ws["A2"].value == "Budi Santoso"
        assert ws["C2"].value == 90
        assert ws.max_row == 4  # empty row dropped cleanly!
        clean_wb.close()


def test_tool_36_excel_to_pdf_report_and_temp_cleanup() -> None:
    xlsx = _make_xlsx_bytes(
        {
            "Laporan": [
                ["No", "Nama Produk", "Tanggal", "Total"],
                [1, "Laptop Kerja Pro", dt.date(2026, 11, 11), 15000000],
                [2, "Monitor Ergonomis", dt.date(2026, 11, 11), 4500000],
            ]
        }
    )

    with TestClient(app) as client:
        res = client.post(
            "/api/spreadsheets/to-pdf-report",
            files={"file": ("rekap penjualan.xlsx", xlsx, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
            data={"paper_size": "A4", "orientation": "landscape", "report_title": "Laporan Penjualan Harian"},
        )
    assert res.status_code == 200
    assert res.headers["content-type"] == "application/pdf"
    doc = pymupdf.open(stream=res.content, filetype="pdf")
    try:
        assert doc.page_count >= 1
        text = doc.load_page(0).get_text()
        assert "Laporan Penjualan Harian" in text
        assert "Laptop Kerja Pro" in text
    finally:
        doc.close()

    assert count_active_job_dirs(get_settings().temp_dir) == 0


def test_corrupted_excel_and_empty_csv_return_clear_errors() -> None:
    with TestClient(app) as client:
        forged_xlsx = client.post(
            "/api/spreadsheets/view",
            files={"file": ("palsu.xlsx", b"bukan-file-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        )
        assert forged_xlsx.status_code == 400
        assert forged_xlsx.json()["error"]["code"] == "INVALID_FILE_SIGNATURE"

        corrupted_zip_xlsx = client.post(
            "/api/spreadsheets/view",
            files={"file": ("rusak.xlsx", b"PK\x03\x04corrupted-workbook", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        )
        assert corrupted_zip_xlsx.status_code == 400
        assert corrupted_zip_xlsx.json()["error"]["code"] == "CORRUPTED_EXCEL"

        empty_csv = client.post(
            "/api/spreadsheets/view",
            files={"file": ("kosong.csv", b"   ", "text/csv")},
        )
        assert empty_csv.status_code == 400
        assert empty_csv.json()["error"]["code"] in {"EMPTY_FILE", "EMPTY_CSV"}

    assert count_active_job_dirs(get_settings().temp_dir) == 0
