"""Additional Excel & Data Tools processing services (Tools #62–#66)."""

from __future__ import annotations

import csv
import io
import json
from collections import Counter
from pathlib import Path
from typing import Any

from app.core.exceptions import AppError
from app.schemas.spreadsheet import (
    ColumnSummaryItem,
    SpreadsheetSummaryResponse,
    SpreadsheetToJsonResponse,
)
from app.services.spreadsheet_service import (
    _format_cell_for_display,
    _normalize_sheet_rows,
    _read_tabular_sheets,
    _write_sheets_to_xlsx,
)
from app.utils.file_security import sanitize_filename


def _flatten_json_obj(obj: Any, prefix: str = "") -> dict[str, Any]:
    out: dict[str, Any] = {}
    if isinstance(obj, dict):
        for k, v in obj.items():
            key = f"{prefix}.{k}" if prefix else str(k)
            if isinstance(v, dict):
                out.update(_flatten_json_obj(v, key))
            elif isinstance(v, list):
                out[key] = json.dumps(v, ensure_ascii=False)
            else:
                out[key] = v
    else:
        out[prefix or "value"] = obj
    return out


def json_to_spreadsheet(
    job_dir: Path,
    json_text: str,
    *,
    output_format: str = "xlsx",
    sheet_name: str = "Data",
    filename_stem: str = "json-data",
) -> tuple[Path, str, str, int]:
    """Tool #62: Convert JSON array of objects into formatted Excel (.xlsx) or CSV."""
    try:
        parsed = json.loads(json_text)
    except json.JSONDecodeError as exc:
        raise AppError(f"Format JSON tidak valid: {exc.msg}", code="INVALID_JSON") from exc

    if isinstance(parsed, dict):
        # Support wrapped lists like {"data": [...]} or single object
        list_vals = [v for v in parsed.values() if isinstance(v, list)]
        if len(list_vals) == 1 and all(isinstance(x, dict) for x in list_vals[0]):
            records = list_vals[0]
        else:
            records = [parsed]
    elif isinstance(parsed, list):
        records = parsed
    else:
        raise AppError(
            "JSON harus berupa array objek ([{...}]) atau objek tunggal.",
            code="INVALID_JSON_STRUCTURE",
        )

    if not records:
        raise AppError("Array JSON kosong.", code="EMPTY_JSON")

    flat_rows = [_flatten_json_obj(item) for item in records]
    headers: list[str] = []
    seen_headers: set[str] = set()
    for row in flat_rows:
        for key in row.keys():
            if key not in seen_headers:
                seen_headers.add(key)
                headers.append(key)

    safe_stem = sanitize_filename(filename_stem, fallback="json-data")
    if output_format.lower() == "csv":
        out_path = job_dir / f"{safe_stem}.csv"
        buf = io.StringIO()
        writer = csv.writer(buf, lineterminator="\n")
        writer.writerow(headers)
        for row in flat_rows:
            writer.writerow(["" if row.get(h) is None else str(row.get(h)) for h in headers])
        out_path.write_bytes(buf.getvalue().encode("utf-8-sig"))
        return out_path, "text/csv", out_path.name, len(flat_rows)

    sheet_rows: list[list[tuple[Any, str | None]]] = [
        [(h, None) for h in headers]
    ]
    for row in flat_rows:
        sheet_rows.append([(row.get(h), None) for h in headers])

    out_path = job_dir / f"{safe_stem}.xlsx"
    _write_sheets_to_xlsx(
        out_path,
        [(sheet_name.strip() or "Data", sheet_rows)],
        style_header=True,
    )
    return (
        out_path,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        out_path.name,
        len(flat_rows),
    )


def _cell_json_value(raw_val: Any) -> Any:
    if raw_val is None or isinstance(raw_val, (bool, int, float)):
        return raw_val
    return _format_cell_for_display(raw_val)


def spreadsheet_to_json(
    data: bytes,
    filename: str,
    *,
    sheet_name: str | None = None,
    pretty: bool = True,
) -> SpreadsheetToJsonResponse:
    """Tool #63: Convert an Excel worksheet or CSV file into JSON records."""
    _, sheets = _read_tabular_sheets(data, filename)
    target = (
        next((s for s in sheets if s[0] == sheet_name), sheets[0])
        if sheet_name
        else sheets[0]
    )
    s_name, raw_rows = target
    if not raw_rows:
        return SpreadsheetToJsonResponse(
            filename=filename, sheet_name=s_name, row_count=0, json_text="[]"
        )

    headers, _ = _normalize_sheet_rows(raw_rows)
    records: list[dict[str, Any]] = []
    for row in raw_rows[1:]:
        rec: dict[str, Any] = {}
        for idx, h in enumerate(headers):
            raw_val = row[idx][0] if idx < len(row) else None
            rec[h] = _cell_json_value(raw_val)
        records.append(rec)

    indent = 2 if pretty else None
    return SpreadsheetToJsonResponse(
        filename=filename,
        sheet_name=s_name,
        row_count=len(records),
        json_text=json.dumps(records, ensure_ascii=False, indent=indent),
    )


def _resolve_target_column_indices(headers: list[str], target_columns: str | None) -> set[int] | None:
    if not target_columns or not target_columns.strip():
        return None
    requested = {t.strip().lower() for t in target_columns.split(",") if t.strip()}
    indices: set[int] = set()
    for idx, h in enumerate(headers):
        if h.lower() in requested or str(idx + 1) in requested:
            indices.add(idx)
    if not indices:
        raise AppError(
            "Kolom target tidak ditemukan di header file.",
            code="COLUMN_NOT_FOUND",
        )
    return indices


def find_replace_spreadsheet(
    job_dir: Path,
    data: bytes,
    filename: str,
    *,
    find_text: str,
    replace_text: str = "",
    target_columns: str | None = None,
    sheet_name: str | None = None,
    case_sensitive: bool = False,
    exact_match: bool = False,
) -> tuple[Path, str, str, int]:
    """Tool #64: Bulk find & replace text across spreadsheet cells."""
    if not find_text:
        raise AppError("Teks yang dicari tidak boleh kosong.", code="EMPTY_FIND_TEXT")

    fmt, sheets = _read_tabular_sheets(data, filename)
    replaced_count = 0
    new_sheets: list[tuple[str, list[list[tuple[Any, str | None]]]]] = []

    for s_name, rows in sheets:
        if sheet_name and s_name != sheet_name:
            new_sheets.append((s_name, rows))
            continue

        if not rows:
            new_sheets.append((s_name, rows))
            continue

        headers, _ = _normalize_sheet_rows(rows)
        target_idxs = _resolve_target_column_indices(headers, target_columns)
        updated_rows: list[list[tuple[Any, str | None]]] = [rows[0]]

        for row in rows[1:]:
            new_row: list[tuple[Any, str | None]] = []
            for c_idx, (val, num_fmt) in enumerate(row):
                if target_idxs is not None and c_idx not in target_idxs or val is None:
                    new_row.append((val, num_fmt))
                    continue

                as_str = _format_cell_for_display(val)
                matched = False
                new_val: Any = val

                if exact_match:
                    cmp_a = as_str if case_sensitive else as_str.lower()
                    cmp_b = find_text if case_sensitive else find_text.lower()
                    if cmp_a == cmp_b:
                        matched = True
                        new_val = replace_text
                else:
                    if case_sensitive:
                        if find_text in as_str:
                            matched = True
                            new_val = as_str.replace(find_text, replace_text)
                    else:
                        import re

                        pattern = re.compile(re.escape(find_text), re.IGNORECASE)
                        if pattern.search(as_str):
                            matched = True
                            new_val = pattern.sub(lambda _m: replace_text, as_str)

                if matched:
                    replaced_count += 1
                    new_row.append((new_val, None))
                else:
                    new_row.append((val, num_fmt))
            updated_rows.append(new_row)

        new_sheets.append((s_name, updated_rows))

    stem = Path(sanitize_filename(filename)).stem or "data"
    if fmt == "csv":
        out_path = job_dir / f"{stem}_replaced.csv"
        buf = io.StringIO()
        writer = csv.writer(buf, lineterminator="\n")
        for row in new_sheets[0][1]:
            writer.writerow([_format_cell_for_display(v) for v, _ in row])
        out_path.write_bytes(buf.getvalue().encode("utf-8-sig"))
        return out_path, "text/csv", out_path.name, replaced_count

    out_path = job_dir / f"{stem}_replaced.xlsx"
    _write_sheets_to_xlsx(out_path, new_sheets, style_header=True)
    return (
        out_path,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        out_path.name,
        replaced_count,
    )


def transform_spreadsheet_columns(
    job_dir: Path,
    data: bytes,
    filename: str,
    *,
    mode: str = "merge",  # "merge" | "split"
    source_columns: str = "",
    separator: str = " ",
    new_column_name: str = "Hasil_Kolom",
    sheet_name: str | None = None,
) -> tuple[Path, str, str, int]:
    """Tool #65: Merge multiple columns into one or split one column by delimiter."""
    fmt, sheets = _read_tabular_sheets(data, filename)
    target_idx_sheet = 0
    if sheet_name:
        for i, s in enumerate(sheets):
            if s[0] == sheet_name:
                target_idx_sheet = i
                break

    s_name, rows = sheets[target_idx_sheet]
    if not rows:
        raise AppError("Sheet kosong dan tidak memiliki kolom.", code="EMPTY_SHEET")

    headers, _ = _normalize_sheet_rows(rows)
    col_names_req = [c.strip() for c in source_columns.split(",") if c.strip()]
    if not col_names_req:
        raise AppError("Pilih minimal satu kolom sumber.", code="NO_COLUMNS_SELECTED")

    col_indices: list[int] = []
    lower_headers = [h.lower() for h in headers]
    for name_req in col_names_req:
        if name_req.lower() in lower_headers:
            col_indices.append(lower_headers.index(name_req.lower()))
        else:
            raise AppError(
                f"Kolom '{name_req}' tidak ditemukan.",
                code="COLUMN_NOT_FOUND",
            )

    transformed_rows: list[list[tuple[Any, str | None]]] = []
    max_cols = len(headers)

    if mode == "merge":
        if len(col_indices) < 2:
            raise AppError("Pilih minimal 2 kolom untuk digabungkan.", code="NEED_TWO_COLUMNS")
        out_header_name = new_column_name.strip() or "Gabungan"
        transformed_rows.append([(h, None) for h in headers] + [(out_header_name, None)])
        for row in rows[1:]:
            padded = list(row) + [(None, None)] * max(0, max_cols - len(row))
            parts = [
                _format_cell_for_display(padded[idx][0]).strip()
                for idx in col_indices
                if _format_cell_for_display(padded[idx][0]).strip()
            ]
            merged_val = separator.join(parts)
            transformed_rows.append(padded[:max_cols] + [(merged_val, None)])
    elif mode == "split":
        split_idx = col_indices[0]
        split_sep = separator if separator else ","
        split_parts_list: list[list[str]] = []
        max_parts = 1
        for row in rows[1:]:
            padded = list(row) + [(None, None)] * max(0, max_cols - len(row))
            raw_txt = _format_cell_for_display(padded[split_idx][0])
            parts = [p.strip() for p in raw_txt.split(split_sep)] if raw_txt else []
            max_parts = max(max_parts, len(parts))
            split_parts_list.append(parts)

        base_name = new_column_name.strip() or headers[split_idx]
        extra_headers = [(f"{base_name}_{i + 1}", None) for i in range(max_parts)]
        transformed_rows.append([(h, None) for h in headers] + extra_headers)

        for r_idx, row in enumerate(rows[1:]):
            padded = list(row) + [(None, None)] * max(0, max_cols - len(row))
            parts = split_parts_list[r_idx]
            extra_cells = [
                (parts[i] if i < len(parts) else None, None)
                for i in range(max_parts)
            ]
            transformed_rows.append(padded[:max_cols] + extra_cells)
    else:
        raise AppError("Mode transformasi kolom tidak dikenal.", code="INVALID_MODE")

    updated_sheets = list(sheets)
    updated_sheets[target_idx_sheet] = (s_name, transformed_rows)
    stem = Path(sanitize_filename(filename)).stem or "data"

    if fmt == "csv":
        out_path = job_dir / f"{stem}_kolom.csv"
        buf = io.StringIO()
        writer = csv.writer(buf, lineterminator="\n")
        for row in transformed_rows:
            writer.writerow([_format_cell_for_display(v) for v, _ in row])
        out_path.write_bytes(buf.getvalue().encode("utf-8-sig"))
        return out_path, "text/csv", out_path.name, max(0, len(transformed_rows) - 1)

    out_path = job_dir / f"{stem}_kolom.xlsx"
    _write_sheets_to_xlsx(out_path, updated_sheets, style_header=True)
    return (
        out_path,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        out_path.name,
        max(0, len(transformed_rows) - 1),
    )


def summarize_spreadsheet(
    data: bytes,
    filename: str,
    *,
    sheet_name: str | None = None,
) -> SpreadsheetSummaryResponse:
    """Tool #66: Compute statistical summary (counts, min, max, mean, sum, top value) per column."""
    _, sheets = _read_tabular_sheets(data, filename)
    target = (
        next((s for s in sheets if s[0] == sheet_name), sheets[0])
        if sheet_name
        else sheets[0]
    )
    s_name, raw_rows = target
    if not raw_rows:
        return SpreadsheetSummaryResponse(
            filename=filename, sheet_name=s_name, row_count=0, col_count=0, columns=[]
        )

    headers, _ = _normalize_sheet_rows(raw_rows)
    body = raw_rows[1:]
    row_count = len(body)
    col_summaries: list[ColumnSummaryItem] = []

    for c_idx, col_name in enumerate(headers):
        non_empty_strs: list[str] = []
        nums: list[float] = []
        for row in body:
            raw_val = row[c_idx][0] if c_idx < len(row) else None
            if raw_val is None or raw_val == "":
                continue
            disp = _format_cell_for_display(raw_val)
            if not disp:
                continue
            non_empty_strs.append(disp)
            if isinstance(raw_val, (int, float)) and not isinstance(raw_val, bool):
                nums.append(float(raw_val))
            else:
                try:
                    # Only parse clean numeric strings that do not start with 0 like IDs/phones
                    if not (disp.startswith("0") and len(disp) > 1 and not disp.startswith("0.")):
                        nums.append(float(disp.replace(",", "")))
                except ValueError:
                    pass

        counter = Counter(non_empty_strs)
        top_val = counter.most_common(1)[0][0] if counter else None
        col_summaries.append(
            ColumnSummaryItem(
                column_name=col_name,
                total_rows=row_count,
                non_empty_count=len(non_empty_strs),
                empty_count=row_count - len(non_empty_strs),
                unique_count=len(counter),
                numeric_count=len(nums),
                min_value=round(min(nums), 4) if nums else None,
                max_value=round(max(nums), 4) if nums else None,
                sum_value=round(sum(nums), 4) if nums else None,
                mean_value=round(sum(nums) / len(nums), 4) if nums else None,
                top_value=top_val,
            )
        )

    return SpreadsheetSummaryResponse(
        filename=filename,
        sheet_name=s_name,
        row_count=row_count,
        col_count=len(headers),
        columns=col_summaries,
    )

