"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useId, useState } from "react";
import { Check, Copy, Loader2, Play, RotateCcw } from "lucide-react";

import {
  FileDropzone,
  type SelectedFileItem,
} from "@/components/shared/file-dropzone";
import { PdfResultPreview } from "@/components/shared/pdf-result-preview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { fetchColorPalette, type PaletteColorResult } from "@/lib/extra-api";
import { revokeJobResult, submitBinaryFileJob } from "@/lib/file-job-client";
import { cn } from "@/lib/utils";
import type { PdfJobResult } from "@/types/pdf";
import type { ToolDefinition } from "@/types/tools";

const IMAGE_ACCEPT =
  ".jpg,.jpeg,.png,.webp,.tif,.tiff,image/jpeg,image/png,image/webp,image/tiff";
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff"];

export function ImageExtraWorkspace({ tool }: { tool: ToolDefinition }) {
  const formId = useId();
  const [files, setFiles] = useState<SelectedFileItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [progressValue, setProgressValue] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<PdfJobResult | null>(null);
  const [firstImgUrl, setFirstImgUrl] = useState<string | null>(null);

  // #56 Filters
  const [brightness, setBrightness] = useState(1.0);
  const [contrast, setContrast] = useState(1.0);
  const [saturation, setSaturation] = useState(1.0);
  const [sharpness, setSharpness] = useState(1.0);
  const [blurRadius, setBlurRadius] = useState(0);
  const [effect, setEffect] = useState<"none" | "grayscale" | "sepia" | "invert">("none");

  // #57 Frame
  const [cornerRadiusPct, setCornerRadiusPct] = useState(14);
  const [borderPx, setBorderPx] = useState(12);
  const [borderColor, setBorderColor] = useState("#0D7A68");
  const [frameFmt, setFrameFmt] = useState<"png" | "jpg" | "webp">("png");

  // #58 Favicon Pack
  const [appName, setAppName] = useState("RuangKerja App");
  const [themeColor, setThemeColor] = useState("#0D7A68");

  // #59 Social Media Preset
  const [socialPreset, setSocialPreset] = useState("ig_square");
  const [socialFit, setSocialFit] = useState<"cover" | "contain">("cover");
  const [socialBg, setSocialBg] = useState("#FFFFFF");

  // #60 Palette Extractor
  const [colorCount, setColorCount] = useState(6);
  const [paletteResult, setPaletteResult] = useState<PaletteColorResult | null>(null);
  const [copiedHex, setCopiedHex] = useState<string | null>(null);

  const isMulti =
    tool.id === "image-filters" ||
    tool.id === "image-round-frame" ||
    tool.id === "social-media-resizer" ||
    tool.id === "image-strip-exif";

  useEffect(() => {
    setFiles([]);
    setErrorMsg(null);
    setProgressValue(null);
    setPaletteResult(null);
    setResult((prev) => {
      revokeJobResult(prev);
      return null;
    });
  }, [tool.id]);

  useEffect(() => {
    return () => revokeJobResult(result);
  }, [result]);

  useEffect(() => {
    if (files.length === 0) {
      setFirstImgUrl(null);
      return;
    }
    const url = URL.createObjectURL(files[0].file);
    setFirstImgUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [files]);

  function handleReset() {
    setFiles([]);
    setErrorMsg(null);
    setPaletteResult(null);
    setBrightness(1);
    setContrast(1);
    setSaturation(1);
    setSharpness(1);
    setBlurRadius(0);
    setEffect("none");
    setResult((prev) => {
      revokeJobResult(prev);
      return null;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    if (files.length === 0) {
      setErrorMsg("Pilih minimal satu gambar terlebih dahulu.");
      return;
    }

    if (tool.id === "color-palette-extractor") {
      setSubmitting(true);
      try {
        const res = await fetchColorPalette(files[0].file, colorCount);
        setPaletteResult(res);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Gagal mengekstrak palet warna.");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const fd = new FormData();
    if (tool.id === "favicon-pack-generator") {
      fd.append("file", files[0].file);
      fd.append("app_name", appName);
      fd.append("theme_color_hex", themeColor);
    } else {
      for (const item of files) fd.append("files", item.file);
    }

    if (tool.id === "image-filters") {
      fd.append("brightness", String(brightness));
      fd.append("contrast", String(contrast));
      fd.append("saturation", String(saturation));
      fd.append("sharpness", String(sharpness));
      fd.append("blur_radius", String(blurRadius));
      fd.append("effect", effect);
    } else if (tool.id === "image-round-frame") {
      fd.append("corner_radius_pct", String(cornerRadiusPct));
      fd.append("border_px", String(borderPx));
      fd.append("border_color_hex", borderColor);
      fd.append("output_format", frameFmt);
    } else if (tool.id === "social-media-resizer") {
      fd.append("preset", socialPreset);
      fd.append("fit_mode", socialFit);
      fd.append("background_hex", socialBg);
    }

    setSubmitting(true);
    setProgressValue(10);
    try {
      const res = await submitBinaryFileJob(
        tool.apiEndpoint || "/api/images/adjust",
        fd,
        (pct) => setProgressValue(pct)
      );
      setResult((prev) => {
        revokeJobResult(prev);
        return res;
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Gagal memproses gambar.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={handleSubmit} className="space-y-4">
        <FileDropzone
          label={isMulti ? "Pilih Gambar (Mendukung Banyak File)" : "Pilih 1 Gambar dari Komputer"}
          acceptAttr={IMAGE_ACCEPT}
          allowedExtensions={IMAGE_EXTENSIONS}
          multiple={isMulti}
          showImageThumbnails
          files={files}
          onFilesChange={(next) => {
            setFiles(next);
            setErrorMsg(null);
            setPaletteResult(null);
          }}
        />

        {tool.id === "image-filters" && (
          <div className="space-y-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/40 p-4">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["none", "Normal"],
                  ["grayscale", "Hitam Putih (Grayscale)"],
                  ["sepia", "Klasik Sepia"],
                  ["invert", "Inversi Warna"],
                ] as const
              ).map(([val, lbl]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setEffect(val)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-xs font-medium cursor-pointer",
                    effect === val
                      ? "border-[var(--brand-primary)] bg-[var(--brand-subtle-bg)] text-[var(--brand-subtle-fg)]"
                      : "border-[var(--border-subtle)] bg-[var(--surface-card)]"
                  )}
                >
                  {lbl}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[
                { id: "br", lbl: `Kecerahan (${Math.round(brightness * 100)}%)`, val: brightness, min: 0.3, max: 2.2, step: 0.05, set: setBrightness },
                { id: "ct", lbl: `Kontras (${Math.round(contrast * 100)}%)`, val: contrast, min: 0.3, max: 2.2, step: 0.05, set: setContrast },
                { id: "st", lbl: `Saturasi (${Math.round(saturation * 100)}%)`, val: saturation, min: 0, max: 2.2, step: 0.05, set: setSaturation },
                { id: "sh", lbl: `Ketajaman (${Math.round(sharpness * 100)}%)`, val: sharpness, min: 0, max: 2.8, step: 0.1, set: setSharpness },
                { id: "bl", lbl: `Blur (${blurRadius} px)`, val: blurRadius, min: 0, max: 10, step: 0.5, set: setBlurRadius },
              ].map((ctrl) => (
                <div key={ctrl.id} className="space-y-1">
                  <label htmlFor={`${formId}-${ctrl.id}`} className="text-xs font-medium">
                    {ctrl.lbl}
                  </label>
                  <input
                    id={`${formId}-${ctrl.id}`}
                    type="range"
                    min={ctrl.min}
                    max={ctrl.max}
                    step={ctrl.step}
                    value={ctrl.val}
                    onChange={(e) => ctrl.set(Number(e.target.value))}
                    className="w-full cursor-pointer"
                  />
                </div>
              ))}
            </div>

            {firstImgUrl && (
              <div className="flex justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4">
                <img
                  src={firstImgUrl}
                  alt="Pratinjau filter langsung"
                  className="max-h-52 rounded-lg object-contain"
                  style={{
                    filter: `brightness(${brightness}) contrast(${contrast}) saturate(${saturation}) blur(${blurRadius}px) ${
                      effect === "grayscale"
                        ? "grayscale(100%)"
                        : effect === "sepia"
                          ? "sepia(90%)"
                          : effect === "invert"
                            ? "invert(100%)"
                            : ""
                    }`,
                  }}
                />
              </div>
            )}
          </div>
        )}

        {tool.id === "image-round-frame" && (
          <div className="grid grid-cols-1 gap-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/40 p-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor={`${formId}-rad`} className="text-xs font-medium">
                Sudut Membulat: <span className="font-mono">{cornerRadiusPct}%</span>
              </label>
              <input
                id={`${formId}-rad`}
                type="range"
                min={0}
                max={50}
                value={cornerRadiusPct}
                onChange={(e) => setCornerRadiusPct(Number(e.target.value))}
                className="w-full cursor-pointer"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor={`${formId}-bpx`} className="text-xs font-medium">
                Tebal Bingkai: <span className="font-mono">{borderPx} px</span>
              </label>
              <input
                id={`${formId}-bpx`}
                type="range"
                min={0}
                max={80}
                value={borderPx}
                onChange={(e) => setBorderPx(Number(e.target.value))}
                className="w-full cursor-pointer"
              />
            </div>
            <div className="flex items-center gap-3">
              <label htmlFor={`${formId}-bcol`} className="text-xs font-medium">
                Warna Bingkai:
              </label>
              <input
                id={`${formId}-bcol`}
                type="color"
                value={borderColor}
                onChange={(e) => setBorderColor(e.target.value)}
                className="h-9 w-12 cursor-pointer rounded border border-[var(--border-default)] bg-transparent p-0.5"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor={`${formId}-ffmt`} className="text-xs font-medium">
                Format Hasil (PNG/WEBP mendukung sudut transparan)
              </label>
              <select
                id={`${formId}-ffmt`}
                value={frameFmt}
                onChange={(e) => setFrameFmt(e.target.value as "png" | "jpg" | "webp")}
                className="min-h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-input)] px-3 py-1.5 text-sm"
              >
                <option value="png">PNG (Transparan)</option>
                <option value="webp">WEBP (Transparan)</option>
                <option value="jpg">JPG (Bingkai Solid)</option>
              </select>
            </div>
          </div>
        )}

        {tool.id === "favicon-pack-generator" && (
          <div className="grid grid-cols-1 gap-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/40 p-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor={`${formId}-aname`} className="text-xs font-medium">
                Nama Aplikasi Web (site.webmanifest)
              </label>
              <Input
                id={`${formId}-aname`}
                value={appName}
                onChange={(e) => setAppName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor={`${formId}-acol`} className="text-xs font-medium">
                Theme Color Manifest
              </label>
              <input
                id={`${formId}-acol`}
                type="color"
                value={themeColor}
                onChange={(e) => setThemeColor(e.target.value)}
                className="block h-9 w-14 cursor-pointer rounded border border-[var(--border-default)] bg-transparent p-0.5"
              />
            </div>
          </div>
        )}

        {tool.id === "social-media-resizer" && (
          <div className="grid grid-cols-1 gap-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/40 p-4 sm:grid-cols-3">
            <div className="space-y-1 sm:col-span-2">
              <label htmlFor={`${formId}-socp`} className="text-xs font-medium">
                Preset Platform &amp; Ukuran Piksel
              </label>
              <select
                id={`${formId}-socp`}
                value={socialPreset}
                onChange={(e) => setSocialPreset(e.target.value)}
                className="min-h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-input)] px-3 py-1.5 text-sm"
              >
                <option value="ig_square">Instagram Post Persegi (1080 × 1080)</option>
                <option value="ig_portrait">Instagram Portrait 4:5 (1080 × 1350)</option>
                <option value="ig_story">Instagram Story / Reels / TikTok (1080 × 1920)</option>
                <option value="yt_thumb">YouTube Thumbnail 16:9 (1280 × 720)</option>
                <option value="linkedin_banner">LinkedIn Banner (1584 × 396)</option>
                <option value="x_header">X / Twitter Header (1500 × 500)</option>
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor={`${formId}-socf`} className="text-xs font-medium">
                Penyesuaian
              </label>
              <div className="flex gap-2">
                <select
                  id={`${formId}-socf`}
                  value={socialFit}
                  onChange={(e) => setSocialFit(e.target.value as "cover" | "contain")}
                  className="min-h-9 flex-1 rounded-lg border border-[var(--border-default)] bg-[var(--surface-input)] px-2.5 py-1.5 text-sm"
                >
                  <option value="cover">Cover (Crop Rapi)</option>
                  <option value="contain">Contain (Utuh + Latar)</option>
                </select>
                <input
                  aria-label="Warna latar contain"
                  type="color"
                  value={socialBg}
                  onChange={(e) => setSocialBg(e.target.value)}
                  className="h-9 w-10 cursor-pointer rounded border border-[var(--border-default)] bg-transparent p-0.5"
                />
              </div>
            </div>
          </div>
        )}

        {tool.id === "color-palette-extractor" && (
          <div className="space-y-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/40 p-4">
            <label htmlFor={`${formId}-ccnt`} className="text-xs font-medium">
              Jumlah Warna Dominan: <span className="font-mono">{colorCount} warna</span>
            </label>
            <input
              id={`${formId}-ccnt`}
              type="range"
              min={2}
              max={12}
              value={colorCount}
              onChange={(e) => setColorCount(Number(e.target.value))}
              className="w-full cursor-pointer"
            />
          </div>
        )}

        {submitting && (
          <div className="space-y-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-4">
            <div className="flex items-center gap-2 text-xs font-medium">
              <Loader2 className="h-4 w-4 animate-spin text-[var(--brand-primary)]" aria-hidden="true" />
              <span>Memproses gambar di FastAPI...</span>
            </div>
            <Progress value={progressValue ?? undefined} max={100} label="Progres pemrosesan gambar" />
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

      {paletteResult && (
        <div className="space-y-3 rounded-xl border border-[var(--brand-subtle-border)] bg-[var(--surface-card)] p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Palet Warna Dominan — {paletteResult.filename}</p>
            <Badge variant="default">{paletteResult.colors.length} warna</Badge>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {paletteResult.colors.map((c) => (
              <button
                key={c.hex}
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(c.hex);
                  setCopiedHex(c.hex);
                  window.setTimeout(() => setCopiedHex(null), 1500);
                }}
                className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/60 p-3 text-left hover:border-[var(--brand-primary)] cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <span
                    className="h-10 w-10 shrink-0 rounded-lg border border-black/10 shadow-2xs"
                    style={{ backgroundColor: c.hex }}
                    aria-hidden="true"
                  />
                  <div>
                    <p className="font-mono text-sm font-semibold">{c.hex}</p>
                    <p className="font-mono text-[11px] text-[var(--text-muted)]">
                      rgb({c.r}, {c.g}, {c.b}) • {c.percent}%
                    </p>
                  </div>
                </div>
                {copiedHex === c.hex ? (
                  <Check className="h-4 w-4 text-[var(--brand-primary)]" aria-hidden="true" />
                ) : (
                  <Copy className="h-4 w-4 text-[var(--text-muted)]" aria-hidden="true" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {result && <PdfResultPreview result={result} onReset={handleReset} />}
    </div>
  );
}

