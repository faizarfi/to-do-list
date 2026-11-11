"use client";

import { useEffect } from "react";

import { useRuangKerjaStore } from "@/lib/storage-store";
import type { ThemePreference } from "@/types/tools";

const COLOR_SCHEME_STORAGE_KEY = "color-scheme";

export function applyColorSchemePreference(pref: ThemePreference): void {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');
  const value = pref === "system" ? "light dark" : pref;
  if (meta) {
    meta.content = value;
  }

  try {
    if (pref === "system") {
      localStorage.removeItem(COLOR_SCHEME_STORAGE_KEY);
    } else {
      localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, pref);
    }
  } catch {
    // Ignore storage errors if site data is restricted
  }
}

export function getResolvedTheme(pref: ThemePreference): "light" | "dark" {
  if (pref === "light" || pref === "dark") return pref;
  if (typeof window !== "undefined") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return "light";
}

export function ThemeSync() {
  const themePreference = useRuangKerjaStore((state) => state.themePreference);
  const setThemePreference = useRuangKerjaStore((state) => state.setThemePreference);

  useEffect(() => {
    applyColorSchemePreference(themePreference);
  }, [themePreference]);

  // Keep theme in sync across browser tabs via storage event
  useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (event.key === COLOR_SCHEME_STORAGE_KEY) {
        if (event.newValue === "light" || event.newValue === "dark") {
          setThemePreference(event.newValue);
        } else if (event.newValue === null) {
          setThemePreference("system");
        }
      }
    }

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [setThemePreference]);

  return null;
}

