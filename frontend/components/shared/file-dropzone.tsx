"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  FileText,
  FolderOpen,
  GripVertical,
  Image as ImageIcon,
  Plus,
  Trash2,
  UploadCloud,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/pdf-api";
import { cn } from "@/lib/utils";

export interface SelectedFileItem {
  id: string;
  file: File;
}

interface FileDropzoneProps {
  label: string;
  acceptAttr: string;
  allowedExtensions: string[];
  multiple?: boolean;
  reorderable?: boolean;
  files: SelectedFileItem[];
  onFilesChange: (files: SelectedFileItem[]) => void;
  showImageThumbnails?: boolean;
  helperText?: string;
}

function getMaxUploadBytes(): number {
  const rawMb = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_SIZE_MB || "50");
  const safeMb = Number.isFinite(rawMb) && rawMb > 0 ? rawMb : 50;
  return safeMb * 1024 * 1024;
}

function makeFileId(file: File): string {
  return `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`;
}

export function FileDropzone({
  label,
  acceptAttr,
  allowedExtensions,
  multiple = false,
  reorderable = false,
  files,
  onFilesChange,
  showImageThumbnails = false,
  helperText,
}: FileDropzoneProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [reorderAnnouncement, setReorderAnnouncement] = useState("");
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);

  // Build safe object URLs for image previews and clean up on change
  const previewUrls = useMemo(() => {
    if (!showImageThumbnails) return new Map<string, string>();
    const map = new Map<string, string>();
    for (const item of files) {
      if (item.file.type.startsWith("image/")) {
        map.set(item.id, URL.createObjectURL(item.file));
      }
    }
    return map;
  }, [files, showImageThumbnails]);

  useEffect(() => {
    return () => {
      for (const url of previewUrls.values()) {
        URL.revokeObjectURL(url);
      }
    };
  }, [previewUrls]);

  function validateAndAccept(incoming: FileList | File[]) {
    const maxBytes = getMaxUploadBytes();
    const maxMb = Math.round(maxBytes / (1024 * 1024));
    const list = Array.from(incoming);
    if (list.length === 0) return;

    const validItems: SelectedFileItem[] = [];
    const errors: string[] = [];

    for (const file of list) {
      const lowerName = file.name.toLowerCase();
      const hasValidExt =
        allowedExtensions.length === 0 ||
        allowedExtensions.includes("*") ||
        allowedExtensions.some((ext) => lowerName.endsWith(ext.toLowerCase()));
      if (!hasValidExt) {
        errors.push(
          `Format "${file.name}" tidak didukung (diizinkan: ${allowedExtensions.join(", ")}).`
        );
        continue;
      }
      if (file.size === 0) {
        errors.push(`File "${file.name}" kosong (0 byte).`);
        continue;
      }
      if (file.size > maxBytes) {
        errors.push(`Ukuran "${file.name}" melebihi batas maksimal ${maxMb} MB.`);
        continue;
      }
      validItems.push({ id: makeFileId(file), file });
    }

    setValidationError(errors.length > 0 ? errors.join(" ") : null);
    if (validItems.length === 0) return;

    if (multiple) {
      onFilesChange([...files, ...validItems]);
    } else {
      onFilesChange([validItems[0]]);
    }

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  function moveItem(fromIdx: number, toIdx: number) {
    if (toIdx < 0 || toIdx >= files.length || fromIdx === toIdx) return;
    const next = [...files];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    onFilesChange(next);
    setReorderAnnouncement(
      `${moved.file.name} dipindahkan ke posisi ${toIdx + 1} dari ${next.length}.`
    );
  }

  function removeItem(id: string) {
    onFilesChange(files.filter((item) => item.id !== id));
    setValidationError(null);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label
          htmlFor={inputId}
          className="text-sm font-medium text-[var(--text-primary)]"
        >
          {label}
        </label>
        <div className="flex items-center gap-2">
          {multiple && files.length > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => inputRef.current?.click()}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Tambah File</span>
            </Button>
          )}
          {files.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onFilesChange([]);
                setValidationError(null);
              }}
            >
              Bersihkan File
            </Button>
          )}
        </div>
      </div>

      {/* Click-to-browse & Drag-and-drop zone */}
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDraggingOver(true);
        }}
        onDragLeave={() => setIsDraggingOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDraggingOver(false);
          if (event.dataTransfer.files.length > 0) {
            validateAndAccept(event.dataTransfer.files);
          }
        }}
        className={cn(
          "relative flex cursor-pointer select-none flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors",
          isDraggingOver
            ? "border-[var(--brand-primary)] bg-[var(--brand-subtle-bg)]"
            : "border-[var(--border-default)] bg-[var(--surface-muted)]/60 hover:border-[var(--brand-primary)]/70 hover:bg-[var(--brand-subtle-bg)]/35"
        )}
      >
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          tabIndex={-1}
          accept={acceptAttr}
          multiple={multiple}
          onChange={(event) => {
            if (event.target.files) {
              validateAndAccept(event.target.files);
            }
          }}
          className="visually-hidden"
        />
        <UploadCloud
          className="h-8 w-8 text-[var(--brand-primary)]"
          aria-hidden="true"
        />
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={(event) => {
              event.stopPropagation();
              inputRef.current?.click();
            }}
          >
            <FolderOpen className="h-4 w-4" aria-hidden="true" />
            <span>Pilih File dari Komputer</span>
          </Button>
          <span className="text-xs text-[var(--text-secondary)]">
            atau seret &amp; lepas file ke area ini
          </span>
        </div>
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          {helperText ??
            `Format: ${allowedExtensions.join(", ").toUpperCase()} • ${multiple ? "Mendukung banyak file" : "1 file"}`}
        </p>
      </div>

      {validationError && (
        <div
          role="alert"
          className="rounded-lg border border-[var(--danger-bg)]/30 bg-[var(--danger-bg)]/10 px-3 py-2 text-xs font-medium text-[var(--danger-bg)]"
        >
          {validationError}
        </div>
      )}

      <p aria-live="polite" className="visually-hidden">
        {reorderAnnouncement}
      </p>

      {files.length > 0 && (
        <ul className="space-y-2" aria-label="Daftar file terpilih">
          {files.map((item, idx) => {
            const thumbUrl = previewUrls.get(item.id);
            return (
              <li
                key={item.id}
                draggable={reorderable}
                onDragStart={() => {
                  if (reorderable) setDraggingIdx(idx);
                }}
                onDragOver={(e) => {
                  if (reorderable) e.preventDefault();
                }}
                onDrop={(e) => {
                  if (!reorderable || draggingIdx === null) return;
                  e.preventDefault();
                  moveItem(draggingIdx, idx);
                  setDraggingIdx(null);
                }}
                onDragEnd={() => setDraggingIdx(null)}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-2 transition-colors",
                  draggingIdx === idx && "opacity-60 ring-2 ring-[var(--brand-primary)]"
                )}
              >
                <div className="flex min-w-0 items-center gap-3">
                  {reorderable && (
                    <span
                      aria-hidden="true"
                      className="cursor-grab touch-none select-none text-[var(--text-muted)] active:cursor-grabbing"
                      style={{ WebkitUserSelect: "none", userSelect: "none" }}
                    >
                      <GripVertical className="h-4 w-4" />
                    </span>
                  )}

                  {thumbUrl ? (
                    <img
                      src={thumbUrl}
                      alt={`Pratinjau ${item.file.name}`}
                      className="h-10 w-10 shrink-0 rounded-lg border border-[var(--border-subtle)] object-cover"
                    />
                  ) : (
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--brand-subtle-bg)] text-[var(--brand-primary)]">
                      {showImageThumbnails ? (
                        <ImageIcon className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <FileText className="h-4 w-4" aria-hidden="true" />
                      )}
                    </span>
                  )}

                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                      {reorderable ? `${idx + 1}. ` : ""}
                      {item.file.name}
                    </p>
                    <p className="font-mono text-xs text-[var(--text-muted)]">
                      {formatBytes(item.file.size)}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  {reorderable && (
                    <>
                      <button
                        type="button"
                        onClick={() => moveItem(idx, idx - 1)}
                        disabled={idx === 0}
                        aria-label={`Geser ${item.file.name} ke atas`}
                        className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] disabled:opacity-30 cursor-pointer"
                      >
                        <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveItem(idx, idx + 1)}
                        disabled={idx === files.length - 1}
                        aria-label={`Geser ${item.file.name} ke bawah`}
                        className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] disabled:opacity-30 cursor-pointer"
                      >
                        <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    aria-label={`Hapus ${item.file.name}`}
                    className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--danger-bg)] cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
