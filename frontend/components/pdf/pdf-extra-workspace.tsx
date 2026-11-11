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
  extractPdfText,
  markdownToPdfJob,
  readPdfMetadata,
  type PdfTextExtractResult,
} from "@/lib/extra-api";
import { revokePdfJobResult, submitPdfJob } from "@/lib/pdf-api";
import type { PaperSizeOption, PdfJobResult } from "@/types/pdf";
import type { ToolDefinition } from "@/types/tools";

const PDF_ACCEPT = ".pdf,application/pdf";
const PDF_EXTENSIONS = [".pdf"];

const SAMPLE_MARKDOWN = `# Ringkasan Proyek RuangKerja

Dokumen ini dibuat langsung dari **Markdown to PDF**.

## Poin Utama
- Konversi cepat dengan tipografi bersih dan rapi.
- Mendukung teks **tebal**, *miring*, dan \`kode inline\`.
- Cocok untuk SOP, catatan rapat, maupun dokumentasi internal.

> Catatan: Seluruh pemrosesan dilakukan secara lokal di server FastAPI Anda.
`;

export function PdfExtraWorkspace({ tool }: { tool: ToolDefinition }) {
  const formId = useId();
  const [files, setFiles] = useState<SelectedFileItem[]>([]);
  const [password, setPassword] = useState("");
  const [pagesSpec, setPagesSpec] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [progressValue, setProgressValue] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<PdfJobResult | null>(null);

  // #51 Extract Text
  const [textResult, setTextResult] = useState<PdfTextExtractResult | null>(null);
  const [copiedText, setCopiedText] = useState(false);

  // #52 Protect PDF
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newOwnerPassword, setNewOwnerPassword] = useState("");
  const [allowPrinting, setAllowPrinting] = useState(true);

  // #54 Metadata Editor
  const [metaTitle, setMetaTitle] = useState("");
  const [metaAuthor, setMetaAuthor] = useState("");
  const [metaSubject, setMetaSubject] = useState("");
  const [metaKeywords, setMetaKeywords] = useState("");
  const [metaCreator, setMetaCreator] = useState("");
  const [metaLoaded, setMetaLoaded] = useState(false);

  // #55 Markdown to PDF
  const [mdText, setMdText] = useState(SAMPLE_MARKDOWN);
  const [mdTitle, setMdTitle] = useState("Catatan Kerja RuangKerja");
  const [mdPaper, setMdPaper] = useState<PaperSizeOption>("A4");
  const [mdFontSize, setMdFontSize] = useState(10);

  useEffect(() => {
    setFiles([]);
    setPassword("");
    setPagesSpec("");
    setErrorMsg(null);
    setProgressValue(null);
    setTextResult(null);
    setMetaLoaded(false);
    setResult((prev) => {
      revokePdfJobResult(prev);
      return null;
    });
  }, [tool.id]);

  useEffect(() => {
    return () => revokePdfJobResult(result);
  }, [result]);

  async function loadPdfMeta(file: File, pwd?: string) {
    setErrorMsg(null);
    try {
      const m = await readPdfMetadata(file, pwd);
      setMetaTitle(m.title);
      setMetaAuthor(m.author);
      setMetaSubject(m.subject);
      setMetaKeywords(m.keywords);
      setMetaCreator(m.creator);
      setMetaLoaded(true);
    } catch (err) {
      setMetaLoaded(false);
      setErrorMsg(err instanceof Error ? err.message : "Gagal membaca metadata PDF.");
    }
  }

  function handleReset() {
    setFiles([]);
    setPassword("");
    setPagesSpec("");
    setErrorMsg(null);
    setTextResult(null);
    setMetaLoaded(false);
    setResult((prev) => {
      revokePdfJobResult(prev);
      return null;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    if (tool.id === "markdown-to-pdf") {
      if (!mdText.trim()) {
        setErrorMsg("Masukkan konten Markdown terlebih dahulu.");
        return;
      }
      setSubmitting(true);
      try {
        const jobRes = await markdownToPdfJob({
          markdown_text: mdText,
          document_title: mdTitle,
          paper_size: mdPaper,
          margin_mm: 18,
          font_size: mdFontSize,
        });
        setResult((prev) => {
          revokePdfJobResult(prev);
          return jobRes;
        });
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Gagal membuat PDF.");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (files.length === 0) {
      setErrorMsg("Pilih file PDF terlebih dahulu.");
      return;
    }

    if (tool.id === "extract-text-pdf") {
      setSubmitting(true);
      try {
        const res = await extractPdfText(files[0].file, pagesSpec, password);
        setTextResult(res);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Gagal mengekstrak teks.");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const fd = new FormData();
    fd.append("file", files[0].file);
    if (password.trim()) fd.append("password", password.trim());

    let endpoint = tool.apiEndpoint || "/api/pdf/protect";
    if (tool.id === "protect-pdf") {
      if (newUserPassword.trim().length < 3) {
        setErrorMsg("Password baru minimal 3 karakter.");
        return;
      }
      fd.append("user_password", newUserPassword.trim());
      if (newOwnerPassword.trim()) fd.append("owner_password", newOwnerPassword.trim());
      fd.append("allow_printing", String(allowPrinting));
    } else if (tool.id === "unlock-pdf") {
      if (!password.trim()) {
        setErrorMsg("Masukkan password PDF yang sah untuk membuka proteksi.");
        return;
      }
    } else if (tool.id === "pdf-metadata-editor") {
      endpoint = "/api/pdf/metadata/update";
      fd.append("title", metaTitle);
      fd.append("author", metaAuthor);
      fd.append("subject", metaSubject);
      fd.append("keywords", metaKeywords);
      fd.append("creator", metaCreator);
    }

    setSubmitting(true);
    setProgressValue(10);
    try {
      const jobRes = await submitPdfJob(endpoint, fd, (pct) => setProgressValue(pct));
      setResult((prev) => {
        revokePdfJobResult(prev);
        return jobRes;
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Gagal memproses PDF.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={handleSubmit} className="space-y-4">
        {tool.id === "markdown-to-pdf" ? (
          <div className="space-y-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/40 p-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-1 sm:col-span-2">
                <label htmlFor={`${formId}-md-title`} className="text-xs font-medium">
                  Judul Dokumen (opsional)
                </label>
                <Input
                  id={`${formId}-md-title`}
                  value={mdTitle}
                  onChange={(e) => setMdTitle(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor={`${formId}-md-paper`} className="text-xs font-medium">
                  Ukuran Kertas &amp; Font
                </label>
                <div className="flex gap-2">
                  <select
                    id={`${formId}-md-paper`}
                    value={mdPaper}
                    onChange={(e) => setMdPaper(e.target.value as PaperSizeOption)}
                    className="min-h-9 flex-1 rounded-lg border border-[var(--border-default)] bg-[var(--surface-input)] px-2.5 py-1.5 text-sm"
                  >
                    <option value="A4">A4</option>
                    <option value="Letter">Letter</option>
                    <option value="Legal">Legal</option>
                    <option value="A3">A3</option>
                  </select>
                  <select
                    aria-label="Ukuran huruf dokumen"
                    value={mdFontSize}
                    onChange={(e) => setMdFontSize(Number(e.target.value))}
                    className="min-h-9 rounded-lg border border-[var(--border-default)] bg-[var(--surface-input)] px-2.5 py-1.5 text-sm"
                  >
                    {[9, 10, 11, 12, 14].map((sz) => (
                      <option key={sz} value={sz}>
                        {sz} pt
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor={`${formId}-md-body`} className="text-xs font-medium">
                Konten Markdown (# Judul, **Tebal**, *Miring*, - Daftar, `Kode`)
              </label>
              <textarea
                id={`${formId}-md-body`}
                rows={12}
                value={mdText}
                onChange={(e) => setMdText(e.target.value)}
                className="w-full rounded-xl border border-[var(--border-default)] bg-[var(--surface-input)] p-3 font-mono text-xs leading-relaxed"
              />
            </div>
          </div>
        ) : (
          <FileDropzone
            label="Pilih atau Seret File PDF"
            acceptAttr={PDF_ACCEPT}
            allowedExtensions={PDF_EXTENSIONS}
            files={files}
            onFilesChange={(next) => {
              setFiles(next);
              setErrorMsg(null);
              setTextResult(null);
              if (tool.id === "pdf-metadata-editor" && next[0]) {
                void loadPdfMeta(next[0].file, password || undefined);
              }
            }}
          />
        )}

        {tool.id === "extract-text-pdf" && (
          <div className="grid grid-cols-1 gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/40 p-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor={`${formId}-et-pages`} className="text-xs font-medium">
                Halaman Tertentu (opsional)
              </label>
              <Input
                id={`${formId}-et-pages`}
                value={pagesSpec}
                onChange={(e) => setPagesSpec(e.target.value)}
                placeholder="Contoh: 1-3, 5 (kosongkan = semua)"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor={`${formId}-et-pwd`} className="text-xs font-medium">
                Password PDF (jika terproteksi)
              </label>
              <Input
                id={`${formId}-et-pwd`}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Opsional..."
              />
            </div>
          </div>
        )}

        {tool.id === "protect-pdf" && (
          <div className="grid grid-cols-1 gap-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/40 p-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor={`${formId}-new-pw`} className="text-xs font-medium">
                Password Baru untuk Membuka PDF
              </label>
              <Input
                id={`${formId}-new-pw`}
                type="password"
                required
                value={newUserPassword}
                onChange={(e) => setNewUserPassword(e.target.value)}
                placeholder="Minimal 3 karakter"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor={`${formId}-own-pw`} className="text-xs font-medium">
                Password Owner / Admin (opsional)
              </label>
              <Input
                id={`${formId}-own-pw`}
                type="password"
                value={newOwnerPassword}
                onChange={(e) => setNewOwnerPassword(e.target.value)}
                placeholder="Sama dengan password utama jika kosong"
              />
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium sm:col-span-2">
              <input
                type="checkbox"
                checked={allowPrinting}
                onChange={(e) => setAllowPrinting(e.target.checked)}
                className="h-4 w-4 cursor-pointer"
              />
              <span>Izinkan penerima mencetak dokumen ini</span>
            </label>
          </div>
        )}

        {tool.id === "unlock-pdf" && (
          <div className="space-y-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/40 p-4">
            <label htmlFor={`${formId}-unlock-pw`} className="text-xs font-medium">
              Password Dokumen Saat Ini (hanya untuk dokumen yang Anda miliki izinnya)
            </label>
            <Input
              id={`${formId}-unlock-pw`}
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Masukkan password PDF..."
            />
          </div>
        )}

        {tool.id === "pdf-metadata-editor" && (
          <div className="grid grid-cols-1 gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/40 p-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor={`${formId}-mt`} className="text-xs font-medium">
                Judul Dokumen (Title)
              </label>
              <Input id={`${formId}-mt`} value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label htmlFor={`${formId}-ma`} className="text-xs font-medium">
                Penulis (Author)
              </label>
              <Input id={`${formId}-ma`} value={metaAuthor} onChange={(e) => setMetaAuthor(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label htmlFor={`${formId}-ms`} className="text-xs font-medium">
                Subjek (Subject)
              </label>
              <Input id={`${formId}-ms`} value={metaSubject} onChange={(e) => setMetaSubject(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label htmlFor={`${formId}-mk`} className="text-xs font-medium">
                Kata Kunci (Keywords)
              </label>
              <Input id={`${formId}-mk`} value={metaKeywords} onChange={(e) => setMetaKeywords(e.target.value)} />
            </div>
            {metaLoaded && (
              <p className="text-[11px] text-[var(--brand-primary)] sm:col-span-2">
                Metadata eksisting berhasil dimuat — ubah kolom di atas lalu simpan PDF baru.
              </p>
            )}
          </div>
        )}

        {submitting && (
          <div className="space-y-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-4">
            <div className="flex items-center gap-2 text-xs font-medium">
              <Loader2 className="h-4 w-4 animate-spin text-[var(--brand-primary)]" aria-hidden="true" />
              <span>Memproses dokumen di FastAPI...</span>
            </div>
            <Progress value={progressValue ?? undefined} max={100} label="Progres pemrosesan" />
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

      {textResult && (
        <div className="space-y-3 rounded-xl border border-[var(--brand-subtle-border)] bg-[var(--surface-card)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="default">{textResult.page_count} halaman</Badge>
              <Badge variant="secondary">{textResult.total_chars} karakter</Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={async () => {
                  await navigator.clipboard.writeText(textResult.full_text);
                  setCopiedText(true);
                  window.setTimeout(() => setCopiedText(false), 1800);
                }}
              >
                {copiedText ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
                <span>{copiedText ? "Tersalin!" : "Salin Semua Teks"}</span>
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  const blob = new Blob([textResult.full_text], { type: "text/plain;charset=utf-8" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `${textResult.filename.replace(/\.pdf$/i, "")}.txt`;
                  a.click();
                  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
                }}
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Unduh .TXT</span>
              </Button>
            </div>
          </div>
          <pre className="max-h-96 overflow-y-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-3 whitespace-pre-wrap font-mono text-xs text-[var(--text-primary)]">
            {textResult.full_text || "(Tidak ada teks terbaca — gunakan OCR PDF jika halaman berupa hasil scan gambar)"}
          </pre>
        </div>
      )}

      {result && <PdfResultPreview result={result} onReset={handleReset} />}
    </div>
  );
}

