"use client";

import { useEffect, useId, useMemo, useState } from "react";
import {
  Bell,
  Check,
  Copy,
  Download,
  Flag,
  Loader2,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";

import { PdfResultPreview } from "@/components/shared/pdf-result-preview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  analyzeWordFrequency,
  computeLineDiff,
} from "@/lib/dev-tools";
import {
  generateBarcodeJob,
  generateInvoicePdfJob,
  markdownToPdfJob,
} from "@/lib/extra-api";
import { getTodayIsoDate } from "@/lib/greeting";
import { revokePdfJobResult } from "@/lib/pdf-api";
import { playCompletionChime } from "@/lib/pomodoro-audio";
import { cn } from "@/lib/utils";
import type { PdfJobResult } from "@/types/pdf";
import type { ToolDefinition } from "@/types/tools";

export const EXTRA_PRODUCTIVITY_IDS = new Set([
  "markdown-notes",
  "meeting-minutes-generator",
  "invoice-pdf-generator",
  "barcode-generator",
  "stopwatch-countdown",
  "text-diff-checker",
  "word-frequency-analyzer",
]);

const MARKDOWN_STORAGE_KEY = "ruangkerja-markdown-note-v1";
const DEFAULT_MARKDOWN_NOTE = `# Catatan Kerja Harian

Gunakan editor **Markdown Notes** ini untuk mencatat ide, SOP, atau ringkasan proyek.

## Daftar Prioritas Hari Ini
- Review laporan keuangan Q3 bersama tim
- Kirim invoice proyek klien sebelum jam 16.00
- Perbarui dokumentasi \`API v2\`

> Tip: Klik tombol "Ekspor ke PDF" untuk menyimpan catatan ini menjadi dokumen PDF rapi.`;

function formatStopwatchMs(ms: number): string {
  const clamped = Math.max(0, Math.floor(ms));
  const mins = Math.floor(clamped / 60_000);
  const secs = Math.floor((clamped % 60_000) / 1000);
  const centis = Math.floor((clamped % 1000) / 10);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(
    centis
  ).padStart(2, "0")}`;
}

function formatCountdownSec(totalSec: number): string {
  const safe = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  if (h > 0) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function downloadPlainTextFile(filename: string, content: string, mime = "text/plain;charset=utf-8"): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function renderInlineMarkdown(text: string): React.ReactNode[] {
  const tokens = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return tokens.map((part, idx) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={idx} className="font-semibold text-[var(--text-primary)]">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return (
        <em key={idx} className="italic">
          {part.slice(1, -1)}
        </em>
      );
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code
          key={idx}
          className="rounded bg-[var(--surface-muted)] px-1.5 py-0.5 font-mono text-[12px] text-[var(--brand-primary)]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={idx}>{part}</span>;
  });
}

function MarkdownSafePreview({ source }: { source: string }) {
  const lines = source.split(/\r?\n/);
  return (
    <div className="space-y-2 text-sm leading-relaxed text-[var(--text-secondary)]">
      {lines.map((rawLine, idx) => {
        const line = rawLine.trimEnd();
        if (!line.trim()) {
          return <div key={idx} className="h-2" />;
        }
        if (line.startsWith("### ")) {
          return (
            <h4 key={idx} className="pt-1 text-sm font-semibold text-[var(--text-primary)]">
              {renderInlineMarkdown(line.slice(4))}
            </h4>
          );
        }
        if (line.startsWith("## ")) {
          return (
            <h3 key={idx} className="pt-2 text-base font-semibold text-[var(--text-primary)]">
              {renderInlineMarkdown(line.slice(3))}
            </h3>
          );
        }
        if (line.startsWith("# ")) {
          return (
            <h2
              key={idx}
              className="border-b border-[var(--border-subtle)] pb-1 text-lg font-bold text-[var(--text-primary)]"
            >
              {renderInlineMarkdown(line.slice(2))}
            </h2>
          );
        }
        if (/^---+$/.test(line.trim())) {
          return <hr key={idx} className="my-2 border-[var(--border-subtle)]" />;
        }
        if (line.startsWith("> ")) {
          return (
            <blockquote
              key={idx}
              className="border-l-4 border-[var(--brand-primary)] bg-[var(--brand-soft)]/40 px-3 py-1.5 text-xs italic text-[var(--text-primary)]"
            >
              {renderInlineMarkdown(line.slice(2))}
            </blockquote>
          );
        }
        if (/^[-*]\s+/.test(line)) {
          return (
            <div key={idx} className="flex items-start gap-2 pl-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--brand-primary)]" />
              <span>{renderInlineMarkdown(line.replace(/^[-*]\s+/, ""))}</span>
            </div>
          );
        }
        if (/^\d+\.\s+/.test(line)) {
          const numMatch = line.match(/^(\d+\.)\s+(.*)$/);
          if (numMatch) {
            return (
              <div key={idx} className="flex items-start gap-2 pl-1">
                <span className="font-semibold text-[var(--brand-primary)]">{numMatch[1]}</span>
                <span>{renderInlineMarkdown(numMatch[2])}</span>
              </div>
            );
          }
        }
        return <p key={idx}>{renderInlineMarkdown(line)}</p>;
      })}
    </div>
  );
}

export function ProductivityExtraWorkspace({ tool }: { tool: ToolDefinition }) {
  const formId = useId();
  const todayIso = getTodayIsoDate();

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [pdfResult, setPdfResult] = useState<PdfJobResult | null>(null);

  // #72 Markdown Notes
  const [mdTitle, setMdTitle] = useState("Catatan Kerja RuangKerja");
  const [mdText, setMdText] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(MARKDOWN_STORAGE_KEY) || DEFAULT_MARKDOWN_NOTE;
    }
    return DEFAULT_MARKDOWN_NOTE;
  });

  // #73 Meeting Minutes Generator
  const [momTitle, setMomTitle] = useState("Rapat Sinkronisasi Mingguan Tim");
  const [momDate, setMomDate] = useState(todayIso);
  const [momLocation, setMomLocation] = useState("Ruang Rapat / Google Meet");
  const [momParticipants, setMomParticipants] = useState("Andi, Budi, Citra, Dimas");
  const [momAgenda, setMomAgenda] = useState(
    "- Review progres sprint minggu ini\n- Finalisasi jadwal rilis fitur baru\n- Pembagian PIC untuk uji coba pengguna"
  );
  const [momDecisions, setMomDecisions] = useState(
    "- Rilis versi beta dijadwalkan hari Jumat pukul 14.00\n- Pengujian internal dimulai hari Rabu"
  );
  const [momActions, setMomActions] = useState<
    { id: string; task: string; pic: string; due: string }[]
  >([
    { id: "a1", task: "Siapkan checklist QA rilis beta", pic: "Citra", due: todayIso },
    { id: "a2", task: "Kirim ringkasan ke stakeholder", pic: "Andi", due: todayIso },
  ]);

  // #74 Invoice PDF Generator
  const [invDocType, setInvDocType] = useState<"INVOICE" | "KWITANSI" | "PENAWARAN">("INVOICE");
  const [invNumber, setInvNumber] = useState("INV-2026-001");
  const [invIssueDate, setInvIssueDate] = useState(todayIso);
  const [invDueDate, setInvDueDate] = useState(todayIso);
  const [invSenderName, setInvSenderName] = useState("PT RuangKerja Digital");
  const [invSenderDetails, setInvSenderDetails] = useState(
    "Jl. Jenderal Sudirman No. 10, Jakarta\nhello@ruangkerja.local • +62 812-0000-0000"
  );
  const [invClientName, setInvClientName] = useState("Klien Utama Indonesia");
  const [invClientDetails, setInvClientDetails] = useState("Jakarta Selatan • finance@klien.local");
  const [invCurrency, setInvCurrency] = useState("IDR");
  const [invItems, setInvItems] = useState<
    { id: string; description: string; quantity: number; unit_price: number }[]
  >([
    { id: "i1", description: "Jasa Pengembangan Sistem Produktivitas", quantity: 1, unit_price: 7500000 },
    { id: "i2", description: "Pelatihan & Dokumentasi Tim", quantity: 2, unit_price: 1250000 },
  ]);
  const [invDiscountPct, setInvDiscountPct] = useState(0);
  const [invTaxPct, setInvTaxPct] = useState(11);
  const [invNotes, setInvNotes] = useState(
    "Mohon transfer ke rekening BCA 123-456-7890 a.n. PT RuangKerja Digital sebelum jatuh tempo."
  );
  const [invAccent, setInvAccent] = useState("#0D7A68");

  // #75 Barcode Generator
  const [barType, setBarType] = useState<"code128" | "ean13" | "ean8">("code128");
  const [barValue, setBarValue] = useState("RK-2026-001");
  const [barFormat, setBarFormat] = useState<"svg" | "png">("svg");
  const [barScale, setBarScale] = useState(3);
  const [barHeight, setBarHeight] = useState(90);
  const [barShowText, setBarShowText] = useState(true);
  const [barFill, setBarFill] = useState("#0F172A");
  const [barBack, setBarBack] = useState("#FFFFFF");

  // #76 Stopwatch & Countdown Timer
  const [timerTab, setTimerTab] = useState<"stopwatch" | "countdown">("stopwatch");
  const [swRunning, setSwRunning] = useState(false);
  const [swElapsedMs, setSwElapsedMs] = useState(0);
  const [swAnchorTs, setSwAnchorTs] = useState<number | null>(null);
  const [swLaps, setSwLaps] = useState<{ lap: number; totalMs: number; deltaMs: number }[]>([]);

  const [cdHours, setCdHours] = useState("0");
  const [cdMinutes, setCdMinutes] = useState("5");
  const [cdSeconds, setCdSeconds] = useState("0");
  const [cdRunning, setCdRunning] = useState(false);
  const [cdRemainingSec, setCdRemainingSec] = useState(300);
  const [cdEndTs, setCdEndTs] = useState<number | null>(null);
  const [cdNotice, setCdNotice] = useState<string | null>(null);

  // #77 Text Diff Checker
  const [diffLeft, setDiffLeft] = useState(
    "Jadwal rilis versi 1.0\nFitur ekspor PDF siap\nTim QA mulai hari Senin\nCatatan internal"
  );
  const [diffRight, setDiffRight] = useState(
    "Jadwal rilis versi 2.0\nFitur ekspor PDF siap\nFitur barcode ditambahkan\nTim QA mulai hari Senin"
  );
  const [diffTrimWhitespace, setDiffTrimWhitespace] = useState(false);

  // #78 Word Frequency Analyzer
  const [freqText, setFreqText] = useState(
    "RuangKerja membantu tim mengelola pekerjaan harian, mengolah PDF, mengolah gambar, dan menyusun laporan kerja secara efisien dan produktif setiap hari."
  );

  useEffect(() => {
    setApiError(null);
    if (pdfResult) {
      revokePdfJobResult(pdfResult);
      setPdfResult(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool.id]);

  useEffect(() => {
    return () => {
      if (pdfResult) revokePdfJobResult(pdfResult);
    };
  }, [pdfResult]);

  // Persist markdown note changes
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(MARKDOWN_STORAGE_KEY, mdText);
      } catch {
        // Ignore storage quota errors
      }
    }
  }, [mdText]);

  // Stopwatch high-precision ticker
  useEffect(() => {
    if (!swRunning || swAnchorTs === null) return;
    const id = window.setInterval(() => {
      setSwElapsedMs(Date.now() - swAnchorTs);
    }, 45);
    return () => window.clearInterval(id);
  }, [swRunning, swAnchorTs]);

  // Countdown ticker
  useEffect(() => {
    if (!cdRunning || cdEndTs === null) return;
    const id = window.setInterval(() => {
      const rem = Math.max(0, Math.ceil((cdEndTs - Date.now()) / 1000));
      setCdRemainingSec(rem);
      if (rem <= 0) {
        setCdRunning(false);
        setCdEndTs(null);
        setCdNotice("Timer selesai! Waktu hitung mundur telah habis.");
        playCompletionChime();
      }
    }, 200);
    return () => window.clearInterval(id);
  }, [cdRunning, cdEndTs]);

  async function copyToClipboard(id: string, text: string) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId(null), 1800);
    } catch {
      // Ignore clipboard failures
    }
  }

  // Invoice totals preview
  const invoiceSummary = useMemo(() => {
    const subtotal = invItems.reduce(
      (sum, item) => sum + Math.max(0, item.quantity) * Math.max(0, item.unit_price),
      0
    );
    const discountAmt = subtotal * (Math.max(0, invDiscountPct) / 100);
    const afterDiscount = Math.max(0, subtotal - discountAmt);
    const taxAmt = afterDiscount * (Math.max(0, invTaxPct) / 100);
    const grandTotal = afterDiscount + taxAmt;
    return { subtotal, discountAmt, taxAmt, grandTotal };
  }, [invItems, invDiscountPct, invTaxPct]);

  // Meeting minutes formatted Markdown
  const formattedMomMarkdown = useMemo(() => {
    const actionRows =
      momActions.length > 0
        ? momActions
            .map(
              (a, i) =>
                `| ${i + 1} | ${a.task || "-"} | ${a.pic || "-"} | ${a.due || "-"} |`
            )
            .join("\n")
        : "| 1 | Belum ada action item | - | - |";
    return `# NOTULEN RAPAT: ${momTitle || "Rapat"}

- **Tanggal:** ${momDate || "-"}
- **Lokasi / Tautan:** ${momLocation || "-"}
- **Peserta:** ${momParticipants || "-"}

## Agenda & Pembahasan
${momAgenda || "-"}

## Keputusan Rapat
${momDecisions || "-"}

## Rencana Tindak Lanjut (Action Items)
| No | Tugas | PIC | Target Selesai |
| --- | --- | --- | --- |
${actionRows}
`;
  }, [momTitle, momDate, momLocation, momParticipants, momAgenda, momDecisions, momActions]);

  // Text diff lines
  const diffResult = useMemo(() => {
    const left = diffTrimWhitespace
      ? diffLeft
          .split(/\r?\n/)
          .map((l) => l.trim())
          .join("\n")
      : diffLeft;
    const right = diffTrimWhitespace
      ? diffRight
          .split(/\r?\n/)
          .map((l) => l.trim())
          .join("\n")
      : diffRight;
    const rows = computeLineDiff(left, right);
    const added = rows.filter((r) => r.type === "added").length;
    const removed = rows.filter((r) => r.type === "removed").length;
    const same = rows.filter((r) => r.type === "same").length;
    return { rows, added, removed, same };
  }, [diffLeft, diffRight, diffTrimWhitespace]);

  const wordFreqStats = useMemo(() => analyzeWordFrequency(freqText), [freqText]);

  // =========================================================================
  // #72 MARKDOWN NOTES + LIVE PREVIEW + EKSPOR PDF
  // =========================================================================
  if (tool.id === "markdown-notes") {
    async function handleExportMarkdownPdf() {
      if (!mdText.trim()) return;
      setSubmitting(true);
      setApiError(null);
      if (pdfResult) {
        revokePdfJobResult(pdfResult);
        setPdfResult(null);
      }
      try {
        const res = await markdownToPdfJob({
          markdown_text: mdText,
          document_title: mdTitle.trim() || "Catatan Markdown",
          paper_size: "A4",
          margin_mm: 18,
          font_size: 11,
        });
        setPdfResult(res);
      } catch (err) {
        setApiError(err instanceof Error ? err.message : "Gagal mengekspor Markdown ke PDF.");
      } finally {
        setSubmitting(false);
      }
    }

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-[220px] flex-1">
            <label htmlFor={`${formId}-mdtitle`} className="block text-xs font-medium text-[var(--text-secondary)]">
              Judul Catatan / PDF
            </label>
            <Input
              id={`${formId}-mdtitle`}
              value={mdTitle}
              onChange={(e) => setMdTitle(e.target.value)}
              className="mt-1"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void copyToClipboard("md", mdText)}
            >
              {copiedId === "md" ? (
                <Check className="h-3.5 w-3.5 text-[var(--brand-primary)]" aria-hidden="true" />
              ) : (
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span>{copiedId === "md" ? "Tersalin!" : "Salin MD"}</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => downloadPlainTextFile("catatan.md", mdText, "text/markdown;charset=utf-8")}
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Unduh .md</span>
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={submitting || !mdText.trim()}
              onClick={() => void handleExportMarkdownPdf()}
            >
              {submitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span>Ekspor ke PDF</span>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <label htmlFor={`${formId}-mdbody`} className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
              Editor Markdown (Tersimpan Otomatis di Browser)
            </label>
            <textarea
              id={`${formId}-mdbody`}
              rows={13}
              value={mdText}
              onChange={(e) => setMdText(e.target.value)}
              className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3 font-mono text-xs leading-relaxed text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
            />
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium text-[var(--text-secondary)]">
              Pratinjau Terformat
            </p>
            <div className="h-[290px] overflow-y-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/40 p-4">
              <MarkdownSafePreview source={mdText} />
            </div>
          </div>
        </div>

        {apiError && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
            {apiError}
          </p>
        )}

        {pdfResult && (
          <PdfResultPreview
            result={pdfResult}
            onReset={() => {
              revokePdfJobResult(pdfResult);
              setPdfResult(null);
            }}
          />
        )}
      </div>
    );
  }

  // =========================================================================
  // #73 MEETING MINUTES GENERATOR (NOTULEN RAPAT)
  // =========================================================================
  if (tool.id === "meeting-minutes-generator") {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <label htmlFor={`${formId}-mtitle`} className="block text-xs font-medium text-[var(--text-secondary)]">
              Judul / Topik Rapat
            </label>
            <Input
              id={`${formId}-mtitle`}
              value={momTitle}
              onChange={(e) => setMomTitle(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <label htmlFor={`${formId}-mdate`} className="block text-xs font-medium text-[var(--text-secondary)]">
              Tanggal Rapat
            </label>
            <Input
              id={`${formId}-mdate`}
              type="date"
              value={momDate}
              onChange={(e) => setMomDate(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <label htmlFor={`${formId}-mloc`} className="block text-xs font-medium text-[var(--text-secondary)]">
              Lokasi / Tautan Meeting
            </label>
            <Input
              id={`${formId}-mloc`}
              value={momLocation}
              onChange={(e) => setMomLocation(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>

        <div>
          <label htmlFor={`${formId}-mpart`} className="block text-xs font-medium text-[var(--text-secondary)]">
            Peserta Rapat
          </label>
          <Input
            id={`${formId}-mpart`}
            value={momParticipants}
            onChange={(e) => setMomParticipants(e.target.value)}
            className="mt-1"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label htmlFor={`${formId}-magenda`} className="block text-xs font-medium text-[var(--text-secondary)]">
              Agenda & Poin Pembahasan
            </label>
            <textarea
              id={`${formId}-magenda`}
              rows={4}
              value={momAgenda}
              onChange={(e) => setMomAgenda(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-2.5 text-xs text-[var(--text-primary)]"
            />
          </div>
          <div>
            <label htmlFor={`${formId}-mdec`} className="block text-xs font-medium text-[var(--text-secondary)]">
              Keputusan Rapat
            </label>
            <textarea
              id={`${formId}-mdec`}
              rows={4}
              value={momDecisions}
              onChange={(e) => setMomDecisions(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-2.5 text-xs text-[var(--text-primary)]"
            />
          </div>
        </div>

        <div className="space-y-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/30 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-[var(--text-primary)]">
              Daftar Tindak Lanjut (Action Items)
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setMomActions((prev) => [
                  ...prev,
                  { id: `act-${Date.now()}`, task: "", pic: "", due: todayIso },
                ])
              }
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Tambah Tugas</span>
            </Button>
          </div>
          <div className="space-y-2">
            {momActions.map((item, idx) => (
              <div key={item.id} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_140px_140px_auto]">
                <Input
                  aria-label={`Tugas tindak lanjut baris ${idx + 1}`}
                  placeholder="Deskripsi tugas..."
                  value={item.task}
                  onChange={(e) =>
                    setMomActions((prev) =>
                      prev.map((row) =>
                        row.id === item.id ? { ...row, task: e.target.value } : row
                      )
                    )
                  }
                />
                <Input
                  aria-label={`PIC baris ${idx + 1}`}
                  placeholder="PIC..."
                  value={item.pic}
                  onChange={(e) =>
                    setMomActions((prev) =>
                      prev.map((row) =>
                        row.id === item.id ? { ...row, pic: e.target.value } : row
                      )
                    )
                  }
                />
                <Input
                  aria-label={`Deadline baris ${idx + 1}`}
                  type="date"
                  value={item.due}
                  onChange={(e) =>
                    setMomActions((prev) =>
                      prev.map((row) =>
                        row.id === item.id ? { ...row, due: e.target.value } : row
                      )
                    )
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Hapus baris ${idx + 1}`}
                  onClick={() =>
                    setMomActions((prev) => prev.filter((row) => row.id !== item.id))
                  }
                >
                  <Trash2 className="h-4 w-4 text-red-500" aria-hidden="true" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-[var(--text-secondary)]">
              Hasil Format Notulen Siap Bagikan
            </span>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void copyToClipboard("mom", formattedMomMarkdown)}
              >
                {copiedId === "mom" ? (
                  <Check className="h-3.5 w-3.5 text-[var(--brand-primary)]" aria-hidden="true" />
                ) : (
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                <span>{copiedId === "mom" ? "Tersalin!" : "Salin Notulen"}</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  downloadPlainTextFile(
                    `notulen-${momDate || "rapat"}.md`,
                    formattedMomMarkdown,
                    "text/markdown;charset=utf-8"
                  )
                }
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Unduh .md</span>
              </Button>
            </div>
          </div>
          <pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded-lg bg-[var(--surface-muted)]/60 p-3 font-mono text-xs text-[var(--text-primary)]">
            {formattedMomMarkdown}
          </pre>
        </div>
      </div>
    );
  }

  // =========================================================================
  // #74 INVOICE PDF GENERATOR
  // =========================================================================
  if (tool.id === "invoice-pdf-generator") {
    async function handleGenerateInvoice(e: React.FormEvent) {
      e.preventDefault();
      if (!invSenderName.trim() || !invClientName.trim() || invItems.length === 0) {
        setApiError("Lengkapi nama pengirim, nama klien, dan minimal 1 item.");
        return;
      }
      setSubmitting(true);
      setApiError(null);
      if (pdfResult) {
        revokePdfJobResult(pdfResult);
        setPdfResult(null);
      }
      try {
        const res = await generateInvoicePdfJob({
          document_type: invDocType,
          invoice_number: invNumber.trim() || "INV-001",
          issue_date: invIssueDate,
          due_date: invDueDate,
          sender_name: invSenderName.trim(),
          sender_details: invSenderDetails.trim(),
          client_name: invClientName.trim(),
          client_details: invClientDetails.trim(),
          currency: invCurrency,
          items: invItems.map((it) => ({
            description: it.description.trim() || "Item Layanan",
            quantity: Math.max(0.01, Number(it.quantity) || 1),
            unit_price: Math.max(0, Number(it.unit_price) || 0),
          })),
          discount_percent: Math.max(0, Math.min(100, Number(invDiscountPct) || 0)),
          tax_percent: Math.max(0, Math.min(100, Number(invTaxPct) || 0)),
          notes: invNotes.trim(),
          accent_color: invAccent,
        });
        setPdfResult(res);
      } catch (err) {
        setApiError(err instanceof Error ? err.message : "Gagal membuat Invoice PDF.");
      } finally {
        setSubmitting(false);
      }
    }

    return (
      <form onSubmit={(e) => void handleGenerateInvoice(e)} className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label htmlFor={`${formId}-itype`} className="block text-xs font-medium text-[var(--text-secondary)]">
              Jenis Dokumen
            </label>
            <select
              id={`${formId}-itype`}
              value={invDocType}
              onChange={(e) =>
                setInvDocType(e.target.value as "INVOICE" | "KWITANSI" | "PENAWARAN")
              }
              className="mt-1 h-10 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 text-sm text-[var(--text-primary)]"
            >
              <option value="INVOICE">INVOICE</option>
              <option value="KWITANSI">KWITANSI</option>
              <option value="PENAWARAN">PENAWARAN</option>
            </select>
          </div>
          <div>
            <label htmlFor={`${formId}-inum`} className="block text-xs font-medium text-[var(--text-secondary)]">
              Nomor Dokumen
            </label>
            <Input
              id={`${formId}-inum`}
              value={invNumber}
              onChange={(e) => setInvNumber(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <label htmlFor={`${formId}-icur`} className="block text-xs font-medium text-[var(--text-secondary)]">
              Mata Uang
            </label>
            <select
              id={`${formId}-icur`}
              value={invCurrency}
              onChange={(e) => setInvCurrency(e.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 text-sm text-[var(--text-primary)]"
            >
              <option value="IDR">IDR (Rupiah)</option>
              <option value="USD">USD ($)</option>
              <option value="SGD">SGD (S$)</option>
              <option value="EUR">EUR (€)</option>
            </select>
          </div>
          <div>
            <label htmlFor={`${formId}-iissue`} className="block text-xs font-medium text-[var(--text-secondary)]">
              Tanggal Terbit
            </label>
            <Input
              id={`${formId}-iissue`}
              type="date"
              value={invIssueDate}
              onChange={(e) => setInvIssueDate(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <label htmlFor={`${formId}-idue`} className="block text-xs font-medium text-[var(--text-secondary)]">
              Jatuh Tempo
            </label>
            <Input
              id={`${formId}-idue`}
              type="date"
              value={invDueDate}
              onChange={(e) => setInvDueDate(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="space-y-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/30 p-3">
            <label htmlFor={`${formId}-isname`} className="block text-xs font-semibold text-[var(--text-primary)]">
              Dari (Pengirim / Usaha Anda)
            </label>
            <Input
              id={`${formId}-isname`}
              placeholder="Nama usaha / pengirim"
              value={invSenderName}
              onChange={(e) => setInvSenderName(e.target.value)}
            />
            <textarea
              aria-label="Detail pengirim"
              rows={2}
              value={invSenderDetails}
              onChange={(e) => setInvSenderDetails(e.target.value)}
              className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] p-2 text-xs text-[var(--text-primary)]"
            />
          </div>
          <div className="space-y-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/30 p-3">
            <label htmlFor={`${formId}-icname`} className="block text-xs font-semibold text-[var(--text-primary)]">
              Kepada (Nama Klien)
            </label>
            <Input
              id={`${formId}-icname`}
              placeholder="Nama klien / perusahaan"
              value={invClientName}
              onChange={(e) => setInvClientName(e.target.value)}
            />
            <textarea
              aria-label="Detail klien"
              rows={2}
              value={invClientDetails}
              onChange={(e) => setInvClientDetails(e.target.value)}
              className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] p-2 text-xs text-[var(--text-primary)]"
            />
          </div>
        </div>

        <div className="space-y-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-[var(--text-primary)]">Rincian Item / Jasa</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setInvItems((prev) => [
                  ...prev,
                  { id: `item-${Date.now()}`, description: "", quantity: 1, unit_price: 0 },
                ])
              }
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Tambah Item</span>
            </Button>
          </div>
          <div className="space-y-2">
            {invItems.map((it, idx) => (
              <div key={it.id} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_90px_150px_auto]">
                <Input
                  aria-label={`Deskripsi item ${idx + 1}`}
                  placeholder="Deskripsi item..."
                  value={it.description}
                  onChange={(e) =>
                    setInvItems((prev) =>
                      prev.map((row) =>
                        row.id === it.id ? { ...row, description: e.target.value } : row
                      )
                    )
                  }
                />
                <Input
                  aria-label={`Qty item ${idx + 1}`}
                  type="number"
                  min="1"
                  step="any"
                  value={it.quantity}
                  onChange={(e) =>
                    setInvItems((prev) =>
                      prev.map((row) =>
                        row.id === it.id ? { ...row, quantity: Number(e.target.value) || 0 } : row
                      )
                    )
                  }
                />
                <Input
                  aria-label={`Harga satuan item ${idx + 1}`}
                  type="number"
                  min="0"
                  step="any"
                  value={it.unit_price}
                  onChange={(e) =>
                    setInvItems((prev) =>
                      prev.map((row) =>
                        row.id === it.id ? { ...row, unit_price: Number(e.target.value) || 0 } : row
                      )
                    )
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={invItems.length <= 1}
                  aria-label={`Hapus item ${idx + 1}`}
                  onClick={() => setInvItems((prev) => prev.filter((row) => row.id !== it.id))}
                >
                  <Trash2 className="h-4 w-4 text-red-500" aria-hidden="true" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div>
            <label htmlFor={`${formId}-idisc`} className="block text-xs font-medium text-[var(--text-secondary)]">
              Diskon (%)
            </label>
            <Input
              id={`${formId}-idisc`}
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={invDiscountPct}
              onChange={(e) => setInvDiscountPct(Number(e.target.value) || 0)}
              className="mt-1"
            />
          </div>
          <div>
            <label htmlFor={`${formId}-itax`} className="block text-xs font-medium text-[var(--text-secondary)]">
              Pajak / PPN (%)
            </label>
            <Input
              id={`${formId}-itax`}
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={invTaxPct}
              onChange={(e) => setInvTaxPct(Number(e.target.value) || 0)}
              className="mt-1"
            />
          </div>
          <div>
            <label htmlFor={`${formId}-iaccent`} className="block text-xs font-medium text-[var(--text-secondary)]">
              Warna Aksen PDF
            </label>
            <Input
              id={`${formId}-iaccent`}
              type="color"
              value={invAccent}
              onChange={(e) => setInvAccent(e.target.value)}
              className="mt-1 h-10 p-1"
            />
          </div>
          <div className="rounded-xl border border-[var(--brand-primary)]/30 bg-[var(--brand-soft)]/50 p-3">
            <p className="text-[11px] font-medium text-[var(--brand-primary)]">
              Total Tagihan Estimasi
            </p>
            <p className="mt-0.5 font-mono text-base font-bold text-[var(--text-primary)]">
              {invCurrency} {Math.round(invoiceSummary.grandTotal).toLocaleString("id-ID")}
            </p>
          </div>
        </div>

        <div>
          <label htmlFor={`${formId}-inotes`} className="block text-xs font-medium text-[var(--text-secondary)]">
            Catatan Pembayaran
          </label>
          <Input
            id={`${formId}-inotes`}
            value={invNotes}
            onChange={(e) => setInvNotes(e.target.value)}
            className="mt-1"
          />
        </div>

        {apiError && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
            {apiError}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={submitting}>
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Download className="h-4 w-4" aria-hidden="true" />
            )}
            <span>Buat & Pratinjau Invoice PDF</span>
          </Button>
        </div>

        {pdfResult && (
          <PdfResultPreview
            result={pdfResult}
            onReset={() => {
              revokePdfJobResult(pdfResult);
              setPdfResult(null);
            }}
          />
        )}
      </form>
    );
  }

  // =========================================================================
  // #75 BARCODE GENERATOR (Code 128, EAN-13, EAN-8 -> SVG & PNG)
  // =========================================================================
  if (tool.id === "barcode-generator") {
    async function handleGenerateBarcode(e: React.FormEvent) {
      e.preventDefault();
      if (!barValue.trim()) {
        setApiError("Masukkan kode atau teks barcode terlebih dahulu.");
        return;
      }
      setSubmitting(true);
      setApiError(null);
      if (pdfResult) {
        revokePdfJobResult(pdfResult);
        setPdfResult(null);
      }
      try {
        const res = await generateBarcodeJob({
          value: barValue.trim(),
          barcode_type: barType,
          output_format: barFormat,
          scale: barScale,
          height_px: barHeight,
          show_text: barShowText,
          fill_color: barFill,
          back_color: barBack,
        });
        setPdfResult(res);
      } catch (err) {
        setApiError(err instanceof Error ? err.message : "Gagal membuat barcode.");
      } finally {
        setSubmitting(false);
      }
    }

    return (
      <form onSubmit={(e) => void handleGenerateBarcode(e)} className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor={`${formId}-btype`} className="block text-xs font-medium text-[var(--text-secondary)]">
              Standar Barcode
            </label>
            <select
              id={`${formId}-btype`}
              value={barType}
              onChange={(e) => {
                const next = e.target.value as "code128" | "ean13" | "ean8";
                setBarType(next);
                if (next === "ean13") setBarValue("899123456789");
                else if (next === "ean8") setBarValue("8991234");
                else setBarValue("RK-2026-001");
              }}
              className="mt-1 h-10 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 text-sm text-[var(--text-primary)]"
            >
              <option value="code128">Code 128 (Huruf & Angka)</option>
              <option value="ean13">EAN-13 (12–13 digit produk ritel)</option>
              <option value="ean8">EAN-8 (7–8 digit kemasan ringkas)</option>
            </select>
          </div>
          <div>
            <label htmlFor={`${formId}-bval`} className="block text-xs font-medium text-[var(--text-secondary)]">
              Kode / Nilai Barcode
            </label>
            <Input
              id={`${formId}-bval`}
              value={barValue}
              onChange={(e) => setBarValue(e.target.value)}
              placeholder={barType === "code128" ? "SKU-12345" : "Hanya angka"}
              className="mt-1 font-mono"
            />
          </div>
          <div>
            <label htmlFor={`${formId}-bfmt`} className="block text-xs font-medium text-[var(--text-secondary)]">
              Format Unduhan
            </label>
            <select
              id={`${formId}-bfmt`}
              value={barFormat}
              onChange={(e) => setBarFormat(e.target.value as "svg" | "png")}
              className="mt-1 h-10 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 text-sm text-[var(--text-primary)]"
            >
              <option value="svg">SVG Vektor (Tajam Cetak)</option>
              <option value="png">PNG Raster</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div>
            <label htmlFor={`${formId}-bscale`} className="block text-xs font-medium text-[var(--text-secondary)]">
              Ketebalan (1–6)
            </label>
            <Input
              id={`${formId}-bscale`}
              type="number"
              min="1"
              max="6"
              value={barScale}
              onChange={(e) => setBarScale(Math.max(1, Math.min(6, Number(e.target.value) || 3)))}
              className="mt-1"
            />
          </div>
          <div>
            <label htmlFor={`${formId}-bh`} className="block text-xs font-medium text-[var(--text-secondary)]">
              Tinggi Batang (px)
            </label>
            <Input
              id={`${formId}-bh`}
              type="number"
              min="30"
              max="260"
              value={barHeight}
              onChange={(e) => setBarHeight(Math.max(30, Math.min(260, Number(e.target.value) || 90)))}
              className="mt-1"
            />
          </div>
          <div>
            <label htmlFor={`${formId}-bfill`} className="block text-xs font-medium text-[var(--text-secondary)]">
              Warna Batang
            </label>
            <Input
              id={`${formId}-bfill`}
              type="color"
              value={barFill}
              onChange={(e) => setBarFill(e.target.value)}
              className="mt-1 h-10 p-1"
            />
          </div>
          <div>
            <label htmlFor={`${formId}-bback`} className="block text-xs font-medium text-[var(--text-secondary)]">
              Warna Latar
            </label>
            <Input
              id={`${formId}-bback`}
              type="color"
              value={barBack}
              onChange={(e) => setBarBack(e.target.value)}
              className="mt-1 h-10 p-1"
            />
          </div>
          <label className="flex items-end gap-2 pb-2 text-xs font-medium text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={barShowText}
              onChange={(e) => setBarShowText(e.target.checked)}
              className="h-4 w-4 rounded"
            />
            <span>Tampilkan angka</span>
          </label>
        </div>

        {apiError && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
            {apiError}
          </p>
        )}

        <Button type="submit" disabled={submitting}>
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Play className="h-4 w-4" aria-hidden="true" />
          )}
          <span>Buat Barcode ({barFormat.toUpperCase()})</span>
        </Button>

        {pdfResult && (
          <PdfResultPreview
            result={pdfResult}
            onReset={() => {
              revokePdfJobResult(pdfResult);
              setPdfResult(null);
            }}
          />
        )}
      </form>
    );
  }

  // =========================================================================
  // #76 STOPWATCH & COUNTDOWN TIMER
  // =========================================================================
  if (tool.id === "stopwatch-countdown") {
    function handleToggleSw() {
      if (swRunning) {
        if (swAnchorTs !== null) {
          setSwElapsedMs(Date.now() - swAnchorTs);
        }
        setSwRunning(false);
        setSwAnchorTs(null);
      } else {
        setSwAnchorTs(Date.now() - swElapsedMs);
        setSwRunning(true);
      }
    }

    function handleAddLap() {
      const currentTotal =
        swRunning && swAnchorTs !== null ? Date.now() - swAnchorTs : swElapsedMs;
      const prevTotal = swLaps.length > 0 ? swLaps[0].totalMs : 0;
      setSwLaps((prev) => [
        { lap: prev.length + 1, totalMs: currentTotal, deltaMs: currentTotal - prevTotal },
        ...prev,
      ]);
    }

    function applyCountdownPreset(mins: number) {
      setCdRunning(false);
      setCdEndTs(null);
      setCdNotice(null);
      setCdHours("0");
      setCdMinutes(String(mins));
      setCdSeconds("0");
      setCdRemainingSec(mins * 60);
    }

    function handleToggleCountdown() {
      setCdNotice(null);
      if (cdRunning) {
        setCdRunning(false);
        setCdEndTs(null);
        return;
      }
      const total =
        cdRemainingSec > 0
          ? cdRemainingSec
          : (Number(cdHours) || 0) * 3600 +
            (Number(cdMinutes) || 0) * 60 +
            (Number(cdSeconds) || 0);
      if (total <= 0) return;
      setCdRemainingSec(total);
      setCdEndTs(Date.now() + total * 1000);
      setCdRunning(true);
    }

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTimerTab("stopwatch")}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
              timerTab === "stopwatch"
                ? "border-[var(--brand-primary)] bg-[var(--brand-soft)] text-[var(--brand-primary)]"
                : "border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-secondary)]"
            )}
          >
            Stopwatch + Putaran (Lap)
          </button>
          <button
            type="button"
            onClick={() => setTimerTab("countdown")}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
              timerTab === "countdown"
                ? "border-[var(--brand-primary)] bg-[var(--brand-soft)] text-[var(--brand-primary)]"
                : "border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-secondary)]"
            )}
          >
            Countdown Timer
          </button>
        </div>

        {timerTab === "stopwatch" ? (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/50 p-8">
              <p className="font-mono text-5xl font-bold tabular-nums text-[var(--brand-primary)] sm:text-6xl">
                {formatStopwatchMs(swElapsedMs)}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={handleToggleSw}>
                  {swRunning ? (
                    <>
                      <Pause className="h-4 w-4" aria-hidden="true" />
                      <span>Jeda</span>
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4" aria-hidden="true" />
                      <span>{swElapsedMs > 0 ? "Lanjut" : "Mulai"}</span>
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!swRunning && swElapsedMs === 0}
                  onClick={handleAddLap}
                >
                  <Flag className="h-4 w-4" aria-hidden="true" />
                  <span>Catat Lap</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setSwRunning(false);
                    setSwAnchorTs(null);
                    setSwElapsedMs(0);
                    setSwLaps([]);
                  }}
                >
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  <span>Reset</span>
                </Button>
              </div>
            </div>

            {swLaps.length > 0 && (
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[var(--text-primary)]">
                    Catatan Putaran ({swLaps.length})
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      void copyToClipboard(
                        "laps",
                        swLaps
                          .map(
                            (l) =>
                              `Lap ${l.lap}: +${formatStopwatchMs(l.deltaMs)} (Total ${formatStopwatchMs(l.totalMs)})`
                          )
                          .join("\n")
                      )
                    }
                  >
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{copiedId === "laps" ? "Tersalin!" : "Salin Lap"}</span>
                  </Button>
                </div>
                <ul className="max-h-52 space-y-1 overflow-y-auto text-xs font-mono">
                  {swLaps.map((item) => (
                    <li
                      key={item.lap}
                      className="flex items-center justify-between rounded-lg bg-[var(--surface-muted)]/50 px-3 py-1.5"
                    >
                      <span className="font-semibold text-[var(--text-primary)]">
                        Lap #{item.lap}
                      </span>
                      <span className="text-[var(--text-secondary)]">
                        +{formatStopwatchMs(item.deltaMs)}
                      </span>
                      <span className="font-semibold text-[var(--brand-primary)]">
                        {formatStopwatchMs(item.totalMs)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3 sm:max-w-md">
              <div>
                <label htmlFor={`${formId}-cdh`} className="block text-xs font-medium text-[var(--text-secondary)]">
                  Jam
                </label>
                <Input
                  id={`${formId}-cdh`}
                  type="number"
                  min="0"
                  max="23"
                  disabled={cdRunning}
                  value={cdHours}
                  onChange={(e) => {
                    setCdHours(e.target.value);
                    const total =
                      (Number(e.target.value) || 0) * 3600 +
                      (Number(cdMinutes) || 0) * 60 +
                      (Number(cdSeconds) || 0);
                    setCdRemainingSec(total);
                  }}
                  className="mt-1"
                />
              </div>
              <div>
                <label htmlFor={`${formId}-cdm`} className="block text-xs font-medium text-[var(--text-secondary)]">
                  Menit
                </label>
                <Input
                  id={`${formId}-cdm`}
                  type="number"
                  min="0"
                  max="59"
                  disabled={cdRunning}
                  value={cdMinutes}
                  onChange={(e) => {
                    setCdMinutes(e.target.value);
                    const total =
                      (Number(cdHours) || 0) * 3600 +
                      (Number(e.target.value) || 0) * 60 +
                      (Number(cdSeconds) || 0);
                    setCdRemainingSec(total);
                  }}
                  className="mt-1"
                />
              </div>
              <div>
                <label htmlFor={`${formId}-cds`} className="block text-xs font-medium text-[var(--text-secondary)]">
                  Detik
                </label>
                <Input
                  id={`${formId}-cds`}
                  type="number"
                  min="0"
                  max="59"
                  disabled={cdRunning}
                  value={cdSeconds}
                  onChange={(e) => {
                    setCdSeconds(e.target.value);
                    const total =
                      (Number(cdHours) || 0) * 3600 +
                      (Number(cdMinutes) || 0) * 60 +
                      (Number(e.target.value) || 0);
                    setCdRemainingSec(total);
                  }}
                  className="mt-1"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {[1, 3, 5, 10, 15, 30].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => applyCountdownPreset(m)}
                  className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] px-2.5 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]"
                >
                  {m} Menit
                </button>
              ))}
            </div>

            <div className="flex flex-col items-center gap-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/50 p-8">
              <p className="font-mono text-5xl font-bold tabular-nums text-[var(--brand-primary)] sm:text-6xl">
                {formatCountdownSec(cdRemainingSec)}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={handleToggleCountdown}>
                  {cdRunning ? (
                    <>
                      <Pause className="h-4 w-4" aria-hidden="true" />
                      <span>Jeda</span>
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4" aria-hidden="true" />
                      <span>Mulai Hitung Mundur</span>
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setCdRunning(false);
                    setCdEndTs(null);
                    setCdNotice(null);
                    setCdRemainingSec(
                      (Number(cdHours) || 0) * 3600 +
                        (Number(cdMinutes) || 0) * 60 +
                        (Number(cdSeconds) || 0)
                    );
                  }}
                >
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  <span>Reset</span>
                </Button>
              </div>
            </div>

            {cdNotice && (
              <div
                role="status"
                aria-live="polite"
                className="flex items-center gap-2 rounded-xl border border-[var(--success-border)] bg-[var(--success-bg)] px-4 py-3 text-sm font-medium text-[var(--success-fg)]"
              >
                <Bell className="h-4 w-4" aria-hidden="true" />
                <span>{cdNotice}</span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // #77 TEXT DIFF CHECKER (Bandingkan Dua Teks)
  // =========================================================================
  if (tool.id === "text-diff-checker") {
    const unifiedSummary = diffResult.rows
      .map((r) => `${r.type === "added" ? "+" : r.type === "removed" ? "-" : " "} ${r.text}`)
      .join("\n");

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label htmlFor={`${formId}-dleft`} className="block text-xs font-medium text-[var(--text-secondary)]">
              Teks Asli (Kiri)
            </label>
            <textarea
              id={`${formId}-dleft`}
              rows={7}
              value={diffLeft}
              onChange={(e) => setDiffLeft(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3 font-mono text-xs text-[var(--text-primary)]"
            />
          </div>
          <div>
            <label htmlFor={`${formId}-dright`} className="block text-xs font-medium text-[var(--text-secondary)]">
              Teks Revisi (Kanan)
            </label>
            <textarea
              id={`${formId}-dright`}
              rows={7}
              value={diffRight}
              onChange={(e) => setDiffRight(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3 font-mono text-xs text-[var(--text-primary)]"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">Sama: {diffResult.same}</Badge>
            <Badge variant="success">Ditambah (+): {diffResult.added}</Badge>
            <Badge variant="warning">Dihapus (-): {diffResult.removed}</Badge>
            <label className="ml-2 flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={diffTrimWhitespace}
                onChange={(e) => setDiffTrimWhitespace(e.target.checked)}
                className="h-3.5 w-3.5 rounded"
              />
              <span>Abaikan spasi ujung baris</span>
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void copyToClipboard("diff", unifiedSummary)}
            >
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{copiedId === "diff" ? "Tersalin!" : "Salin Diff"}</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setDiffLeft("");
                setDiffRight("");
              }}
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Bersihkan</span>
            </Button>
          </div>
        </div>

        <div
          role="region"
          aria-label="Hasil perbandingan baris teks"
          tabIndex={0}
          className="max-h-72 overflow-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] font-mono text-xs"
        >
          {diffResult.rows.map((row, idx) => (
            <div
              key={idx}
              className={cn(
                "flex items-start gap-2 border-b border-[var(--border-subtle)]/50 px-3 py-1 last:border-b-0",
                row.type === "added" &&
                  "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200",
                row.type === "removed" && "bg-red-500/15 text-red-800 dark:text-red-200"
              )}
            >
              <span className="w-8 shrink-0 text-right text-[11px] opacity-60">
                {row.lineNumberLeft ?? ""}
              </span>
              <span className="w-8 shrink-0 text-right text-[11px] opacity-60">
                {row.lineNumberRight ?? ""}
              </span>
              <span className="w-4 shrink-0 font-bold">
                {row.type === "added" ? "+" : row.type === "removed" ? "-" : " "}
              </span>
              <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">
                {row.text || " "}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // =========================================================================
  // #78 WORD FREQUENCY & READING TIME ANALYZER
  // =========================================================================
  const freqReportCsv = [
    "Kata,Frekuensi,Persentase(%)",
    ...wordFreqStats.topWords.map((w) => `${w.word},${w.count},${w.pct}`),
  ].join("\n");

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor={`${formId}-wfreq`} className="block text-xs font-medium text-[var(--text-secondary)]">
          Masukkan Artikel, Pidato, atau Dokumen Teks
        </label>
        <textarea
          id={`${formId}-wfreq`}
          rows={6}
          value={freqText}
          onChange={(e) => setFreqText(e.target.value)}
          className="mt-1 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3 text-sm text-[var(--text-primary)]"
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3">
          <p className="text-[11px] text-[var(--text-muted)]">Total Kata</p>
          <p className="mt-0.5 text-lg font-bold text-[var(--text-primary)]">
            {wordFreqStats.totalWords.toLocaleString("id-ID")}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3">
          <p className="text-[11px] text-[var(--text-muted)]">Kata Unik</p>
          <p className="mt-0.5 text-lg font-bold text-[var(--brand-primary)]">
            {wordFreqStats.uniqueWords.toLocaleString("id-ID")}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3">
          <p className="text-[11px] text-[var(--text-muted)]">Kalimat</p>
          <p className="mt-0.5 text-lg font-bold text-[var(--text-primary)]">
            {wordFreqStats.sentences}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3">
          <p className="text-[11px] text-[var(--text-muted)]">Rata-rata / Kalimat</p>
          <p className="mt-0.5 text-lg font-bold text-[var(--text-primary)]">
            {wordFreqStats.avgWordsPerSentence}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3">
          <p className="text-[11px] text-[var(--text-muted)]">Waktu Baca</p>
          <p className="mt-0.5 text-lg font-bold text-[var(--text-primary)]">
            {wordFreqStats.readingMinutes} mnt
          </p>
        </div>
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3">
          <p className="text-[11px] text-[var(--text-muted)]">Waktu Presentasi</p>
          <p className="mt-0.5 text-lg font-bold text-[var(--text-primary)]">
            {wordFreqStats.speakingMinutes} mnt
          </p>
        </div>
      </div>

      <div
        role="region"
        aria-label="Tabel kata paling sering muncul"
        tabIndex={0}
        className="overflow-x-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)]"
      >
        <table className="w-full text-left text-xs">
          <thead className="border-b border-[var(--border-subtle)] bg-[var(--surface-muted)]/60 text-[var(--text-secondary)]">
            <tr>
              <th className="px-3 py-2 font-semibold">#</th>
              <th className="px-3 py-2 font-semibold">Kata</th>
              <th className="px-3 py-2 font-semibold">Jumlah</th>
              <th className="px-3 py-2 font-semibold">Proporsi</th>
            </tr>
          </thead>
          <tbody>
            {wordFreqStats.topWords.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-center text-[var(--text-muted)]">
                  Belum ada kata untuk dianalisis.
                </td>
              </tr>
            ) : (
              wordFreqStats.topWords.map((item, idx) => (
                <tr key={item.word} className="border-b border-[var(--border-subtle)]/50 last:border-b-0">
                  <td className="px-3 py-1.5 text-[var(--text-muted)]">{idx + 1}</td>
                  <td className="px-3 py-1.5 font-mono font-medium text-[var(--text-primary)]">
                    {item.word}
                  </td>
                  <td className="px-3 py-1.5 font-semibold text-[var(--text-primary)]">
                    {item.count}
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-24 overflow-hidden rounded-full bg-[var(--surface-muted)]">
                        <div
                          className="h-full rounded-full bg-[var(--brand-primary)]"
                          style={{ width: `${Math.min(100, item.pct * 3)}%` }}
                        />
                      </div>
                      <span className="font-mono text-[var(--text-secondary)]">{item.pct}%</span>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void copyToClipboard("freqcsv", freqReportCsv)}
        >
          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{copiedId === "freqcsv" ? "Tersalin!" : "Salin CSV Frekuensi"}</span>
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setFreqText("")}>
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Reset</span>
        </Button>
      </div>
    </div>
  );
}
