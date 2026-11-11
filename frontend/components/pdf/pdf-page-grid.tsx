"use client";
/* eslint-disable @next/next/no-img-element */

import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  GripVertical,
  RotateCcw,
  RotateCw,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PdfInspectResponse } from "@/types/pdf";

interface PdfPageGridProps {
  inspectData: PdfInspectResponse;
  mode: "preview" | "select" | "rotate" | "reorder";
  selectionIntent?: "extract" | "delete";
  selectedPages?: number[];
  onToggleSelectPage?: (pageNum: number) => void;
  pageRotations?: Record<number, number>;
  onRotatePage?: (pageNum: number) => void;
  onRotateAll?: (delta: number) => void;
  onResetRotations?: () => void;
  pageOrder?: number[];
  onOrderChange?: (nextOrder: number[]) => void;
  onResetOrder?: () => void;
}

export function PdfPageGrid({
  inspectData,
  mode,
  selectionIntent = "extract",
  selectedPages = [],
  onToggleSelectPage,
  pageRotations = {},
  onRotatePage,
  onRotateAll,
  onResetRotations,
  pageOrder = [],
  onOrderChange,
  onResetOrder,
}: PdfPageGridProps) {
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [liveAnnouncement, setLiveAnnouncement] = useState("");

  const pageMap = new Map(
    inspectData.pages.map((page) => [page.page_number, page])
  );

  const displayNumbers =
    mode === "reorder" && pageOrder.length > 0
      ? pageOrder
      : inspectData.pages.map((p) => p.page_number);

  function movePageOrder(fromIdx: number, toIdx: number) {
    if (!onOrderChange) return;
    if (toIdx < 0 || toIdx >= displayNumbers.length || fromIdx === toIdx) return;
    const next = [...displayNumbers];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    onOrderChange(next);
    setLiveAnnouncement(
      `Halaman ${moved} dipindahkan ke posisi ${toIdx + 1} dari ${next.length}.`
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold text-[var(--text-primary)]">
            Pratinjau Halaman ({inspectData.page_count} halaman)
          </p>
          {mode === "select" && (
            <Badge variant={selectionIntent === "delete" ? "warning" : "default"}>
              {selectedPages.length} dipilih
            </Badge>
          )}
        </div>

        {mode === "rotate" && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onRotateAll?.(90)}
            >
              <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Putar Semua +90°</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onResetRotations}
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Reset</span>
            </Button>
          </div>
        )}

        {mode === "reorder" && (
          <Button type="button" variant="ghost" size="sm" onClick={onResetOrder}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Kembalikan Urutan Asli</span>
          </Button>
        )}
      </div>

      <p aria-live="polite" className="visually-hidden">
        {liveAnnouncement}
      </p>

      <div className="grid max-h-[420px] grid-cols-2 gap-3 overflow-y-auto p-1 sm:grid-cols-3 md:grid-cols-4">
        {displayNumbers.map((pageNum, idx) => {
          const info = pageMap.get(pageNum);
          if (!info) return null;

          const isSelected = selectedPages.includes(pageNum);
          const extraRotation = pageRotations[pageNum] ?? 0;

          return (
            <div
              key={`${pageNum}-${idx}`}
              draggable={mode === "reorder"}
              onDragStart={() => {
                if (mode === "reorder") setDraggingIndex(idx);
              }}
              onDragOver={(e) => {
                if (mode === "reorder") e.preventDefault();
              }}
              onDrop={(e) => {
                if (mode !== "reorder" || draggingIndex === null) return;
                e.preventDefault();
                movePageOrder(draggingIndex, idx);
                setDraggingIndex(null);
              }}
              onDragEnd={() => setDraggingIndex(null)}
              className={cn(
                "relative flex flex-col justify-between rounded-xl border bg-[var(--surface-card)] p-2.5 transition-all",
                mode === "select" &&
                  isSelected &&
                  selectionIntent === "extract" &&
                  "border-[var(--brand-primary)] ring-2 ring-[var(--brand-primary)]/30",
                mode === "select" &&
                  isSelected &&
                  selectionIntent === "delete" &&
                  "border-[var(--danger-bg)] bg-[var(--danger-bg)]/5 ring-2 ring-[var(--danger-bg)]/25",
                mode !== "select" && "border-[var(--border-subtle)]",
                draggingIndex === idx && "opacity-55 ring-2 ring-[var(--brand-primary)]"
              )}
            >
              <div className="flex items-center justify-between gap-1 pb-1.5">
                <span className="font-mono text-[11px] font-semibold text-[var(--text-secondary)]">
                  {mode === "reorder" ? `#${idx + 1} (Asli ${pageNum})` : `Hal ${pageNum}`}
                </span>

                {mode === "reorder" && (
                  <span
                    aria-hidden="true"
                    className="cursor-grab touch-none select-none text-[var(--text-muted)] active:cursor-grabbing"
                    style={{ WebkitUserSelect: "none", userSelect: "none" }}
                  >
                    <GripVertical className="h-3.5 w-3.5" />
                  </span>
                )}

                {mode === "rotate" && extraRotation !== 0 && (
                  <Badge variant="default">+{extraRotation % 360}°</Badge>
                )}
              </div>

              {/* Thumbnail container */}
              {mode === "select" ? (
                <button
                  type="button"
                  onClick={() => onToggleSelectPage?.(pageNum)}
                  aria-pressed={isSelected}
                  aria-label={`${selectionIntent === "delete" ? "Tandai hapus" : "Pilih"} halaman ${pageNum}`}
                  className="group relative flex h-32 w-full items-center justify-center overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] cursor-pointer"
                >
                  {info.thumbnail_data_url ? (
                    <img
                      src={info.thumbnail_data_url}
                      alt={`Halaman ${pageNum}`}
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <span className="font-mono text-xs text-[var(--text-muted)]">
                      Halaman {pageNum}
                    </span>
                  )}

                  {isSelected && (
                    <span
                      className={cn(
                        "absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full text-white shadow-xs",
                        selectionIntent === "delete"
                          ? "bg-[var(--danger-bg)]"
                          : "bg-[var(--brand-primary)]"
                      )}
                    >
                      {selectionIntent === "delete" ? (
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                    </span>
                  )}
                </button>
              ) : (
                <div className="flex h-32 w-full items-center justify-center overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)]">
                  {info.thumbnail_data_url ? (
                    <img
                      src={info.thumbnail_data_url}
                      alt={`Halaman ${pageNum}`}
                      className="max-h-28 max-w-full object-contain transition-transform duration-200"
                      style={{ transform: `rotate(${extraRotation}deg)` }}
                    />
                  ) : (
                    <span className="font-mono text-xs text-[var(--text-muted)]">
                      Halaman {pageNum}
                    </span>
                  )}
                </div>
              )}

              {/* Per-card action controls */}
              {mode === "rotate" && (
                <button
                  type="button"
                  onClick={() => onRotatePage?.(pageNum)}
                  className="mt-2 inline-flex min-h-8 w-full items-center justify-center gap-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--brand-subtle-bg)] cursor-pointer"
                >
                  <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Putar 90°</span>
                </button>
              )}

              {mode === "reorder" && (
                <div className="mt-2 flex items-center justify-between gap-1">
                  <button
                    type="button"
                    onClick={() => movePageOrder(idx, idx - 1)}
                    disabled={idx === 0}
                    aria-label={`Geser halaman ${pageNum} lebih awal`}
                    className="inline-flex min-h-8 flex-1 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] text-xs hover:bg-[var(--surface-hover)] disabled:opacity-35 cursor-pointer"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => movePageOrder(idx, idx + 1)}
                    disabled={idx === displayNumbers.length - 1}
                    aria-label={`Geser halaman ${pageNum} lebih akhir`}
                    className="inline-flex min-h-8 flex-1 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] text-xs hover:bg-[var(--surface-hover)] disabled:opacity-35 cursor-pointer"
                  >
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
