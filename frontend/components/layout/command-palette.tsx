"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Command,
  LayoutDashboard,
  Moon,
  Search,
  Settings,
  Star,
  Sun,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { ToolIcon } from "@/components/ui/tool-icon";
import { useRuangKerjaStore } from "@/lib/storage-store";
import { ALL_TOOLS, getCategoryMeta, searchTools } from "@/lib/tools-registry";
import { cn } from "@/lib/utils";
import { getResolvedTheme } from "@/components/layout/theme-sync";
import { useMounted } from "@/hooks/use-mounted";
import type { ToolDefinition } from "@/types/tools";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();
  const mounted = useMounted();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const favorites = useRuangKerjaStore((state) => state.favorites);
  const recentToolIds = useRuangKerjaStore((state) => state.recentToolIds);
  const recordToolUsage = useRuangKerjaStore((state) => state.recordToolUsage);
  const themePreference = useRuangKerjaStore((state) => state.themePreference);
  const setThemePreference = useRuangKerjaStore((state) => state.setThemePreference);

  const results = useMemo<ToolDefinition[]>(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      // Prioritize recent & favorite tools when query is empty
      const seen = new Set<string>();
      const prioritized: ToolDefinition[] = [];
      for (const id of [...recentToolIds, ...favorites]) {
        const match = ALL_TOOLS.find((tool) => tool.id === id);
        if (match && !seen.has(match.id)) {
          seen.add(match.id);
          prioritized.push(match);
        }
      }
      for (const tool of ALL_TOOLS) {
        if (!seen.has(tool.id)) {
          prioritized.push(tool);
        }
      }
      return prioritized.slice(0, 14);
    }
    return searchTools(trimmed).slice(0, 16);
  }, [query, recentToolIds, favorites]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, open]);

  // Open/close native <dialog> via showModal() / close()
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      if (!dialog.open) {
        dialog.showModal();
      }
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    } else if (dialog.open) {
      dialog.close();
      setQuery("");
    }
  }, [open]);

  // Fallback light-dismiss for browsers without <dialog closedby="any"> (e.g. Safari)
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    function handleNativeClose() {
      if (dialog) {
        dialog.returnValue = "";
      }
      onOpenChange(false);
    }

    dialog.addEventListener("close", handleNativeClose);

    if ("closedBy" in HTMLDialogElement.prototype) {
      return () => {
        dialog.removeEventListener("close", handleNativeClose);
      };
    }

    let pressedOutside = false;
    const isOutside = (e: PointerEvent) => {
      const rect = dialog.getBoundingClientRect();
      return (
        e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom
      );
    };

    const onPointerDown = (e: PointerEvent) => {
      pressedOutside = isOutside(e);
    };
    const onPointerUp = (e: PointerEvent) => {
      if (pressedOutside && isOutside(e)) {
        dialog.close();
      }
    };

    dialog.addEventListener("pointerdown", onPointerDown);
    dialog.addEventListener("pointerup", onPointerUp);

    return () => {
      dialog.removeEventListener("close", handleNativeClose);
      dialog.removeEventListener("pointerdown", onPointerDown);
      dialog.removeEventListener("pointerup", onPointerUp);
    };
  }, [onOpenChange]);

  function openTool(tool: ToolDefinition) {
    recordToolUsage(tool.id);
    onOpenChange(false);
    router.push(tool.route);
  }

  function navigateQuickAction(route: string) {
    onOpenChange(false);
    router.push(route);
  }

  function handleToggleTheme() {
    const current = getResolvedTheme(themePreference);
    const next = current === "dark" ? "light" : "dark";
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const systemScheme = systemDark ? "dark" : "light";
    setThemePreference(next === systemScheme ? "system" : next);
    onOpenChange(false);
  }

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (results.length > 0) {
        setActiveIndex((prev) => (prev + 1) % results.length);
      }
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (results.length > 0) {
        setActiveIndex((prev) => (prev - 1 + results.length) % results.length);
      }
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      // IME-safe Enter check (including Safari keyCode 229 fallback)
      if (event.nativeEvent.isComposing || event.keyCode === 229) {
        return;
      }
      const selected = results[activeIndex];
      if (selected) {
        openTool(selected);
      }
    }
  }

  return (
    <dialog
      ref={dialogRef}
      {...({ closedby: "any" } as Record<string, string>)}
      aria-labelledby="command-palette-title"
      className="m-auto w-[min(92vw,640px)] max-w-none rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-0 text-[var(--text-primary)] shadow-2xl"
    >
      <div className="flex flex-col">
        <div className="flex items-center gap-3 border-b border-[var(--border-subtle)] px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
          <div className="flex-1">
            <label htmlFor="command-palette-input" className="visually-hidden">
              Cari 100 tools atau perintah cepat
            </label>
            <h2 id="command-palette-title" className="visually-hidden">
              Command Palette RuangKerja
            </h2>
            <input
              ref={inputRef}
              id="command-palette-input"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="Cari dari 100 tools (misal: Merge PDF, Invoice, JWT, Password, KPR)..."
              autoFocus
              className="w-full bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Tutup command palette"
            className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] cursor-pointer"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="max-h-[380px] overflow-y-auto p-2">
          {results.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-sm font-medium text-[var(--text-primary)]">
                Tool tidak ditemukan untuk &ldquo;{query}&rdquo;
              </p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Coba kata kunci lain seperti PDF, Excel, QR, Kalkulator, atau To-Do.
              </p>
            </div>
          ) : (
            <div>
              <div className="px-2.5 py-1.5 text-[11px] font-semibold tracking-wider text-[var(--text-muted)] uppercase">
                {query.trim()
                  ? `Hasil Pencarian (${results.length})`
                  : "Rekomendasi & Riwayat Cepat"}
              </div>
              <ul className="space-y-1">
                {results.map((tool, index) => {
                  const categoryMeta = getCategoryMeta(tool.category);
                  const isActive = index === activeIndex;
                  const isFav = favorites.includes(tool.id);
                  return (
                    <li key={tool.id}>
                      <button
                        type="button"
                        onClick={() => openTool(tool)}
                        onMouseEnter={() => setActiveIndex(index)}
                        className={cn(
                          "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-colors cursor-pointer",
                          isActive
                            ? "bg-[var(--brand-subtle-bg)] text-[var(--text-primary)]"
                            : "hover:bg-[var(--surface-muted)]"
                        )}
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--brand-primary)]">
                            <ToolIcon name={tool.iconName} className="h-4 w-4" />
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-sm font-medium">
                                {tool.name}
                              </span>
                              {isFav && (
                                <Star
                                  className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-500"
                                  aria-hidden="true"
                                />
                              )}
                            </div>
                            <p className="truncate text-xs text-[var(--text-secondary)]">
                              {tool.shortDescription}
                            </p>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Badge variant="secondary">{categoryMeta.shortLabel}</Badge>
                          <ArrowRight
                            className={cn(
                              "h-3.5 w-3.5 transition-opacity",
                              isActive ? "opacity-100 text-[var(--brand-primary)]" : "opacity-40"
                            )}
                            aria-hidden="true"
                          />
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className="mt-2 border-t border-[var(--border-subtle)] pt-2">
            <div className="px-2.5 py-1 text-[11px] font-semibold tracking-wider text-[var(--text-muted)] uppercase">
              Navigasi & Aksi Cepat
            </div>
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => navigateQuickAction("/dashboard")}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <LayoutDashboard className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Dashboard Utama</span>
              </button>
              <button
                type="button"
                onClick={() => navigateQuickAction("/settings")}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <Settings className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Pengaturan & Diagnostik</span>
              </button>
              <button
                type="button"
                onClick={handleToggleTheme}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                {mounted && getResolvedTheme(themePreference) === "dark" ? (
                  <Sun className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <Moon className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                <span>Ubah Tema Gelap/Terang</span>
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-[var(--border-subtle)] bg-[var(--surface-muted)] px-4 py-2 text-[11px] text-[var(--text-muted)]">
          <div className="flex items-center gap-3">
            <span>↑↓ Pilih</span>
            <span>↵ Buka</span>
            <span>Esc Tutup</span>
          </div>
          <div className="flex items-center gap-1">
            <Command className="h-3 w-3" aria-hidden="true" />
            <span>K</span>
          </div>
        </div>
      </div>
    </dialog>
  );
}
