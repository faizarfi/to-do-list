export type SpreadsheetMergeModeOption = "separate_sheets" | "append_rows";
export type DuplicateKeepOption = "first" | "last";
export type TextCaseOption = "none" | "lower" | "upper" | "title";

export interface SheetPreviewData {
  name: string;
  total_rows: number;
  total_cols: number;
  headers: string[];
  rows: string[][];
  truncated: boolean;
}

export interface SpreadsheetViewResponse {
  filename: string;
  file_size_bytes: number;
  format: string;
  sheets: SheetPreviewData[];
}

