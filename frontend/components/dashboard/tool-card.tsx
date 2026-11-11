"use client";

import Link from "next/link";
import { ArrowRight, Star } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { ToolIcon } from "@/components/ui/tool-icon";
import { cn } from "@/lib/utils";
import type { ToolDefinition } from "@/types/tools";

interface ToolCardProps {
  tool: ToolDefinition;
  isFavorite: boolean;
  usageCount?: number;
  onToggleFavorite: (toolId: string) => void;
  onSelectTool: (toolId: string) => void;
}

export function ToolCard({
  tool,
  isFavorite,
  usageCount = 0,
  onToggleFavorite,
  onSelectTool,
}: ToolCardProps) {
  const paddedNumber = String(tool.number).padStart(2, "0");

  return (
    <article className="group relative flex flex-col justify-between rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 transition-all hover:border-[var(--brand-primary)]/50 hover:shadow-sm rk-card-focus">
      <div>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--brand-subtle-bg)] text-[var(--brand-primary)]">
              <ToolIcon name={tool.iconName} className="h-4 w-4" />
            </span>
            <span className="font-mono text-[11px] font-medium text-[var(--text-muted)]">
              #{paddedNumber}
            </span>
          </div>

          <button
            type="button"
            onClick={() => onToggleFavorite(tool.id)}
            aria-pressed={isFavorite}
            aria-label={
              isFavorite
                ? `Hapus ${tool.name} dari favorit`
                : `Simpan ${tool.name} ke favorit`
            }
            className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-hover)] cursor-pointer"
          >
            <Star
              className={cn(
                "h-4 w-4 transition-colors",
                isFavorite
                  ? "fill-amber-400 text-amber-500"
                  : "text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]"
              )}
              aria-hidden="true"
            />
          </button>
        </div>

        <h3 className="mt-3 text-sm font-semibold text-[var(--text-primary)]">
          <Link
            href={tool.route}
            onClick={() => onSelectTool(tool.id)}
            className="after:absolute after:inset-0 after:z-0 focus-visible:outline-none"
          >
            {tool.name}
          </Link>
        </h3>
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[var(--text-secondary)]">
          {tool.shortDescription}
        </p>
      </div>

      <div className="relative z-10 mt-4 flex items-center justify-between gap-2 pt-2 pointer-events-none">
        <div className="flex items-center gap-1.5">
          {tool.implemented ? (
            <Badge variant="success">Aktif</Badge>
          ) : (
            <Badge variant="secondary">Fase {tool.phase}</Badge>
          )}
          {usageCount > 0 && (
            <span className="font-mono text-[11px] text-[var(--text-muted)]">
              {usageCount}x
            </span>
          )}
        </div>

        <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--brand-primary)] opacity-80 transition-transform group-hover:translate-x-0.5 group-hover:opacity-100">
          <span>Buka</span>
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      </div>
    </article>
  );
}

