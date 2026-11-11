import { beforeEach, describe, expect, it, vi } from "vitest";

const memoryStorage = vi.hoisted(() => {
  let store: Record<string, string> = {};
  const mockStorage = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: mockStorage,
    writable: true,
    configurable: true,
  });
  return mockStorage;
});

import {
  formatIndonesianDate,
  formatIndonesianTime,
  getGreetingForHour,
} from "@/lib/greeting";
import { formatBytes, parseContentDispositionFilename } from "@/lib/pdf-api";
import { useRuangKerjaStore } from "@/lib/storage-store";
import {
  ALL_TOOLS,
  TOOL_CATEGORIES,
  getToolsByCategory,
  searchTools,
} from "@/lib/tools-registry";

describe("RuangKerja 100-Tools Registry", () => {
  it("contains exactly 100 unique implemented tools across 8 categories", () => {
    expect(ALL_TOOLS).toHaveLength(100);
    expect(TOOL_CATEGORIES).toHaveLength(8);

    const ids = new Set(ALL_TOOLS.map((t) => t.id));
    const slugs = new Set(ALL_TOOLS.map((t) => t.slug));
    const numbers = ALL_TOOLS.map((t) => t.number);

    expect(ids.size).toBe(100);
    expect(slugs.size).toBe(100);
    expect(numbers).toEqual(Array.from({ length: 100 }, (_, idx) => idx + 1));
    expect(ALL_TOOLS.every((t) => t.implemented)).toBe(true);

    expect(getToolsByCategory("pdf")).toHaveLength(20);
    expect(
      getToolsByCategory("pdf").every((t) => t.apiEndpoint?.startsWith("/api/pdf/"))
    ).toBe(true);
    expect(getToolsByCategory("image")).toHaveLength(18);
    expect(getToolsByCategory("excel")).toHaveLength(14);
    expect(getToolsByCategory("calculator")).toHaveLength(14);
    expect(getToolsByCategory("productivity")).toHaveLength(12);
    expect(getToolsByCategory("developer")).toHaveLength(12);
    expect(getToolsByCategory("security")).toHaveLength(5);
    expect(getToolsByCategory("business")).toHaveLength(5);
  });

  it("filters tools accurately by name, keywords, or category", () => {
    const mergeResults = searchTools("merge pdf");
    expect(mergeResults.some((tool) => tool.id === "merge-pdf")).toBe(true);

    const qrResults = searchTools("wifi");
    expect(qrResults.some((tool) => tool.id === "qr-code-generator")).toBe(true);

    const passportResults = searchTools("3x4", "image");
    expect(passportResults.map((tool) => tool.id)).toContain("passport-photo-maker");

    expect(searchTools("tidakadadiaplikasiini")).toHaveLength(0);
  });
});

describe("Greeting and Date/Time Helpers", () => {
  it("returns appropriate Indonesian greeting by hour", () => {
    expect(getGreetingForHour(7)).toBe("Selamat pagi");
    expect(getGreetingForHour(12)).toBe("Selamat siang");
    expect(getGreetingForHour(16)).toBe("Selamat sore");
    expect(getGreetingForHour(21)).toBe("Selamat malam");
  });

  it("formats Indonesian date and 24h time consistently", () => {
    const sample = new Date("2026-11-11T09:05:03");
    expect(formatIndonesianDate(sample)).toContain("2026");
    expect(formatIndonesianTime(sample)).toMatch(/09[:.]05[:.]03/);
  });
});

describe("Zustand Storage Store (Favorites, Usage, Quick Todos)", () => {
  beforeEach(() => {
    memoryStorage.clear();
    useRuangKerjaStore.getState().resetAllPreferences();
  });

  it("toggles favorites, tracks usage, and persists to localStorage", () => {
    const store = useRuangKerjaStore.getState();
    expect(store.favorites).toContain("merge-pdf");

    store.toggleFavorite("merge-pdf");
    expect(useRuangKerjaStore.getState().favorites).not.toContain("merge-pdf");

    store.toggleFavorite("ocr-pdf");
    expect(useRuangKerjaStore.getState().favorites).toContain("ocr-pdf");

    store.recordToolUsage("ocr-pdf");
    store.recordToolUsage("ocr-pdf");
    store.recordToolUsage("pomodoro-timer");

    const updated = useRuangKerjaStore.getState();
    expect(updated.recentToolIds[0]).toBe("pomodoro-timer");
    expect(updated.recentToolIds[1]).toBe("ocr-pdf");
    expect(updated.usageCounts["ocr-pdf"]).toBe(2);
    expect(updated.usageCounts["pomodoro-timer"]).toBe(1);

    const persistedRaw = memoryStorage.getItem("ruangkerja-storage-v1");
    expect(persistedRaw).not.toBeNull();
    const persisted = JSON.parse(persistedRaw!);
    expect(persisted.state.favorites).toContain("ocr-pdf");
    expect(persisted.state.usageCounts["ocr-pdf"]).toBe(2);
  });

  it("adds, toggles, deletes quick todos and persists across reloads", () => {
    useRuangKerjaStore.getState().addQuickTodo("Siapkan laporan PDF");
    let todos = useRuangKerjaStore.getState().todos;
    expect(todos).toHaveLength(1);
    expect(todos[0].completed).toBe(false);

    useRuangKerjaStore.getState().toggleTodo(todos[0].id);
    todos = useRuangKerjaStore.getState().todos;
    expect(todos[0].completed).toBe(true);

    const persistedRaw = memoryStorage.getItem("ruangkerja-storage-v1");
    expect(persistedRaw).not.toBeNull();
    const persisted = JSON.parse(persistedRaw!);
    expect(persisted.state.todos[0].title).toBe("Siapkan laporan PDF");
    expect(persisted.state.todos[0].completed).toBe(true);

    useRuangKerjaStore.getState().deleteTodo(todos[0].id);
    expect(useRuangKerjaStore.getState().todos).toHaveLength(0);
  });
});

describe("PDF API Helpers", () => {
  it("parses UTF-8 and quoted Content-Disposition filenames safely", () => {
    expect(
      parseContentDispositionFilename(
        "attachment; filename*=UTF-8''Laporan%20Keuangan%20(2026).pdf",
        "fallback.pdf"
      )
    ).toBe("Laporan Keuangan (2026).pdf");

    expect(
      parseContentDispositionFilename(
        'attachment; filename="dokumen hasil.zip"',
        "fallback.zip"
      )
    ).toBe("dokumen hasil.zip");

    expect(parseContentDispositionFilename(null, "default.pdf")).toBe("default.pdf");
  });

  it("formats file byte sizes cleanly", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(2 * 1024 * 1024)).toBe("2.00 MB");
  });
});
