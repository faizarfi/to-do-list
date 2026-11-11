"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Flame,
  History,
  Search,
  Star,
  Zap,
} from "lucide-react";

import { DailySummary } from "@/components/dashboard/daily-summary";
import { GreetingClock } from "@/components/dashboard/greeting-clock";
import { ToolCard } from "@/components/dashboard/tool-card";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ToolIcon } from "@/components/ui/tool-icon";
import { useMounted } from "@/hooks/use-mounted";
import { useRuangKerjaStore } from "@/lib/storage-store";
import {
  ALL_TOOLS,
  TOOL_BY_ID,
  TOOL_CATEGORIES,
  getToolsByCategory,
  searchTools,
} from "@/lib/tools-registry";
import { cn } from "@/lib/utils";
import type { ToolCategoryId, ToolDefinition } from "@/types/tools";

const RECOMMENDED_SHORTCUT_IDS = [
  "merge-pdf",
  "jpg-png-to-pdf",
  "image-converter",
  "excel-to-csv",
  "daily-todo-list",
  "pomodoro-timer",
];

export function DashboardView() {
  const searchParams = useSearchParams();
  const mounted = useMounted();

  const [searchQuery, setSearchQuery] = useState(
    () => searchParams.get("q") ?? ""
  );
  const [selectedCategory, setSelectedCategory] = useState<
    ToolCategoryId | "all"
  >("all");

  const favorites = useRuangKerjaStore((state) => state.favorites);
  const recentToolIds = useRuangKerjaStore((state) => state.recentToolIds);
  const usageCounts = useRuangKerjaStore((state) => state.usageCounts);
  const toggleFavorite = useRuangKerjaStore((state) => state.toggleFavorite);
  const recordToolUsage = useRuangKerjaStore((state) => state.recordToolUsage);

  // Sync live header search bar events
  useEffect(() => {
    const paramQ = searchParams.get("q");
    if (paramQ !== null) {
      setSearchQuery(paramQ);
    }
  }, [searchParams]);

  useEffect(() => {
    function onHeaderSearch(event: Event) {
      const customEvent = event as CustomEvent<string>;
      setSearchQuery(customEvent.detail ?? "");
    }

    window.addEventListener("ruangkerja:search-update", onHeaderSearch);
    return () =>
      window.removeEventListener("ruangkerja:search-update", onHeaderSearch);
  }, []);

  const safeFavorites = useMemo(
    () => (mounted ? favorites : []),
    [mounted, favorites]
  );
  const safeRecent = useMemo(
    () => (mounted ? recentToolIds : []),
    [mounted, recentToolIds]
  );
  const safeUsage = useMemo(
    () => (mounted ? usageCounts : {}),
    [mounted, usageCounts]
  );

  // 5. Tools favorit
  const favoriteTools = useMemo(
    () =>
      safeFavorites
        .map((id) => TOOL_BY_ID[id])
        .filter((tool): tool is ToolDefinition => Boolean(tool)),
    [safeFavorites]
  );

  // 4. Tools yang sering digunakan
  const frequentTools = useMemo(() => {
    const sorted = Object.entries(safeUsage)
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => TOOL_BY_ID[id])
      .filter((tool): tool is ToolDefinition => Boolean(tool));
    if (sorted.length > 0) return sorted.slice(0, 6);
    return RECOMMENDED_SHORTCUT_IDS.map((id) => TOOL_BY_ID[id]).filter(
      (tool): tool is ToolDefinition => Boolean(tool)
    );
  }, [safeUsage]);

  // 6. Tools yang terakhir digunakan
  const recentTools = useMemo(
    () =>
      safeRecent
        .map((id) => TOOL_BY_ID[id])
        .filter((tool): tool is ToolDefinition => Boolean(tool))
        .slice(0, 6),
    [safeRecent]
  );

  // 14. Shortcut menuju fitur yang sering digunakan
  const shortcutTools = useMemo(() => {
    const pool = [...frequentTools, ...favoriteTools];
    const unique: ToolDefinition[] = [];
    const seen = new Set<string>();
    for (const tool of pool) {
      if (!seen.has(tool.id)) {
        seen.add(tool.id);
        unique.push(tool);
      }
      if (unique.length >= 6) break;
    }
    return unique;
  }, [frequentTools, favoriteTools]);

  // 3. Search bar filtering across all 50 tools
  const filteredTools = useMemo(() => {
    const categoryFilter =
      selectedCategory === "all" ? undefined : selectedCategory;
    return searchTools(searchQuery, categoryFilter);
  }, [searchQuery, selectedCategory]);

  const isSearching = searchQuery.trim().length > 0 || selectedCategory !== "all";

  return (
    <div className="space-y-8">
      {/* 1 & 2. Sapaan pengguna + Tanggal & waktu saat ini */}
      <GreetingClock />

      {/* 3. Search bar untuk mencari 50 tools + 14. Shortcut cepat */}
      <section aria-label="Pencarian cepat dan pintasan tools" className="space-y-3">
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 shadow-2xs">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="relative flex-1">
              <label htmlFor="dashboard-search-tools" className="visually-hidden">
                Cari di antara 100 tools RuangKerja
              </label>
              <Search
                className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
                aria-hidden="true"
              />
              <input
                id="dashboard-search-tools"
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari dari 100 tools (contoh: Merge PDF, Invoice, JWT, Password, KPR, Excel)..."
                className="min-h-10 w-full rounded-xl border border-[var(--border-default)] bg-[var(--surface-input)] py-2 pr-4 pl-10 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedCategory("all")}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
                  selectedCategory === "all"
                    ? "bg-[var(--brand-primary)] text-[var(--brand-primary-fg)]"
                    : "bg-[var(--surface-muted)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
                )}
              >
                Semua ({ALL_TOOLS.length})
              </button>
              {TOOL_CATEGORIES.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => setSelectedCategory(category.id)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
                    selectedCategory === category.id
                      ? "bg-[var(--brand-primary)] text-[var(--brand-primary-fg)]"
                      : "bg-[var(--surface-muted)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
                  )}
                >
                  {category.shortLabel}
                </button>
              ))}
            </div>
          </div>

          {/* 14. Shortcut menuju fitur yang sering digunakan */}
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--border-subtle)] pt-3">
            <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--text-muted)]">
              <Zap className="h-3.5 w-3.5 text-[var(--brand-primary)]" aria-hidden="true" />
              <span>Shortcut Cepat:</span>
            </span>
            {shortcutTools.map((tool) => (
              <Link
                key={tool.id}
                href={tool.route}
                onClick={() => recordToolUsage(tool.id)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-2.5 py-1 text-xs font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--brand-primary)]/40 hover:bg-[var(--brand-subtle-bg)]"
              >
                <ToolIcon
                  name={tool.iconName}
                  className="h-3.5 w-3.5 text-[var(--brand-primary)]"
                />
                <span>{tool.name}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Search Results View when filtering */}
      {isSearching && (
        <section aria-label="Hasil pencarian tools" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              Hasil Pencarian ({filteredTools.length} tools)
            </h2>
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setSelectedCategory("all");
              }}
              className="text-xs font-medium text-[var(--brand-primary)] hover:underline cursor-pointer"
            >
              Reset filter
            </button>
          </div>

          {filteredTools.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center">
                <p className="text-sm font-medium text-[var(--text-primary)]">
                  Tidak ada tool yang cocok dengan pencarian Anda.
                </p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  Coba kata kunci lain atau tekan Ctrl+K untuk membuka Command Palette.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredTools.map((tool) => (
                <ToolCard
                  key={tool.id}
                  tool={tool}
                  isFavorite={safeFavorites.includes(tool.id)}
                  usageCount={safeUsage[tool.id] ?? 0}
                  onToggleFavorite={toggleFavorite}
                  onSelectTool={recordToolUsage}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* 12 & 13. Ringkasan pekerjaan harian + Jumlah tugas selesai */}
      <DailySummary />

      {/* 4, 5, 6. Sering digunakan, Favorit, Terakhir digunakan */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* 5. Tools Favorit */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <Star className="h-4 w-4 text-amber-500" aria-hidden="true" />
              <span>Tools Favorit</span>
            </CardTitle>
            <CardDescription>
              Klik ikon bintang pada tool mana saja untuk menyematkannya di sini.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {favoriteTools.length === 0 ? (
              <p className="rounded-lg border border-dashed border-[var(--border-subtle)] p-4 text-center text-xs text-[var(--text-muted)]">
                Belum ada tool favorit tersimpan.
              </p>
            ) : (
              favoriteTools.slice(0, 5).map((tool) => (
                <Link
                  key={tool.id}
                  href={tool.route}
                  onClick={() => recordToolUsage(tool.id)}
                  className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm transition-colors hover:border-[var(--brand-primary)]/40 hover:bg-[var(--brand-subtle-bg)]"
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <ToolIcon
                      name={tool.iconName}
                      className="h-4 w-4 shrink-0 text-[var(--brand-primary)]"
                    />
                    <span className="truncate font-medium">{tool.name}</span>
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        {/* 4. Tools yang Sering Digunakan */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <Flame
                className="h-4 w-4 text-[var(--brand-primary)]"
                aria-hidden="true"
              />
              <span>Sering Digunakan</span>
            </CardTitle>
            <CardDescription>
              {Object.keys(safeUsage).length > 0
                ? "Diurutkan otomatis berdasarkan frekuensi pemakaian Anda."
                : "Rekomendasi populer untuk memulai pekerjaan hari ini."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {frequentTools.slice(0, 5).map((tool) => (
              <Link
                key={tool.id}
                href={tool.route}
                onClick={() => recordToolUsage(tool.id)}
                className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm transition-colors hover:border-[var(--brand-primary)]/40 hover:bg-[var(--brand-subtle-bg)]"
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <ToolIcon
                    name={tool.iconName}
                    className="h-4 w-4 shrink-0 text-[var(--brand-primary)]"
                  />
                  <span className="truncate font-medium">{tool.name}</span>
                </span>
                <Badge variant="secondary">
                  {safeUsage[tool.id] ? `${safeUsage[tool.id]}x` : "Saran"}
                </Badge>
              </Link>
            ))}
          </CardContent>
        </Card>

        {/* 6. Tools yang Terakhir Digunakan */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <History
                className="h-4 w-4 text-[var(--brand-primary)]"
                aria-hidden="true"
              />
              <span>Terakhir Digunakan</span>
            </CardTitle>
            <CardDescription>
              Akses ulang cepat ke tools yang baru saja Anda buka.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentTools.length === 0 ? (
              <p className="rounded-lg border border-dashed border-[var(--border-subtle)] p-4 text-center text-xs text-[var(--text-muted)]">
                Riwayat pemakaian akan muncul otomatis saat Anda membuka salah satu tool.
              </p>
            ) : (
              recentTools.slice(0, 5).map((tool) => (
                <Link
                  key={tool.id}
                  href={tool.route}
                  onClick={() => recordToolUsage(tool.id)}
                  className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm transition-colors hover:border-[var(--brand-primary)]/40 hover:bg-[var(--brand-subtle-bg)]"
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <ToolIcon
                      name={tool.iconName}
                      className="h-4 w-4 shrink-0 text-[var(--brand-primary)]"
                    />
                    <span className="truncate font-medium">{tool.name}</span>
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* 7-11+. 8 Kategori Lengkap (Total 100 Tools) */}
      <section aria-label="Katalog lengkap 8 kategori produktivitas" className="space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              Jelajahi Katalog ({ALL_TOOLS.length} Tools Profesional)
            </h2>
            <p className="text-xs text-[var(--text-secondary)]">
              Lompat cepat ke salah satu kategori atau langsung buka workspace khusus.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {TOOL_CATEGORIES.map((cat) => (
              <a
                key={cat.id}
                href={`#cat-${cat.id}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-2.5 py-1 text-xs font-medium text-[var(--text-primary)] hover:border-[var(--brand-primary)]/40 hover:bg-[var(--brand-subtle-bg)]"
              >
                <span>{cat.shortLabel}</span>
                <span className="font-mono text-[10px] text-[var(--text-muted)]">
                  {cat.accentLabel.split(" ")[0]}
                </span>
              </a>
            ))}
          </div>
        </div>

        {TOOL_CATEGORIES.map((category) => {
          const categoryTools = getToolsByCategory(category.id);
          return (
            <div key={category.id} id={`cat-${category.id}`} className="scroll-mt-20 space-y-4">
              <div className="flex flex-col justify-between gap-2 border-b border-[var(--border-subtle)] pb-3 sm:flex-row sm:items-end">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-subtle-bg)] text-[var(--brand-primary)]">
                    <ToolIcon name={category.iconName} className="h-5 w-5" />
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">
                        {category.label}
                      </h2>
                      <Badge variant="default">{category.accentLabel}</Badge>
                    </div>
                    <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
                      {category.description}
                    </p>
                  </div>
                </div>

                <Link
                  href={category.route}
                  className="inline-flex items-center gap-1.5 self-start rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:border-[var(--brand-primary)]/40 hover:bg-[var(--surface-hover)] sm:self-auto"
                >
                  <span>Buka Workspace {category.shortLabel}</span>
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {categoryTools.map((tool) => (
                  <ToolCard
                    key={tool.id}
                    tool={tool}
                    isFavorite={safeFavorites.includes(tool.id)}
                    usageCount={safeUsage[tool.id] ?? 0}
                    onToggleFavorite={toggleFavorite}
                    onSelectTool={recordToolUsage}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
