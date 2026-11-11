"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Menu, Moon, Search, Sun, Timer } from "lucide-react";

import { getResolvedTheme } from "@/components/layout/theme-sync";
import { Button } from "@/components/ui/button";
import { useMounted } from "@/hooks/use-mounted";
import { useRuangKerjaStore } from "@/lib/storage-store";

interface HeaderBarProps {
  onOpenMobileMenu: () => void;
  onOpenCommandPalette: () => void;
  globalSearchQuery: string;
  onGlobalSearchChange: (value: string) => void;
}

export function HeaderBar({
  onOpenMobileMenu,
  onOpenCommandPalette,
  globalSearchQuery,
  onGlobalSearchChange,
}: HeaderBarProps) {
  const mounted = useMounted();
  const themePreference = useRuangKerjaStore((state) => state.themePreference);
  const setThemePreference = useRuangKerjaStore((state) => state.setThemePreference);
  const pomodoroRuntime = useRuangKerjaStore((state) => state.pomodoroRuntime);

  const pomoMins = Math.floor(pomodoroRuntime.secondsLeft / 60);
  const pomoSecs = pomodoroRuntime.secondsLeft % 60;
  const pomoFormatted = `${String(pomoMins).padStart(2, "0")}:${String(pomoSecs).padStart(2, "0")}`;

  const resolvedTheme = useMemo(() => {
    if (!mounted) return "light";
    return getResolvedTheme(themePreference);
  }, [mounted, themePreference]);

  function handleQuickThemeToggle() {
    const current = getResolvedTheme(themePreference);
    const target = current === "dark" ? "light" : "dark";
    const systemIsDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const systemScheme = systemIsDark ? "dark" : "light";
    setThemePreference(target === systemScheme ? "system" : target);
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-[var(--border-subtle)] bg-[var(--surface-card)]/90 px-4 backdrop-blur-md lg:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={onOpenMobileMenu}
          aria-label="Buka menu navigasi"
          className="lg:hidden"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </Button>

        {/* Header Search Input */}
        <div className="relative flex w-full max-w-md items-center">
          <label htmlFor="header-tool-search" className="visually-hidden">
            Cari fitur di RuangKerja
          </label>
          <Search
            className="pointer-events-none absolute left-3 h-4 w-4 text-[var(--text-muted)]"
            aria-hidden="true"
          />
          <input
            id="header-tool-search"
            type="search"
            value={globalSearchQuery}
            onChange={(e) => onGlobalSearchChange(e.target.value)}
            placeholder="Cari cepat 100 tools produktivitas..."
            className="min-h-9 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] py-1.5 pr-16 pl-9 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] transition-colors focus:border-[var(--brand-primary)] focus:bg-[var(--surface-input)] focus:outline-none"
          />
          <button
            type="button"
            onClick={onOpenCommandPalette}
            aria-label="Buka command palette (Ctrl + K)"
            className="absolute right-2 hidden sm:inline-flex items-center gap-0.5 rounded border border-[var(--border-subtle)] bg-[var(--surface-card)] px-1.5 py-0.5 font-mono text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            <span>Ctrl</span>
            <span>K</span>
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {mounted && pomodoroRuntime.running && (
          <Link
            href="/productivity?tool=pomodoro-timer"
            aria-label={`Pomodoro aktif: ${pomoFormatted}`}
            className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-[var(--brand-subtle-border)] bg-[var(--brand-subtle-bg)] px-2.5 py-1 font-mono text-xs font-semibold tabular-nums text-[var(--brand-subtle-fg)] transition-colors hover:border-[var(--brand-primary)]"
          >
            <Timer className="h-3.5 w-3.5 text-[var(--brand-primary)]" aria-hidden="true" />
            <span>{pomoFormatted}</span>
          </Link>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={onOpenCommandPalette}
          className="sm:hidden"
          aria-label="Buka pencarian cepat"
        >
          <Search className="h-4 w-4" aria-hidden="true" />
          <span>Tools</span>
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={handleQuickThemeToggle}
          aria-label={
            resolvedTheme === "dark"
              ? "Beralih ke mode terang"
              : "Beralih ke mode gelap"
          }
          title={
            resolvedTheme === "dark"
              ? "Beralih ke mode terang"
              : "Beralih ke mode gelap"
          }
        >
          {resolvedTheme === "dark" ? (
            <Sun className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Moon className="h-4 w-4" aria-hidden="true" />
          )}
        </Button>
      </div>
    </header>
  );
}

