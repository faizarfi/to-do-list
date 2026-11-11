"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useId, useState } from "react";
import {
  AlertTriangle,
  KeyRound,
  Loader2,
  Play,
  RotateCcw,
} from "lucide-react";

import { PdfExtraWorkspace } from "@/components/pdf/pdf-extra-workspace";
import { PdfPageGrid } from "@/components/pdf/pdf-page-grid";
import {
  FileDropzone,
  type SelectedFileItem,
} from "@/components/shared/file-dropzone";
import { PdfResultPreview } from "@/components/shared/pdf-result-preview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  inspectPdfFile,
  revokePdfJobResult,
  submitPdfJob,
} from "@/lib/pdf-api";
import { cn } from "@/lib/utils";
import type {
  CompressionLevelOption,
  FitModeOption,
  OrientationOption,
  PageNumberPositionOption,
  PaperSizeOption,
  PdfInspectResponse,
  PdfJobResult,
  SplitModeOption,
  WatermarkPositionOption,
  WatermarkTypeOption,
} from "@/types/pdf";
import type { BackendHealthResponse, ToolDefinition } from "@/types/tools";

interface PdfWorkspaceProps {
  tool: ToolDefinition;
  health: BackendHealthResponse | null;
}

const IMAGE_ACCEPT = ".jpg,.jpeg,.png,.webp,.tif,.tiff,image/jpeg,image/png,image/webp,image/tiff";
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff"];
const PDF_ACCEPT = ".pdf,application/pdf";
const PDF_EXTENSIONS = [".pdf"];

const TOOLS_NEEDING_INSPECT = new Set([
  "split-pdf",
  "rotate-pdf",
  "reorder-pdf",
  "delete-pdf-pages",
  "extract-pdf-pages",
]);

function formatSelectedPagesList(pages: number[]): string {
  return [...pages].sort((a, b) => a - b).join(", ");
}

const EXTRA_PDF_IDS = new Set([
  "extract-text-pdf",
  "protect-pdf",
  "unlock-pdf",
  "pdf-metadata-editor",
  "markdown-to-pdf",
]);

export function PdfWorkspace({ tool, health }: PdfWorkspaceProps) {
  if (EXTRA_PDF_IDS.has(tool.id)) {
    return <PdfExtraWorkspace tool={tool} />;
  }
  return <CorePdfWorkspace tool={tool} health={health} />;
}

function CorePdfWorkspace({ tool, health }: PdfWorkspaceProps) {
  const formId = useId();

  // Shared upload & job state
  const [files, setFiles] = useState<SelectedFileItem[]>([]);
  const [watermarkImageFiles, setWatermarkImageFiles] = useState<SelectedFileItem[]>([]);
  const [password, setPassword] = useState("");
  const [showPasswordField, setShowPasswordField] = useState(false);

  const [inspectData, setInspectData] = useState<PdfInspectResponse | null>(null);
  const [inspectLoading, setInspectLoading] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [progressValue, setProgressValue] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<PdfJobResult | null>(null);

  // Tool #1, #2, #14: Paper & Layout settings
  const [paperSize, setPaperSize] = useState<PaperSizeOption>("A4");
  const [customWidthMm, setCustomWidthMm] = useState(210);
  const [customHeightMm, setCustomHeightMm] = useState(297);
  const [orientation, setOrientation] = useState<OrientationOption>(
    tool.id === "resize-pdf" ? "auto" : "portrait"
  );
  const [marginMm, setMarginMm] = useState(10);
  const [fitMode, setFitMode] = useState<FitModeOption>("fit");
  const [imageQuality, setImageQuality] = useState(85);

  // Tool #3, #4: PDF to Image settings
  const [dpi, setDpi] = useState(150);
  const [transparentPng, setTransparentPng] = useState(false);
  const [pagesSpec, setPagesSpec] = useState("");

  // Tool #6: Split PDF
  const [splitMode, setSplitMode] = useState<SplitModeOption>("ranges");
  const [splitRanges, setSplitRanges] = useState("1-1");
  const [everyN, setEveryN] = useState(1);

  // Tool #7: Compress PDF
  const [compressLevel, setCompressLevel] =
    useState<CompressionLevelOption>("medium");

  // Tool #8: Rotate PDF
  const [pageRotations, setPageRotations] = useState<Record<number, number>>({});

  // Tool #9: Reorder PDF
  const [pageOrder, setPageOrder] = useState<number[]>([]);

  // Tool #10 & #11: Selected page numbers
  const [selectedPages, setSelectedPages] = useState<number[]>([]);

  // Tool #12: Watermark PDF
  const [watermarkType, setWatermarkType] = useState<WatermarkTypeOption>("text");
  const [watermarkText, setWatermarkText] = useState("RAHASIA");
  const [watermarkFontSize, setWatermarkFontSize] = useState(36);
  const [watermarkColor, setWatermarkColor] = useState("#0D7A68");
  const [watermarkOpacity, setWatermarkOpacity] = useState(0.25);
  const [watermarkRotation, setWatermarkRotation] = useState(35);
  const [watermarkPosition, setWatermarkPosition] =
    useState<WatermarkPositionOption>("center");
  const [watermarkScale, setWatermarkScale] = useState(0.35);

  // Tool #13: Page Number PDF
  const [pageNumPosition, setPageNumPosition] =
    useState<PageNumberPositionOption>("bottom_center");
  const [pageNumTemplate, setPageNumTemplate] = useState(
    "Halaman {page} dari {total}"
  );
  const [startNumber, setStartNumber] = useState(1);
  const [skipFirstPage, setSkipFirstPage] = useState(false);
  const [pageNumFontSize, setPageNumFontSize] = useState(11);
  const [pageNumColor, setPageNumColor] = useState("#334155");

  // Tool #15: OCR PDF
  const [ocrLanguage, setOcrLanguage] = useState("ind+eng");
  const [ocrDpi, setOcrDpi] = useState(200);

  // Reset workspace cleanly when switching tools
  useEffect(() => {
    setFiles([]);
    setWatermarkImageFiles([]);
    setPassword("");
    setShowPasswordField(false);
    setInspectData(null);
    setErrorMsg(null);
    setProgressValue(null);
    setPageRotations({});
    setPageOrder([]);
    setSelectedPages([]);
    setPagesSpec("");
    setOrientation(tool.id === "resize-pdf" ? "auto" : "portrait");
    setResult((prev) => {
      revokePdfJobResult(prev);
      return null;
    });
  }, [tool.id]);

  // Revoke object URLs on unmount
  useEffect(() => {
    return () => {
      revokePdfJobResult(result);
    };
  }, [result]);

  async function runInspect(file: File, pwd?: string) {
    setInspectLoading(true);
    setErrorMsg(null);
    try {
      const info = await inspectPdfFile(file, pwd);
      setInspectData(info);
      setPageOrder(info.pages.map((p) => p.page_number));
      setPageRotations({});
      setSelectedPages([]);
      if (info.page_count >= 2) {
        setSplitRanges(`1-${Math.ceil(info.page_count / 2)}, ${Math.ceil(info.page_count / 2) + 1}-${info.page_count}`);
      } else {
        setSplitRanges("1");
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Gagal memuat pratinjau PDF.";
      setInspectData(null);
      setErrorMsg(message);
      if (message.toLowerCase().includes("password")) {
        setShowPasswordField(true);
      }
    } finally {
      setInspectLoading(false);
    }
  }

  function handleFilesChange(nextFiles: SelectedFileItem[]) {
    setFiles(nextFiles);
    setErrorMsg(null);
    setResult((prev) => {
      revokePdfJobResult(prev);
      return null;
    });

    if (nextFiles.length === 0) {
      setInspectData(null);
      setPageOrder([]);
      setPageRotations({});
      setSelectedPages([]);
      return;
    }

    if (TOOLS_NEEDING_INSPECT.has(tool.id) && nextFiles[0]) {
      void runInspect(nextFiles[0].file, password || undefined);
    }
  }

  function handleResetAll() {
    setFiles([]);
    setWatermarkImageFiles([]);
    setPassword("");
    setInspectData(null);
    setErrorMsg(null);
    setProgressValue(null);
    setPageRotations({});
    setPageOrder([]);
    setSelectedPages([]);
    setPagesSpec("");
    setResult((prev) => {
      revokePdfJobResult(prev);
      return null;
    });
  }

  function handleToggleSelectPage(pageNum: number) {
    setSelectedPages((prev) => {
      const next = prev.includes(pageNum)
        ? prev.filter((p) => p !== pageNum)
        : [...prev, pageNum].sort((a, b) => a - b);
      setPagesSpec(formatSelectedPagesList(next));
      return next;
    });
  }

  function handleRotateSinglePage(pageNum: number) {
    setPageRotations((prev) => ({
      ...prev,
      [pageNum]: ((prev[pageNum] ?? 0) + 90) % 360,
    }));
  }

  function handleRotateAllPages(delta: number) {
    if (!inspectData) return;
    setPageRotations((prev) => {
      const next: Record<number, number> = { ...prev };
      for (const page of inspectData.pages) {
        next[page.page_number] = ((next[page.page_number] ?? 0) + delta) % 360;
      }
      return next;
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMsg(null);

    if (files.length === 0) {
      setErrorMsg("Unggah minimal satu file terlebih dahulu.");
      return;
    }
    if (tool.id === "merge-pdf" && files.length < 2) {
      setErrorMsg("Merge PDF membutuhkan minimal 2 file PDF.");
      return;
    }

    const endpoint = tool.apiEndpoint;
    if (!endpoint) {
      setErrorMsg("Endpoint backend untuk tool ini tidak tersedia.");
      return;
    }

    const formData = new FormData();

    if (tool.id === "jpg-png-to-pdf" || tool.id === "merge-pdf") {
      for (const item of files) {
        formData.append("files", item.file);
      }
    } else {
      formData.append("file", files[0].file);
    }

    if (password.trim()) {
      formData.append("password", password.trim());
    }

    // Tool-specific payload fields
    if (
      tool.id === "jpg-png-to-pdf" ||
      tool.id === "image-to-pdf" ||
      tool.id === "resize-pdf"
    ) {
      formData.append("paper_size", paperSize);
      formData.append("custom_width_mm", String(customWidthMm));
      formData.append("custom_height_mm", String(customHeightMm));
      formData.append("orientation", orientation);
      formData.append("margin_mm", String(marginMm));
      formData.append("fit_mode", fitMode);
      if (tool.id !== "resize-pdf") {
        formData.append("quality", String(imageQuality));
      }
    } else if (tool.id === "pdf-to-jpg") {
      formData.append("dpi", String(dpi));
      formData.append("quality", String(imageQuality));
      if (pagesSpec.trim()) formData.append("pages", pagesSpec.trim());
    } else if (tool.id === "pdf-to-png") {
      formData.append("dpi", String(dpi));
      formData.append("transparent", String(transparentPng));
      if (pagesSpec.trim()) formData.append("pages", pagesSpec.trim());
    } else if (tool.id === "split-pdf") {
      formData.append("mode", splitMode);
      if (splitMode === "ranges") formData.append("ranges", splitRanges);
      if (splitMode === "every_n") formData.append("every_n", String(everyN));
    } else if (tool.id === "compress-pdf") {
      formData.append("level", compressLevel);
    } else if (tool.id === "rotate-pdf") {
      const nonZero = Object.fromEntries(
        Object.entries(pageRotations).filter(([, rot]) => rot % 360 !== 0)
      );
      if (Object.keys(nonZero).length === 0) {
        setErrorMsg("Putar minimal satu halaman sebelum memproses PDF.");
        return;
      }
      formData.append("page_rotations_json", JSON.stringify(nonZero));
    } else if (tool.id === "reorder-pdf") {
      if (pageOrder.length === 0) {
        setErrorMsg("Urutan halaman belum siap.");
        return;
      }
      formData.append("order_json", JSON.stringify(pageOrder));
    } else if (
      tool.id === "delete-pdf-pages" ||
      tool.id === "extract-pdf-pages"
    ) {
      if (!pagesSpec.trim()) {
        setErrorMsg("Pilih atau ketik nomor halaman yang ingin diproses.");
        return;
      }
      formData.append("pages", pagesSpec.trim());
    } else if (tool.id === "watermark-pdf") {
      formData.append("watermark_type", watermarkType);
      formData.append("text", watermarkText);
      formData.append("font_size", String(watermarkFontSize));
      formData.append("color_hex", watermarkColor);
      formData.append("opacity", String(watermarkOpacity));
      formData.append("rotation", String(watermarkRotation));
      formData.append("position", watermarkPosition);
      formData.append("image_scale", String(watermarkScale));
      if (pagesSpec.trim()) formData.append("pages", pagesSpec.trim());
      if (watermarkType === "image") {
        if (watermarkImageFiles.length === 0) {
          setErrorMsg("Unggah file gambar/logo untuk watermark.");
          return;
        }
        formData.append("watermark_image", watermarkImageFiles[0].file);
      }
    } else if (tool.id === "page-number-pdf") {
      formData.append("position", pageNumPosition);
      formData.append("format_template", pageNumTemplate);
      formData.append("start_number", String(startNumber));
      formData.append("skip_first_page", String(skipFirstPage));
      formData.append("font_size", String(pageNumFontSize));
      formData.append("margin_mm", String(marginMm));
      formData.append("color_hex", pageNumColor);
    } else if (tool.id === "ocr-pdf") {
      formData.append("language", ocrLanguage);
      formData.append("dpi", String(ocrDpi));
    }

    setSubmitting(true);
    setProgressValue(5);
    setResult((prev) => {
      revokePdfJobResult(prev);
      return null;
    });

    try {
      const jobResult = await submitPdfJob(endpoint, formData, (pct) =>
        setProgressValue(pct)
      );
      setResult(jobResult);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Gagal memproses file PDF.";
      setErrorMsg(message);
      if (message.toLowerCase().includes("password")) {
        setShowPasswordField(true);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const isImageInputTool =
    tool.id === "jpg-png-to-pdf" || tool.id === "image-to-pdf";
  const isMultiFile =
    tool.id === "jpg-png-to-pdf" || tool.id === "merge-pdf";
  const tesseractEngine = health?.engines.find(
    (e) => e.name === "Tesseract OCR Binary"
  );

  // Live preview URL for the first uploaded image in Image -> PDF tools
  const [firstImageUrl, setFirstImageUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!isImageInputTool || files.length === 0) {
      setFirstImageUrl(null);
      return;
    }
    const url = URL.createObjectURL(files[0].file);
    setFirstImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [isImageInputTool, files]);

  const previewDimensions = (() => {
    const baseMm: Record<PaperSizeOption, [number, number]> = {
      A4: [210, 297],
      A3: [297, 420],
      Letter: [215.9, 279.4],
      Legal: [215.9, 355.6],
      Custom: [Math.max(20, customWidthMm), Math.max(20, customHeightMm)],
    };
    let [w, h] = baseMm[paperSize];
    if (orientation === "landscape" && w < h) [w, h] = [h, w];
    if (orientation === "portrait" && w > h) [w, h] = [h, w];
    return { w, h };
  })();

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

        {/* OCR Tesseract availability banner */}
        {tool.id === "ocr-pdf" && tesseractEngine && !tesseractEngine.available && (
          <div
            role="status"
            className="flex items-start gap-3 rounded-xl border border-[var(--warning-border)] bg-[var(--warning-bg)] p-4 text-xs text-[var(--warning-fg)]"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div className="space-y-1">
              <p className="font-semibold">
                Tesseract OCR Binary belum terpasang di server ini
              </p>
              <p>
                Untuk menjalankan OCR PDF pada mesin lokal, instal Tesseract OCR lalu tambahkan ke <code>PATH</code> atau atur <code>RUANGKERJA_TESSERACT_CMD</code> di <code>backend/.env</code> (lihat panduan di <code>README.md</code>).
              </p>
            </div>
          </div>
        )}

        {/* File Dropzone */}
        <FileDropzone
          label={
            isImageInputTool
              ? isMultiFile
                ? "Pilih atau Seret Gambar (Urutkan Sesuai Keinginan)"
                : "Pilih atau Seret 1 Gambar"
              : isMultiFile
                ? "Pilih atau Seret Beberapa File PDF (Minimal 2)"
                : "Pilih atau Seret File PDF"
          }
          acceptAttr={isImageInputTool ? IMAGE_ACCEPT : PDF_ACCEPT}
          allowedExtensions={isImageInputTool ? IMAGE_EXTENSIONS : PDF_EXTENSIONS}
          multiple={isMultiFile}
          reorderable={isMultiFile}
          showImageThumbnails={isImageInputTool}
          files={files}
          onFilesChange={handleFilesChange}
        />

        {/* Optional Authorized PDF Password */}
        {!isImageInputTool && (
          <div className="space-y-2">
            {!showPasswordField ? (
              <button
                type="button"
                onClick={() => setShowPasswordField(true)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--brand-primary)] cursor-pointer"
              >
                <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Dokumen memiliki password? Masukkan password yang sah</span>
              </button>
            ) : (
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/60 p-3 space-y-2">
                <label
                  htmlFor={`${formId}-pdf-password`}
                  className="text-xs font-medium text-[var(--text-primary)]"
                >
                  Password Dokumen PDF (hanya untuk dokumen yang Anda miliki izinnya)
                </label>
                <div className="flex gap-2">
                  <Input
                    id={`${formId}-pdf-password`}
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Masukkan password PDF..."
                  />
                  {TOOLS_NEEDING_INSPECT.has(tool.id) && files[0] && (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => void runInspect(files[0].file, password)}
                    >
                      Buka Pratinjau
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Inspect loading state */}
        {inspectLoading && (
          <div className="flex items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-4 text-xs text-[var(--text-secondary)]">
            <Loader2 className="h-4 w-4 animate-spin text-[var(--brand-primary)]" aria-hidden="true" />
            <span>Memuat pratinjau halaman PDF...</span>
          </div>
        )}

        {/* Visual PDF Page Grid for Tools #6, #8, #9, #10, #11 */}
        {inspectData && tool.id === "split-pdf" && (
          <PdfPageGrid inspectData={inspectData} mode="preview" />
        )}
        {inspectData && tool.id === "rotate-pdf" && (
          <PdfPageGrid
            inspectData={inspectData}
            mode="rotate"
            pageRotations={pageRotations}
            onRotatePage={handleRotateSinglePage}
            onRotateAll={handleRotateAllPages}
            onResetRotations={() => setPageRotations({})}
          />
        )}
        {inspectData && tool.id === "reorder-pdf" && (
          <PdfPageGrid
            inspectData={inspectData}
            mode="reorder"
            pageOrder={pageOrder}
            onOrderChange={setPageOrder}
            onResetOrder={() =>
              setPageOrder(inspectData.pages.map((p) => p.page_number))
            }
          />
        )}
        {inspectData &&
          (tool.id === "delete-pdf-pages" || tool.id === "extract-pdf-pages") && (
            <PdfPageGrid
              inspectData={inspectData}
              mode="select"
              selectionIntent={tool.id === "delete-pdf-pages" ? "delete" : "extract"}
              selectedPages={selectedPages}
              onToggleSelectPage={handleToggleSelectPage}
            />
          )}

        {/* Tool-specific Settings Panels */}
        {(tool.id === "jpg-png-to-pdf" ||
          tool.id === "image-to-pdf" ||
          tool.id === "resize-pdf") && (
          <div className="grid grid-cols-1 gap-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/40 p-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <label
                htmlFor={`${formId}-paper-size`}
                className="text-xs font-medium text-[var(--text-primary)]"
              >
                Ukuran Kertas
              </label>
              <select
                id={`${formId}-paper-size`}
                value={paperSize}
                onChange={(e) => setPaperSize(e.target.value as PaperSizeOption)}
                className="min-h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-input)] px-3 py-1.5 text-sm text-[var(--text-primary)]"
              >
                <option value="A4">A4 (210 × 297 mm)</option>
                <option value="A3">A3 (297 × 420 mm)</option>
                <option value="Letter">Letter (215.9 × 279.4 mm)</option>
                <option value="Legal">Legal (215.9 × 355.6 mm)</option>
                <option value="Custom">Ukuran Custom (mm)</option>
              </select>
            </div>

            <fieldset className="space-y-1.5">
              <legend className="text-xs font-medium text-[var(--text-primary)]">
                Orientasi Halaman
              </legend>
              <div className="flex flex-wrap gap-2 pt-1">
                {(
                  [
                    ["portrait", "Portrait"],
                    ["landscape", "Landscape"],
                    ...(tool.id === "resize-pdf" ? [["auto", "Otomatis"]] : []),
                  ] as [OrientationOption, string][]
                ).map(([val, lbl]) => (
                  <label
                    key={val}
                    className={cn(
                      "inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium",
                      orientation === val
                        ? "border-[var(--brand-primary)] bg-[var(--brand-subtle-bg)] text-[var(--brand-subtle-fg)]"
                        : "border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-secondary)]"
                    )}
                  >
                    <input
                      type="radio"
                      name={`${formId}-orientation`}
                      value={val}
                      checked={orientation === val}
                      onChange={() => setOrientation(val)}
                    />
                    <span>{lbl}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            {paperSize === "Custom" && (
              <>
                <div className="space-y-1.5">
                  <label
                    htmlFor={`${formId}-custom-w`}
                    className="text-xs font-medium text-[var(--text-primary)]"
                  >
                    Lebar Custom (mm)
                  </label>
                  <Input
                    id={`${formId}-custom-w`}
                    type="number"
                    min={20}
                    max={2000}
                    value={customWidthMm}
                    onChange={(e) => setCustomWidthMm(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-1.5">
                  <label
                    htmlFor={`${formId}-custom-h`}
                    className="text-xs font-medium text-[var(--text-primary)]"
                  >
                    Tinggi Custom (mm)
                  </label>
                  <Input
                    id={`${formId}-custom-h`}
                    type="number"
                    min={20}
                    max={2000}
                    value={customHeightMm}
                    onChange={(e) => setCustomHeightMm(Number(e.target.value))}
                  />
                </div>
              </>
            )}

            <fieldset className="space-y-1.5">
              <legend className="text-xs font-medium text-[var(--text-primary)]">
                Penyesuaian Isi (Fit / Fill)
              </legend>
              <div className="flex gap-2 pt-1">
                {(
                  [
                    ["fit", "Fit to Page (Utuh)"],
                    ["fill", "Fill Page (Penuh)"],
                  ] as [FitModeOption, string][]
                ).map(([val, lbl]) => (
                  <label
                    key={val}
                    className={cn(
                      "inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium",
                      fitMode === val
                        ? "border-[var(--brand-primary)] bg-[var(--brand-subtle-bg)] text-[var(--brand-subtle-fg)]"
                        : "border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-secondary)]"
                    )}
                  >
                    <input
                      type="radio"
                      name={`${formId}-fit`}
                      value={val}
                      checked={fitMode === val}
                      onChange={() => setFitMode(val)}
                    />
                    <span>{lbl}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="space-y-1.5">
              <label
                htmlFor={`${formId}-margin`}
                className="text-xs font-medium text-[var(--text-primary)]"
              >
                Margin: <span className="font-mono">{marginMm} mm</span>
              </label>
              <input
                id={`${formId}-margin`}
                type="range"
                min={0}
                max={45}
                value={marginMm}
                onChange={(e) => setMarginMm(Number(e.target.value))}
                className="w-full cursor-pointer"
              />
            </div>

            {tool.id !== "resize-pdf" && (
              <div className="space-y-1.5 md:col-span-2">
                <label
                  htmlFor={`${formId}-quality`}
                  className="text-xs font-medium text-[var(--text-primary)]"
                >
                  Kualitas Gambar: <span className="font-mono">{imageQuality}%</span>
                </label>
                <input
                  id={`${formId}-quality`}
                  type="range"
                  min={20}
                  max={100}
                  value={imageQuality}
                  onChange={(e) => setImageQuality(Number(e.target.value))}
                  className="w-full cursor-pointer"
                />
              </div>
            )}

            {/* Visual Paper & Margin Layout Preview */}
            <div className="flex flex-col items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 md:col-span-2 sm:flex-row">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-[var(--text-primary)]">
                  Simulasi Tata Letak Kertas ({paperSize})
                </p>
                <p className="text-xs text-[var(--text-secondary)]">
                  {Math.round(previewDimensions.w)} × {Math.round(previewDimensions.h)} mm •{" "}
                  {orientation === "landscape"
                    ? "Landscape"
                    : orientation === "portrait"
                      ? "Portrait"
                      : "Otomatis"}{" "}
                  • Margin {marginMm} mm • {fitMode === "fit" ? "Fit to Page" : "Fill Page"}
                </p>
              </div>
              <div
                aria-hidden="true"
                className="flex shrink-0 items-center justify-center rounded border border-[var(--border-default)] bg-white shadow-xs"
                style={{
                  width: previewDimensions.w >= previewDimensions.h ? 104 : 74,
                  height: previewDimensions.w >= previewDimensions.h ? 74 : 104,
                  padding: `${Math.min(18, Math.round(marginMm * 0.45))}px`,
                }}
              >
                <div className="flex h-full w-full items-center justify-center overflow-hidden border border-dashed border-[var(--brand-primary)]/50 bg-[var(--brand-subtle-bg)]/40">
                  {firstImageUrl ? (
                    <img
                      src={firstImageUrl}
                      alt=""
                      className={cn(
                        "h-full w-full",
                        fitMode === "fit" ? "object-contain" : "object-cover"
                      )}
                    />
                  ) : (
                    <span className="font-mono text-[9px] text-[var(--brand-primary)]">
                      {fitMode.toUpperCase()}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {(tool.id === "pdf-to-jpg" || tool.id === "pdf-to-png") && (
          <div className="grid grid-cols-1 gap-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/40 p-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label
                htmlFor={`${formId}-dpi`}
                className="text-xs font-medium text-[var(--text-primary)]"
              >
                Resolusi (DPI): <span className="font-mono">{dpi} DPI</span>
              </label>
              <input
                id={`${formId}-dpi`}
                type="range"
                min={72}
                max={300}
                step={6}
                value={dpi}
                onChange={(e) => setDpi(Number(e.target.value))}
                className="w-full cursor-pointer"
              />
            </div>

            {tool.id === "pdf-to-jpg" ? (
              <div className="space-y-1.5">
                <label
                  htmlFor={`${formId}-jpg-q`}
                  className="text-xs font-medium text-[var(--text-primary)]"
                >
                  Kualitas JPG: <span className="font-mono">{imageQuality}%</span>
                </label>
                <input
                  id={`${formId}-jpg-q`}
                  type="range"
                  min={20}
                  max={100}
                  value={imageQuality}
                  onChange={(e) => setImageQuality(Number(e.target.value))}
                  className="w-full cursor-pointer"
                />
              </div>
            ) : (
              <div className="flex items-center gap-2.5 pt-5">
                <input
                  id={`${formId}-transparent-png`}
                  type="checkbox"
                  checked={transparentPng}
                  onChange={(e) => setTransparentPng(e.target.checked)}
                  className="h-4 w-4 cursor-pointer"
                />
                <label
                  htmlFor={`${formId}-transparent-png`}
                  className="text-xs font-medium text-[var(--text-primary)] cursor-pointer"
                >
                  Latar belakang transparan (PNG Alpha)
                </label>
              </div>
            )}

            <div className="space-y-1.5 sm:col-span-2">
              <label
                htmlFor={`${formId}-export-pages`}
                className="text-xs font-medium text-[var(--text-primary)]"
              >
                Halaman Tertentu (opsional, kosongkan untuk semua halaman)
              </label>
              <Input
                id={`${formId}-export-pages`}
                value={pagesSpec}
                onChange={(e) => setPagesSpec(e.target.value)}
                placeholder="Contoh: 1-3, 5"
              />
            </div>
          </div>
        )}

        {tool.id === "split-pdf" && (
          <div className="space-y-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/40 p-4">
            <fieldset className="space-y-2">
              <legend className="text-xs font-medium text-[var(--text-primary)]">
                Metode Pemisahan
              </legend>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["ranges", "Berdasarkan Rentang"],
                    ["every_n", "Setiap N Halaman"],
                    ["all_pages", "Semua Jadi Satuan"],
                  ] as [SplitModeOption, string][]
                ).map(([val, lbl]) => (
                  <label
                    key={val}
                    className={cn(
                      "inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium",
                      splitMode === val
                        ? "border-[var(--brand-primary)] bg-[var(--brand-subtle-bg)] text-[var(--brand-subtle-fg)]"
                        : "border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-secondary)]"
                    )}
                  >
                    <input
                      type="radio"
                      name={`${formId}-split-mode`}
                      value={val}
                      checked={splitMode === val}
                      onChange={() => setSplitMode(val)}
                    />
                    <span>{lbl}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            {splitMode === "ranges" && (
              <div className="space-y-1.5">
                <label
                  htmlFor={`${formId}-split-ranges`}
                  className="text-xs font-medium text-[var(--text-primary)]"
                >
                  Rentang Pemisahan (pisahkan bagian dengan koma)
                </label>
                <Input
                  id={`${formId}-split-ranges`}
                  value={splitRanges}
                  onChange={(e) => setSplitRanges(e.target.value)}
                  placeholder="Contoh: 1-2, 3-5, 6"
                />
              </div>
            )}

            {splitMode === "every_n" && (
              <div className="space-y-1.5">
                <label
                  htmlFor={`${formId}-split-everyn`}
                  className="text-xs font-medium text-[var(--text-primary)]"
                >
                  Jumlah Halaman per File Hasil
                </label>
                <Input
                  id={`${formId}-split-everyn`}
                  type="number"
                  min={1}
                  value={everyN}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isFinite(n)) setEveryN(n);
                  }}
                  onBlur={() => setEveryN((prev) => Math.max(1, Math.round(prev || 1)))}
                />
              </div>
            )}
          </div>
        )}

        {tool.id === "compress-pdf" && (
          <fieldset className="space-y-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/40 p-4">
            <legend className="text-xs font-medium text-[var(--text-primary)]">
              Tingkat Kompresi PDF
            </legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {(
                [
                  ["low", "Ringan (Lossless)", "Menjaga kualitas gambar asli."],
                  ["medium", "Seimbang (Disarankan)", "Ukuran jauh lebih kecil, tetap tajam."],
                  ["high", "Maksimal", "Ukuran paling ringkas untuk lampiran email."],
                ] as [CompressionLevelOption, string, string][]
              ).map(([val, title, desc]) => (
                <label
                  key={val}
                  className={cn(
                    "flex cursor-pointer flex-col rounded-xl border p-3 text-left transition-colors",
                    compressLevel === val
                      ? "border-[var(--brand-primary)] bg-[var(--brand-subtle-bg)]"
                      : "border-[var(--border-subtle)] bg-[var(--surface-card)]"
                  )}
                >
                  <span className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
                    <input
                      type="radio"
                      name={`${formId}-compress`}
                      value={val}
                      checked={compressLevel === val}
                      onChange={() => setCompressLevel(val)}
                    />
                    <span>{title}</span>
                  </span>
                  <span className="mt-1 text-[11px] text-[var(--text-secondary)]">
                    {desc}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {(tool.id === "delete-pdf-pages" || tool.id === "extract-pdf-pages") && (
          <div className="space-y-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/40 p-4">
            <label
              htmlFor={`${formId}-target-pages`}
              className="text-xs font-medium text-[var(--text-primary)]"
            >
              {tool.id === "delete-pdf-pages"
                ? "Halaman yang Akan Dihapus (klik pratinjau di atas atau ketik rentang)"
                : "Halaman yang Akan Diambil (klik pratinjau di atas atau ketik rentang)"}
            </label>
            <Input
              id={`${formId}-target-pages`}
              value={pagesSpec}
              onChange={(e) => setPagesSpec(e.target.value)}
              placeholder="Contoh: 1, 3-5"
            />
          </div>
        )}

        {tool.id === "watermark-pdf" && (
          <div className="space-y-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/40 p-4">
            <fieldset className="space-y-2">
              <legend className="text-xs font-medium text-[var(--text-primary)]">
                Jenis Watermark
              </legend>
              <div className="flex gap-2">
                {(
                  [
                    ["text", "Watermark Teks"],
                    ["image", "Watermark Gambar / Logo"],
                  ] as [WatermarkTypeOption, string][]
                ).map(([val, lbl]) => (
                  <label
                    key={val}
                    className={cn(
                      "inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium",
                      watermarkType === val
                        ? "border-[var(--brand-primary)] bg-[var(--brand-subtle-bg)] text-[var(--brand-subtle-fg)]"
                        : "border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-secondary)]"
                    )}
                  >
                    <input
                      type="radio"
                      name={`${formId}-wm-type`}
                      value={val}
                      checked={watermarkType === val}
                      onChange={() => setWatermarkType(val)}
                    />
                    <span>{lbl}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            {watermarkType === "text" ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label
                    htmlFor={`${formId}-wm-text`}
                    className="text-xs font-medium text-[var(--text-primary)]"
                  >
                    Teks Watermark
                  </label>
                  <Input
                    id={`${formId}-wm-text`}
                    value={watermarkText}
                    onChange={(e) => setWatermarkText(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label
                    htmlFor={`${formId}-wm-color`}
                    className="text-xs font-medium text-[var(--text-primary)]"
                  >
                    Warna Teks
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id={`${formId}-wm-color`}
                      type="color"
                      value={watermarkColor}
                      onChange={(e) => setWatermarkColor(e.target.value)}
                      className="h-9 w-12 cursor-pointer rounded border border-[var(--border-default)] bg-transparent p-0.5"
                    />
                    <span className="font-mono text-xs text-[var(--text-secondary)]">
                      {watermarkColor}
                    </span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label
                    htmlFor={`${formId}-wm-size`}
                    className="text-xs font-medium text-[var(--text-primary)]"
                  >
                    Ukuran Font: <span className="font-mono">{watermarkFontSize} pt</span>
                  </label>
                  <input
                    id={`${formId}-wm-size`}
                    type="range"
                    min={12}
                    max={96}
                    value={watermarkFontSize}
                    onChange={(e) => setWatermarkFontSize(Number(e.target.value))}
                    className="w-full cursor-pointer"
                  />
                </div>
                <div className="space-y-1.5">
                  <label
                    htmlFor={`${formId}-wm-rot`}
                    className="text-xs font-medium text-[var(--text-primary)]"
                  >
                    Kemiringan: <span className="font-mono">{watermarkRotation}°</span>
                  </label>
                  <input
                    id={`${formId}-wm-rot`}
                    type="range"
                    min={-90}
                    max={90}
                    value={watermarkRotation}
                    onChange={(e) => setWatermarkRotation(Number(e.target.value))}
                    className="w-full cursor-pointer"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <FileDropzone
                  label="Gambar / Logo Watermark"
                  acceptAttr={IMAGE_ACCEPT}
                  allowedExtensions={IMAGE_EXTENSIONS}
                  showImageThumbnails
                  files={watermarkImageFiles}
                  onFilesChange={setWatermarkImageFiles}
                />
                <div className="space-y-1.5">
                  <label
                    htmlFor={`${formId}-wm-scale`}
                    className="text-xs font-medium text-[var(--text-primary)]"
                  >
                    Skala Lebar Logo: <span className="font-mono">{Math.round(watermarkScale * 100)}%</span>
                  </label>
                  <input
                    id={`${formId}-wm-scale`}
                    type="range"
                    min={0.1}
                    max={0.85}
                    step={0.05}
                    value={watermarkScale}
                    onChange={(e) => setWatermarkScale(Number(e.target.value))}
                    className="w-full cursor-pointer"
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label
                  htmlFor={`${formId}-wm-pos`}
                  className="text-xs font-medium text-[var(--text-primary)]"
                >
                  Posisi Watermark
                </label>
                <select
                  id={`${formId}-wm-pos`}
                  value={watermarkPosition}
                  onChange={(e) =>
                    setWatermarkPosition(e.target.value as WatermarkPositionOption)
                  }
                  className="min-h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-input)] px-3 py-1.5 text-sm text-[var(--text-primary)]"
                >
                  <option value="center">Tengah Halaman</option>
                  <option value="tile">Pola Berulang (Tile)</option>
                  <option value="top_left">Kiri Atas</option>
                  <option value="top_right">Kanan Atas</option>
                  <option value="bottom_left">Kiri Bawah</option>
                  <option value="bottom_right">Kanan Bawah</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label
                  htmlFor={`${formId}-wm-opacity`}
                  className="text-xs font-medium text-[var(--text-primary)]"
                >
                  Opasitas: <span className="font-mono">{Math.round(watermarkOpacity * 100)}%</span>
                </label>
                <input
                  id={`${formId}-wm-opacity`}
                  type="range"
                  min={0.05}
                  max={1}
                  step={0.05}
                  value={watermarkOpacity}
                  onChange={(e) => setWatermarkOpacity(Number(e.target.value))}
                  className="w-full cursor-pointer"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor={`${formId}-wm-pages`}
                className="text-xs font-medium text-[var(--text-primary)]"
              >
                Halaman Tertentu (opsional, kosongkan = semua halaman)
              </label>
              <Input
                id={`${formId}-wm-pages`}
                value={pagesSpec}
                onChange={(e) => setPagesSpec(e.target.value)}
                placeholder="Contoh: 1-3, 5"
              />
            </div>
          </div>
        )}

        {tool.id === "page-number-pdf" && (
          <div className="grid grid-cols-1 gap-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/40 p-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label
                htmlFor={`${formId}-pn-pos`}
                className="text-xs font-medium text-[var(--text-primary)]"
              >
                Posisi Nomor Halaman
              </label>
              <select
                id={`${formId}-pn-pos`}
                value={pageNumPosition}
                onChange={(e) =>
                  setPageNumPosition(e.target.value as PageNumberPositionOption)
                }
                className="min-h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-input)] px-3 py-1.5 text-sm text-[var(--text-primary)]"
              >
                <option value="bottom_center">Bawah Tengah</option>
                <option value="bottom_right">Bawah Kanan</option>
                <option value="bottom_left">Bawah Kiri</option>
                <option value="top_center">Atas Tengah</option>
                <option value="top_right">Atas Kanan</option>
                <option value="top_left">Atas Kiri</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor={`${formId}-pn-tpl`}
                className="text-xs font-medium text-[var(--text-primary)]"
              >
                Format Teks (gunakan {"{page}"} dan {"{total}"})
              </label>
              <Input
                id={`${formId}-pn-tpl`}
                value={pageNumTemplate}
                onChange={(e) => setPageNumTemplate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor={`${formId}-pn-start`}
                className="text-xs font-medium text-[var(--text-primary)]"
              >
                Mulai dari Nomor
              </label>
              <Input
                id={`${formId}-pn-start`}
                type="number"
                min={1}
                value={startNumber}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n)) setStartNumber(n);
                }}
                onBlur={() => setStartNumber((prev) => Math.max(1, Math.round(prev || 1)))}
              />
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor={`${formId}-pn-size`}
                className="text-xs font-medium text-[var(--text-primary)]"
              >
                Ukuran Font: <span className="font-mono">{pageNumFontSize} pt</span>
              </label>
              <input
                id={`${formId}-pn-size`}
                type="range"
                min={8}
                max={24}
                value={pageNumFontSize}
                onChange={(e) => setPageNumFontSize(Number(e.target.value))}
                className="w-full cursor-pointer"
              />
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor={`${formId}-pn-color`}
                className="text-xs font-medium text-[var(--text-primary)]"
              >
                Warna Teks
              </label>
              <input
                id={`${formId}-pn-color`}
                type="color"
                value={pageNumColor}
                onChange={(e) => setPageNumColor(e.target.value)}
                className="h-9 w-12 cursor-pointer rounded border border-[var(--border-default)] bg-transparent p-0.5"
              />
            </div>
            <div className="flex items-center gap-2 pt-5">
              <input
                id={`${formId}-pn-skip`}
                type="checkbox"
                checked={skipFirstPage}
                onChange={(e) => setSkipFirstPage(e.target.checked)}
                className="h-4 w-4 cursor-pointer"
              />
              <label
                htmlFor={`${formId}-pn-skip`}
                className="text-xs font-medium text-[var(--text-primary)] cursor-pointer"
              >
                Lewati halaman pertama (Sampul)
              </label>
            </div>
          </div>
        )}

        {tool.id === "ocr-pdf" && (
          <div className="grid grid-cols-1 gap-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/40 p-4 sm:grid-cols-2">
            <fieldset className="space-y-1.5">
              <legend className="text-xs font-medium text-[var(--text-primary)]">
                Bahasa Teks Dokumen
              </legend>
              <div className="flex flex-wrap gap-2 pt-1">
                {(
                  [
                    ["ind+eng", "Indonesia + Inggris"],
                    ["ind", "Indonesia"],
                    ["eng", "Inggris"],
                  ] as const
                ).map(([val, lbl]) => (
                  <label
                    key={val}
                    className={cn(
                      "inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium",
                      ocrLanguage === val
                        ? "border-[var(--brand-primary)] bg-[var(--brand-subtle-bg)] text-[var(--brand-subtle-fg)]"
                        : "border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-secondary)]"
                    )}
                  >
                    <input
                      type="radio"
                      name={`${formId}-ocr-lang`}
                      value={val}
                      checked={ocrLanguage === val}
                      onChange={() => setOcrLanguage(val)}
                    />
                    <span>{lbl}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="space-y-1.5">
              <label
                htmlFor={`${formId}-ocr-dpi`}
                className="text-xs font-medium text-[var(--text-primary)]"
              >
                Ketajaman Render OCR: <span className="font-mono">{ocrDpi} DPI</span>
              </label>
              <input
                id={`${formId}-ocr-dpi`}
                type="range"
                min={120}
                max={300}
                step={20}
                value={ocrDpi}
                onChange={(e) => setOcrDpi(Number(e.target.value))}
                className="w-full cursor-pointer"
              />
            </div>
          </div>
        )}

        {/* Progress Bar during processing */}
        {submitting && (
          <div className="space-y-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-4">
            <div className="flex items-center justify-between text-xs font-medium text-[var(--text-primary)]">
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-[var(--brand-primary)]" aria-hidden="true" />
                <span>
                  {progressValue === null
                    ? "Memproses dokumen di FastAPI..."
                    : `Mengunggah & memproses (${progressValue}%)...`}
                </span>
              </span>
            </div>
            <Progress
              value={progressValue === null ? undefined : progressValue}
              max={100}
              label="Progres pemrosesan dokumen PDF"
            />
          </div>
        )}

        {/* Error Alert */}
        {errorMsg && (
          <div
            role="alert"
            className="rounded-xl border border-[var(--danger-bg)]/35 bg-[var(--danger-bg)]/10 px-4 py-3 text-sm font-medium text-[var(--danger-bg)]"
          >
            {errorMsg}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={submitting}>
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Play className="h-4 w-4" aria-hidden="true" />
            )}
            <span>{submitting ? "Sedang Memproses..." : `Jalankan ${tool.name}`}</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={handleResetAll}
            disabled={submitting}
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            <span>Reset</span>
          </Button>
        </div>
      </form>

      {/* Output Preview & Download Panel */}
      {result && <PdfResultPreview result={result} onReset={handleResetAll} />}
    </div>
  );
}
