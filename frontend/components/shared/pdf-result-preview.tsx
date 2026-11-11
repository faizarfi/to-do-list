"use client";
/* eslint-disable @next/next/no-img-element */

import { CheckCircle2, Download, FileArchive, FileText, RotateCcw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBytes } from "@/lib/pdf-api";
import type { PdfJobResult } from "@/types/pdf";

interface PdfResultPreviewProps {
  result: PdfJobResult;
  onReset: () => void;
}

export function PdfResultPreview({ result, onReset }: PdfResultPreviewProps) {
  const savingsPct =
    result.originalSize && result.processedSize && result.originalSize > 0
      ? Math.round(
          ((result.originalSize - result.processedSize) / result.originalSize) * 100
        )
      : null;

  const isSinglePdf = result.mimeType === "application/pdf";
  const isBrowserRenderableImage =
    result.mimeType === "image/jpeg" ||
    result.mimeType === "image/png" ||
    result.mimeType === "image/webp" ||
    result.mimeType === "image/svg+xml";
  const hasCsvPreview = Boolean(
    result.mimeType === "text/csv" &&
      result.csvPreviewRows &&
      result.csvPreviewRows.length > 0
  );
  const isSingleNonPreviewableFile =
    !isSinglePdf &&
    !isBrowserRenderableImage &&
    !hasCsvPreview &&
    result.mimeType !== "application/zip";
  const isZip = result.mimeType === "application/zip";

  return (
    <Card className="border-[var(--brand-subtle-border)]">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] bg-[var(--brand-subtle-bg)]/50">
        <div className="flex items-center gap-2.5">
          <CheckCircle2
            className="h-5 w-5 shrink-0 text-[var(--brand-primary)]"
            aria-hidden="true"
          />
          <div>
            <CardTitle className="text-base">
              Pemrosesan Berhasil — Siap Diunduh
            </CardTitle>
            <div
              role="status"
              aria-live="polite"
              className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]"
            >
              <span className="font-medium text-[var(--text-primary)]">
                {result.filename}
              </span>
              <Badge variant="secondary">{formatBytes(result.sizeBytes)}</Badge>
              {result.pageCount !== null && (
                <Badge variant="default">{result.pageCount} halaman</Badge>
              )}
              {result.outputCount !== null && (
                <Badge variant="default">{result.outputCount} file hasil</Badge>
              )}
              {result.imageWidth != null && result.imageHeight != null && (
                <Badge variant="default">
                  {result.imageWidth} × {result.imageHeight} px
                </Badge>
              )}
              {result.removedCount != null && (
                <Badge variant="success">
                  {result.removedCount} duplikat dihapus
                </Badge>
              )}
              {result.processedRowCount != null && (
                <Badge variant="default">
                  {result.processedRowCount} baris hasil
                </Badge>
              )}
              {savingsPct !== null && (
                <Badge variant="success">
                  {savingsPct > 0 ? `Hemat ${savingsPct}%` : "Ukuran optimal"}
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href={result.objectUrl}
            download={result.filename}
            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-sm font-medium text-[var(--brand-primary-fg)] hover:bg-[var(--brand-primary-hover)]"
          >
            {isZip ? (
              <FileArchive className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Download className="h-4 w-4" aria-hidden="true" />
            )}
            <span>{isZip ? "Download Semua (ZIP)" : "Download Hasil"}</span>
          </a>

          <Button type="button" variant="outline" onClick={onReset}>
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            <span>Reset</span>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-5">
        {/* OCR text preview when present */}
        {result.ocrPreview && (
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-4">
            <p className="text-xs font-semibold tracking-wider text-[var(--text-secondary)] uppercase">
              Pratinjau Teks Terbaca (OCR)
            </p>
            <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap font-sans text-xs text-[var(--text-primary)]">
              {result.ocrPreview}
            </pre>
          </div>
        )}

        {/* Single PDF inline preview */}
        {isSinglePdf && (
          <div className="overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]">
            <iframe
              title={`Pratinjau dokumen ${result.filename}`}
              src={result.objectUrl}
              className="h-[480px] w-full"
            />
          </div>
        )}

        {/* Single Image inline preview */}
        {isBrowserRenderableImage && (
          <div className="flex justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-4">
            <img
              src={result.objectUrl}
              alt={`Pratinjau ${result.filename}`}
              className="max-h-[420px] rounded-lg object-contain shadow-xs"
            />
          </div>
        )}

        {/* Single CSV inline table preview */}
        {hasCsvPreview && result.csvPreviewRows && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-[var(--text-secondary)]">
              Pratinjau CSV ({result.csvPreviewRows.length} baris pertama):
            </p>
            <div
              tabIndex={0}
              role="region"
              aria-label={`Pratinjau tabel CSV ${result.filename}`}
              className="max-h-72 overflow-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)]"
            >
              <table className="w-full border-collapse text-left text-xs">
                <thead className="sticky top-0 border-b border-[var(--border-subtle)] bg-[var(--surface-muted)]">
                  <tr>
                    {result.csvPreviewRows[0].map((col, idx) => (
                      <th key={idx} scope="col" className="whitespace-nowrap px-3 py-2 font-semibold">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {result.csvPreviewRows.slice(1).map((row, rIdx) => (
                    <tr key={rIdx}>
                      {row.map((cell, cIdx) => (
                        <td key={cIdx} className="whitespace-nowrap px-3 py-1.5 font-mono">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Non-previewable single output (e.g. TIFF, XLSX) */}
        {isSingleNonPreviewableFile && (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-8 text-center">
            <FileText className="h-10 w-10 text-[var(--brand-primary)]" aria-hidden="true" />
            <p className="text-sm font-medium text-[var(--text-primary)]">
              {result.filename} ({formatBytes(result.sizeBytes)})
            </p>
            <p className="text-xs text-[var(--text-secondary)]">
              Format file ini tidak dirender langsung oleh browser. Klik tombol Download Hasil di atas untuk menyimpannya.
            </p>
          </div>
        )}

        {/* Multi-file ZIP contents: individual previews & individual downloads */}
        {isZip && result.extractedFiles.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-medium text-[var(--text-secondary)]">
              Pratinjau &amp; Download Satuan ({result.extractedFiles.length} file di dalam ZIP):
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {result.extractedFiles.map((item) => {
                const isImg =
                  item.mimeType === "image/jpeg" ||
                  item.mimeType === "image/png" ||
                  item.mimeType === "image/webp" ||
                  item.mimeType === "image/svg+xml";
                return (
                  <div
                    key={item.name}
                    className="flex flex-col justify-between gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3"
                  >
                    {isImg ? (
                      <img
                        src={item.objectUrl}
                        alt={`Pratinjau ${item.name}`}
                        className="h-40 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] object-contain"
                      />
                    ) : (
                      <div className="flex h-24 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] text-[var(--brand-primary)]">
                        <FileText className="h-8 w-8" aria-hidden="true" />
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-[var(--text-primary)]">
                          {item.name}
                        </p>
                        <p className="font-mono text-[11px] text-[var(--text-muted)]">
                          {formatBytes(item.sizeBytes)}
                        </p>
                      </div>
                      <a
                        href={item.objectUrl}
                        download={item.name}
                        aria-label={`Download ${item.name}`}
                        className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-2.5 py-1 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--brand-subtle-bg)]"
                      >
                        <Download className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Unduh</span>
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
