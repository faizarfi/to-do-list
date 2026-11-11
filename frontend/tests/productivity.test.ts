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

import { useRuangKerjaStore } from "@/lib/storage-store";
import {
  computeTextStats,
  removeDuplicateLines,
  removeEmptyLines,
  removeExtraSpaces,
  sortTextLines,
  toLowerCaseText,
  toTitleCaseText,
  toUpperCaseText,
} from "@/lib/text-formatter";
import { ALL_TOOLS } from "@/lib/tools-registry";

describe("All 100 RuangKerja Tools Implemented", () => {
  it("marks every one of the 100 tools as implemented", () => {
    expect(ALL_TOOLS).toHaveLength(100);
    expect(ALL_TOOLS.every((tool) => tool.implemented)).toBe(true);
  });
});

describe("Text Formatter (#49)", () => {
  it("applies case transformations, cleaning, deduplication, sorting, and stats", () => {
    expect(toUpperCaseText("ruang kerja")).toBe("RUANG KERJA");
    expect(toLowerCaseText("RUANG KERJA")).toBe("ruang kerja");
    expect(toTitleCaseText("ruang kerja produktif")).toBe("Ruang Kerja Produktif");
    expect(removeExtraSpaces("  halo   dunia  \n  tes   lagi ")).toBe("halo dunia\ntes lagi");
    expect(removeEmptyLines("satu\n\n  \ndua")).toBe("satu\ndua");
    expect(removeDuplicateLines("apel\njeruk\napel\nmangga")).toBe("apel\njeruk\nmangga");
    expect(sortTextLines("c\na\nb", "asc")).toBe("a\nb\nc");

    const stats = computeTextStats("satu dua\ntiga");
    expect(stats.words).toBe(3);
    expect(stats.lines).toBe(2);
    expect(stats.characters).toBe(13);
    expect(stats.charactersNoSpaces).toBe(11);
  });
});

describe("Daily To-Do List, Work Log & Pomodoro Persistence (#46-#48)", () => {
  beforeEach(() => {
    memoryStorage.clear();
    useRuangKerjaStore.getState().resetAllPreferences();
  });

  it("adds, edits, persists, and toggles To-Do items", () => {
    useRuangKerjaStore.getState().addTodo({
      title: "Kirim laporan",
      category: "Dokumen",
      priority: "high",
      deadline: "2026-11-15",
    });

    const items = useRuangKerjaStore.getState().todos;
    expect(items).toHaveLength(1);
    expect(items[0].priority).toBe("high");
    expect(items[0].deadline).toBe("2026-11-15");

    useRuangKerjaStore.getState().updateTodo(items[0].id, {
      title: "Kirim laporan final",
      priority: "medium",
    });
    const updated = useRuangKerjaStore.getState().todos[0];
    expect(updated.title).toBe("Kirim laporan final");
    expect(updated.priority).toBe("medium");

    const saved = JSON.parse(memoryStorage.getItem("ruangkerja-storage-v1")!);
    expect(saved.state.todos[0].title).toBe("Kirim laporan final");

    useRuangKerjaStore.getState().toggleTodo(updated.id);
    useRuangKerjaStore.getState().clearCompletedTodos();
    expect(useRuangKerjaStore.getState().todos).toHaveLength(0);
  });

  it("logs work activities and persists Pomodoro duration settings", () => {
    useRuangKerjaStore.getState().addWorkLog({
      activity: "Olah data penjualan",
      category: "Operasional",
      startTime: "09:00",
      endTime: "11:00",
      durationMinutes: 120,
      notes: "Selesai ekspor ke PDF",
      date: "2026-11-11",
    });
    expect(useRuangKerjaStore.getState().workLogs).toHaveLength(1);

    useRuangKerjaStore.getState().updatePomodoroSettings({ focusMinutes: 30 });
    expect(useRuangKerjaStore.getState().pomodoroSettings.focusMinutes).toBe(30);
  });
});

