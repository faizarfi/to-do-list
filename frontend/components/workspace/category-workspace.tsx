"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Cpu,
  Search,
  Server,
  Star,
} from "lucide-react";

import { BusinessWorkspace } from "@/components/business/business-workspace";
import { CalculatorWorkspace } from "@/components/calculator/calculator-workspace";
import { DeveloperWorkspace } from "@/components/developer/developer-workspace";
import { ExcelWorkspace } from "@/components/excel/excel-workspace";
import { ImageWorkspace } from "@/components/image/image-workspace";
import { PdfWorkspace } from "@/components/pdf/pdf-workspace";
import { ProductivityWorkspace } from "@/components/productivity/productivity-workspace";
import { SecurityWorkspace } from "@/components/security/security-workspace";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ToolIcon } from "@/components/ui/tool-icon";
import { useBackendHealth } from "@/hooks/use-backend-health";
import { useMounted } from "@/hooks/use-mounted";
import { useRuangKerjaStore } from "@/lib/storage-store";
import {
  getCategoryMeta,
  getToolsByCategory,
  searchTools,
} from "@/lib/tools-registry";
import { cn } from "@/lib/utils";
import type { ToolCategoryId } from "@/types/tools";

interface CategoryWorkspaceProps {
  categoryId: ToolCategoryId;
}

export function CategoryWorkspace({ categoryId }: CategoryWorkspaceProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mounted = useMounted();

  const meta = getCategoryMeta(categoryId);
  const categoryTools = getToolsByCategory(categoryId);
  const initialToolSlug = searchParams.get("tool");

  const [filterText, setFilterText] = useState("");
  const [selectedSlug, setSelectedSlug] = useState<string>(
    initialToolSlug || categoryTools[0]?.slug || ""
  );

  const favorites = useRuangKerjaStore((state) => state.favorites);
  const toggleFavorite = useRuangKerjaStore((state) => state.toggleFavorite);
  const recordToolUsage = useRuangKerjaStore((state) => state.recordToolUsage);

  const { capabilities, health, error: healthError } = useBackendHealth(true);

  const safeFavorites = mounted ? favorites : [];

  const filteredTools = useMemo(
    () => searchTools(filterText, categoryId),
    [filterText, categoryId]
  );

  const activeTool = useMemo(() => {
    const requested = searchParams.get("tool") || selectedSlug;
    return (
      categoryTools.find((tool) => tool.slug === requested) ?? categoryTools[0]
    );
  }, [categoryTools, searchParams, selectedSlug]);

  const backendCategoryKey =
    categoryId === "image"
      ? "images"
      : categoryId === "excel"
        ? "spreadsheets"
        : categoryId === "productivity" ||
            categoryId === "developer" ||
            categoryId === "security"
          ? "qr"
          : categoryId === "business"
            ? "calculator"
            : categoryId;

  const backendReadiness = capabilities?.categories.find(
    (item) => item.category === backendCategoryKey
  );

  function handleSelectTool(slug: string, id: string) {
    setSelectedSlug(slug);
    recordToolUsage(id);
    router.replace(`${meta.route}?tool=${encodeURIComponent(slug)}`, {
      scroll: false,
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--brand-primary)]"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Kembali ke Dashboard</span>
          </Link>
          <div className="mt-2 flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--brand-subtle-bg)] text-[var(--brand-primary)]">
              <ToolIcon name={meta.iconName} className="h-5 w-5" />
            </span>
            <div>
              <h1
                id="main-heading"
                tabIndex={-1}
                className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]"
              >
                {meta.label}
              </h1>
              <p className="text-sm text-[var(--text-secondary)]">
                {meta.description}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="default">{meta.accentLabel}</Badge>
          {categoryTools.every((t) => t.implemented) ? (
            <Badge variant="success">Semua Fitur Aktif</Badge>
          ) : (
            <Badge variant="secondary">Target Aktif: Fase {meta.phase}</Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Tool selector column */}
        <Card className="lg:col-span-4 lg:self-start">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Daftar Tools ({categoryTools.length})</CardTitle>
            <div className="relative pt-1">
              <label htmlFor={`filter-${categoryId}`} className="visually-hidden">
                Filter tools di kategori {meta.label}
              </label>
              <Search
                className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]"
                aria-hidden="true"
              />
              <input
                id={`filter-${categoryId}`}
                type="search"
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                placeholder="Filter tool..."
                className="min-h-8 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] py-1.5 pr-3 pl-8 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
              />
            </div>
          </CardHeader>
          <CardContent className="max-h-[580px] space-y-1 overflow-y-auto">
            {filteredTools.map((tool) => {
              const selected = activeTool?.id === tool.id;
              return (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => handleSelectTool(tool.slug, tool.id)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors cursor-pointer",
                    selected
                      ? "bg-[var(--brand-subtle-bg)] text-[var(--brand-subtle-fg)] font-medium"
                      : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <ToolIcon name={tool.iconName} className="h-4 w-4 shrink-0" />
                    <span className="truncate">{tool.name}</span>
                  </span>
                  <span className="font-mono text-[11px] opacity-70">
                    #{String(tool.number).padStart(2, "0")}
                  </span>
                </button>
              );
            })}
          </CardContent>
        </Card>

        {/* Active tool workspace panel */}
        <div className="space-y-4 lg:col-span-8">
          {activeTool && (
            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-4 border-b border-[var(--border-subtle)]">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-subtle-bg)] text-[var(--brand-primary)]">
                    <ToolIcon name={activeTool.iconName} className="h-5 w-5" />
                  </span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="text-lg">{activeTool.name}</CardTitle>
                      <Badge variant="secondary">
                        Tool #{String(activeTool.number).padStart(2, "0")}
                      </Badge>
                      {activeTool.implemented && (
                        <Badge variant="success">Aktif</Badge>
                      )}
                    </div>
                    <CardDescription className="mt-1">
                      {activeTool.shortDescription}
                    </CardDescription>
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toggleFavorite(activeTool.id)}
                  aria-pressed={safeFavorites.includes(activeTool.id)}
                >
                  <Star
                    className={cn(
                      "h-4 w-4",
                      safeFavorites.includes(activeTool.id)
                        ? "fill-amber-400 text-amber-500"
                        : "text-[var(--text-muted)]"
                    )}
                    aria-hidden="true"
                  />
                  <span>
                    {safeFavorites.includes(activeTool.id) ? "Difavoritkan" : "Favorit"}
                  </span>
                </Button>
              </CardHeader>

              <CardContent className="space-y-4 pt-5">
                {activeTool.implemented && categoryId === "pdf" ? (
                  <PdfWorkspace tool={activeTool} health={health} />
                ) : activeTool.implemented && categoryId === "image" ? (
                  <ImageWorkspace tool={activeTool} />
                ) : activeTool.implemented && categoryId === "excel" ? (
                  <ExcelWorkspace tool={activeTool} />
                ) : activeTool.implemented && categoryId === "calculator" ? (
                  <CalculatorWorkspace tool={activeTool} />
                ) : activeTool.implemented && categoryId === "productivity" ? (
                  <ProductivityWorkspace tool={activeTool} />
                ) : activeTool.implemented && categoryId === "developer" ? (
                  <DeveloperWorkspace tool={activeTool} />
                ) : activeTool.implemented && categoryId === "security" ? (
                  <SecurityWorkspace tool={activeTool} />
                ) : activeTool.implemented && categoryId === "business" ? (
                  <BusinessWorkspace tool={activeTool} />
                ) : (
                  <>
                    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium text-[var(--text-primary)]">
                          Status Implementasi: Fase {activeTool.phase}
                        </p>
                        <Badge variant="warning">Menunggu Fase {activeTool.phase}</Badge>
                      </div>
                      <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">
                        Antarmuka penuh, validasi upload, pemrosesan file, dan preview hasil untuk <strong>{activeTool.name}</strong> akan diaktifkan pada Fase {activeTool.phase} sesuai rencana pengembangan bertahap.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border border-[var(--border-subtle)] p-4">
                        <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
                          <Cpu className="h-4 w-4 text-[var(--brand-primary)]" aria-hidden="true" />
                          <span>Arsitektur Pemrosesan</span>
                        </div>
                        <p className="mt-1.5 text-xs text-[var(--text-secondary)]">
                          {activeTool.requiresBackend
                            ? `Diproses di backend Python FastAPI (${activeTool.apiEndpoint}) dengan direktori temporary terisolasi.`
                            : "Diproses langsung secara instan di client dengan penyimpanan terstruktur di browser."}
                        </p>
                      </div>

                      <div className="rounded-xl border border-[var(--border-subtle)] p-4">
                        <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
                          <Server className="h-4 w-4 text-[var(--brand-primary)]" aria-hidden="true" />
                          <span>Kesiapan Engine Backend</span>
                        </div>
                        <div className="mt-1.5 flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                          {healthError ? (
                            <span className="text-[var(--warning-fg)]">
                              Server FastAPI belum tersambung. Jalankan backend terlebih dahulu.
                            </span>
                          ) : backendReadiness ? (
                            <span className="inline-flex items-center gap-1.5">
                              <CheckCircle2
                                className={cn(
                                  "h-3.5 w-3.5",
                                  backendReadiness.required_engines_ready
                                    ? "text-[var(--brand-primary)]"
                                    : "text-amber-500"
                                )}
                                aria-hidden="true"
                              />
                              <span>
                                {backendReadiness.required_engines_ready
                                  ? "Semua library Python pendukung siap digunakan."
                                  : "Sebagian library pendukung belum terpasang."}
                              </span>
                            </span>
                          ) : (
                            <span>{health ? "Tersambung" : "Memeriksa status..."}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
