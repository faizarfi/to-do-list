"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Sparkles,
} from "lucide-react";

import { ToolIcon } from "@/components/ui/tool-icon";
import { TOOL_CATEGORIES } from "@/lib/tools-registry";
import { cn } from "@/lib/utils";
import type { BackendHealthResponse } from "@/types/tools";

interface SidebarNavProps {
  collapsed: boolean;
  onToggleCollapse?: () => void;
  onNavigate?: () => void;
  health: BackendHealthResponse | null;
  healthError: string | null;
}

export function SidebarNav({
  collapsed,
  onToggleCollapse,
  onNavigate,
  health,
  healthError,
}: SidebarNavProps) {
  const pathname = usePathname();

  const isActive = (route: string) =>
    pathname === route || pathname.startsWith(`${route}/`);

  return (
    <div className="flex h-full flex-col justify-between">
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-hidden">
        {/* Brand Header */}
        <div
          className={cn(
            "flex shrink-0 items-center border-b border-[var(--border-subtle)] px-3 py-3.5",
            collapsed ? "justify-center" : "justify-between"
          )}
        >
          <Link
            href="/dashboard"
            onClick={onNavigate}
            className="flex items-center gap-2.5 rounded-lg focus-visible:outline-2"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--brand-primary)] text-[var(--brand-primary-fg)] shadow-xs">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            </span>
            {!collapsed && (
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold tracking-tight text-[var(--text-primary)]">
                  RuangKerja
                </p>
                <p className="truncate text-[11px] text-[var(--text-muted)]">
                  100 Tools Suite
                </p>
              </div>
            )}
          </Link>

          {onToggleCollapse && !collapsed && (
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label="Ciutkan sidebar"
              className="hidden lg:inline-flex min-h-8 min-w-8 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>

        {onToggleCollapse && collapsed && (
          <div className="hidden lg:flex shrink-0 justify-center px-2">
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label="Lebarkan sidebar"
              className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}

        <div className="flex-1 space-y-5 overflow-y-auto pb-2">
          {/* Primary Navigation */}
          <nav aria-label="Menu utama" className="space-y-1 px-2">
            {!collapsed && (
              <p className="px-2.5 pb-1 text-[11px] font-semibold tracking-wider text-[var(--text-muted)] uppercase">
                Ruang Utama
              </p>
            )}
            <Link
              href="/dashboard"
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                collapsed && "justify-center px-2",
                isActive("/dashboard")
                  ? "bg-[var(--brand-subtle-bg)] text-[var(--brand-subtle-fg)]"
                  : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
              )}
            >
              <LayoutDashboard className="h-4 w-4 shrink-0" aria-hidden="true" />
              {!collapsed && <span>Dashboard</span>}
            </Link>
          </nav>

          {/* 8 Tool Categories */}
          <nav aria-label="Kategori alat produktivitas" className="space-y-1 px-2">
            {!collapsed && (
              <p className="px-2.5 pb-1 text-[11px] font-semibold tracking-wider text-[var(--text-muted)] uppercase">
                100 Tools • 8 Kategori
              </p>
            )}
            {TOOL_CATEGORIES.map((category) => {
              const active = isActive(category.route);
              return (
                <Link
                  key={category.id}
                  href={category.route}
                  onClick={onNavigate}
                  title={collapsed ? category.label : undefined}
                  className={cn(
                    "flex items-center justify-between gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                    collapsed && "justify-center px-2",
                    active
                      ? "bg-[var(--brand-subtle-bg)] text-[var(--brand-subtle-fg)]"
                      : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <ToolIcon name={category.iconName} className="h-4 w-4 shrink-0" />
                    {!collapsed && <span className="truncate">{category.label}</span>}
                  </span>
                  {!collapsed && (
                    <span className="shrink-0 rounded-md bg-[var(--surface-muted)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-muted)]">
                      {category.accentLabel.split(" ")[0]}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Bottom Settings & Live Backend Indicator */}
      <div className="space-y-2 border-t border-[var(--border-subtle)] p-2">
        <Link
          href="/settings"
          onClick={onNavigate}
          title={collapsed ? "Pengaturan" : undefined}
          className={cn(
            "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
            collapsed && "justify-center px-2",
            isActive("/settings")
              ? "bg-[var(--brand-subtle-bg)] text-[var(--brand-subtle-fg)]"
              : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
          )}
        >
          <Settings className="h-4 w-4 shrink-0" aria-hidden="true" />
          {!collapsed && <span>Pengaturan</span>}
        </Link>

        <Link
          href="/settings#backend-status"
          onClick={onNavigate}
          className={cn(
            "flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-2.5 py-2 text-xs transition-colors hover:bg-[var(--surface-hover)]",
            collapsed && "justify-center px-2"
          )}
        >
          <span
            className={cn(
              "h-2 w-2 shrink-0 rounded-full",
              health?.status === "healthy"
                ? "bg-emerald-500"
                : healthError
                  ? "bg-amber-500"
                  : "bg-slate-400"
            )}
            aria-hidden="true"
          />
          {!collapsed ? (
            <div className="flex min-w-0 flex-1 items-center justify-between gap-1">
              <span className="truncate font-medium text-[var(--text-primary)]">
                {health?.status === "healthy"
                  ? "FastAPI Aktif"
                  : healthError
                    ? "Backend Offline"
                    : "Memeriksa API..."}
              </span>
              <Activity className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
            </div>
          ) : (
            <span className="visually-hidden">
              {health?.status === "healthy" ? "FastAPI Aktif" : "Status Backend"}
            </span>
          )}
        </Link>
      </div>
    </div>
  );
}

