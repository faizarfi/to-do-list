"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Loader2, Play, RotateCcw } from "lucide-react";

import { ImageExtraWorkspace } from "@/components/image/image-extra-workspace";
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
import { fetchImagesInfo } from "@/lib/image-api";
import { cn } from "@/lib/utils";
import type {
  BulkResizeModeOption,
  CollageFitOption,
  CollageLayoutOption,
  ImageInfoResponse,
  ImageTargetFormatOption,
  PassportPhotoSizeOption,
  RenameCaseOption,
} from "@/types/image";
import type {
  PdfJobResult,
  WatermarkPositionOption,
  WatermarkTypeOption,
} from "@/types/pdf";
import type { ToolDefinition } from "@/types/tools";

interface ImageWorkspaceProps {
  tool: ToolDefinition;
}

const IMAGE_ACCEPT =
  ".jpg,.jpeg,.png,.webp,.tif,.tiff,image/jpeg,image/png,image/webp,image/tiff";
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff"];

const MULTI_FILE_IMAGE_TOOLS = new Set([
  "image-converter",
  "image-compressor",
  "bulk-image-resize",
  "image-rotate",
  "dpi-changer",
  "bulk-rename",
  "image-watermark",
  "image-collage",
  "image-information",
]);

const REORDERABLE_IMAGE_TOOLS = new Set(["bulk-rename", "image-collage"]);

const EXTRA_IMAGE_IDS = new Set([
  "image-filters",
  "image-round-frame",
  "favicon-pack-generator",
  "social-media-resizer",
  "color-palette-extractor",
  "image-strip-exif",
]);

export function ImageWorkspace({ tool }: ImageWorkspaceProps) {
  if (EXTRA_IMAGE_IDS.has(tool.id)) {
    return <ImageExtraWorkspace tool={tool} />;
  }
  return <CoreImageWorkspace tool={tool} />;
}

function CoreImageWorkspace({ tool }: ImageWorkspaceProps) {
  const formId = useId();

  const [files, setFiles] = useState<SelectedFileItem[]>([]);
  const [logoFiles, setLogoFiles] = useState<SelectedFileItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [progressValue, setProgressValue] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<PdfJobResult | null>(null);
  const [infoResult, setInfoResult] = useState<ImageInfoResponse | null>(null);

  // Natural dimensions of first selected image for live crop/resize UX
  const [firstImgUrl, setFirstImgUrl] = useState<string | null>(null);
  const [naturalDims, setNaturalDims] = useState<{ w: number; h: number } | null>(
    null
  );
  const [previewDecodeFailed, setPreviewDecodeFailed] = useState(false);

  // Interactive drag state for #20 Image Cropper
  const cropPreviewRef = useRef<HTMLDivElement>(null);
  const cropHandleRef = useRef<HTMLButtonElement>(null);
  const cropDragStartRef = useRef<{
    startClientX: number;
    startClientY: number;
    origCropX: number;
    origCropY: number;
  } | null>(null);
  const [isDraggingCrop, setIsDraggingCrop] = useState(false);
  const [cropLiveMsg, setCropLiveMsg] = useState("");

  // #16 Image Converter
  const [targetFormat, setTargetFormat] =
    useState<ImageTargetFormatOption>("png");
  const [quality, setQuality] = useState(88);
  const [losslessWebp, setLosslessWebp] = useState(false);

  // #17 Image Compressor
  const [compressQuality, setCompressQuality] = useState(70);
  const [maxDimension, setMaxDimension] = useState<string>("");

  // #18 & #19 Resize
  const [resizeWidth, setResizeWidth] = useState(800);
  const [resizeHeight, setResizeHeight] = useState(600);
  const [keepAspect, setKeepAspect] = useState(true);
  const [resizeFormat, setResizeFormat] = useState<string>("original");
  const [bulkMode, setBulkMode] =
    useState<BulkResizeModeOption>("dimensions");
  const [scalePercent, setScalePercent] = useState(50);

  // #20 Cropper
  const [cropPreset, setCropPreset] = useState<string>("free");
  const [cropX, setCropX] = useState(0);
  const [cropY, setCropY] = useState(0);
  const [cropW, setCropW] = useState(300);
  const [cropH, setCropH] = useState(300);

  // #21 Rotate
  const [rotateAngle, setRotateAngle] = useState(90);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);

  // #22 DPI
  const [dpiX, setDpiX] = useState(300);
  const [dpiY, setDpiY] = useState(300);

  // #23 Passport Photo
  const [passportSize, setPassportSize] =
    useState<PassportPhotoSizeOption>("3x4");
  const [passportDpi, setPassportDpi] = useState(300);
  const [passportBg, setPassportBg] = useState("#DC2626");
  const [focusY, setFocusY] = useState(0.35);
  const [printSheet, setPrintSheet] = useState(false);

  // #24 Bulk Rename
  const [renamePrefix, setRenamePrefix] = useState("foto-");
  const [renameSuffix, setRenameSuffix] = useState("");
  const [renameStart, setRenameStart] = useState(1);
  const [renamePad, setRenamePad] = useState(3);
  const [keepOrigName, setKeepOrigName] = useState(false);
  const [renameCase, setRenameCase] = useState<RenameCaseOption>("original");

  // #25 Image Watermark
  const [wmType, setWmType] = useState<WatermarkTypeOption>("text");
  const [wmText, setWmText] = useState("RuangKerja");
  const [wmSizePct, setWmSizePct] = useState(6);
  const [wmColor, setWmColor] = useState("#FFFFFF");
  const [wmOpacity, setWmOpacity] = useState(0.45);
  const [wmPosition, setWmPosition] =
    useState<WatermarkPositionOption>("bottom_right");
  const [wmLogoScale, setWmLogoScale] = useState(20);

  // #26 Image Collage
  const [collageLayout, setCollageLayout] =
    useState<CollageLayoutOption>("grid");
  const [collageCols, setCollageCols] = useState(2);
  const [collageCellPx, setCollageCellPx] = useState(500);
  const [collageGapPx, setCollageGapPx] = useState(16);
  const [collagePadPx, setCollagePadPx] = useState(24);
  const [collageBg, setCollageBg] = useState("#FFFFFF");
  const [collageFit, setCollageFit] = useState<CollageFitOption>("cover");
  const [collageFormat, setCollageFormat] =
    useState<ImageTargetFormatOption>("jpg");

  // Reset when changing tool
  useEffect(() => {
    setFiles([]);
    setLogoFiles([]);
    setErrorMsg(null);
    setProgressValue(null);
    setInfoResult(null);
    setNaturalDims(null);
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

  // Read natural dimensions of first uploaded image (with backend fallback for TIFF)
  useEffect(() => {
    if (files.length === 0) {
      setFirstImgUrl(null);
      setNaturalDims(null);
      setPreviewDecodeFailed(false);
      return;
    }
    let cancelled = false;
    const file = files[0].file;
    const url = URL.createObjectURL(file);
    setFirstImgUrl(url);
    setPreviewDecodeFailed(false);

    const applyDims = (w: number, h: number) => {
      if (cancelled) return;
      setNaturalDims({ w, h });
      if (tool.id === "image-resizer") {
        setResizeWidth(w);
        setResizeHeight(h);
      }
      if (tool.id === "image-cropper") {
        setCropX(0);
        setCropY(0);
        setCropW(Math.max(1, Math.round(w * 0.8)));
        setCropH(Math.max(1, Math.round(h * 0.8)));
      }
    };

    const probe = new window.Image();
    probe.onload = () => {
      applyDims(probe.naturalWidth, probe.naturalHeight);
    };
    probe.onerror = () => {
      if (cancelled) return;
      setPreviewDecodeFailed(true);
      void fetchImagesInfo([file])
        .then((res) => {
          const item = res.items[0];
          if (item) applyDims(item.width, item.height);
        })
        .catch(() => {
          // Ignore silent fallback error
        });
    };
    probe.src = url;

    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [files, tool.id]);

  // Live rename preview for #24 Bulk Rename
  const renamePreviews = useMemo(() => {
    if (tool.id !== "bulk-rename") return [];
    return files.map((item, idx) => {
      const lastDot = item.file.name.lastIndexOf(".");
      const origStem =
        lastDot > 0 ? item.file.name.slice(0, lastDot) : item.file.name;
      const origExt = lastDot > 0 ? item.file.name.slice(lastDot) : "";
      const num = String(renameStart + idx).padStart(renamePad, "0");
      let base = keepOrigName
        ? `${renamePrefix}${origStem}_${num}${renameSuffix}`
        : `${renamePrefix}${num}${renameSuffix}`;
      let ext = origExt;
      if (renameCase === "lowercase") {
        base = base.toLowerCase();
        ext = ext.toLowerCase();
      } else if (renameCase === "uppercase") {
        base = base.toUpperCase();
        ext = ext.toUpperCase();
      }
      return {
        original: item.file.name,
        renamed: `${base}${ext}`,
      };
    });
  }, [
    files,
    tool.id,
    renamePrefix,
    renameSuffix,
    renameStart,
    renamePad,
    keepOrigName,
    renameCase,
  ]);

  function applyCropRatioPreset(preset: string) {
    setCropPreset(preset);
    if (!naturalDims || preset === "free") return;
    const [rwStr, rhStr] = preset.split(":");
    const rw = Number(rwStr);
    const rh = Number(rhStr);
    if (!rw || !rh) return;

    const targetRatio = rw / rh;
    const srcRatio = naturalDims.w / naturalDims.h;
    let newW = naturalDims.w;
    let newH = naturalDims.h;
    if (srcRatio > targetRatio) {
      newH = naturalDims.h;
      newW = Math.max(1, Math.round(newH * targetRatio));
    } else {
      newW = naturalDims.w;
      newH = Math.max(1, Math.round(newW / targetRatio));
    }
    setCropW(newW);
    setCropH(newH);
    setCropX(Math.floor((naturalDims.w - newW) / 2));
    setCropY(Math.floor((naturalDims.h - newH) / 2));
  }

  function moveCropTo(nextX: number, nextY: number, announce: boolean = false) {
    const maxW = naturalDims ? Math.max(0, naturalDims.w - cropW) : 99999;
    const maxH = naturalDims ? Math.max(0, naturalDims.h - cropH) : 99999;
    const clampedX = Math.max(0, Math.min(Math.round(nextX), maxW));
    const clampedY = Math.max(0, Math.min(Math.round(nextY), maxH));
    setCropX(clampedX);
    setCropY(clampedY);
    if (announce) {
      setCropLiveMsg(`Area potong digeser ke posisi X ${clampedX} px, Y ${clampedY} px.`);
    }
  }

  function handleReset() {
    setFiles([]);
    setLogoFiles([]);
    setErrorMsg(null);
    setProgressValue(null);
    setInfoResult(null);
    setNaturalDims(null);
    setResult((prev) => {
      revokeJobResult(prev);
      return null;
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMsg(null);

    if (files.length === 0) {
      setErrorMsg("Pilih minimal satu gambar terlebih dahulu.");
      return;
    }
    if (tool.id === "image-collage" && files.length < 2) {
      setErrorMsg("Kolase gambar membutuhkan minimal 2 file gambar.");
      return;
    }

    // #27 Image Information returns rich JSON metadata
    if (tool.id === "image-information") {
      setSubmitting(true);
      setProgressValue(null);
      try {
        const res = await fetchImagesInfo(files.map((item) => item.file));
        setInfoResult(res);
      } catch (err) {
        setErrorMsg(
          err instanceof Error ? err.message : "Gagal memeriksa info gambar."
        );
      } finally {
        setSubmitting(false);
        setProgressValue(null);
      }
      return;
    }

    const endpoint = tool.apiEndpoint;
    if (!endpoint) {
      setErrorMsg("Endpoint backend tidak tersedia.");
      return;
    }

    const formData = new FormData();
    const isSingleEndpoint =
      tool.id === "image-resizer" ||
      tool.id === "image-cropper" ||
      tool.id === "passport-photo-maker";

    if (isSingleEndpoint) {
      formData.append("file", files[0].file);
    } else {
      for (const item of files) {
        formData.append("files", item.file);
      }
    }

    if (tool.id === "image-converter") {
      formData.append("target_format", targetFormat);
      formData.append("quality", String(quality));
      formData.append("lossless_webp", String(losslessWebp));
    } else if (tool.id === "image-compressor") {
      formData.append("quality", String(compressQuality));
      if (maxDimension.trim()) {
        formData.append("max_dimension", maxDimension.trim());
      }
    } else if (tool.id === "image-resizer") {
      formData.append("width", String(resizeWidth));
      formData.append("height", String(resizeHeight));
      formData.append("keep_aspect_ratio", String(keepAspect));
      formData.append("quality", String(quality));
      if (resizeFormat !== "original") {
        formData.append("output_format", resizeFormat);
      }
    } else if (tool.id === "bulk-image-resize") {
      formData.append("mode", bulkMode);
      formData.append("width", String(resizeWidth));
      formData.append("height", String(resizeHeight));
      formData.append("keep_aspect_ratio", String(keepAspect));
      formData.append("scale_percent", String(scalePercent));
      formData.append("quality", String(quality));
    } else if (tool.id === "image-cropper") {
      formData.append("crop_x", String(cropX));
      formData.append("crop_y", String(cropY));
      formData.append("crop_width", String(cropW));
      formData.append("crop_height", String(cropH));
      formData.append("quality", String(quality));
    } else if (tool.id === "image-rotate") {
      formData.append("angle", String(rotateAngle));
      formData.append("flip_horizontal", String(flipH));
      formData.append("flip_vertical", String(flipV));
      formData.append("quality", String(quality));
    } else if (tool.id === "dpi-changer") {
      formData.append("dpi_x", String(dpiX));
      formData.append("dpi_y", String(dpiY));
      formData.append("quality", String(quality));
    } else if (tool.id === "passport-photo-maker") {
      formData.append("photo_size", passportSize);
      formData.append("dpi", String(passportDpi));
      formData.append("background_hex", passportBg);
      formData.append("focus_y", String(focusY));
      formData.append("print_sheet", String(printSheet));
    } else if (tool.id === "bulk-rename") {
      formData.append("prefix", renamePrefix);
      formData.append("suffix", renameSuffix);
      formData.append("start_number", String(renameStart));
      formData.append("zero_pad", String(renamePad));
      formData.append("keep_original_name", String(keepOrigName));
      formData.append("case_mode", renameCase);
    } else if (tool.id === "image-watermark") {
      formData.append("watermark_type", wmType);
      formData.append("text", wmText);
      formData.append("font_size_pct", String(wmSizePct));
      formData.append("color_hex", wmColor);
      formData.append("opacity", String(wmOpacity));
      formData.append("position", wmPosition);
      formData.append("logo_scale_pct", String(wmLogoScale));
      formData.append("quality", String(quality));
      if (wmType === "image") {
        if (logoFiles.length === 0) {
          setErrorMsg("Pilih file gambar/logo untuk watermark.");
          return;
        }
        formData.append("watermark_image", logoFiles[0].file);
      }
    } else if (tool.id === "image-collage") {
      formData.append("layout", collageLayout);
      formData.append("columns", String(collageCols));
      formData.append("cell_size_px", String(collageCellPx));
      formData.append("gap_px", String(collageGapPx));
      formData.append("padding_px", String(collagePadPx));
      formData.append("background_hex", collageBg);
      formData.append("fit_mode", collageFit);
      formData.append("output_format", collageFormat);
      formData.append("quality", String(quality));
    }

    setSubmitting(true);
    setProgressValue(5);
    setResult((prev) => {
      revokeJobResult(prev);
      return null;
    });

    try {
      const jobResult = await submitBinaryFileJob(endpoint, formData, (pct) =>
        setProgressValue(pct)
      );
      setResult(jobResult);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Gagal memproses gambar."
      );
    } finally {
      setSubmitting(false);
    }
  }

  const isMultiple = MULTI_FILE_IMAGE_TOOLS.has(tool.id);
  const isReorderable = REORDERABLE_IMAGE_TOOLS.has(tool.id);

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
            isMultiple
              ? "Pilih Gambar dari Komputer atau Seret ke Sini"
              : "Pilih 1 Gambar dari Komputer atau Seret ke Sini"
          }
          acceptAttr={IMAGE_ACCEPT}
          allowedExtensions={IMAGE_EXTENSIONS}
          multiple={isMultiple}
          reorderable={isReorderable}
          showImageThumbnails
          files={files}
          onFilesChange={(next) => {
            setFiles(next);
            setErrorMsg(null);
            setInfoResult(null);
            setResult((prev) => {
              revokeJobResult(prev);
              return null;
            });
          }}
        />

        {/* #16 Image Converter */}
        {tool.id === "image-converter" && (
          <div className="space-y-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/40 p-4">
            <fieldset className="space-y-2">
              <legend className="text-xs font-medium text-[var(--text-primary)]">
                Format Tujuan
              </legend>
              <div className="flex flex-wrap gap-2">
                {(["jpg", "png", "webp", "tiff"] as ImageTargetFormatOption[]).map(
                  (fmt) => (
                    <label
                      key={fmt}
                      className={cn(
                        "inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold uppercase",
                        targetFormat === fmt
                          ? "border-[var(--brand-primary)] bg-[var(--brand-subtle-bg)] text-[var(--brand-subtle-fg)]"
                          : "border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-secondary)]"
                      )}
                    >
                      <input
                        type="radio"
                        name={`${formId}-fmt`}
                        value={fmt}
                        checked={targetFormat === fmt}
                        onChange={() => setTargetFormat(fmt)}
                      />
                      <span>{fmt}</span>
                    </label>
                  )
                )}
              </div>
            </fieldset>

            {(targetFormat === "jpg" || targetFormat === "webp") && (
              <div className="space-y-1.5">
                <label
                  htmlFor={`${formId}-conv-q`}
                  className="text-xs font-medium text-[var(--text-primary)]"
                >
                  Kualitas Output: <span className="font-mono">{quality}%</span>
                </label>
                <input
                  id={`${formId}-conv-q`}
                  type="range"
                  min={10}
                  max={100}
                  value={quality}
                  aria-valuetext={`${quality} persen`}
                  onChange={(e) => setQuality(Number(e.target.value))}
                  className="w-full cursor-pointer"
                />
              </div>
            )}

            {targetFormat === "webp" && (
              <div className="flex items-center gap-2">
                <input
                  id={`${formId}-lossless-webp`}
                  type="checkbox"
                  checked={losslessWebp}
                  onChange={(e) => setLosslessWebp(e.target.checked)}
                  className="h-4 w-4 cursor-pointer"
                />
                <label
                  htmlFor={`${formId}-lossless-webp`}
                  className="text-xs font-medium text-[var(--text-primary)] cursor-pointer"
                >
                  Gunakan kompresi Lossless WEBP (tanpa penurunan kualitas)
                </label>
              </div>
            )}
          </div>
        )}

        {/* #17 Image Compressor */}
        {tool.id === "image-compressor" && (
          <div className="grid grid-cols-1 gap-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/40 p-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label
                htmlFor={`${formId}-cmp-q`}
                className="text-xs font-medium text-[var(--text-primary)]"
              >
                Tingkat Kualitas: <span className="font-mono">{compressQuality}%</span>
              </label>
              <input
                id={`${formId}-cmp-q`}
                type="range"
                min={10}
                max={95}
                value={compressQuality}
                aria-valuetext={`${compressQuality} persen`}
                onChange={(e) => setCompressQuality(Number(e.target.value))}
                className="w-full cursor-pointer"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor={`${formId}-max-dim`}
                className="text-xs font-medium text-[var(--text-primary)]"
              >
                Batasi Sisi Terpanjang (opsional)
              </label>
              <select
                id={`${formId}-max-dim`}
                value={maxDimension}
                onChange={(e) => setMaxDimension(e.target.value)}
                className="min-h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-input)] px-3 py-1.5 text-sm text-[var(--text-primary)]"
              >
                <option value="">Pertahankan dimensi asli</option>
                <option value="1920">Maksimal 1920 px (Full HD)</option>
                <option value="1280">Maksimal 1280 px (HD Web)</option>
                <option value="800">Maksimal 800 px (Thumbnail/Email)</option>
              </select>
            </div>
          </div>
        )}

        {/* #18 Image Resizer & #19 Bulk Image Resize */}
        {(tool.id === "image-resizer" || tool.id === "bulk-image-resize") && (
          <div className="space-y-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/40 p-4">
            {naturalDims && tool.id === "image-resizer" && (
              <p className="text-xs text-[var(--text-secondary)]">
                Dimensi asli gambar:{" "}
                <strong className="font-mono text-[var(--text-primary)]">
                  {naturalDims.w} × {naturalDims.h} px
                </strong>
              </p>
            )}

            {tool.id === "bulk-image-resize" && (
              <fieldset className="space-y-2">
                <legend className="text-xs font-medium text-[var(--text-primary)]">
                  Metode Resize Massal
                </legend>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ["dimensions", "Berdasarkan Piksel"],
                      ["percentage", "Berdasarkan Persentase (%)"],
                    ] as [BulkResizeModeOption, string][]
                  ).map(([val, lbl]) => (
                    <label
                      key={val}
                      className={cn(
                        "inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium",
                        bulkMode === val
                          ? "border-[var(--brand-primary)] bg-[var(--brand-subtle-bg)] text-[var(--brand-subtle-fg)]"
                          : "border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-secondary)]"
                      )}
                    >
                      <input
                        type="radio"
                        name={`${formId}-bulk-mode`}
                        value={val}
                        checked={bulkMode === val}
                        onChange={() => setBulkMode(val)}
                      />
                      <span>{lbl}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            {tool.id === "bulk-image-resize" && bulkMode === "percentage" ? (
              <div className="space-y-1.5">
                <label
                  htmlFor={`${formId}-scale-pct`}
                  className="text-xs font-medium text-[var(--text-primary)]"
                >
                  Skala Ukuran: <span className="font-mono">{scalePercent}%</span>
                </label>
                <input
                  id={`${formId}-scale-pct`}
                  type="range"
                  min={10}
                  max={300}
                  step={5}
                  value={scalePercent}
                  onChange={(e) => setScalePercent(Number(e.target.value))}
                  className="w-full cursor-pointer"
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label
                    htmlFor={`${formId}-rw`}
                    className="text-xs font-medium text-[var(--text-primary)]"
                  >
                    Lebar (px)
                  </label>
                  <Input
                    id={`${formId}-rw`}
                    type="number"
                    min={1}
                    max={12000}
                    value={resizeWidth}
                    onChange={(e) => {
                      const raw = Number(e.target.value);
                      if (!Number.isFinite(raw)) return;
                      setResizeWidth(raw);
                      if (keepAspect && naturalDims && tool.id === "image-resizer" && raw >= 1) {
                        setResizeHeight(
                          Math.max(1, Math.round(raw * (naturalDims.h / naturalDims.w)))
                        );
                      }
                    }}
                    onBlur={() =>
                      setResizeWidth((prev) => Math.max(1, Math.min(12000, Math.round(prev || 1))))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <label
                    htmlFor={`${formId}-rh`}
                    className="text-xs font-medium text-[var(--text-primary)]"
                  >
                    Tinggi (px)
                  </label>
                  <Input
                    id={`${formId}-rh`}
                    type="number"
                    min={1}
                    max={12000}
                    value={resizeHeight}
                    onChange={(e) => {
                      const raw = Number(e.target.value);
                      if (!Number.isFinite(raw)) return;
                      setResizeHeight(raw);
                      if (keepAspect && naturalDims && tool.id === "image-resizer" && raw >= 1) {
                        setResizeWidth(
                          Math.max(1, Math.round(raw * (naturalDims.w / naturalDims.h)))
                        );
                      }
                    }}
                    onBlur={() =>
                      setResizeHeight((prev) => Math.max(1, Math.min(12000, Math.round(prev || 1))))
                    }
                  />
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-4">
              {(tool.id === "image-resizer" || bulkMode === "dimensions") && (
                <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-[var(--text-primary)]">
                  <input
                    type="checkbox"
                    checked={keepAspect}
                    onChange={(e) => setKeepAspect(e.target.checked)}
                    className="h-4 w-4 cursor-pointer"
                  />
                  <span>Pertahankan rasio aspek (tidak gepeng)</span>
                </label>
              )}

              {tool.id === "image-resizer" && (
                <div className="flex items-center gap-2">
                  <label
                    htmlFor={`${formId}-resize-fmt`}
                    className="text-xs font-medium text-[var(--text-secondary)]"
                  >
                    Format:
                  </label>
                  <select
                    id={`${formId}-resize-fmt`}
                    value={resizeFormat}
                    onChange={(e) => setResizeFormat(e.target.value)}
                    className="min-h-8 rounded-lg border border-[var(--border-default)] bg-[var(--surface-input)] px-2.5 py-1 text-xs"
                  >
                    <option value="original">Asli</option>
                    <option value="jpg">JPG</option>
                    <option value="png">PNG</option>
                    <option value="webp">WEBP</option>
                  </select>
                </div>
              )}
            </div>
          </div>
        )}

        {/* #20 Image Cropper */}
        {tool.id === "image-cropper" && (
          <div className="space-y-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/40 p-4">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs font-medium text-[var(--text-secondary)]">
                Preset Rasio:
              </span>
              {["free", "1:1", "4:3", "16:9", "3:4", "2:3"].map((ratio) => (
                <button
                  key={ratio}
                  type="button"
                  onClick={() => applyCropRatioPreset(ratio)}
                  className={cn(
                    "rounded-lg border px-2.5 py-1 text-xs font-medium cursor-pointer",
                    cropPreset === ratio
                      ? "border-[var(--brand-primary)] bg-[var(--brand-subtle-bg)] text-[var(--brand-subtle-fg)]"
                      : "border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-secondary)]"
                  )}
                >
                  {ratio === "free" ? "Bebas" : ratio}
                </button>
              ))}
            </div>

            {firstImgUrl && previewDecodeFailed && (
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 text-xs text-[var(--text-secondary)]">
                Format gambar ini tidak dirender langsung oleh browser, namun tetap diproses penuh oleh FastAPI
                {naturalDims ? ` (dimensi terdeteksi: ${naturalDims.w} × ${naturalDims.h} px)` : ""}.
              </div>
            )}

            <div className="visually-hidden" aria-live="polite">
              {cropLiveMsg}
            </div>

            {firstImgUrl && !previewDecodeFailed && naturalDims && (
              <div className="space-y-2">
                <p className="text-[11px] text-[var(--text-muted)]">
                  Seret kotak hijau pada gambar (atau gunakan tombol panah keyboard saat fokus) untuk memposisikan area potong ({naturalDims.w} × {naturalDims.h} px).
                </p>
                <div className="flex justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4">
                  <div
                    ref={cropPreviewRef}
                    className="relative inline-block overflow-hidden rounded-lg"
                  >
                    <img
                      src={firstImgUrl}
                      alt="Area potong gambar"
                      className="block max-h-72 max-w-full select-none pointer-events-none"
                    />
                    <button
                      ref={cropHandleRef}
                      type="button"
                      aria-label="Area potong gambar. Seret atau gunakan tombol panah untuk menggeser."
                      onPointerDown={(event) => {
                        if (event.button !== 0 || !cropHandleRef.current) return;
                        event.preventDefault();
                        cropDragStartRef.current = {
                          startClientX: event.clientX,
                          startClientY: event.clientY,
                          origCropX: cropX,
                          origCropY: cropY,
                        };
                        cropHandleRef.current.setPointerCapture(event.pointerId);
                      }}
                      onPointerMove={(event) => {
                        const drag = cropDragStartRef.current;
                        const box = cropPreviewRef.current;
                        if (
                          !drag ||
                          !box ||
                          !cropHandleRef.current?.hasPointerCapture(event.pointerId)
                        ) {
                          return;
                        }
                        const rect = box.getBoundingClientRect();
                        if (rect.width <= 0 || rect.height <= 0) return;
                        setIsDraggingCrop(true);
                        const scaleX = naturalDims.w / rect.width;
                        const scaleY = naturalDims.h / rect.height;
                        const deltaImgX = (event.clientX - drag.startClientX) * scaleX;
                        const deltaImgY = (event.clientY - drag.startClientY) * scaleY;
                        moveCropTo(drag.origCropX + deltaImgX, drag.origCropY + deltaImgY, false);
                      }}
                      onPointerUp={() => {
                        if (isDraggingCrop) {
                          setCropLiveMsg(`Area potong ditempatkan di X ${cropX} px, Y ${cropY} px.`);
                        }
                        cropDragStartRef.current = null;
                        setIsDraggingCrop(false);
                      }}
                      onLostPointerCapture={() => {
                        cropDragStartRef.current = null;
                        setIsDraggingCrop(false);
                      }}
                      onKeyDown={(event) => {
                        const step = event.shiftKey ? 25 : 10;
                        if (event.key === "ArrowLeft") {
                          event.preventDefault();
                          moveCropTo(cropX - step, cropY, true);
                        } else if (event.key === "ArrowRight") {
                          event.preventDefault();
                          moveCropTo(cropX + step, cropY, true);
                        } else if (event.key === "ArrowUp") {
                          event.preventDefault();
                          moveCropTo(cropX, cropY - step, true);
                        } else if (event.key === "ArrowDown") {
                          event.preventDefault();
                          moveCropTo(cropX, cropY + step, true);
                        }
                      }}
                      className={cn(
                        "absolute touch-none border-2 border-[var(--brand-primary)] bg-transparent shadow-[0_0_0_9999px_rgba(15,23,42,0.48)] focus-visible:outline-2 focus-visible:outline-white",
                        isDraggingCrop ? "cursor-grabbing" : "cursor-grab"
                      )}
                      style={{
                        WebkitUserSelect: "none",
                        userSelect: "none",
                        left: `${(cropX / naturalDims.w) * 100}%`,
                        top: `${(cropY / naturalDims.h) * 100}%`,
                        width: `${Math.min(100 - (cropX / naturalDims.w) * 100, (cropW / naturalDims.w) * 100)}%`,
                        height: `${Math.min(100 - (cropY / naturalDims.h) * 100, (cropH / naturalDims.h) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="space-y-1">
                <label htmlFor={`${formId}-cx`} className="text-xs font-medium">
                  Posisi X (px)
                </label>
                <Input
                  id={`${formId}-cx`}
                  type="number"
                  min={0}
                  max={Math.max(0, (naturalDims?.w ?? 9999) - cropW)}
                  value={cropX}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isFinite(n)) moveCropTo(n, cropY, false);
                  }}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor={`${formId}-cy`} className="text-xs font-medium">
                  Posisi Y (px)
                </label>
                <Input
                  id={`${formId}-cy`}
                  type="number"
                  min={0}
                  max={Math.max(0, (naturalDims?.h ?? 9999) - cropH)}
                  value={cropY}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isFinite(n)) moveCropTo(cropX, n, false);
                  }}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor={`${formId}-cw`} className="text-xs font-medium">
                  Lebar Potong (px)
                </label>
                <Input
                  id={`${formId}-cw`}
                  type="number"
                  min={1}
                  max={naturalDims?.w ?? 9999}
                  value={cropW}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isFinite(n)) setCropW(n);
                  }}
                  onBlur={() =>
                    setCropW((prev) =>
                      Math.max(1, Math.min(naturalDims?.w ?? 9999, Math.round(prev || 1)))
                    )
                  }
                />
              </div>
              <div className="space-y-1">
                <label htmlFor={`${formId}-ch`} className="text-xs font-medium">
                  Tinggi Potong (px)
                </label>
                <Input
                  id={`${formId}-ch`}
                  type="number"
                  min={1}
                  max={naturalDims?.h ?? 9999}
                  value={cropH}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isFinite(n)) setCropH(n);
                  }}
                  onBlur={() =>
                    setCropH((prev) =>
                      Math.max(1, Math.min(naturalDims?.h ?? 9999, Math.round(prev || 1)))
                    )
                  }
                />
              </div>
            </div>
          </div>
        )}

        {/* #21 Image Rotate */}
        {tool.id === "image-rotate" && (
          <div className="space-y-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/40 p-4">
            <div className="flex flex-wrap items-center gap-2">
              {[0, 90, 180, 270].map((deg) => (
                <button
                  key={deg}
                  type="button"
                  onClick={() => setRotateAngle(deg)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 font-mono text-xs font-medium cursor-pointer",
                    rotateAngle === deg
                      ? "border-[var(--brand-primary)] bg-[var(--brand-subtle-bg)] text-[var(--brand-subtle-fg)]"
                      : "border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-secondary)]"
                  )}
                >
                  {deg}°
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-4">
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium">
                <input
                  type="checkbox"
                  checked={flipH}
                  onChange={(e) => setFlipH(e.target.checked)}
                  className="h-4 w-4 cursor-pointer"
                />
                <span>Balik Horizontal (Mirror)</span>
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium">
                <input
                  type="checkbox"
                  checked={flipV}
                  onChange={(e) => setFlipV(e.target.checked)}
                  className="h-4 w-4 cursor-pointer"
                />
                <span>Balik Vertikal</span>
              </label>
            </div>

            {firstImgUrl && (
              <div className="flex justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-6">
                {previewDecodeFailed ? (
                  <p className="text-xs text-[var(--text-secondary)]">
                    Pratinjau visual browser tidak tersedia untuk format ini, rotasi ({rotateAngle}°) tetap diproses akurat oleh FastAPI.
                  </p>
                ) : (
                  <img
                    src={firstImgUrl}
                    alt="Pratinjau rotasi"
                    className="max-h-48 object-contain transition-transform duration-200"
                    style={{
                      transform: `rotate(${rotateAngle}deg) scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1})`,
                    }}
                  />
                )}
              </div>
            )}
          </div>
        )}

        {/* #22 DPI Changer */}
        {tool.id === "dpi-changer" && (
          <div className="space-y-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/40 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-[var(--text-secondary)]">
                Preset DPI:
              </span>
              {[72, 96, 150, 300, 600].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => {
                    setDpiX(val);
                    setDpiY(val);
                  }}
                  className={cn(
                    "rounded-lg border px-3 py-1 font-mono text-xs font-medium cursor-pointer",
                    dpiX === val && dpiY === val
                      ? "border-[var(--brand-primary)] bg-[var(--brand-subtle-bg)] text-[var(--brand-subtle-fg)]"
                      : "border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-secondary)]"
                  )}
                >
                  {val} DPI
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label htmlFor={`${formId}-dpix`} className="text-xs font-medium">
                  DPI Horizontal (X)
                </label>
                <Input
                  id={`${formId}-dpix`}
                  type="number"
                  min={30}
                  max={1200}
                  value={dpiX}
                  onChange={(e) => setDpiX(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor={`${formId}-dpiy`} className="text-xs font-medium">
                  DPI Vertikal (Y)
                </label>
                <Input
                  id={`${formId}-dpiy`}
                  type="number"
                  min={30}
                  max={1200}
                  value={dpiY}
                  onChange={(e) => setDpiY(Number(e.target.value))}
                />
              </div>
            </div>
          </div>
        )}

        {/* #23 Passport Photo Maker */}
        {tool.id === "passport-photo-maker" && (
          <div className="space-y-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/40 p-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <fieldset className="space-y-2">
                <legend className="text-xs font-medium text-[var(--text-primary)]">
                  Ukuran Pas Foto Standar
                </legend>
                <div className="flex gap-2">
                  {(["2x3", "3x4", "4x6"] as PassportPhotoSizeOption[]).map(
                    (sz) => (
                      <label
                        key={sz}
                        className={cn(
                          "inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold",
                          passportSize === sz
                            ? "border-[var(--brand-primary)] bg-[var(--brand-subtle-bg)] text-[var(--brand-subtle-fg)]"
                            : "border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-secondary)]"
                        )}
                      >
                        <input
                          type="radio"
                          name={`${formId}-psize`}
                          value={sz}
                          checked={passportSize === sz}
                          onChange={() => setPassportSize(sz)}
                        />
                        <span>{sz} cm</span>
                      </label>
                    )
                  )}
                </div>
              </fieldset>

              <fieldset className="space-y-2">
                <legend className="text-xs font-medium text-[var(--text-primary)]">
                  Resolusi Cetak
                </legend>
                <div className="flex gap-2">
                  {[150, 300, 600].map((d) => (
                    <label
                      key={d}
                      className={cn(
                        "inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 font-mono text-xs font-medium",
                        passportDpi === d
                          ? "border-[var(--brand-primary)] bg-[var(--brand-subtle-bg)] text-[var(--brand-subtle-fg)]"
                          : "border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-secondary)]"
                      )}
                    >
                      <input
                        type="radio"
                        name={`${formId}-pdpi`}
                        value={d}
                        checked={passportDpi === d}
                        onChange={() => setPassportDpi(d)}
                      />
                      <span>{d} DPI</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label
                  htmlFor={`${formId}-pbg`}
                  className="text-xs font-medium text-[var(--text-primary)]"
                >
                  Warna Latar (untuk PNG transparan)
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  {[
                    ["#DC2626", "Merah"],
                    ["#2563EB", "Biru"],
                    ["#FFFFFF", "Putih"],
                  ].map(([hex, label]) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => setPassportBg(hex)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs cursor-pointer",
                        passportBg.toUpperCase() === hex
                          ? "border-[var(--brand-primary)] bg-[var(--brand-subtle-bg)] font-medium"
                          : "border-[var(--border-subtle)] bg-[var(--surface-card)]"
                      )}
                    >
                      <span
                        className="h-3 w-3 rounded-full border border-slate-300"
                        style={{ backgroundColor: hex }}
                        aria-hidden="true"
                      />
                      <span>{label}</span>
                    </button>
                  ))}
                  <input
                    id={`${formId}-pbg`}
                    type="color"
                    value={passportBg}
                    onChange={(e) => setPassportBg(e.target.value)}
                    className="h-8 w-10 cursor-pointer rounded border border-[var(--border-default)] bg-transparent p-0.5"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor={`${formId}-pfocus`}
                  className="text-xs font-medium text-[var(--text-primary)]"
                >
                  Posisi Fokus Vertikal (Kepala):{" "}
                  <span className="font-mono">{Math.round(focusY * 100)}%</span>
                </label>
                <input
                  id={`${formId}-pfocus`}
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={focusY}
                  onChange={(e) => setFocusY(Number(e.target.value))}
                  className="w-full cursor-pointer"
                />
              </div>
            </div>

            <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-[var(--text-primary)]">
              <input
                type="checkbox"
                checked={printSheet}
                onChange={(e) => setPrintSheet(e.target.checked)}
                className="h-4 w-4 cursor-pointer"
              />
              <span>Susun otomatis ke lembar cetak 4R (10×15 cm) siap cetak</span>
            </label>
          </div>
        )}

        {/* #24 Bulk Rename */}
        {tool.id === "bulk-rename" && (
          <div className="space-y-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/40 p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <label htmlFor={`${formId}-rn-pre`} className="text-xs font-medium">
                  Prefix (Awalan)
                </label>
                <Input
                  id={`${formId}-rn-pre`}
                  value={renamePrefix}
                  onChange={(e) => setRenamePrefix(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor={`${formId}-rn-suf`} className="text-xs font-medium">
                  Suffix (Akhiran)
                </label>
                <Input
                  id={`${formId}-rn-suf`}
                  value={renameSuffix}
                  onChange={(e) => setRenameSuffix(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor={`${formId}-rn-start`} className="text-xs font-medium">
                  Nomor Mulai
                </label>
                <Input
                  id={`${formId}-rn-start`}
                  type="number"
                  min={0}
                  value={renameStart}
                  onChange={(e) => setRenameStart(Math.max(0, Number(e.target.value)))}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor={`${formId}-rn-pad`} className="text-xs font-medium">
                  Digit Angka (Padding)
                </label>
                <Input
                  id={`${formId}-rn-pad`}
                  type="number"
                  min={1}
                  max={6}
                  value={renamePad}
                  onChange={(e) =>
                    setRenamePad(Math.min(6, Math.max(1, Number(e.target.value))))
                  }
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4">
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium">
                <input
                  type="checkbox"
                  checked={keepOrigName}
                  onChange={(e) => setKeepOrigName(e.target.checked)}
                  className="h-4 w-4 cursor-pointer"
                />
                <span>Sertakan nama file asli</span>
              </label>

              <fieldset className="flex items-center gap-2">
                <legend className="visually-hidden">Format huruf nama file</legend>
                {(
                  [
                    ["original", "Asli"],
                    ["lowercase", "huruf kecil"],
                    ["uppercase", "HURUF BESAR"],
                  ] as [RenameCaseOption, string][]
                ).map(([val, lbl]) => (
                  <label
                    key={val}
                    className={cn(
                      "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs",
                      renameCase === val
                        ? "border-[var(--brand-primary)] bg-[var(--brand-subtle-bg)] font-medium"
                        : "border-[var(--border-subtle)] bg-[var(--surface-card)]"
                    )}
                  >
                    <input
                      type="radio"
                      name={`${formId}-rncase`}
                      value={val}
                      checked={renameCase === val}
                      onChange={() => setRenameCase(val)}
                    />
                    <span>{lbl}</span>
                  </label>
                ))}
              </fieldset>
            </div>

            {renamePreviews.length > 0 && (
              <div
                tabIndex={0}
                role="region"
                aria-labelledby={`${formId}-rename-cap`}
                className="overflow-x-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)]"
              >
                <table className="w-full border-collapse text-left text-xs">
                  <caption id={`${formId}-rename-cap`} className="visually-hidden">
                    Pratinjau perubahan nama file
                  </caption>
                  <thead className="border-b border-[var(--border-subtle)] bg-[var(--surface-muted)]">
                    <tr>
                      <th scope="col" className="px-3 py-2 font-medium">Nama Asli</th>
                      <th scope="col" className="px-3 py-2 font-medium">Nama Baru</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]">
                    {renamePreviews.map((row, idx) => (
                      <tr key={idx}>
                        <td className="px-3 py-2 text-[var(--text-secondary)]">
                          {row.original}
                        </td>
                        <td className="px-3 py-2 font-mono font-medium text-[var(--brand-primary)]">
                          {row.renamed}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* #25 Image Watermark */}
        {tool.id === "image-watermark" && (
          <div className="space-y-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/40 p-4">
            <fieldset className="space-y-2">
              <legend className="text-xs font-medium text-[var(--text-primary)]">
                Jenis Watermark
              </legend>
              <div className="flex gap-2">
                {(
                  [
                    ["text", "Watermark Teks"],
                    ["image", "Watermark Logo / Gambar"],
                  ] as [WatermarkTypeOption, string][]
                ).map(([val, lbl]) => (
                  <label
                    key={val}
                    className={cn(
                      "inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium",
                      wmType === val
                        ? "border-[var(--brand-primary)] bg-[var(--brand-subtle-bg)] text-[var(--brand-subtle-fg)]"
                        : "border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-secondary)]"
                    )}
                  >
                    <input
                      type="radio"
                      name={`${formId}-iwm`}
                      value={val}
                      checked={wmType === val}
                      onChange={() => setWmType(val)}
                    />
                    <span>{lbl}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            {wmType === "text" ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="space-y-1 sm:col-span-2">
                  <label htmlFor={`${formId}-iwm-text`} className="text-xs font-medium">
                    Teks Watermark
                  </label>
                  <Input
                    id={`${formId}-iwm-text`}
                    value={wmText}
                    onChange={(e) => setWmText(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor={`${formId}-iwm-col`} className="text-xs font-medium">
                    Warna
                  </label>
                  <input
                    id={`${formId}-iwm-col`}
                    type="color"
                    value={wmColor}
                    onChange={(e) => setWmColor(e.target.value)}
                    className="block h-9 w-14 cursor-pointer rounded border border-[var(--border-default)] bg-transparent p-0.5"
                  />
                </div>
                <div className="space-y-1 sm:col-span-3">
                  <label htmlFor={`${formId}-iwm-size`} className="text-xs font-medium">
                    Ukuran Teks Relatif: <span className="font-mono">{wmSizePct}%</span>
                  </label>
                  <input
                    id={`${formId}-iwm-size`}
                    type="range"
                    min={2}
                    max={20}
                    value={wmSizePct}
                    onChange={(e) => setWmSizePct(Number(e.target.value))}
                    className="w-full cursor-pointer"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <FileDropzone
                  label="Pilih Logo Watermark (PNG/JPG)"
                  acceptAttr={IMAGE_ACCEPT}
                  allowedExtensions={IMAGE_EXTENSIONS}
                  showImageThumbnails
                  files={logoFiles}
                  onFilesChange={setLogoFiles}
                />
                <div className="space-y-1">
                  <label htmlFor={`${formId}-iwm-lscale`} className="text-xs font-medium">
                    Ukuran Logo: <span className="font-mono">{wmLogoScale}%</span>
                  </label>
                  <input
                    id={`${formId}-iwm-lscale`}
                    type="range"
                    min={5}
                    max={70}
                    value={wmLogoScale}
                    onChange={(e) => setWmLogoScale(Number(e.target.value))}
                    className="w-full cursor-pointer"
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label htmlFor={`${formId}-iwm-pos`} className="text-xs font-medium">
                  Posisi
                </label>
                <select
                  id={`${formId}-iwm-pos`}
                  value={wmPosition}
                  onChange={(e) =>
                    setWmPosition(e.target.value as WatermarkPositionOption)
                  }
                  className="min-h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-input)] px-3 py-1.5 text-sm"
                >
                  <option value="bottom_right">Kanan Bawah</option>
                  <option value="bottom_left">Kiri Bawah</option>
                  <option value="top_right">Kanan Atas</option>
                  <option value="top_left">Kiri Atas</option>
                  <option value="center">Tengah</option>
                  <option value="tile">Pola Berulang (Tile)</option>
                </select>
              </div>
              <div className="space-y-1">
                <label htmlFor={`${formId}-iwm-op`} className="text-xs font-medium">
                  Opasitas: <span className="font-mono">{Math.round(wmOpacity * 100)}%</span>
                </label>
                <input
                  id={`${formId}-iwm-op`}
                  type="range"
                  min={0.05}
                  max={1}
                  step={0.05}
                  value={wmOpacity}
                  onChange={(e) => setWmOpacity(Number(e.target.value))}
                  className="w-full cursor-pointer"
                />
              </div>
            </div>
          </div>
        )}

        {/* #26 Image Collage */}
        {tool.id === "image-collage" && (
          <div className="grid grid-cols-1 gap-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/40 p-4 sm:grid-cols-2">
            <fieldset className="space-y-2 sm:col-span-2">
              <legend className="text-xs font-medium text-[var(--text-primary)]">
                Tata Letak Kolase
              </legend>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["grid", "Grid"],
                    ["horizontal", "Mendatar (1 Baris)"],
                    ["vertical", "Menurun (1 Kolom)"],
                  ] as [CollageLayoutOption, string][]
                ).map(([val, lbl]) => (
                  <label
                    key={val}
                    className={cn(
                      "inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium",
                      collageLayout === val
                        ? "border-[var(--brand-primary)] bg-[var(--brand-subtle-bg)] text-[var(--brand-subtle-fg)]"
                        : "border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-secondary)]"
                    )}
                  >
                    <input
                      type="radio"
                      name={`${formId}-clayout`}
                      value={val}
                      checked={collageLayout === val}
                      onChange={() => setCollageLayout(val)}
                    />
                    <span>{lbl}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            {collageLayout === "grid" && (
              <div className="space-y-1">
                <label htmlFor={`${formId}-ccols`} className="text-xs font-medium">
                  Jumlah Kolom
                </label>
                <Input
                  id={`${formId}-ccols`}
                  type="number"
                  min={1}
                  max={4}
                  value={collageCols}
                  onChange={(e) =>
                    setCollageCols(Math.min(4, Math.max(1, Number(e.target.value))))
                  }
                />
              </div>
            )}

            <div className="space-y-1">
              <label htmlFor={`${formId}-ccell`} className="text-xs font-medium">
                Ukuran Sel (px)
              </label>
              <Input
                id={`${formId}-ccell`}
                type="number"
                min={120}
                max={1200}
                value={collageCellPx}
                onChange={(e) => setCollageCellPx(Number(e.target.value))}
              />
            </div>

            <div className="space-y-1">
              <label htmlFor={`${formId}-cgap`} className="text-xs font-medium">
                Jarak Antar Foto: <span className="font-mono">{collageGapPx} px</span>
              </label>
              <input
                id={`${formId}-cgap`}
                type="range"
                min={0}
                max={60}
                value={collageGapPx}
                onChange={(e) => setCollageGapPx(Number(e.target.value))}
                className="w-full cursor-pointer"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor={`${formId}-cpad`} className="text-xs font-medium">
                Padding Tepi: <span className="font-mono">{collagePadPx} px</span>
              </label>
              <input
                id={`${formId}-cpad`}
                type="range"
                min={0}
                max={60}
                value={collagePadPx}
                onChange={(e) => setCollagePadPx(Number(e.target.value))}
                className="w-full cursor-pointer"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor={`${formId}-cfit`} className="text-xs font-medium">
                Penyesuaian Foto
              </label>
              <select
                id={`${formId}-cfit`}
                value={collageFit}
                onChange={(e) => setCollageFit(e.target.value as CollageFitOption)}
                className="min-h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-input)] px-3 py-1.5 text-sm"
              >
                <option value="cover">Penuhi Kotak (Cover)</option>
                <option value="contain">Utuh dengan Latar (Contain)</option>
              </select>
            </div>

            <div className="flex items-center gap-4">
              <div className="space-y-1">
                <label htmlFor={`${formId}-cbg`} className="text-xs font-medium">
                  Warna Latar
                </label>
                <input
                  id={`${formId}-cbg`}
                  type="color"
                  value={collageBg}
                  onChange={(e) => setCollageBg(e.target.value)}
                  className="block h-9 w-12 cursor-pointer rounded border border-[var(--border-default)] bg-transparent p-0.5"
                />
              </div>
              <div className="flex-1 space-y-1">
                <label htmlFor={`${formId}-cfmt`} className="text-xs font-medium">
                  Format Hasil
                </label>
                <select
                  id={`${formId}-cfmt`}
                  value={collageFormat}
                  onChange={(e) =>
                    setCollageFormat(e.target.value as ImageTargetFormatOption)
                  }
                  className="min-h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-input)] px-3 py-1.5 text-sm"
                >
                  <option value="jpg">JPG</option>
                  <option value="png">PNG</option>
                  <option value="webp">WEBP</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Progress Bar */}
        {submitting && (
          <div className="space-y-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-4">
            <div className="flex items-center gap-2 text-xs font-medium text-[var(--text-primary)]">
              <Loader2 className="h-4 w-4 animate-spin text-[var(--brand-primary)]" aria-hidden="true" />
              <span>
                {progressValue === null
                  ? "Memproses gambar di FastAPI..."
                  : `Mengunggah & memproses (${progressValue}%)...`}
              </span>
            </div>
            <Progress
              value={progressValue === null ? undefined : progressValue}
              max={100}
              label="Progres pemrosesan gambar"
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
            onClick={handleReset}
            disabled={submitting}
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            <span>Reset</span>
          </Button>
        </div>
      </form>

      {/* #27 Image Information Table Result */}
      {infoResult && (
        <div className="space-y-4">
          <div
            tabIndex={0}
            role="region"
            aria-labelledby={`${formId}-info-cap`}
            className="overflow-x-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)]"
          >
            <table className="w-full border-collapse text-left text-sm">
              <caption id={`${formId}-info-cap`} className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-secondary)]">
                Informasi Teknis Gambar ({infoResult.count} file)
              </caption>
              <thead className="border-y border-[var(--border-subtle)] bg-[var(--surface-muted)] text-xs text-[var(--text-secondary)]">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-medium">Nama File</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Format</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Dimensi</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Rasio</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">DPI</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Mode Warna</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Ukuran</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)] text-xs">
                {infoResult.items.map((item, idx) => (
                  <tr key={idx}>
                    <th scope="row" className="px-4 py-3 font-medium text-[var(--text-primary)]">
                      {item.filename}
                    </th>
                    <td className="px-4 py-3">
                      <Badge variant="default">{item.format}</Badge>
                    </td>
                    <td className="px-4 py-3 font-mono">
                      {item.width} × {item.height} px ({item.megapixels} MP)
                    </td>
                    <td className="px-4 py-3 font-mono">{item.aspect_ratio}</td>
                    <td className="px-4 py-3 font-mono">
                      {item.dpi_x ? `${item.dpi_x} × ${item.dpi_y ?? item.dpi_x}` : "Tidak diset"}
                    </td>
                    <td className="px-4 py-3 font-mono">
                      {item.color_mode} {item.has_alpha ? "(Alpha)" : ""}
                    </td>
                    <td className="px-4 py-3 font-mono">
                      {formatBytes(item.file_size_bytes)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {infoResult.items.some((item) => Object.keys(item.exif).length > 0) && (
            <div className="space-y-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/50 p-4">
              <p className="text-xs font-semibold text-[var(--text-primary)]">
                Metadata EXIF Terdeteksi
              </p>
              {infoResult.items.map(
                (item, idx) =>
                  Object.keys(item.exif).length > 0 && (
                    <div key={idx} className="space-y-1 text-xs">
                      <p className="font-medium text-[var(--text-secondary)]">
                        {item.filename}
                      </p>
                      <dl className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                        {Object.entries(item.exif).map(([k, v]) => (
                          <div key={k} className="flex gap-2">
                            <dt className="font-mono text-[var(--text-muted)]">{k}:</dt>
                            <dd className="truncate text-[var(--text-primary)]">{v}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  )
              )}
            </div>
          )}
        </div>
      )}

      {result && <PdfResultPreview result={result} onReset={handleReset} />}
    </div>
  );
}

