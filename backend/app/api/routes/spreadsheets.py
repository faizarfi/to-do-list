"""REST API endpoints for all 9 Excel & Data Tools."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.responses import FileResponse

from app.core.config import Settings, get_settings
from app.core.exceptions import AppError
from app.schemas.pdf import Orientation, PaperSize
from app.schemas.spreadsheet import (
    DuplicateKeepMode,
    SpreadsheetMergeMode,
    SpreadsheetSummaryResponse,
    SpreadsheetToJsonResponse,
    SpreadsheetViewResponse,
    TextCaseTransform,
)
from app.services import spreadsheet_extra_service, spreadsheet_service
from app.services.spreadsheet_service import (
    CSV_ONLY_EXTENSIONS,
    EXCEL_ONLY_EXTENSIONS,
    SPREADSHEET_ALLOWED_EXTENSIONS,
    SPREADSHEET_ALLOWED_MIMES,
)
from app.utils.file_security import (
    cleanup_job_dir,
    create_job_dir,
    read_and_validate_upload,
)
from app.utils.response_helpers import stream_result_and_cleanup

router = APIRouter(prefix="/spreadsheets", tags=["Excel & Data"])


async def _validate_upload(
    upload: UploadFile,
    extensions: set[str],
    settings: Settings,
) -> tuple[str, bytes]:
    return await read_and_validate_upload(
        upload,
        allowed_extensions=extensions,
        allowed_mime_types=SPREADSHEET_ALLOWED_MIMES,
        max_size_bytes=settings.max_upload_size_bytes,
    )


@router.post("/view", response_model=SpreadsheetViewResponse)
async def view_spreadsheet_endpoint(
    file: Annotated[UploadFile, File(...)],
    max_rows: Annotated[int, Form(ge=10, le=2000)] = 500,
    settings: Settings = Depends(get_settings),
) -> SpreadsheetViewResponse:
    """Tool #28: Inspect XLSX, XLS, or CSV contents cleanly."""
    name, data = await _validate_upload(file, SPREADSHEET_ALLOWED_EXTENSIONS, settings)
    return spreadsheet_service.view_spreadsheet(data, name, max_rows=max_rows)


@router.post("/excel-to-csv")
async def excel_to_csv_endpoint(
    file: Annotated[UploadFile, File(...)],
    sheet_name: Annotated[str | None, Form()] = None,
    all_sheets: Annotated[bool, Form()] = False,
    delimiter: Annotated[str, Form()] = ",",
    include_bom: Annotated[bool, Form()] = True,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #29: Convert Excel (.xlsx/.xls) to UTF-8 CSV (single or ZIP)."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_upload(file, EXCEL_ONLY_EXTENSIONS, settings)
        out_path, media_type, dl_name, count = spreadsheet_service.excel_to_csv(
            job_dir,
            data,
            name,
            sheet_name=sheet_name or None,
            all_sheets=all_sheets,
            delimiter=delimiter,
            include_bom=include_bom,
        )
        return stream_result_and_cleanup(
            out_path,
            download_name=dl_name,
            media_type=media_type,
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Output-Count": str(count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/csv-to-excel")
async def csv_to_excel_endpoint(
    file: Annotated[UploadFile, File(...)],
    delimiter: Annotated[str, Form()] = "auto",
    sheet_name: Annotated[str, Form()] = "Data",
    preserve_leading_zeros: Annotated[bool, Form()] = True,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #30: Convert CSV to a formatted .xlsx workbook."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_upload(file, CSV_ONLY_EXTENSIONS, settings)
        out_path, dl_name, row_count = spreadsheet_service.csv_to_excel(
            job_dir,
            data,
            name,
            delimiter=delimiter,
            sheet_name=sheet_name,
            preserve_leading_zeros=preserve_leading_zeros,
        )
        return stream_result_and_cleanup(
            out_path,
            download_name=dl_name,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Processed-Row-Count": str(row_count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/merge-excel")
async def merge_excel_endpoint(
    files: Annotated[list[UploadFile], File(...)],
    mode: Annotated[SpreadsheetMergeMode, Form()] = SpreadsheetMergeMode.SEPARATE_SHEETS,
    include_source_column: Annotated[bool, Form()] = False,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #31: Merge multiple Excel workbooks."""
    if len(files) < 2:
        raise AppError("Unggah minimal 2 file Excel untuk digabungkan.", code="MINIMUM_TWO_FILES")

    job_dir = create_job_dir(settings.temp_dir)
    try:
        validated = [await _validate_upload(item, EXCEL_ONLY_EXTENSIONS, settings) for item in files]
        out_path, dl_name, count = spreadsheet_service.merge_excel_workbooks(
            job_dir,
            validated,
            mode=mode,
            include_source_column=include_source_column,
        )
        return stream_result_and_cleanup(
            out_path,
            download_name=dl_name,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Output-Count": str(count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/merge-csv")
async def merge_csv_endpoint(
    files: Annotated[list[UploadFile], File(...)],
    input_delimiter: Annotated[str, Form()] = "auto",
    output_delimiter: Annotated[str, Form()] = ",",
    align_by_header: Annotated[bool, Form()] = True,
    include_source_column: Annotated[bool, Form()] = False,
    include_bom: Annotated[bool, Form()] = True,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #32: Merge multiple CSV files."""
    if len(files) < 2:
        raise AppError("Unggah minimal 2 file CSV untuk digabungkan.", code="MINIMUM_TWO_FILES")

    job_dir = create_job_dir(settings.temp_dir)
    try:
        validated = [await _validate_upload(item, CSV_ONLY_EXTENSIONS, settings) for item in files]
        out_path, dl_name, row_count = spreadsheet_service.merge_csv_files(
            job_dir,
            validated,
            input_delimiter=input_delimiter,
            output_delimiter=output_delimiter,
            align_by_header=align_by_header,
            include_source_column=include_source_column,
            include_bom=include_bom,
        )
        return stream_result_and_cleanup(
            out_path,
            download_name=dl_name,
            media_type="text/csv; charset=utf-8",
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Processed-Row-Count": str(row_count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/remove-duplicates")
async def remove_duplicates_endpoint(
    file: Annotated[UploadFile, File(...)],
    sheet_name: Annotated[str | None, Form()] = None,
    columns: Annotated[str | None, Form()] = None,
    keep: Annotated[DuplicateKeepMode, Form()] = DuplicateKeepMode.FIRST,
    case_sensitive: Annotated[bool, Form()] = True,
    trim_compare: Annotated[bool, Form()] = False,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #33: Remove duplicate rows from Excel or CSV."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_upload(file, SPREADSHEET_ALLOWED_EXTENSIONS, settings)
        out_path, media_type, dl_name, orig_rows, kept_rows = spreadsheet_service.remove_duplicates(
            job_dir,
            data,
            name,
            sheet_name=sheet_name or None,
            columns_spec=columns,
            keep=keep,
            case_sensitive=case_sensitive,
            trim_compare=trim_compare,
        )
        return stream_result_and_cleanup(
            out_path,
            download_name=dl_name,
            media_type=media_type,
            job_dir=job_dir,
            settings=settings,
            extra_headers={
                "X-Original-Row-Count": str(orig_rows),
                "X-Processed-Row-Count": str(kept_rows),
                "X-Removed-Count": str(max(0, orig_rows - kept_rows)),
            },
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/split-excel")
async def split_excel_endpoint(
    file: Annotated[UploadFile, File(...)],
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #34: Split an Excel workbook into individual .xlsx files per sheet."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_upload(file, EXCEL_ONLY_EXTENSIONS, settings)
        out_path, media_type, dl_name, count = spreadsheet_service.split_excel_by_sheets(
            job_dir, data, name
        )
        return stream_result_and_cleanup(
            out_path,
            download_name=dl_name,
            media_type=media_type,
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Output-Count": str(count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/clean")
async def data_cleaner_endpoint(
    file: Annotated[UploadFile, File(...)],
    trim_spaces: Annotated[bool, Form()] = True,
    text_case: Annotated[TextCaseTransform, Form()] = TextCaseTransform.NONE,
    drop_empty_rows: Annotated[bool, Form()] = True,
    drop_empty_columns: Annotated[bool, Form()] = False,
    fill_empty_with: Annotated[str, Form()] = "",
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #35: Clean whitespace, casing, and empty rows/columns."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_upload(file, SPREADSHEET_ALLOWED_EXTENSIONS, settings)
        out_path, media_type, dl_name, kept_rows = spreadsheet_service.clean_tabular_data(
            job_dir,
            data,
            name,
            trim_spaces=trim_spaces,
            text_case=text_case,
            drop_empty_rows=drop_empty_rows,
            drop_empty_columns=drop_empty_columns,
            fill_empty_with=fill_empty_with,
        )
        return stream_result_and_cleanup(
            out_path,
            download_name=dl_name,
            media_type=media_type,
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Processed-Row-Count": str(kept_rows)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/to-pdf-report")
async def excel_to_pdf_report_endpoint(
    file: Annotated[UploadFile, File(...)],
    sheet_name: Annotated[str | None, Form()] = None,
    paper_size: Annotated[PaperSize, Form()] = PaperSize.A4,
    orientation: Annotated[Orientation, Form()] = Orientation.LANDSCAPE,
    report_title: Annotated[str | None, Form()] = None,
    font_size: Annotated[int, Form(ge=6, le=12)] = 8,
    repeat_header: Annotated[bool, Form()] = True,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #36: Export an Excel or CSV table into a formatted PDF report."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_upload(file, SPREADSHEET_ALLOWED_EXTENSIONS, settings)
        out_path, dl_name, row_count = spreadsheet_service.excel_to_pdf_report(
            job_dir,
            data,
            name,
            sheet_name=sheet_name or None,
            paper_size=paper_size,
            orientation=orientation,
            report_title=report_title,
            font_size=font_size,
            repeat_header=repeat_header,
        )
        return stream_result_and_cleanup(
            out_path,
            download_name=dl_name,
            media_type="application/pdf",
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Processed-Row-Count": str(row_count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/json-to-excel")
async def json_to_excel_endpoint(
    json_text: Annotated[str | None, Form()] = None,
    file: Annotated[UploadFile | None, File()] = None,
    output_format: Annotated[str, Form()] = "xlsx",
    sheet_name: Annotated[str, Form()] = "Data",
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #62: Convert JSON array/object into Excel (.xlsx) or CSV."""
    raw_text = (json_text or "").strip()
    stem = "json-data"
    if file is not None and file.filename:
        _, raw_bytes = await read_and_validate_upload(
            file,
            allowed_extensions={".json"},
            allowed_mime_types={"application/json", "text/json", "text/plain"},
            max_size_bytes=settings.max_upload_size_bytes,
            verify_magic=False,
        )
        raw_text = raw_bytes.decode("utf-8-sig", errors="replace")
        stem = file.filename.rsplit(".", 1)[0] or "json-data"

    if not raw_text:
        raise AppError("Masukkan teks JSON atau unggah file .json.", code="EMPTY_JSON")

    job_dir = create_job_dir(settings.temp_dir)
    try:
        out_path, media_type, dl_name, row_count = (
            spreadsheet_extra_service.json_to_spreadsheet(
                job_dir,
                raw_text,
                output_format=output_format,
                sheet_name=sheet_name,
                filename_stem=stem,
            )
        )
        return stream_result_and_cleanup(
            out_path,
            download_name=dl_name,
            media_type=media_type,
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Processed-Row-Count": str(row_count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/to-json", response_model=SpreadsheetToJsonResponse)
async def spreadsheet_to_json_endpoint(
    file: Annotated[UploadFile, File(...)],
    sheet_name: Annotated[str | None, Form()] = None,
    pretty: Annotated[bool, Form()] = True,
    settings: Settings = Depends(get_settings),
) -> SpreadsheetToJsonResponse:
    """Tool #63: Export Excel/CSV rows as structured JSON."""
    name, data = await _validate_upload(file, SPREADSHEET_ALLOWED_EXTENSIONS, settings)
    return spreadsheet_extra_service.spreadsheet_to_json(
        data, name, sheet_name=sheet_name or None, pretty=pretty
    )


@router.post("/find-replace")
async def find_replace_endpoint(
    file: Annotated[UploadFile, File(...)],
    find_text: Annotated[str, Form(...)],
    replace_text: Annotated[str, Form()] = "",
    target_columns: Annotated[str | None, Form()] = None,
    sheet_name: Annotated[str | None, Form()] = None,
    case_sensitive: Annotated[bool, Form()] = False,
    exact_match: Annotated[bool, Form()] = False,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #64: Find and replace values across Excel/CSV cells."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_upload(file, SPREADSHEET_ALLOWED_EXTENSIONS, settings)
        out_path, media_type, dl_name, replaced_count = (
            spreadsheet_extra_service.find_replace_spreadsheet(
                job_dir,
                data,
                name,
                find_text=find_text,
                replace_text=replace_text,
                target_columns=target_columns,
                sheet_name=sheet_name or None,
                case_sensitive=case_sensitive,
                exact_match=exact_match,
            )
        )
        return stream_result_and_cleanup(
            out_path,
            download_name=dl_name,
            media_type=media_type,
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Removed-Count": str(replaced_count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/column-transform")
async def column_transform_endpoint(
    file: Annotated[UploadFile, File(...)],
    mode: Annotated[str, Form()] = "merge",
    source_columns: Annotated[str, Form(...)] = "",
    separator: Annotated[str, Form()] = " ",
    new_column_name: Annotated[str, Form()] = "Hasil_Kolom",
    sheet_name: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Tool #65: Merge multiple columns or split a column by delimiter."""
    job_dir = create_job_dir(settings.temp_dir)
    try:
        name, data = await _validate_upload(file, SPREADSHEET_ALLOWED_EXTENSIONS, settings)
        out_path, media_type, dl_name, row_count = (
            spreadsheet_extra_service.transform_spreadsheet_columns(
                job_dir,
                data,
                name,
                mode=mode,
                source_columns=source_columns,
                separator=separator,
                new_column_name=new_column_name,
                sheet_name=sheet_name or None,
            )
        )
        return stream_result_and_cleanup(
            out_path,
            download_name=dl_name,
            media_type=media_type,
            job_dir=job_dir,
            settings=settings,
            extra_headers={"X-Processed-Row-Count": str(row_count)},
        )
    except Exception:
        cleanup_job_dir(job_dir, settings.temp_dir)
        raise


@router.post("/summary", response_model=SpreadsheetSummaryResponse)
async def spreadsheet_summary_endpoint(
    file: Annotated[UploadFile, File(...)],
    sheet_name: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
) -> SpreadsheetSummaryResponse:
    """Tool #66: Compute column summary statistics for an Excel or CSV file."""
    name, data = await _validate_upload(file, SPREADSHEET_ALLOWED_EXTENSIONS, settings)
    return spreadsheet_extra_service.summarize_spreadsheet(
        data, name, sheet_name=sheet_name or None
    )

