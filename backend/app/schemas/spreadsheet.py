"""Pydantic schemas and enums for Excel & Data Tools endpoints."""

from __future__ import annotations

from enum import Enum
from pydantic import BaseModel, Field


class SpreadsheetMergeMode(str, Enum):
    """Workbook merge strategies."""

    SEPARATE_SHEETS = "separate_sheets"
    APPEND_ROWS = "append_rows"


class DuplicateKeepMode(str, Enum):
    """Which duplicate occurrence to keep."""

    FIRST = "first"
    LAST = "last"


class TextCaseTransform(str, Enum):
    """Text casing cleanups applied only to string cells."""

    NONE = "none"
    LOWER = "lower"
    UPPER = "upper"
    TITLE = "title"


class SheetPreviewData(BaseModel):
    """Tabular preview for a single worksheet or CSV file."""

    name: str
    total_rows: int = Field(ge=0)
    total_cols: int = Field(ge=0)
    headers: list[str]
    rows: list[list[str]]
    truncated: bool = False


class SpreadsheetViewResponse(BaseModel):
    """Response returned by POST /api/spreadsheets/view."""

    filename: str
    file_size_bytes: int
    format: str
    sheets: list[SheetPreviewData]


class ColumnSummaryItem(BaseModel):
    """Statistical summary for one spreadsheet column."""

    column_name: str
    total_rows: int
    non_empty_count: int
    empty_count: int
    unique_count: int
    numeric_count: int
    min_value: float | None = None
    max_value: float | None = None
    sum_value: float | None = None
    mean_value: float | None = None
    top_value: str | None = None


class SpreadsheetSummaryResponse(BaseModel):
    """Response returned by POST /api/spreadsheets/summary."""

    filename: str
    sheet_name: str
    row_count: int
    col_count: int
    columns: list[ColumnSummaryItem]


class SpreadsheetToJsonResponse(BaseModel):
    """Response returned by POST /api/spreadsheets/to-json."""

    filename: str
    sheet_name: str
    row_count: int
    json_text: str

