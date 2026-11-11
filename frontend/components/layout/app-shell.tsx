"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { X } from "lucide-react";

import { CommandPalette } from "@/components/layout/command-palette";
import { HeaderBar } from "@/components/layout/header-bar";
import { PomodoroRuntime } from "@/components/layout/pomodoro-runtime";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { useBackendHealth } from "@/hooks/use-backend-health";
import { useMounted } from "@/hooks/use-mounted";
import { useRuangKerjaStore } from "@/lib/storage-store";
import { cn } from "@/lib/utils";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const mounted = useMounted();

  const sidebarCollapsed = useRuangKerjaStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useRuangKerjaStore((state) => state.toggleSidebar);

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [headerQuery, setHeaderQuery] = useState("");
  const mobileDialogRef = useRef<HTMLDialogElement>(null);

  const { health, error: healthError } = useBackendHealth(true);

  const effectiveCollapsed = mounted ? sidebarCollapsed : false;

  // Global Ctrl+K / Cmd+K shortcut for Command Palette
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((prev) => !prev);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Native <dialog> sync for mobile navigation drawer
  useEffect(() => {
    const dialog = mobileDialogRef.current;
    if (!dialog) return;

    if (mobileMenuOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [mobileMenuOpen]);

  useEffect(() => {
    const dialog = mobileDialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      dialog.returnValue = "";
      setMobileMenuOpen(false);
    };
    dialog.addEventListener("close", handleClose);
    return () => dialog.removeEventListener("close", handleClose);
  }, []);

  // Sync header search input to dashboard query or redirect when typing on subpages
  function handleHeaderSearchChange(value: string) {
    setHeaderQuery(value);
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("ruangkerja:search-update", { detail: value })
      );
    }
    if (value.trim() && pathname !== "/dashboard") {
      router.push(`/dashboard?q=${encodeURIComponent(value.trim())}`);
    }
  }

  return (
    <div className="flex min-h-dvh bg-[var(--bg-canvas)] text-[var(--text-primary)]">
      {/* Skip link for keyboard accessibility */}
      <a
        href="#main-heading"
        className="visually-hidden fixed top-3 left-3 z-50 rounded-lg bg-[var(--brand-primary)] px-3 py-2 text-xs font-semibold text-[var(--brand-primary-fg)] shadow-lg"
      >
        Lewati ke konten utama
      </a>

      {/* Desktop Collapsible Sidebar */}
      <aside
        aria-label="Navigasi samping"
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 border-r border-[var(--border-subtle)] bg-[var(--surface-card)] transition-[width] duration-200 lg:block",
          effectiveCollapsed ? "w-[72px]" : "w-64"
        )}
      >
        <SidebarNav
          collapsed={effectiveCollapsed}
          onToggleCollapse={toggleSidebar}
          health={health}
          healthError={healthError}
        />
      </aside>

      {/* Mobile Navigation Drawer using native modal <dialog> */}
      <dialog
        ref={mobileDialogRef}
        {...({ closedby: "any" } as Record<string, string>)}
        aria-label="Menu navigasi RuangKerja"
        className="m-0 h-dvh max-h-dvh w-[min(82vw,300px)] max-w-none border-r border-[var(--border-subtle)] bg-[var(--surface-card)] p-0 text-[var(--text-primary)] shadow-2xl"
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-end border-b border-[var(--border-subtle)] px-3 py-2">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Tutup menu navigasi"
              autoFocus
              className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] cursor-pointer"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <SidebarNav
              collapsed={false}
              onNavigate={() => setMobileMenuOpen(false)}
              health={health}
              healthError={healthError}
            />
          </div>
        </div>
      </dialog>

      {/* Main Content Column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <HeaderBar
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          onOpenCommandPalette={() => setPaletteOpen(true)}
          globalSearchQuery={headerQuery}
          onGlobalSearchChange={handleHeaderSearchChange}
        />

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 lg:px-8">
          {children}
        </main>

        <footer className="border-t border-[var(--border-subtle)] px-4 py-4 text-xs text-[var(--text-muted)] lg:px-8">
          <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
            <p>
              RuangKerja — Personal Productivity Toolbox (100 Fitur Produktivitas)
            </p>
            <p>Pemrosesan dokumen lokal dan aman via FastAPI</p>
          </div>
        </footer>
      </div>

      <PomodoroRuntime />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}

