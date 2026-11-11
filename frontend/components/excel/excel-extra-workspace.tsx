"use client";

import { useEffect, useId, useState } from "react";
import { Check, Copy, Download, Loader2, Play, RotateCcw } from "lucide-react";

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
  fetchSpreadsheetSummary,
  spreadsheetToJson,
  type SpreadsheetSummaryResult,
} from "@/lib/extra-api";
import { revokeJobResult, submitBinaryFileJob } from "@/lib/file-job-client";
import { viewSpreadsheetFile } from "@/lib/spreadsheet-api";
import { cn } from "@/lib/utils";
import type { PdfJobResult } from "@/types/pdf";
import type { SpreadsheetViewResponse } from "@/types/spreadsheet";
import type { ToolDefinition } from "@/types/tools";

const TABULAR_ACCEPT =
  ".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv";
const TABULAR_EXTENSIONS = [".xlsx", ".xls", ".csv"];

const SAMPLE_JSON = `[
  { "kode": "001", "nama": "Laptop Kerja", "kategori": "Elektronik", "harga": 12500000 },
  { "kode": "002", "nama": "Kursi Ergonomis", "kategori": "Furnitur", "harga": 2850000 }
]`;

export function ExcelExtraWorkspace({ tool }: { tool: ToolDefinition }) {
  const formId = useId();
  const [files, setFiles] = useState<SelectedFileItem[]>([]);
  const [viewData, setViewData] = useState<SpreadsheetViewResponse | null>(null);
  const [selectedSheet, setSelectedSheet] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [progressValue, setProgressValue] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<PdfJobResult | null>(null);

  // #62 JSON to Excel
  const [jsonText, setJsonText] = useState(SAMPLE_JSON);
  const [jsonOutFmt, setJsonOutFmt] = useState<"xlsx" | "csv">("xlsx");
  const [jsonSheetName, setJsonSheetName] = useState("Data");

  // #63 Excel to JSON
  const [jsonOutput, setJsonOutput] = useState<{
    filename: string;
    sheet_name: string;
    row_count: number;
    json_text: string;
  } | null>(null);
  const [copiedJson, setCopiedJson] = useState(false);

  // #64 Find & Replace
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [targetColumns, setTargetColumns] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [exactMatch, setExactMatch] = useState(false);

  // #65 Column Transform
  const [colMode, setColMode] = useState<"merge" | "split">("merge");
  const [sourceCols, setSourceCols] = useState("");
  const [colSeparator, setColSeparator] = useState(" ");
  const [newColName, setNewColName] = useState("Kolom_Baru");

  // #66 Summary Stats
  const [summaryData, setSummaryData] = useState<SpreadsheetSummaryResult | null>(null);

  useEffect(() => {
    setFiles([]);
    setViewData(null);
    setSelectedSheet("");
    setErrorMsg(null);
    setJsonOutput(null);
    setSummaryData(null);
    setSourceCols("");
    setTargetColumns("");
    setResult((prev) => {
      revokeJobResult(prev);
      return null;
    });
  }, [tool.id]);

  useEffect(() => {
    return () => revokeJobResult(result);
  }, [result]);

  async function inspectFile(file: File) {
    try {
      const info = await viewSpreadsheetFile(file, 20);
      setViewData(info);
      setSelectedSheet(info.sheets[0]?.name ?? "");
    } catch {
      setViewData(null);
    }
  }

  function handleReset() {
    setFiles([]);
    setViewData(null);
    setSelectedSheet("");
    setErrorMsg(null);
    setJsonOutput(null);
    setSummaryData(null);
    setResult((prev) => {
      revokeJobResult(prev);
      return null;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    if (tool.id === "json-to-excel") {
      if (!jsonText.trim() && files.length === 0) {
        setErrorMsg("Tempel data JSON atau unggah file .json.");
        return;
      }
      const fd = new FormData();
      if (files[0]) fd.append("file", files[0].file);
      else fd.append("json_text", jsonText);
      fd.append("output_format", jsonOutFmt);
      fd.append("sheet_name", jsonSheetName);

      setSubmitting(true);
      try {
        const res = await submitBinaryFileJob(
          "/api/spreadsheets/json-to-excel",
          fd,
          (pct) => setProgressValue(pct)
        );
        setResult((prev) => {
          revokeJobResult(prev);
          return res;
        });
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Gagal mengonversi JSON.");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (files.length === 0) {
      setErrorMsg("Pilih file Excel (.xlsx/.xls) atau CSV terlebih dahulu.");
      return;
    }

    if (tool.id === "excel-to-json") {
      setSubmitting(true);
      try {
        const res = await spreadsheetToJson(files[0].file, selectedSheet || undefined, true);
        setJsonOutput(res);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Gagal mengekspor JSON.");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (tool.id === "spreadsheet-summary") {
      setSubmitting(true);
      try {
        const res = await fetchSpreadsheetSummary(files[0].file, selectedSheet || undefined);
        setSummaryData(res);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Gagal menghitung statistik.");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const fd = new FormData();
    fd.append("file", files[0].file);
    if (selectedSheet) fd.append("sheet_name", selectedSheet);

    if (tool.id === "spreadsheet-find-replace") {
      if (!findText) {
        setErrorMsg("Masukkan teks yang ingin dicari.");
        return;
      }
      fd.append("find_text", findText);
      fd.append("replace_text", replaceText);
      if (targetColumns.trim()) fd.append("target_columns", targetColumns.trim());
      fd.append("case_sensitive", String(caseSensitive));
      fd.append("exact_match", String(exactMatch));
    } else if (tool.id === "spreadsheet-column-transform") {
      if (!sourceCols.trim()) {
        setErrorMsg("Pilih minimal satu kolom sumber.");
        return;
      }
      fd.append("mode", colMode);
      fd.append("source_columns", sourceCols.trim());
      fd.append("separator", colSeparator);
      fd.append("new_column_name", newColName);
    }

    setSubmitting(true);
    setProgressValue(10);
    try {
      const res = await submitBinaryFileJob(
        tool.apiEndpoint || "/api/spreadsheets/find-replace",
        fd,
        (pct) => setProgressValue(pct)
      );
      setResult((prev) => {
        revokeJobResult(prev);
        return res;
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Gagal memproses spreadsheet.");
    } finally {
      setSubmitting(false);
    }
  }

  const activeSheet =
    viewData?.sheets.find((s) => s.name === selectedSheet) ?? viewData?.sheets[0];

  return (
    <div className="space-y-5">
      <form onSubmit={handleSubmit} className="space-y-4">
        {tool.id === "json-to-excel" ? (
          <div className="space-y-4">
            <FileDropzone
              label="Unggah File .JSON (opsional — atau tempel JSON di bawah)"
              acceptAttr=".json,application/json"
              allowedExtensions={[".json"]}
              files={files}
              onFilesChange={(next) => setFiles(next)}
            />

            <div className="space-y-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/40 p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label htmlFor={`${formId}-jfmt`} className="text-xs font-medium">
                    Format Output
                  </label>
                  <select
                    id={`${formId}-jfmt`}
                    value={jsonOutFmt}
                    onChange={(e) => setJsonOutFmt(e.target.value as "xlsx" | "csv")}
                    className="min-h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-input)] px-3 py-1.5 text-sm"
                  >
                    <option value="xlsx">Excel (.XLSX)</option>
                    <option value="csv">CSV (.CSV)</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label htmlFor={`${formId}-jsheet`} className="text-xs font-medium">
                    Nama Sheet (khusus XLSX)
                  </label>
                  <Input
                    id={`${formId}-jsheet`}
                    value={jsonSheetName}
                    onChange={(e) => setJsonSheetName(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label htmlFor={`${formId}-jraw`} className="text-xs font-medium">
                  Tempel Array Objek JSON
                </label>
                <textarea
                  id={`${formId}-jraw`}
                  rows={8}
                  value={jsonText}
                  onChange={(e) => setJsonText(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border-default)] bg-[var(--surface-input)] p-3 font-mono text-xs"
                />
              </div>
            </div>
          </div>
        ) : (
          <FileDropzone
            label="Pilih File Excel (.XLSX/.XLS) atau CSV"
            acceptAttr={TABULAR_ACCEPT}
            allowedExtensions={TABULAR_EXTENSIONS}
            files={files}
            onFilesChange={(next) => {
              setFiles(next);
              setErrorMsg(null);
              setJsonOutput(null);
              setSummaryData(null);
              if (next[0]) void inspectFile(next[0].file);
            }}
          />
        )}

        {viewData && viewData.sheets.length > 1 && tool.id !== "json-to-excel" && (
          <div className="space-y-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/40 p-4">
            <label htmlFor={`${formId}-sh`} className="text-xs font-medium">
              Pilih Sheet
            </label>
            <select
              id={`${formId}-sh`}
              value={selectedSheet}
              onChange={(e) => setSelectedSheet(e.target.value)}
              className="min-h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-input)] px-3 py-1.5 text-sm"
            >
              {viewData.sheets.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name} ({s.total_rows} baris)
                </option>
              ))}
            </select>
          </div>
        )}

        {tool.id === "spreadsheet-find-replace" && (
          <div className="space-y-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/40 p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label htmlFor={`${formId}-fr-f`} className="text-xs font-medium">
                  Cari Teks
                </label>
                <Input
                  id={`${formId}-fr-f`}
                  value={findText}
                  onChange={(e) => setFindText(e.target.value)}
                  placeholder="Contoh: JKT"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor={`${formId}-fr-r`} className="text-xs font-medium">
                  Ganti Dengan
                </label>
                <Input
                  id={`${formId}-fr-r`}
                  value={replaceText}
                  onChange={(e) => setReplaceText(e.target.value)}
                  placeholder="Contoh: Jakarta"
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <label htmlFor={`${formId}-fr-c`} className="text-xs font-medium">
                  Batasi Kolom Tertentu (opsional, kosongkan = semua kolom)
                </label>
                <Input
                  id={`${formId}-fr-c`}
                  value={targetColumns}
                  onChange={(e) => setTargetColumns(e.target.value)}
                  placeholder="Klik chip kolom di bawah atau ketik..."
                />
                {activeSheet && activeSheet.headers.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {activeSheet.headers.map((h, i) => (
                      <button
                        key={`${h}-${i}`}
                        type="button"
                        onClick={() => {
                          const set = new Set(targetColumns.split(",").map((x) => x.trim()).filter(Boolean));
                          if (set.has(h)) set.delete(h);
                          else set.add(h);
                          setTargetColumns(Array.from(set).join(", "));
                        }}
                        className={cn(
                          "rounded border px-2 py-0.5 text-[11px] cursor-pointer",
                          targetColumns.split(",").map((x) => x.trim()).includes(h)
                            ? "border-[var(--brand-primary)] bg-[var(--brand-subtle-bg)] font-medium"
                            : "border-[var(--border-subtle)] bg-[var(--surface-card)]"
                        )}
                      >
                        {h}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs">
                <input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} className="h-4 w-4" />
                <span>Cocokkan huruf besar/kecil (Case Sensitive)</span>
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs">
                <input type="checkbox" checked={exactMatch} onChange={(e) => setExactMatch(e.target.checked)} className="h-4 w-4" />
                <span>Cocokkan seluruh isi sel (Exact Match)</span>
              </label>
            </div>
          </div>
        )}

        {tool.id === "spreadsheet-column-transform" && (
          <div className="space-y-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/40 p-4">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["merge", "Gabungkan Beberapa Kolom"],
                  ["split", "Pisahkan 1 Kolom dengan Pemisah"],
                ] as const
              ).map(([val, lbl]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setColMode(val)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-xs font-medium cursor-pointer",
                    colMode === val
                      ? "border-[var(--brand-primary)] bg-[var(--brand-subtle-bg)] text-[var(--brand-subtle-fg)]"
                      : "border-[var(--border-subtle)] bg-[var(--surface-card)]"
                  )}
                >
                  {lbl}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1 sm:col-span-3">
                <label htmlFor={`${formId}-ct-src`} className="text-xs font-medium">
                  {colMode === "merge" ? "Kolom yang Digabungkan (minimal 2, pisahkan koma)" : "Nama 1 Kolom yang Akan Dipecah"}
                </label>
                <Input
                  id={`${formId}-ct-src`}
                  value={sourceCols}
                  onChange={(e) => setSourceCols(e.target.value)}
                  placeholder="Klik chip kolom di bawah..."
                />
                {activeSheet && activeSheet.headers.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {activeSheet.headers.map((h, i) => (
                      <button
                        key={`${h}-${i}`}
                        type="button"
                        onClick={() => {
                          if (colMode === "split") {
                            setSourceCols(h);
                            return;
                          }
                          const set = new Set(sourceCols.split(",").map((x) => x.trim()).filter(Boolean));
                          if (set.has(h)) set.delete(h);
                          else set.add(h);
                          setSourceCols(Array.from(set).join(", "));
                        }}
                        className="rounded border border-[var(--border-subtle)] bg-[var(--surface-card)] px-2 py-0.5 text-[11px] hover:border-[var(--brand-primary)] cursor-pointer"
                      >
                        {h}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <label htmlFor={`${formId}-ct-sep`} className="text-xs font-medium">
                  {colMode === "merge" ? "Pemisah Gabungan" : "Delimiter Pemecah"}
                </label>
                <Input id={`${formId}-ct-sep`} value={colSeparator} onChange={(e) => setColSeparator(e.target.value)} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <label htmlFor={`${formId}-ct-new`} className="text-xs font-medium">
                  Nama Kolom Hasil
                </label>
                <Input id={`${formId}-ct-new`} value={newColName} onChange={(e) => setNewColName(e.target.value)} />
              </div>
            </div>
          </div>
        )}

        {submitting && (
          <div className="space-y-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-4">
            <div className="flex items-center gap-2 text-xs font-medium">
              <Loader2 className="h-4 w-4 animate-spin text-[var(--brand-primary)]" aria-hidden="true" />
              <span>Memproses spreadsheet...</span>
            </div>
            <Progress value={progressValue ?? undefined} max={100} label="Progres spreadsheet" />
          </div>
        )}

        {errorMsg && (
          <div role="alert" className="rounded-xl border border-[var(--danger-bg)]/35 bg-[var(--danger-bg)]/10 px-4 py-3 text-sm font-medium text-[var(--danger-bg)]">
            {errorMsg}
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
            <span>{submitting ? "Memproses..." : `Jalankan ${tool.name}`}</span>
          </Button>
          <Button type="button" variant="outline" onClick={handleReset} disabled={submitting}>
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            <span>Reset</span>
          </Button>
        </div>
      </form>

      {jsonOutput && (
        <div className="space-y-3 rounded-xl border border-[var(--brand-subtle-border)] bg-[var(--surface-card)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="default">Sheet: {jsonOutput.sheet_name}</Badge>
              <Badge variant="secondary">{jsonOutput.row_count} objek</Badge>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={async () => {
                  await navigator.clipboard.writeText(jsonOutput.json_text);
                  setCopiedJson(true);
                  window.setTimeout(() => setCopiedJson(false), 1500);
                }}
              >
                {copiedJson ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
                <span>{copiedJson ? "Tersalin!" : "Salin JSON"}</span>
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  const blob = new Blob([jsonOutput.json_text], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `${jsonOutput.filename.replace(/\.[^.]+$/, "")}.json`;
                  a.click();
                  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
                }}
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Unduh .JSON</span>
              </Button>
            </div>
          </div>
          <pre className="max-h-96 overflow-y-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-3 font-mono text-xs">
            {jsonOutput.json_text}
          </pre>
        </div>
      )}

      {summaryData && (
        <div className="space-y-3 rounded-xl border border-[var(--brand-subtle-border)] bg-[var(--surface-card)] p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="default">Sheet: {summaryData.sheet_name}</Badge>
            <Badge variant="secondary">{summaryData.row_count} baris × {summaryData.col_count} kolom</Badge>
          </div>
          <div tabIndex={0} role="region" aria-label="Tabel ringkasan statistik kolom" className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="border-b border-[var(--border-subtle)] bg-[var(--surface-muted)]">
                <tr>
                  <th scope="col" className="px-3 py-2">Kolom</th>
                  <th scope="col" className="px-3 py-2">Terisi</th>
                  <th scope="col" className="px-3 py-2">Kosong</th>
                  <th scope="col" className="px-3 py-2">Unik</th>
                  <th scope="col" className="px-3 py-2">Min</th>
                  <th scope="col" className="px-3 py-2">Max</th>
                  <th scope="col" className="px-3 py-2">Rata-rata</th>
                  <th scope="col" className="px-3 py-2">Total (Sum)</th>
                  <th scope="col" className="px-3 py-2">Tersering</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)] font-mono">
                {summaryData.columns.map((c) => (
                  <tr key={c.column_name}>
                    <th scope="row" className="px-3 py-2 font-sans font-semibold">{c.column_name}</th>
                    <td className="px-3 py-2">{c.non_empty_count}</td>
                    <td className="px-3 py-2">{c.empty_count}</td>
                    <td className="px-3 py-2">{c.unique_count}</td>
                    <td className="px-3 py-2">{c.min_value ?? "—"}</td>
                    <td className="px-3 py-2">{c.max_value ?? "—"}</td>
                    <td className="px-3 py-2">{c.mean_value ?? "—"}</td>
                    <td className="px-3 py-2">{c.sum_value ?? "—"}</td>
                    <td className="max-w-[160px] truncate px-3 py-2 font-sans">{c.top_value ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {result && <PdfResultPreview result={result} onReset={handleReset} />}
    </div>
  );
}

