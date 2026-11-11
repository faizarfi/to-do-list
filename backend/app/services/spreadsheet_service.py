"""Core spreadsheet & tabular data processing services (Tools #28–#36)."""

from __future__ import annotations

import csv
import datetime as dt
import io
import re
from pathlib import Path
from typing import Any

import openpyxl
import xlrd
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from reportlab.lib import colors
from reportlab.lib.pagesizes import A3, A4, LEGAL, LETTER, landscape, portrait
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.core.exceptions import AppError
from app.schemas.pdf import Orientation, PaperSize
from app.schemas.spreadsheet import (
    DuplicateKeepMode,
    SheetPreviewData,
    SpreadsheetMergeMode,
    SpreadsheetViewResponse,
    TextCaseTransform,
)
from app.utils.response_helpers import package_outputs

SPREADSHEET_ALLOWED_EXTENSIONS = {".xlsx", ".xls", ".csv"}
EXCEL_ONLY_EXTENSIONS = {".xlsx", ".xls"}
CSV_ONLY_EXTENSIONS = {".csv"}

SPREADSHEET_ALLOWED_MIMES = {
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "text/csv",
    "text/x-csv",
    "application/csv",
    "application/x-csv",
    "text/plain",
}

_LEADING_ZERO_INT_RE = re.compile(r"^0\d+$")
_PURE_INT_RE = re.compile(r"^-?(0|[1-9]\d*)$")
_PURE_FLOAT_RE = re.compile(r"^-?\d+\.\d+$")
_MULTI_SPACE_RE = re.compile(r"\s+")


def _decode_csv_text(data: bytes, filename: str) -> str:
    for encoding in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise AppError(
        f"Encoding file CSV '{filename}' tidak dapat dibaca. Gunakan encoding UTF-8.",
        code="INVALID_CSV_ENCODING",
    )


def _detect_csv_delimiter(sample_text: str, requested: str = "auto") -> str:
    if requested != "auto":
        return "\t" if requested == "\\t" else requested
    sample = "\n".join(sample_text.splitlines()[:10])
    if not sample.strip():
        return ","
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
        return dialect.delimiter
    except csv.Error:
        # Heuristic fallback: choose delimiter with highest count in header line
        first_line = sample.splitlines()[0]
        counts = {delim: first_line.count(delim) for delim in (",", ";", "\t", "|")}
        best = max(counts, key=lambda d: counts[d])
        return best if counts[best] > 0 else ","


def _format_cell_for_display(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, dt.datetime):
        if value.hour == 0 and value.minute == 0 and value.second == 0:
            return value.strftime("%Y-%m-%d")
        return value.strftime("%Y-%m-%d %H:%M:%S")
    if isinstance(value, dt.date):
        return value.strftime("%Y-%m-%d")
    if isinstance(value, dt.time):
        return value.strftime("%H:%M:%S")
    if isinstance(value, float):
        if value.is_integer():
            return str(int(value))
        return str(value)
    return str(value)


def _read_xlsx_sheets(
    data: bytes, filename: str
) -> list[tuple[str, list[list[tuple[Any, str | None]]]]]:
    """Read .xlsx preserving (value, number_format) per cell."""
    try:
        wb = openpyxl.load_workbook(io.BytesIO(data), data_only=True, read_only=True)
    except Exception as exc:
        raise AppError(
            f"File Excel '{filename}' rusak atau bukan file XLSX yang valid.",
            code="CORRUPTED_EXCEL",
        ) from exc

    sheets: list[tuple[str, list[list[tuple[Any, str | None]]]]] = []
    try:
        for name in wb.sheetnames:
            ws = wb[name]
            rows: list[list[tuple[Any, str | None]]] = []
            for row in ws.iter_rows(values_only=False):
                row_items = [(cell.value, cell.number_format) for cell in row]
                rows.append(row_items)
            # Trim trailing completely empty rows
            while rows and all(val is None or val == "" for val, _ in rows[-1]):
                rows.pop()
            sheets.append((name, rows))
    finally:
        wb.close()

    if not sheets:
        raise AppError(f"Workbook '{filename}' tidak memiliki sheet.", code="EMPTY_EXCEL")
    return sheets


def _read_xls_sheets(
    data: bytes, filename: str
) -> list[tuple[str, list[list[tuple[Any, str | None]]]]]:
    """Read legacy .xls using xlrd preserving dates, ints, and text."""
    try:
        book = xlrd.open_workbook(file_contents=data)
    except Exception as exc:
        raise AppError(
            f"File Excel '{filename}' rusak atau bukan file XLS yang valid.",
            code="CORRUPTED_EXCEL",
        ) from exc

    sheets: list[tuple[str, list[list[tuple[Any, str | None]]]]] = []
    for sheet in book.sheets():
        rows: list[list[tuple[Any, str | None]]] = []
        for r in range(sheet.nrows):
            row_items: list[tuple[Any, str | None]] = []
            for c in range(sheet.ncols):
                cell = sheet.cell(r, c)
                val: Any = cell.value
                num_fmt: str | None = None
                if cell.ctype == xlrd.XL_CELL_DATE:
                    dt_tuple = xlrd.xldate_as_tuple(val, book.datemode)
                    if dt_tuple[3:] == (0, 0, 0):
                        val = dt.date(dt_tuple[0], dt_tuple[1], dt_tuple[2])
                        num_fmt = "yyyy-mm-dd"
                    else:
                        val = dt.datetime(*dt_tuple)
                        num_fmt = "yyyy-mm-dd hh:mm:ss"
                elif cell.ctype == xlrd.XL_CELL_NUMBER and isinstance(val, float) and val.is_integer():
                    val = int(val)
                elif cell.ctype == xlrd.XL_CELL_BOOLEAN:
                    val = bool(val)
                elif cell.ctype == xlrd.XL_CELL_EMPTY:
                    val = None
                row_items.append((val, num_fmt))
            rows.append(row_items)
        while rows and all(val is None or val == "" for val, _ in rows[-1]):
            rows.pop()
        sheets.append((sheet.name, rows))

    if not sheets:
        raise AppError(f"Workbook '{filename}' tidak memiliki sheet.", code="EMPTY_EXCEL")
    return sheets


def _read_csv_rows(data: bytes, filename: str, delimiter: str = "auto") -> list[list[str]]:
    text = _decode_csv_text(data, filename)
    if not text.strip():
        raise AppError(f"File CSV '{filename}' kosong.", code="EMPTY_CSV")
    delim = _detect_csv_delimiter(text, delimiter)
    reader = csv.reader(io.StringIO(text), delimiter=delim)
    rows = [row for row in reader]
    if not rows:
        raise AppError(f"File CSV '{filename}' kosong.", code="EMPTY_CSV")
    return rows


def _read_tabular_sheets(
    data: bytes,
    filename: str,
    *,
    csv_delimiter: str = "auto",
) -> tuple[str, list[tuple[str, list[list[tuple[Any, str | None]]]]]]:
    ext = Path(filename).suffix.lower()
    if ext == ".xlsx":
        return "xlsx", _read_xlsx_sheets(data, filename)
    if ext == ".xls":
        return "xls", _read_xls_sheets(data, filename)
    if ext == ".csv":
        csv_rows = _read_csv_rows(data, filename, delimiter=csv_delimiter)
        wrapped = [[(cell, None) for cell in row] for row in csv_rows]
        return "csv", [(Path(filename).stem or "Data", wrapped)]
    raise AppError(f"Format file '{ext}' tidak didukung.", code="INVALID_FILE_EXTENSION")


def _auto_fit_worksheet(ws: openpyxl.worksheet.worksheet.Worksheet, *, style_header: bool = True) -> None:
    if style_header and ws.max_row >= 1:
        header_fill = PatternFill(start_color="E6FAF6", end_color="E6FAF6", fill_type="solid")
        header_font = Font(bold=True, color="065F5B")
        for cell in ws[1]:
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(vertical="center")
        ws.freeze_panes = "A2"

    for col_idx in range(1, ws.max_column + 1):
        max_len = 8
        for row_idx in range(1, min(ws.max_row, 250) + 1):
            val = ws.cell(row=row_idx, column=col_idx).value
            if val is not None:
                max_len = max(max_len, len(_format_cell_for_display(val)))
        col_letter = get_column_letter(col_idx)
        ws.column_dimensions[col_letter].width = min(max_len + 4, 48)


def _normalize_sheet_rows(rows: list[list[tuple[Any, str | None]]]) -> tuple[list[str], list[list[str]]]:
    if not rows:
        return [], []
    max_cols = max((len(r) for r in rows), default=0)
    if max_cols == 0:
        return [], []

    raw_headers = rows[0]
    headers = [
        _format_cell_for_display(raw_headers[c][0]) or f"Kolom {c + 1}"
        if c < len(raw_headers)
        else f"Kolom {c + 1}"
        for c in range(max_cols)
    ]

    data_rows: list[list[str]] = []
    for row in rows[1:]:
        formatted = [
            _format_cell_for_display(row[c][0]) if c < len(row) else ""
            for c in range(max_cols)
        ]
        data_rows.append(formatted)
    return headers, data_rows


def _parse_csv_scalar(value: str, preserve_leading_zeros: bool = True) -> Any:
    trimmed = value.strip()
    if trimmed == "":
        return None
    if preserve_leading_zeros and _LEADING_ZERO_INT_RE.match(trimmed):
        return trimmed
    if _PURE_INT_RE.match(trimmed):
        try:
            return int(trimmed)
        except ValueError:
            return trimmed
    if _PURE_FLOAT_RE.match(trimmed):
        try:
            return float(trimmed)
        except ValueError:
            return trimmed
    return value


def _safe_sheet_title(desired: str, existing: set[str]) -> str:
    clean = re.sub(r"[\\/*?:\[\]]", "_", desired.strip()) or "Sheet"
    base = clean[:31]
    candidate = base
    counter = 2
    while candidate in existing:
        suffix = f"_{counter}"
        candidate = f"{base[: 31 - len(suffix)]}{suffix}"
        counter += 1
    existing.add(candidate)
    return candidate


def _write_sheets_to_xlsx(
    out_path: Path,
    sheets: list[tuple[str, list[list[tuple[Any, str | None]]]]],
    *,
    style_header: bool = True,
) -> None:
    wb = openpyxl.Workbook()
    default_ws = wb.active
    wb.remove(default_ws)
    used_names: set[str] = set()

    for name, rows in sheets:
        ws = wb.create_sheet(title=_safe_sheet_title(name, used_names))
        for r_idx, row in enumerate(rows, start=1):
            for c_idx, (val, num_fmt) in enumerate(row, start=1):
                cell = ws.cell(row=r_idx, column=c_idx, value=val)
                if num_fmt and num_fmt != "General":
                    cell.number_format = num_fmt
        _auto_fit_worksheet(ws, style_header=style_header)

    wb.save(out_path)
    wb.close()


def view_spreadsheet(
    data: bytes,
    filename: str,
    *,
    max_rows: int = 500,
) -> SpreadsheetViewResponse:
    """Tool #28: Inspect XLSX, XLS, or CSV contents cleanly preserving formatting."""
    fmt, raw_sheets = _read_tabular_sheets(data, filename)
    previews: list[SheetPreviewData] = []

    for sheet_name, rows in raw_sheets:
        headers, body_rows = _normalize_sheet_rows(rows)
        total_rows = len(body_rows)
        truncated = total_rows > max_rows
        previews.append(
            SheetPreviewData(
                name=sheet_name,
                total_rows=total_rows,
                total_cols=len(headers),
                headers=headers,
                rows=body_rows[:max_rows],
                truncated=truncated,
            )
        )

    return SpreadsheetViewResponse(
        filename=filename,
        file_size_bytes=len(data),
        format=fmt.upper(),
        sheets=previews,
    )


def excel_to_csv(
    job_dir: Path,
    data: bytes,
    filename: str,
    *,
    sheet_name: str | None = None,
    all_sheets: bool = False,
    delimiter: str = ",",
    include_bom: bool = True,
) -> tuple[Path, str, str, int]:
    """Tool #29: Convert Excel workbook sheets to CSV without mangling formats."""
    ext = Path(filename).suffix.lower()
    if ext not in EXCEL_ONLY_EXTENSIONS:
        raise AppError("Unggah file Excel (.xlsx atau .xls).", code="INVALID_FILE_EXTENSION")

    raw_sheets = _read_xlsx_sheets(data, filename) if ext == ".xlsx" else _read_xls_sheets(data, filename)
    delim = "\t" if delimiter == "\\t" else delimiter
    encoding = "utf-8-sig" if include_bom else "utf-8"

    if sheet_name:
        selected = [s for s in raw_sheets if s[0] == sheet_name]
        if not selected:
            raise AppError(f"Sheet '{sheet_name}' tidak ditemukan.", code="SHEET_NOT_FOUND")
    elif all_sheets:
        selected = raw_sheets
    else:
        selected = [raw_sheets[0]]

    stem = Path(filename).stem or "excel"
    output_files: list[Path] = []
    for s_name, rows in selected:
        safe_sheet = re.sub(r"[^\w\- ]+", "_", s_name).strip() or "sheet"
        out_name = f"{stem}.csv" if len(selected) == 1 else f"{stem}_{safe_sheet}.csv"
        out_path = job_dir / out_name
        with out_path.open("w", encoding=encoding, newline="") as handle:
            writer = csv.writer(handle, delimiter=delim)
            for row in rows:
                writer.writerow([_format_cell_for_display(val) for val, _ in row])
        output_files.append(out_path)

    res_path, media_type, dl_name = package_outputs(
        job_dir,
        output_files,
        single_media_type="text/csv; charset=utf-8",
        zip_filename=f"{stem}_csv.zip",
    )
    return res_path, media_type, dl_name, len(output_files)


def csv_to_excel(
    job_dir: Path,
    data: bytes,
    filename: str,
    *,
    delimiter: str = "auto",
    sheet_name: str = "Data",
    preserve_leading_zeros: bool = True,
) -> tuple[Path, str, int]:
    """Tool #30: Convert CSV to a formatted .xlsx workbook preserving leading zeros."""
    rows = _read_csv_rows(data, filename, delimiter=delimiter)
    typed_rows: list[list[tuple[Any, str | None]]] = []

    for r_idx, row in enumerate(rows):
        if r_idx == 0:
            typed_rows.append([(cell, None) for cell in row])
        else:
            typed_row: list[tuple[Any, str | None]] = []
            for cell in row:
                parsed = _parse_csv_scalar(cell, preserve_leading_zeros=preserve_leading_zeros)
                fmt = "@" if isinstance(parsed, str) and _LEADING_ZERO_INT_RE.match(parsed.strip()) else None
                typed_row.append((parsed, fmt))
            typed_rows.append(typed_row)

    stem = Path(filename).stem or "data"
    out_path = job_dir / f"{stem}.xlsx"
    _write_sheets_to_xlsx(out_path, [(sheet_name or "Data", typed_rows)], style_header=True)
    return out_path, out_path.name, max(0, len(rows) - 1)


def merge_excel_workbooks(
    job_dir: Path,
    files: list[tuple[str, bytes]],
    *,
    mode: SpreadsheetMergeMode = SpreadsheetMergeMode.SEPARATE_SHEETS,
    include_source_column: bool = False,
) -> tuple[Path, str, int]:
    """Tool #31: Merge 2+ Excel workbooks as separate sheets or combined rows."""
    if len(files) < 2:
        raise AppError("Unggah minimal 2 file Excel untuk digabungkan.", code="MINIMUM_TWO_FILES")

    if mode == SpreadsheetMergeMode.SEPARATE_SHEETS:
        combined_sheets: list[tuple[str, list[list[tuple[Any, str | None]]]]] = []
        for fname, data in files:
            ext = Path(fname).suffix.lower()
            sheets = _read_xlsx_sheets(data, fname) if ext == ".xlsx" else _read_xls_sheets(data, fname)
            stem = Path(fname).stem
            for s_name, rows in sheets:
                label = s_name if len(sheets) > 1 else stem
                combined_sheets.append((label, rows))

        out_path = job_dir / "excel-gabungan.xlsx"
        _write_sheets_to_xlsx(out_path, combined_sheets, style_header=True)
        return out_path, out_path.name, len(combined_sheets)

    # Append rows mode: align headers cleanly across workbooks
    unified_headers: list[str] = []
    unified_rows: list[list[tuple[Any, str | None]]] = []

    for fname, data in files:
        ext = Path(fname).suffix.lower()
        sheets = _read_xlsx_sheets(data, fname) if ext == ".xlsx" else _read_xls_sheets(data, fname)
        for _s_name, rows in sheets:
            if not rows:
                continue
            file_headers = [_format_cell_for_display(val) or f"Kolom_{i+1}" for i, (val, _) in enumerate(rows[0])]
            for h in file_headers:
                if h not in unified_headers:
                    unified_headers.append(h)
            col_map = {h: idx for idx, h in enumerate(file_headers)}
            for body_row in rows[1:]:
                entry: list[tuple[Any, str | None]] = []
                for h in unified_headers:
                    src_idx = col_map.get(h)
                    if src_idx is not None and src_idx < len(body_row):
                        entry.append(body_row[src_idx])
                    else:
                        entry.append((None, None))
                if include_source_column:
                    entry.append((fname, None))
                unified_rows.append(entry)

    final_headers = [(h, None) for h in unified_headers]
    if include_source_column:
        final_headers.append(("Sumber_File", None))

    # Pad earlier rows if later workbooks introduced additional columns
    target_width = len(final_headers)
    padded_rows: list[list[tuple[Any, str | None]]] = [final_headers]
    for row in unified_rows:
        if len(row) < target_width:
            if include_source_column:
                src_cell = row[-1]
                core = row[:-1] + [(None, None)] * (target_width - len(row))
                padded_rows.append(core + [src_cell])
            else:
                padded_rows.append(row + [(None, None)] * (target_width - len(row)))
        else:
            padded_rows.append(row)

    out_path = job_dir / "excel-gabungan.xlsx"
    _write_sheets_to_xlsx(out_path, [("Gabungan", padded_rows)], style_header=True)
    return out_path, out_path.name, max(0, len(padded_rows) - 1)


def merge_csv_files(
    job_dir: Path,
    files: list[tuple[str, bytes]],
    *,
    input_delimiter: str = "auto",
    output_delimiter: str = ",",
    align_by_header: bool = True,
    include_source_column: bool = False,
    include_bom: bool = True,
) -> tuple[Path, str, int]:
    """Tool #32: Merge 2+ CSV files safely preserving string values."""
    if len(files) < 2:
        raise AppError("Unggah minimal 2 file CSV untuk digabungkan.", code="MINIMUM_TWO_FILES")

    out_delim = "\t" if output_delimiter == "\\t" else output_delimiter
    encoding = "utf-8-sig" if include_bom else "utf-8"

    all_headers: list[str] = []
    output_records: list[list[str]] = []

    if align_by_header:
        parsed_tables: list[tuple[str, list[str], list[list[str]]]] = []
        for fname, data in files:
            rows = _read_csv_rows(data, fname, delimiter=input_delimiter)
            headers = rows[0]
            for h in headers:
                if h not in all_headers:
                    all_headers.append(h)
            parsed_tables.append((fname, headers, rows[1:]))

        for fname, headers, body in parsed_tables:
            idx_map = {h: idx for idx, h in enumerate(headers)}
            for row in body:
                aligned = [
                    row[idx_map[h]] if h in idx_map and idx_map[h] < len(row) else ""
                    for h in all_headers
                ]
                if include_source_column:
                    aligned.append(fname)
                output_records.append(aligned)

        final_header = list(all_headers) + (["Sumber_File"] if include_source_column else [])
    else:
        max_cols = 0
        raw_tables: list[tuple[str, list[list[str]]]] = []
        for fname, data in files:
            rows = _read_csv_rows(data, fname, delimiter=input_delimiter)
            max_cols = max(max_cols, max((len(r) for r in rows), default=0))
            raw_tables.append((fname, rows))

        first_hdr = raw_tables[0][1][0]
        final_header = [
            first_hdr[c] if c < len(first_hdr) else f"Kolom_{c + 1}"
            for c in range(max_cols)
        ] + (["Sumber_File"] if include_source_column else [])

        for fname, rows in raw_tables:
            for row in rows[1:]:
                padded = [row[c] if c < len(row) else "" for c in range(max_cols)]
                if include_source_column:
                    padded.append(fname)
                output_records.append(padded)

    out_path = job_dir / "csv-gabungan.csv"
    with out_path.open("w", encoding=encoding, newline="") as handle:
        writer = csv.writer(handle, delimiter=out_delim)
        writer.writerow(final_header)
        writer.writerows(output_records)

    return out_path, out_path.name, len(output_records)


def _resolve_column_indices(headers: list[str], columns_spec: str | None) -> list[int]:
    if not columns_spec or not columns_spec.strip():
        return list(range(len(headers)))

    indices: list[int] = []
    header_lookup = {h.strip().lower(): idx for idx, h in enumerate(headers)}
    for raw_token in columns_spec.split(","):
        token = raw_token.strip()
        if not token:
            continue
        if token.lower() in header_lookup:
            indices.append(header_lookup[token.lower()])
        elif token.isdigit():
            col_num = int(token) - 1
            if 0 <= col_num < len(headers):
                indices.append(col_num)
            else:
                raise AppError(f"Nomor kolom '{token}' di luar rentang (1–{len(headers)}).", code="INVALID_COLUMN")
        else:
            raise AppError(f"Kolom '{token}' tidak ditemukan pada header.", code="COLUMN_NOT_FOUND")
    return indices


def remove_duplicates(
    job_dir: Path,
    data: bytes,
    filename: str,
    *,
    sheet_name: str | None = None,
    columns_spec: str | None = None,
    keep: DuplicateKeepMode = DuplicateKeepMode.FIRST,
    case_sensitive: bool = True,
    trim_compare: bool = False,
) -> tuple[Path, str, str, int, int]:
    """Tool #33: Remove duplicate rows from Excel or CSV preserving column types/formats."""
    fmt, sheets = _read_tabular_sheets(data, filename)
    target_idx = 0
    if sheet_name:
        matches = [i for i, (name, _) in enumerate(sheets) if name == sheet_name]
        if not matches:
            raise AppError(f"Sheet '{sheet_name}' tidak ditemukan.", code="SHEET_NOT_FOUND")
        target_idx = matches[0]

    s_name, rows = sheets[target_idx]
    if not rows:
        raise AppError("Sheet kosong tidak memiliki baris data.", code="EMPTY_SHEET")

    header_row = rows[0]
    header_labels = [_format_cell_for_display(val) or f"Kolom_{i+1}" for i, (val, _) in enumerate(header_row)]
    key_indices = _resolve_column_indices(header_labels, columns_spec)
    body = rows[1:]
    original_count = len(body)

    def _row_key(row: list[tuple[Any, str | None]]) -> tuple[str, ...]:
        parts: list[str] = []
        for idx in key_indices:
            raw_val = _format_cell_for_display(row[idx][0]) if idx < len(row) else ""
            if trim_compare:
                raw_val = _MULTI_SPACE_RE.sub(" ", raw_val.strip())
            if not case_sensitive:
                raw_val = raw_val.lower()
            parts.append(raw_val)
        return tuple(parts)

    ordered_body = body if keep == DuplicateKeepMode.FIRST else list(reversed(body))
    seen: set[tuple[str, ...]] = set()
    kept: list[list[tuple[Any, str | None]]] = []
    for row in ordered_body:
        k = _row_key(row)
        if k not in seen:
            seen.add(k)
            kept.append(row)

    if keep == DuplicateKeepMode.LAST:
        kept.reverse()

    new_rows = [header_row, *kept]
    stem = Path(filename).stem or "data"

    if fmt == "csv":
        out_path = job_dir / f"{stem}_unik.csv"
        with out_path.open("w", encoding="utf-8-sig", newline="") as handle:
            writer = csv.writer(handle)
            for row in new_rows:
                writer.writerow([_format_cell_for_display(val) for val, _ in row])
        return out_path, "text/csv; charset=utf-8", out_path.name, original_count, len(kept)

    updated_sheets = list(sheets)
    updated_sheets[target_idx] = (s_name, new_rows)
    out_path = job_dir / f"{stem}_unik.xlsx"
    _write_sheets_to_xlsx(out_path, updated_sheets, style_header=True)
    return (
        out_path,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        out_path.name,
        original_count,
        len(kept),
    )


def split_excel_by_sheets(
    job_dir: Path,
    data: bytes,
    filename: str,
) -> tuple[Path, str, str, int]:
    """Tool #34: Split an Excel workbook into individual .xlsx files per sheet."""
    ext = Path(filename).suffix.lower()
    if ext not in EXCEL_ONLY_EXTENSIONS:
        raise AppError("Unggah file Excel (.xlsx atau .xls).", code="INVALID_FILE_EXTENSION")

    sheets = _read_xlsx_sheets(data, filename) if ext == ".xlsx" else _read_xls_sheets(data, filename)
    stem = Path(filename).stem or "workbook"
    output_files: list[Path] = []

    for s_name, rows in sheets:
        safe_sheet = re.sub(r"[^\w\- ]+", "_", s_name).strip() or "sheet"
        out_path = job_dir / f"{stem}_{safe_sheet}.xlsx"
        counter = 2
        while out_path.exists():
            out_path = job_dir / f"{stem}_{safe_sheet}_{counter}.xlsx"
            counter += 1
        _write_sheets_to_xlsx(out_path, [(s_name, rows)], style_header=True)
        output_files.append(out_path)

    res_path, media_type, dl_name = package_outputs(
        job_dir,
        output_files,
        single_media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        zip_filename=f"{stem}_sheets.zip",
    )
    return res_path, media_type, dl_name, len(output_files)


def clean_tabular_data(
    job_dir: Path,
    data: bytes,
    filename: str,
    *,
    trim_spaces: bool = True,
    text_case: TextCaseTransform = TextCaseTransform.NONE,
    drop_empty_rows: bool = True,
    drop_empty_columns: bool = False,
    fill_empty_with: str = "",
) -> tuple[Path, str, str, int]:
    """Tool #35: Clean whitespace, standardize text casing, and prune empty rows/cols."""
    fmt, sheets = _read_tabular_sheets(data, filename)
    cleaned_sheets: list[tuple[str, list[list[tuple[Any, str | None]]]]] = []
    total_rows_kept = 0

    for s_name, rows in sheets:
        if not rows:
            cleaned_sheets.append((s_name, rows))
            continue

        # Transform cell values safely (only touch strings for whitespace/case)
        transformed_rows: list[list[tuple[Any, str | None]]] = []
        for r_idx, row in enumerate(rows):
            new_row: list[tuple[Any, str | None]] = []
            for val, num_fmt in row:
                if val is None or (isinstance(val, str) and val.strip() == ""):
                    new_val: Any = fill_empty_with if (fill_empty_with and r_idx > 0) else None
                    new_row.append((new_val, num_fmt))
                    continue

                if isinstance(val, str):
                    next_str = val
                    if trim_spaces:
                        next_str = _MULTI_SPACE_RE.sub(" ", next_str.strip())
                    if r_idx > 0:
                        if text_case == TextCaseTransform.LOWER:
                            next_str = next_str.lower()
                        elif text_case == TextCaseTransform.UPPER:
                            next_str = next_str.upper()
                        elif text_case == TextCaseTransform.TITLE:
                            next_str = next_str.title()
                    new_row.append((next_str, num_fmt))
                else:
                    new_row.append((val, num_fmt))

            if drop_empty_rows and r_idx > 0:
                if all(v is None or (isinstance(v, str) and v.strip() == "") for v, _ in new_row):
                    continue
            transformed_rows.append(new_row)

        if drop_empty_columns and transformed_rows:
            max_cols = max((len(r) for r in transformed_rows), default=0)
            keep_cols = [
                c
                for c in range(max_cols)
                if any(
                    c < len(r)
                    and r[c][0] is not None
                    and not (isinstance(r[c][0], str) and r[c][0].strip() == "")
                    for r in transformed_rows
                )
            ]
            transformed_rows = [
                [r[c] if c < len(r) else (None, None) for c in keep_cols]
                for r in transformed_rows
            ]

        total_rows_kept += max(0, len(transformed_rows) - 1)
        cleaned_sheets.append((s_name, transformed_rows))

    stem = Path(filename).stem or "data"
    if fmt == "csv":
        out_path = job_dir / f"{stem}_bersih.csv"
        with out_path.open("w", encoding="utf-8-sig", newline="") as handle:
            writer = csv.writer(handle)
            for row in cleaned_sheets[0][1]:
                writer.writerow([_format_cell_for_display(v) for v, _ in row])
        return out_path, "text/csv; charset=utf-8", out_path.name, total_rows_kept

    out_path = job_dir / f"{stem}_bersih.xlsx"
    _write_sheets_to_xlsx(out_path, cleaned_sheets, style_header=True)
    return (
        out_path,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        out_path.name,
        total_rows_kept,
    )


def excel_to_pdf_report(
    job_dir: Path,
    data: bytes,
    filename: str,
    *,
    sheet_name: str | None = None,
    paper_size: PaperSize = PaperSize.A4,
    orientation: Orientation = Orientation.LANDSCAPE,
    report_title: str | None = None,
    font_size: int = 8,
    repeat_header: bool = True,
) -> tuple[Path, str, int]:
    """Tool #36: Generate a clean multi-page PDF report from Excel or CSV tables."""
    _, sheets = _read_tabular_sheets(data, filename)
    if sheet_name:
        selected = [s for s in sheets if s[0] == sheet_name]
        if not selected:
            raise AppError(f"Sheet '{sheet_name}' tidak ditemukan.", code="SHEET_NOT_FOUND")
    else:
        selected = sheets

    base_size_map = {
        PaperSize.A4: A4,
        PaperSize.A3: A3,
        PaperSize.LETTER: LETTER,
        PaperSize.LEGAL: LEGAL,
        PaperSize.CUSTOM: A4,
    }
    base_page = base_size_map[paper_size]
    page_size = landscape(base_page) if orientation == Orientation.LANDSCAPE else portrait(base_page)

    stem = Path(filename).stem or "laporan"
    out_path = job_dir / f"{stem}_laporan.pdf"
    margin_pt = 14 * mm

    doc = SimpleDocTemplate(
        str(out_path),
        pagesize=page_size,
        leftMargin=margin_pt,
        rightMargin=margin_pt,
        topMargin=margin_pt,
        bottomMargin=margin_pt,
        title=report_title or f"Laporan {stem}",
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "RKTitle",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=13,
        textColor=colors.HexColor("#0F172A"),
        spaceAfter=4,
    )
    subtitle_style = ParagraphStyle(
        "RKSub",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        textColor=colors.HexColor("#475569"),
        spaceAfter=10,
    )
    cell_style = ParagraphStyle(
        "RKCell",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=font_size,
        leading=font_size + 3,
        textColor=colors.HexColor("#0F172A"),
    )
    header_cell_style = ParagraphStyle(
        "RKHeaderCell",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=font_size,
        leading=font_size + 3,
        textColor=colors.white,
    )

    story: list[Any] = []
    avail_w = page_size[0] - 2 * margin_pt
    total_data_rows = 0

    for idx, (s_name, rows) in enumerate(selected):
        if idx > 0:
            story.append(PageBreak())

        headers, body_rows = _normalize_sheet_rows(rows)
        if not headers:
            continue
        total_data_rows += len(body_rows)

        heading_text = report_title.strip() if report_title and report_title.strip() else f"Laporan: {filename}"
        story.append(Paragraph(heading_text, title_style))
        story.append(
            Paragraph(
                f"Sheet: {s_name} • {len(body_rows)} baris × {len(headers)} kolom",
                subtitle_style,
            )
        )

        # Cap width safely for extreme wide spreadsheets while keeping all columns visible
        col_count = len(headers)
        col_weights = []
        for c in range(col_count):
            max_chars = len(headers[c])
            for r in body_rows[:60]:
                max_chars = max(max_chars, len(r[c]))
            col_weights.append(min(max(max_chars, 6), 36))
        total_weight = sum(col_weights) or col_count
        col_widths = [avail_w * (w / total_weight) for w in col_weights]

        def _escape(txt: str) -> str:
            return txt.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

        table_data: list[list[Any]] = [
            [Paragraph(_escape(h), header_cell_style) for h in headers]
        ]
        for r in body_rows:
            table_data.append([Paragraph(_escape(cell), cell_style) for cell in r])

        tbl = Table(
            table_data,
            colWidths=col_widths,
            repeatRows=1 if repeat_header else 0,
        )
        tbl.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0D7A68")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#CBD5E1")),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
                    ("TOPPADDING", (0, 0), (-1, -1), 4),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                    ("LEFTPADDING", (0, 0), (-1, -1), 5),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ]
            )
        )
        story.append(tbl)
        story.append(Spacer(1, 8))

    if not story:
        raise AppError("Tidak ada data tabel yang dapat dicetak ke PDF.", code="EMPTY_SPREADSHEET")

    doc.build(story)
    return out_path, out_path.name, total_data_rows
