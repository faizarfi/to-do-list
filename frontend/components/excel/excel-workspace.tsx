"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Loader2, Play, RotateCcw, Search } from "lucide-react";

import { ExcelExtraWorkspace } from "@/components/excel/excel-extra-workspace";
import {
  FileDropzone,
  type SelectedFileItem,
} from "@/components/shared/file-dropzone";
import { PdfResultPreview } from "@/components/shared/pdf-result-preview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  formatBytes,
  revokeJobResult,
  submitBinaryFileJob,
} from "@/lib/file-job-client";
import { viewSpreadsheetFile } from "@/lib/spreadsheet-api";
import { cn } from "@/lib/utils";
import type { OrientationOption, PaperSizeOption, PdfJobResult } from "@/types/pdf";
import type {
  DuplicateKeepOption,
  SpreadsheetMergeModeOption,
  SpreadsheetViewResponse,
  TextCaseOption,
} from "@/types/spreadsheet";
import type { ToolDefinition } from "@/types/tools";

interface ExcelWorkspaceProps {
  tool: ToolDefinition;
}

const EXCEL_ACCEPT =
  ".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel";
const EXCEL_EXTENSIONS = [".xlsx", ".xls"];

const CSV_ACCEPT = ".csv,text/csv,application/csv";
const CSV_EXTENSIONS = [".csv"];

const ALL_TABULAR_ACCEPT = `${EXCEL_ACCEPT},${CSV_ACCEPT}`;
const ALL_TABULAR_EXTENSIONS = [".xlsx", ".xls", ".csv"];

const EXTRA_EXCEL_IDS = new Set([
  "json-to-excel",
  "excel-to-json",
  "spreadsheet-find-replace",
  "spreadsheet-column-transform",
  "spreadsheet-summary",
]);

export function ExcelWorkspace({ tool }: ExcelWorkspaceProps) {
  if (EXTRA_EXCEL_IDS.has(tool.id)) {
    return <ExcelExtraWorkspace tool={tool} />;
  }
  return <CoreExcelWorkspace tool={tool} />;
}

function CoreExcelWorkspace({ tool }: ExcelWorkspaceProps) {
  const formId = useId();

  const [files, setFiles] = useState<SelectedFileItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [progressValue, setProgressValue] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<PdfJobResult | null>(null);

  // Viewer / Sheet inspection state
  const [viewData, setViewData] = useState<SpreadsheetViewResponse | null>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [activeSheetIdx, setActiveSheetIdx] = useState(0);
  const [tableSearch, setTableSearch] = useState("");

  // Tool options
  const [selectedSheet, setSelectedSheet] = useState("");
  const [allSheets, setAllSheets] = useState(false);
  const [delimiter, setDelimiter] = useState(",");
  const [csvInputDelimiter, setCsvInputDelimiter] = useState("auto");
  const [sheetNameInput, setSheetNameInput] = useState("Data");
  const [preserveLeadingZeros, setPreserveLeadingZeros] = useState(true);
  const [includeBom, setIncludeBom] = useState(true);

  const [mergeMode, setMergeMode] =
    useState<SpreadsheetMergeModeOption>("separate_sheets");
  const [alignByHeader, setAlignByHeader] = useState(true);
  const [includeSourceCol, setIncludeSourceCol] = useState(false);

  const [dedupeColumns, setDedupeColumns] = useState("");
  const [dedupeKeep, setDedupeKeep] = useState<DuplicateKeepOption>("first");
  const [caseSensitive, setCaseSensitive] = useState(true);
  const [trimCompare, setTrimCompare] = useState(false);

  const [trimSpaces, setTrimSpaces] = useState(true);
  const [textCase, setTextCase] = useState<TextCaseOption>("none");
  const [dropEmptyRows, setDropEmptyRows] = useState(true);
  const [dropEmptyCols, setDropEmptyCols] = useState(false);
  const [fillEmptyWith, setFillEmptyWith] = useState("");

  const [paperSize, setPaperSize] = useState<PaperSizeOption>("A4");
  const [orientation, setOrientation] =
    useState<OrientationOption>("landscape");
  const [reportTitle, setReportTitle] = useState("");
  const [reportFontSize, setReportFontSize] = useState(8);
  const [repeatHeader, setRepeatHeader] = useState(true);

  useEffect(() => {
    setFiles([]);
    setErrorMsg(null);
    setProgressValue(null);
    setViewData(null);
    setActiveSheetIdx(0);
    setTableSearch("");
    setSelectedSheet("");
    setAllSheets(false);
    setDedupeColumns("");
    setResult((prev) => {
      revokeJobResult(prev);
      return null;
    });
  }, [tool.id]);

  useEffect(() => {
    return () => {
      revokeJobResult(result);
    };
  }, [result]);

  async function inspectSpreadsheet(file: File) {
    setViewLoading(true);
    setErrorMsg(null);
    try {
      const data = await viewSpreadsheetFile(file, 500);
      setViewData(data);
      setActiveSheetIdx(0);
      setSelectedSheet(data.sheets[0]?.name ?? "");
    } catch (err) {
      setViewData(null);
      setErrorMsg(
        err instanceof Error ? err.message : "Gagal membaca spreadsheet."
      );
    } finally {
      setViewLoading(false);
    }
  }

  function handleFilesChange(nextFiles: SelectedFileItem[]) {
    setFiles(nextFiles);
    setErrorMsg(null);
    setResult((prev) => {
      revokeJobResult(prev);
      return null;
    });

    if (nextFiles.length === 0) {
      setViewData(null);
      setSelectedSheet("");
      return;
    }

    const shouldAutoInspect = new Set([
      "excel-viewer",
      "excel-to-csv",
      "remove-duplicate",
      "split-excel",
      "excel-to-pdf-report",
    ]).has(tool.id);

    if (shouldAutoInspect && nextFiles[0]) {
      void inspectSpreadsheet(nextFiles[0].file);
    }
  }

  function handleReset() {
    setFiles([]);
    setErrorMsg(null);
    setProgressValue(null);
    setViewData(null);
    setActiveSheetIdx(0);
    setTableSearch("");
    setSelectedSheet("");
    setResult((prev) => {
      revokeJobResult(prev);
      return null;
    });
  }

  const activeSheetData = viewData?.sheets[activeSheetIdx] ?? null;

  const filteredViewerRows = useMemo(() => {
    if (!activeSheetData) return [];
    const q = tableSearch.trim().toLowerCase();
    if (!q) return activeSheetData.rows;
    return activeSheetData.rows.filter((row) =>
      row.some((cell) => cell.toLowerCase().includes(q))
    );
  }, [activeSheetData, tableSearch]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMsg(null);

    if (files.length === 0) {
      setErrorMsg("Pilih minimal satu file terlebih dahulu.");
      return;
    }

    if (tool.id === "excel-viewer") {
      await inspectSpreadsheet(files[0].file);
      return;
    }

    if (
      (tool.id === "merge-excel" || tool.id === "merge-csv") &&
      files.length < 2
    ) {
      setErrorMsg("Unggah minimal 2 file untuk digabungkan.");
      return;
    }

    const endpoint = tool.apiEndpoint;
    if (!endpoint) {
      setErrorMsg("Endpoint backend tidak tersedia.");
      return;
    }

    const formData = new FormData();
    const isMulti = tool.id === "merge-excel" || tool.id === "merge-csv";
    if (isMulti) {
      for (const item of files) {
        formData.append("files", item.file);
      }
    } else {
      formData.append("file", files[0].file);
    }

    if (tool.id === "excel-to-csv") {
      if (selectedSheet && !allSheets) formData.append("sheet_name", selectedSheet);
      formData.append("all_sheets", String(allSheets));
      formData.append("delimiter", delimiter);
      formData.append("include_bom", String(includeBom));
    } else if (tool.id === "csv-to-excel") {
      formData.append("delimiter", csvInputDelimiter);
      formData.append("sheet_name", sheetNameInput);
      formData.append("preserve_leading_zeros", String(preserveLeadingZeros));
    } else if (tool.id === "merge-excel") {
      formData.append("mode", mergeMode);
      formData.append("include_source_column", String(includeSourceCol));
    } else if (tool.id === "merge-csv") {
      formData.append("input_delimiter", csvInputDelimiter);
      formData.append("output_delimiter", delimiter);
      formData.append("align_by_header", String(alignByHeader));
      formData.append("include_source_column", String(includeSourceCol));
      formData.append("include_bom", String(includeBom));
    } else if (tool.id === "remove-duplicate") {
      if (selectedSheet) formData.append("sheet_name", selectedSheet);
      if (dedupeColumns.trim()) formData.append("columns", dedupeColumns.trim());
      formData.append("keep", dedupeKeep);
      formData.append("case_sensitive", String(caseSensitive));
      formData.append("trim_compare", String(trimCompare));
    } else if (tool.id === "data-cleaner") {
      formData.append("trim_spaces", String(trimSpaces));
      formData.append("text_case", textCase);
      formData.append("drop_empty_rows", String(dropEmptyRows));
      formData.append("drop_empty_columns", String(dropEmptyCols));
      formData.append("fill_empty_with", fillEmptyWith);
    } else if (tool.id === "excel-to-pdf-report") {
      if (selectedSheet && !allSheets) formData.append("sheet_name", selectedSheet);
      formData.append("paper_size", paperSize);
      formData.append("orientation", orientation);
      if (reportTitle.trim()) formData.append("report_title", reportTitle.trim());
      formData.append("font_size", String(reportFontSize));
      formData.append("repeat_header", String(repeatHeader));
    }

    setSubmitting(true);
    setProgressValue(5);
    setResult((prev) => {
      revokeJobResult(prev);
      return null;
    });

    try {
      const jobRes = await submitBinaryFileJob(endpoint, formData, (pct) =>
        setProgressValue(pct)
      );
      setResult(jobRes);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Gagal memproses spreadsheet."
      );
    } finally {
      setSubmitting(false);
    }
  }

  const isCsvOnly = tool.id === "csv-to-excel" || tool.id === "merge-csv";
  const isExcelOnly =
    tool.id === "excel-to-csv" ||
    tool.id === "merge-excel" ||
    tool.id === "split-excel";

  const acceptAttr = isCsvOnly
    ? CSV_ACCEPT
    : isExcelOnly
      ? EXCEL_ACCEPT
      : ALL_TABULAR_ACCEPT;
  const allowedExt = isCsvOnly
    ? CSV_EXTENSIONS
    : isExcelOnly
      ? EXCEL_EXTENSIONS
      : ALL_TABULAR_EXTENSIONS;
  const isMulti = tool.id === "merge-excel" || tool.id === "merge-csv";

  return (
    <div className="space-y-5">
      <form
        aria-labelledby={`${formId}-heading`}
        onSubmit={handleSubmit}
        className="space-y-5"
      >
        <h2 id={`${formId}-heading`} className="visually-hidden">
          Formulir pemrosesan {tool.name}
        </h2>

        <FileDropzone
          label={
            isMulti
              ? "Pilih Beberapa File dari Komputer atau Seret ke Sini"
              : "Pilih File dari Komputer atau Seret ke Sini"
          }
          acceptAttr={acceptAttr}
          allowedExtensions={allowedExt}
          multiple={isMulti}
          reorderable={isMulti}
          files={files}
          onFilesChange={handleFilesChange}
        />

        {/* Sheet Preview for Split Excel */}
        {tool.id === "split-excel" && viewData && viewData.sheets.length > 0 && (
          <div className="space-y-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/40 p-4">
            <p className="text-xs font-medium text-[var(--text-primary)]">
              Sheet yang Terdeteksi ({viewData.sheets.length} file hasil di ZIP):
            </p>
            <div className="flex flex-wrap gap-1.5">
              {viewData.sheets.map((s) => (
                <Badge key={s.name} variant="secondary">
                  {s.name} ({s.total_rows} baris)
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Sheet Selector when Excel inspected */}
        {viewData &&
          viewData.sheets.length > 0 &&
          (tool.id === "excel-to-csv" ||
            tool.id === "remove-duplicate" ||
            tool.id === "excel-to-pdf-report") && (
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/40 p-4">
              <div className="flex-1 space-y-1">
                <label
                  htmlFor={`${formId}-sheet-sel`}
                  className="text-xs font-medium text-[var(--text-primary)]"
                >
                  Pilih Sheet
                </label>
                <select
                  id={`${formId}-sheet-sel`}
                  value={selectedSheet}
                  disabled={allSheets}
                  onChange={(e) => setSelectedSheet(e.target.value)}
                  className="min-h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-input)] px-3 py-1.5 text-sm disabled:opacity-50"
                >
                  {viewData.sheets.map((s) => (
                    <option key={s.name} value={s.name}>
                      {s.name} ({s.total_rows} baris × {s.total_cols} kolom)
                    </option>
                  ))}
                </select>
              </div>

              {(tool.id === "excel-to-csv" || tool.id === "excel-to-pdf-report") &&
                viewData.sheets.length > 1 && (
                  <label className="inline-flex cursor-pointer items-center gap-2 pt-4 text-xs font-medium">
                    <input
                      type="checkbox"
                      checked={allSheets}
                      onChange={(e) => setAllSheets(e.target.checked)}
                      className="h-4 w-4 cursor-pointer"
                    />
                    <span>Proses semua sheet ({viewData.sheets.length})</span>
                  </label>
                )}
            </div>
          )}

        {/* #29 Excel to CSV */}
        {tool.id === "excel-to-csv" && (
          <div className="grid grid-cols-1 gap-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/40 p-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor={`${formId}-delim`} className="text-xs font-medium">
                Pemisah Kolom (Delimiter)
              </label>
              <select
                id={`${formId}-delim`}
                value={delimiter}
                onChange={(e) => setDelimiter(e.target.value)}
                className="min-h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-input)] px-3 py-1.5 text-sm"
              >
                <option value=",">Koma (,)</option>
                <option value=";">Titik Koma (; — umum di Excel Indonesia)</option>
                <option value="\t">Tab (TSV)</option>
              </select>
            </div>
            <div className="flex items-center gap-2 pt-5">
              <input
                id={`${formId}-bom`}
                type="checkbox"
                checked={includeBom}
                onChange={(e) => setIncludeBom(e.target.checked)}
                className="h-4 w-4 cursor-pointer"
              />
              <label htmlFor={`${formId}-bom`} className="text-xs font-medium cursor-pointer">
                Sertakan UTF-8 BOM (agar karakter terbaca rapi di Excel Windows)
              </label>
            </div>
          </div>
        )}

        {/* #30 CSV to Excel */}
        {tool.id === "csv-to-excel" && (
          <div className="grid grid-cols-1 gap-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/40 p-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor={`${formId}-cdelim`} className="text-xs font-medium">
                Delimiter Sumber CSV
              </label>
              <select
                id={`${formId}-cdelim`}
                value={csvInputDelimiter}
                onChange={(e) => setCsvInputDelimiter(e.target.value)}
                className="min-h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-input)] px-3 py-1.5 text-sm"
              >
                <option value="auto">Deteksi Otomatis</option>
                <option value=",">Koma (,)</option>
                <option value=";">Titik Koma (;)</option>
                <option value="\t">Tab</option>
                <option value="|">Pipe (|)</option>
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor={`${formId}-sname`} className="text-xs font-medium">
                Nama Sheet Excel
              </label>
              <Input
                id={`${formId}-sname`}
                value={sheetNameInput}
                onChange={(e) => setSheetNameInput(e.target.value)}
              />
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium sm:col-span-2">
              <input
                type="checkbox"
                checked={preserveLeadingZeros}
                onChange={(e) => setPreserveLeadingZeros(e.target.checked)}
                className="h-4 w-4 cursor-pointer"
              />
              <span>
                Pertahankan angka nol di depan (contoh: nomor HP 0812... dan kode 001 tetap utuh)
              </span>
            </label>
          </div>
        )}

        {/* #31 Merge Excel */}
        {tool.id === "merge-excel" && (
          <div className="space-y-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/40 p-4">
            <fieldset className="space-y-2">
              <legend className="text-xs font-medium">Mode Penggabungan Workbook</legend>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["separate_sheets", "Sebagai Sheet Terpisah"],
                    ["append_rows", "Gabungkan Baris ke Satu Sheet"],
                  ] as [SpreadsheetMergeModeOption, string][]
                ).map(([val, lbl]) => (
                  <label
                    key={val}
                    className={cn(
                      "inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium",
                      mergeMode === val
                        ? "border-[var(--brand-primary)] bg-[var(--brand-subtle-bg)] text-[var(--brand-subtle-fg)]"
                        : "border-[var(--border-subtle)] bg-[var(--surface-card)]"
                    )}
                  >
                    <input
                      type="radio"
                      name={`${formId}-mmode`}
                      value={val}
                      checked={mergeMode === val}
                      onChange={() => setMergeMode(val)}
                    />
                    <span>{lbl}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            {mergeMode === "append_rows" && (
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium">
                <input
                  type="checkbox"
                  checked={includeSourceCol}
                  onChange={(e) => setIncludeSourceCol(e.target.checked)}
                  className="h-4 w-4 cursor-pointer"
                />
                <span>Tambahkan kolom Sumber_File untuk melacak asal baris</span>
              </label>
            )}
          </div>
        )}

        {/* #32 Merge CSV */}
        {tool.id === "merge-csv" && (
          <div className="grid grid-cols-1 gap-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/40 p-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor={`${formId}-mcin`} className="text-xs font-medium">
                Delimiter Input
              </label>
              <select
                id={`${formId}-mcin`}
                value={csvInputDelimiter}
                onChange={(e) => setCsvInputDelimiter(e.target.value)}
                className="min-h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-input)] px-3 py-1.5 text-sm"
              >
                <option value="auto">Deteksi Otomatis</option>
                <option value=",">Koma (,)</option>
                <option value=";">Titik Koma (;)</option>
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor={`${formId}-mcout`} className="text-xs font-medium">
                Delimiter Output
              </label>
              <select
                id={`${formId}-mcout`}
                value={delimiter}
                onChange={(e) => setDelimiter(e.target.value)}
                className="min-h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-input)] px-3 py-1.5 text-sm"
              >
                <option value=",">Koma (,)</option>
                <option value=";">Titik Koma (;)</option>
              </select>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium">
              <input
                type="checkbox"
                checked={alignByHeader}
                onChange={(e) => setAlignByHeader(e.target.checked)}
                className="h-4 w-4 cursor-pointer"
              />
              <span>Cocokkan kolom berdasarkan nama header</span>
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium">
              <input
                type="checkbox"
                checked={includeSourceCol}
                onChange={(e) => setIncludeSourceCol(e.target.checked)}
                className="h-4 w-4 cursor-pointer"
              />
              <span>Sertakan kolom Sumber_File</span>
            </label>
          </div>
        )}

        {/* #33 Remove Duplicate */}
        {tool.id === "remove-duplicate" && (
          <div className="space-y-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/40 p-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor={`${formId}-dcols`} className="text-xs font-medium">
                  Kolom Acuan Duplikat (opsional, kosongkan = cek seluruh kolom)
                </label>
                <Input
                  id={`${formId}-dcols`}
                  value={dedupeColumns}
                  onChange={(e) => setDedupeColumns(e.target.value)}
                  placeholder="Contoh: Email, Telepon atau klik kolom di bawah"
                />
                {viewData && (() => {
                  const targetSheet =
                    viewData.sheets.find((s) => s.name === selectedSheet) ??
                    viewData.sheets[0];
                  if (!targetSheet || targetSheet.headers.length === 0) return null;
                  const activeCols = new Set(
                    dedupeColumns
                      .split(",")
                      .map((c) => c.trim())
                      .filter(Boolean)
                  );
                  return (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="text-[11px] text-[var(--text-muted)]">
                        Pilih kolom:
                      </span>
                      {targetSheet.headers.map((header, idx) => {
                        const checked = activeCols.has(header);
                        return (
                          <button
                            key={`${header}-${idx}`}
                            type="button"
                            aria-pressed={checked}
                            onClick={() => {
                              const next = new Set(activeCols);
                              if (checked) next.delete(header);
                              else next.add(header);
                              setDedupeColumns(Array.from(next).join(", "));
                            }}
                            className={cn(
                              "rounded-md border px-2 py-0.5 text-[11px] font-medium cursor-pointer transition-colors",
                              checked
                                ? "border-[var(--brand-primary)] bg-[var(--brand-subtle-bg)] text-[var(--brand-subtle-fg)]"
                                : "border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
                            )}
                          >
                            {header}
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
              <fieldset className="space-y-1.5">
                <legend className="text-xs font-medium">Simpan Baris</legend>
                <div className="flex gap-2 pt-1">
                  {(
                    [
                      ["first", "Pertahankan Pertama"],
                      ["last", "Pertahankan Terakhir"],
                    ] as [DuplicateKeepOption, string][]
                  ).map(([val, lbl]) => (
                    <label
                      key={val}
                      className={cn(
                        "inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-xs",
                        dedupeKeep === val
                          ? "border-[var(--brand-primary)] bg-[var(--brand-subtle-bg)] font-medium"
                          : "border-[var(--border-subtle)] bg-[var(--surface-card)]"
                      )}
                    >
                      <input
                        type="radio"
                        name={`${formId}-dkeep`}
                        value={val}
                        checked={dedupeKeep === val}
                        onChange={() => setDedupeKeep(val)}
                      />
                      <span>{lbl}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium">
                <input
                  type="checkbox"
                  checked={!caseSensitive}
                  onChange={(e) => setCaseSensitive(!e.target.checked)}
                  className="h-4 w-4 cursor-pointer"
                />
                <span>Abaikan perbedaan huruf besar/kecil saat mengecek</span>
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium">
                <input
                  type="checkbox"
                  checked={trimCompare}
                  onChange={(e) => setTrimCompare(e.target.checked)}
                  className="h-4 w-4 cursor-pointer"
                />
                <span>Abaikan spasi berlebih saat mengecek</span>
              </label>
            </div>
          </div>
        )}

        {/* #35 Data Cleaner */}
        {tool.id === "data-cleaner" && (
          <div className="grid grid-cols-1 gap-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/40 p-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor={`${formId}-dcase`} className="text-xs font-medium">
                Standardisasi Kapitalisasi Teks
              </label>
              <select
                id={`${formId}-dcase`}
                value={textCase}
                onChange={(e) => setTextCase(e.target.value as TextCaseOption)}
                className="min-h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-input)] px-3 py-1.5 text-sm"
              >
                <option value="none">Jangan ubah huruf</option>
                <option value="title">Title Case (Contoh: Budi Santoso)</option>
                <option value="upper">UPPERCASE (HURUF BESAR)</option>
                <option value="lower">lowercase (huruf kecil)</option>
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor={`${formId}-dfill`} className="text-xs font-medium">
                Isi Sel Kosong Dengan (opsional)
              </label>
              <Input
                id={`${formId}-dfill`}
                value={fillEmptyWith}
                onChange={(e) => setFillEmptyWith(e.target.value)}
                placeholder="Biarkan kosong atau ketik misal: -"
              />
            </div>
            <div className="flex flex-wrap gap-4 sm:col-span-2">
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium">
                <input
                  type="checkbox"
                  checked={trimSpaces}
                  onChange={(e) => setTrimSpaces(e.target.checked)}
                  className="h-4 w-4 cursor-pointer"
                />
                <span>Bersihkan spasi berlebih</span>
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium">
                <input
                  type="checkbox"
                  checked={dropEmptyRows}
                  onChange={(e) => setDropEmptyRows(e.target.checked)}
                  className="h-4 w-4 cursor-pointer"
                />
                <span>Hapus baris kosong</span>
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium">
                <input
                  type="checkbox"
                  checked={dropEmptyCols}
                  onChange={(e) => setDropEmptyCols(e.target.checked)}
                  className="h-4 w-4 cursor-pointer"
                />
                <span>Hapus kolom kosong</span>
              </label>
            </div>
          </div>
        )}

        {/* #36 Excel to PDF Report */}
        {tool.id === "excel-to-pdf-report" && (
          <div className="grid grid-cols-1 gap-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/40 p-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor={`${formId}-rtitle`} className="text-xs font-medium">
                Judul Laporan (opsional)
              </label>
              <Input
                id={`${formId}-rtitle`}
                value={reportTitle}
                onChange={(e) => setReportTitle(e.target.value)}
                placeholder="Contoh: Laporan Keuangan Bulanan"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor={`${formId}-rpaper`} className="text-xs font-medium">
                Ukuran Kertas
              </label>
              <select
                id={`${formId}-rpaper`}
                value={paperSize}
                onChange={(e) => setPaperSize(e.target.value as PaperSizeOption)}
                className="min-h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-input)] px-3 py-1.5 text-sm"
              >
                <option value="A4">A4</option>
                <option value="A3">A3 (Tabel Lebar)</option>
                <option value="Letter">Letter</option>
                <option value="Legal">Legal</option>
              </select>
            </div>
            <fieldset className="space-y-1.5">
              <legend className="text-xs font-medium">Orientasi Kertas</legend>
              <div className="flex gap-2 pt-1">
                {(
                  [
                    ["landscape", "Landscape (Melebar)"],
                    ["portrait", "Portrait (Berdiri)"],
                  ] as [OrientationOption, string][]
                ).map(([val, lbl]) => (
                  <label
                    key={val}
                    className={cn(
                      "inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-xs",
                      orientation === val
                        ? "border-[var(--brand-primary)] bg-[var(--brand-subtle-bg)] font-medium"
                        : "border-[var(--border-subtle)] bg-[var(--surface-card)]"
                    )}
                  >
                    <input
                      type="radio"
                      name={`${formId}-rori`}
                      value={val}
                      checked={orientation === val}
                      onChange={() => setOrientation(val)}
                    />
                    <span>{lbl}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="space-y-1">
              <label htmlFor={`${formId}-rfont`} className="text-xs font-medium">
                Ukuran Huruf Tabel: <span className="font-mono">{reportFontSize} pt</span>
              </label>
              <input
                id={`${formId}-rfont`}
                type="range"
                min={6}
                max={12}
                value={reportFontSize}
                onChange={(e) => setReportFontSize(Number(e.target.value))}
                className="w-full cursor-pointer"
              />
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium sm:col-span-2">
              <input
                type="checkbox"
                checked={repeatHeader}
                onChange={(e) => setRepeatHeader(e.target.checked)}
                className="h-4 w-4 cursor-pointer"
              />
              <span>Ulangi baris header kolom di setiap halaman PDF baru</span>
            </label>
          </div>
        )}

        {(submitting || viewLoading) && (
          <div className="space-y-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-4">
            <div className="flex items-center gap-2 text-xs font-medium">
              <Loader2 className="h-4 w-4 animate-spin text-[var(--brand-primary)]" aria-hidden="true" />
              <span>Memproses data spreadsheet...</span>
            </div>
            <Progress
              value={progressValue === null ? undefined : progressValue}
              max={100}
              label="Progres pemrosesan data"
            />
          </div>
        )}

        {errorMsg && (
          <div
            role="alert"
            className="rounded-xl border border-[var(--danger-bg)]/35 bg-[var(--danger-bg)]/10 px-4 py-3 text-sm font-medium text-[var(--danger-bg)]"
          >
            {errorMsg}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={submitting || viewLoading}>
            {submitting || viewLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Play className="h-4 w-4" aria-hidden="true" />
            )}
            <span>
              {tool.id === "excel-viewer"
                ? "Muat Pratinjau Tabel"
                : submitting
                  ? "Sedang Memproses..."
                  : `Jalankan ${tool.name}`}
            </span>
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleReset}
            disabled={submitting || viewLoading}
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            <span>Reset</span>
          </Button>
        </div>
      </form>

      {/* #28 Interactive Excel Viewer Table */}
      {tool.id === "excel-viewer" && viewData && activeSheetData && (
        <div className="space-y-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="default">{viewData.format}</Badge>
              <span className="text-xs font-medium text-[var(--text-primary)]">
                {viewData.filename} ({formatBytes(viewData.file_size_bytes)})
              </span>
              <span className="font-mono text-xs text-[var(--text-muted)]">
                {activeSheetData.total_rows} baris × {activeSheetData.total_cols} kolom
              </span>
            </div>

            <div className="relative w-full sm:w-64">
              <label htmlFor={`${formId}-tbl-search`} className="visually-hidden">
                Cari data di dalam tabel
              </label>
              <Search
                className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]"
                aria-hidden="true"
              />
              <input
                id={`${formId}-tbl-search`}
                type="search"
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                placeholder="Cari baris di sheet ini..."
                className="min-h-8 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] py-1 pr-3 pl-8 text-xs"
              />
            </div>
          </div>

          {viewData.sheets.length > 1 && (
            <div className="flex flex-wrap gap-1.5 border-b border-[var(--border-subtle)] pb-2">
              {viewData.sheets.map((s, idx) => (
                <button
                  key={s.name}
                  type="button"
                  onClick={() => {
                    setActiveSheetIdx(idx);
                    setTableSearch("");
                  }}
                  className={cn(
                    "rounded-lg px-3 py-1 text-xs font-medium cursor-pointer",
                    idx === activeSheetIdx
                      ? "bg-[var(--brand-primary)] text-[var(--brand-primary-fg)]"
                      : "bg-[var(--surface-muted)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
                  )}
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}

          <div
            tabIndex={0}
            role="region"
            aria-labelledby={`${formId}-viewer-cap`}
            className="max-h-[460px] overflow-auto rounded-lg border border-[var(--border-subtle)]"
          >
            <table className="w-full border-collapse text-left text-xs">
              <caption id={`${formId}-viewer-cap`} className="visually-hidden">
                Isi sheet {activeSheetData.name} dari {viewData.filename}
              </caption>
              <thead className="sticky top-0 z-10 border-b border-[var(--border-subtle)] bg-[var(--surface-muted)]">
                <tr>
                  <th scope="col" className="px-3 py-2 font-mono text-[var(--text-muted)]">
                    #
                  </th>
                  {activeSheetData.headers.map((header, hIdx) => (
                    <th
                      key={hIdx}
                      scope="col"
                      className="whitespace-nowrap px-3 py-2 font-semibold text-[var(--text-primary)]"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {filteredViewerRows.map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-[var(--surface-muted)]/50">
                    <th
                      scope="row"
                      className="px-3 py-2 font-mono text-[var(--text-muted)]"
                    >
                      {rIdx + 1}
                    </th>
                    {row.map((cell, cIdx) => (
                      <td
                        key={cIdx}
                        className="max-w-[260px] truncate whitespace-nowrap px-3 py-2 font-mono text-[var(--text-primary)]"
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {activeSheetData.truncated && (
            <p className="text-xs text-[var(--text-muted)]">
              Menampilkan 500 baris pertama dari total {activeSheetData.total_rows} baris untuk menjaga performa browser.
            </p>
          )}
        </div>
      )}

      {result && <PdfResultPreview result={result} onReset={handleReset} />}
    </div>
  );
}

