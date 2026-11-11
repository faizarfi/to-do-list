"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useId, useMemo, useState } from "react";
import {
  Bell,
  Check,
  CheckCircle2,
  Circle,
  Copy,
  Download,
  Edit3,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Search,
  SkipForward,
  Trash2,
} from "lucide-react";

import {
  EXTRA_PRODUCTIVITY_IDS,
  ProductivityExtraWorkspace,
} from "@/components/productivity/productivity-extra-workspace";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useMounted } from "@/hooks/use-mounted";
import { calculateWorkDuration } from "@/lib/calculators";
import { getTodayIsoDate } from "@/lib/greeting";
import {
  playCompletionChime,
  requestPomodoroNotificationPermission,
} from "@/lib/pomodoro-audio";
import {
  generateQrCode,
  type QrContentTypeOption,
  type QrGenerateResult,
  type QrOutputFormatOption,
  type WifiEncryptionOption,
} from "@/lib/qr-api";
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
import { cn, formatMinutesToDuration } from "@/lib/utils";
import type {
  PomodoroMode,
  TodoItem,
  TodoPriority,
  ToolDefinition,
} from "@/types/tools";

interface ProductivityWorkspaceProps {
  tool: ToolDefinition;
}

const TODO_CATEGORIES = ["Pekerjaan", "Dokumen", "Meeting", "Pribadi", "Harian"];
const WORKLOG_CATEGORIES = [
  "Pengembangan",
  "Dokumen",
  "Rapat",
  "Riset",
  "Operasional",
  "Lainnya",
];

function escapeCsvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

function downloadCsvRows(filename: string, headers: string[], rows: string[][]): void {
  const lines = [
    headers.map(escapeCsvCell).join(","),
    ...rows.map((r) => r.map(escapeCsvCell).join(",")),
  ];
  const blob = new Blob([`\uFEFF${lines.join("\r\n")}`], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function getRelativeLuminance(hex: string): number {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return 0;
  const channels = [0, 2, 4].map((idx) => {
    const c = parseInt(clean.slice(idx, idx + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function computeHexContrast(hexA: string, hexB: string): number {
  const lumA = getRelativeLuminance(hexA);
  const lumB = getRelativeLuminance(hexB);
  const bright = Math.max(lumA, lumB);
  const dark = Math.min(lumA, lumB);
  return (bright + 0.05) / (dark + 0.05);
}

export function ProductivityWorkspace({ tool }: ProductivityWorkspaceProps) {
  const mounted = useMounted();
  const pomodoroRuntime = useRuangKerjaStore((s) => s.pomodoroRuntime);
  const togglePomodoroRunning = useRuangKerjaStore((s) => s.togglePomodoroRunning);

  const showLivePomodoroBanner =
    mounted && pomodoroRuntime.running && tool.id !== "pomodoro-timer";

  const remMins = Math.floor(pomodoroRuntime.secondsLeft / 60);
  const remSecs = pomodoroRuntime.secondsLeft % 60;
  const formattedPomo = `${String(remMins).padStart(2, "0")}:${String(remSecs).padStart(2, "0")}`;

  return (
    <div className="space-y-4">
      {showLivePomodoroBanner && (
        <div
          role="status"
          aria-live="polite"
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--brand-primary)]/30 bg-[var(--brand-soft)]/60 px-4 py-2.5 text-xs"
        >
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-[var(--brand-primary)]" aria-hidden="true" />
            <span className="font-medium text-[var(--text-primary)]">
              Pomodoro aktif (
              {pomodoroRuntime.mode === "focus"
                ? "Fokus"
                : pomodoroRuntime.mode === "shortBreak"
                  ? "Istirahat Singkat"
                  : "Istirahat Panjang"}
              ):
            </span>
            <span className="font-mono text-sm font-bold tabular-nums text-[var(--brand-primary)]">
              {formattedPomo}
            </span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={togglePomodoroRunning}
          >
            <Pause className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Jeda Timer</span>
          </Button>
        </div>
      )}

      {EXTRA_PRODUCTIVITY_IDS.has(tool.id) ? (
        <ProductivityExtraWorkspace tool={tool} />
      ) : (
        <CoreProductivityWorkspace tool={tool} />
      )}
    </div>
  );
}

function CoreProductivityWorkspace({ tool }: ProductivityWorkspaceProps) {
  const formId = useId();
  const mounted = useMounted();
  const todayIso = getTodayIsoDate();

  // Store selectors
  const todos = useRuangKerjaStore((s) => s.todos);
  const addTodo = useRuangKerjaStore((s) => s.addTodo);
  const updateTodo = useRuangKerjaStore((s) => s.updateTodo);
  const toggleTodo = useRuangKerjaStore((s) => s.toggleTodo);
  const deleteTodo = useRuangKerjaStore((s) => s.deleteTodo);
  const clearCompletedTodos = useRuangKerjaStore((s) => s.clearCompletedTodos);

  const workLogs = useRuangKerjaStore((s) => s.workLogs);
  const addWorkLog = useRuangKerjaStore((s) => s.addWorkLog);
  const deleteWorkLog = useRuangKerjaStore((s) => s.deleteWorkLog);

  const pomodoroSettings = useRuangKerjaStore((s) => s.pomodoroSettings);
  const pomodoroRuntime = useRuangKerjaStore((s) => s.pomodoroRuntime);
  const updatePomodoroSettings = useRuangKerjaStore(
    (s) => s.updatePomodoroSettings
  );
  const togglePomodoroRunning = useRuangKerjaStore((s) => s.togglePomodoroRunning);
  const switchPomodoroMode = useRuangKerjaStore((s) => s.switchPomodoroMode);
  const clearPomodoroNotice = useRuangKerjaStore((s) => s.clearPomodoroNotice);

  // #46 To-Do List local UI state
  const [todoTitle, setTodoTitle] = useState("");
  const [todoCategory, setTodoCategory] = useState("Pekerjaan");
  const [todoPriority, setTodoPriority] = useState<TodoPriority>("medium");
  const [todoDeadline, setTodoDeadline] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [todoSearch, setTodoSearch] = useState("");
  const [todoStatusFilter, setTodoStatusFilter] = useState<
    "all" | "active" | "completed"
  >("all");
  const [todoPriorityFilter, setTodoPriorityFilter] = useState<
    TodoPriority | "all"
  >("all");
  const [todoCategoryFilter, setTodoCategoryFilter] = useState<string>("all");

  // #48 Work Log local state
  const [logActivity, setLogActivity] = useState("");
  const [logCategory, setLogCategory] = useState("Pengembangan");
  const [logDate, setLogDate] = useState(todayIso);
  const [logStart, setLogStart] = useState("09:00");
  const [logEnd, setLogEnd] = useState("10:30");
  const [logNotes, setLogNotes] = useState("");

  // #49 Text Formatter local state
  const [textInput, setTextInput] = useState("");
  const [previousText, setPreviousText] = useState<string | null>(null);
  const [textCopied, setTextCopied] = useState(false);

  // #50 QR Code Generator local state
  const [qrType, setQrType] = useState<QrContentTypeOption>("url");
  const [qrText, setQrText] = useState("");
  const [qrUrl, setQrUrl] = useState("https://ruangkerja.local");
  const [qrPhone, setQrPhone] = useState("");
  const [qrEmailTo, setQrEmailTo] = useState("");
  const [qrEmailSubj, setQrEmailSubj] = useState("");
  const [qrEmailBody, setQrEmailBody] = useState("");
  const [qrWifiSsid, setQrWifiSsid] = useState("");
  const [qrWifiPass, setQrWifiPass] = useState("");
  const [qrWifiEnc, setQrWifiEnc] = useState<WifiEncryptionOption>("WPA");
  const [qrWifiHidden, setQrWifiHidden] = useState(false);
  const [qrSize, setQrSize] = useState(360);
  const [qrFillColor, setQrFillColor] = useState("#0F172A");
  const [qrBackColor, setQrBackColor] = useState("#FFFFFF");
  const [qrFormat, setQrFormat] = useState<QrOutputFormatOption>("png");
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [qrResult, setQrResult] = useState<QrGenerateResult | null>(null);

  useEffect(() => {
    return () => {
      if (qrResult) URL.revokeObjectURL(qrResult.objectUrl);
    };
  }, [qrResult]);

  const safeTodos = useMemo(() => (mounted ? todos : []), [mounted, todos]);
  const safeLogs = useMemo(() => (mounted ? workLogs : []), [mounted, workLogs]);

  // #46 To-Do filtering & stats
  const filteredTodos = useMemo(() => {
    const q = todoSearch.trim().toLowerCase();
    return safeTodos.filter((item) => {
      if (todoStatusFilter === "active" && item.completed) return false;
      if (todoStatusFilter === "completed" && !item.completed) return false;
      if (todoPriorityFilter !== "all" && item.priority !== todoPriorityFilter)
        return false;
      if (todoCategoryFilter !== "all" && item.category !== todoCategoryFilter)
        return false;
      if (q && !item.title.toLowerCase().includes(q) && !item.category.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [
    safeTodos,
    todoSearch,
    todoStatusFilter,
    todoPriorityFilter,
    todoCategoryFilter,
  ]);

  const todoStats = useMemo(() => {
    const total = safeTodos.length;
    const completed = safeTodos.filter((t) => t.completed).length;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, remaining: total - completed, pct };
  }, [safeTodos]);

  // #48 Work Log computed duration & daily stats
  const computedWorkMinutes = useMemo(() => {
    try {
      return calculateWorkDuration(logStart, logEnd, 0).netMinutes;
    } catch {
      return 0;
    }
  }, [logStart, logEnd]);

  const todayLogs = useMemo(
    () => safeLogs.filter((entry) => entry.date === todayIso),
    [safeLogs, todayIso]
  );
  const todayTotalMinutes = useMemo(
    () => todayLogs.reduce((sum, entry) => sum + entry.durationMinutes, 0),
    [todayLogs]
  );

  // #49 Text Formatter stats
  const textStats = useMemo(() => computeTextStats(textInput), [textInput]);

  // =========================================================================
  // #46 DAILY TO-DO LIST
  // =========================================================================
  if (tool.id === "daily-todo-list") {
    function handleSaveTodo(e: React.FormEvent) {
      e.preventDefault();
      if (!todoTitle.trim()) return;
      if (editingId) {
        updateTodo(editingId, {
          title: todoTitle,
          category: todoCategory,
          priority: todoPriority,
          deadline: todoDeadline || null,
        });
        setEditingId(null);
      } else {
        addTodo({
          title: todoTitle,
          category: todoCategory,
          priority: todoPriority,
          deadline: todoDeadline || null,
        });
      }
      setTodoTitle("");
      setTodoDeadline("");
    }

    function beginEdit(item: TodoItem) {
      setEditingId(item.id);
      setTodoTitle(item.title);
      setTodoCategory(item.category);
      setTodoPriority(item.priority);
      setTodoDeadline(item.deadline ?? "");
    }

    const priorityBadge = (p: TodoPriority) => {
      if (p === "high") return <Badge variant="warning">Tinggi</Badge>;
      if (p === "medium") return <Badge variant="default">Sedang</Badge>;
      return <Badge variant="secondary">Rendah</Badge>;
    };

    return (
      <div className="space-y-5">
        {/* Statistik */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/50 p-3">
            <p className="text-xs text-[var(--text-muted)]">Total Tugas</p>
            <p className="mt-1 font-mono text-2xl font-semibold">{todoStats.total}</p>
          </div>
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/50 p-3">
            <p className="text-xs text-[var(--text-muted)]">Selesai</p>
            <p className="mt-1 font-mono text-2xl font-semibold text-[var(--brand-primary)]">
              {todoStats.completed}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/50 p-3">
            <p className="text-xs text-[var(--text-muted)]">Tersisa</p>
            <p className="mt-1 font-mono text-2xl font-semibold">{todoStats.remaining}</p>
          </div>
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/50 p-3 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--text-muted)]">Progres</span>
              <span className="font-mono font-semibold">{todoStats.pct}%</span>
            </div>
            <Progress value={todoStats.pct} max={100} label="Persentase tugas selesai" />
          </div>
        </div>

        {/* Form Tambah / Edit Tugas */}
        <form
          onSubmit={handleSaveTodo}
          className="grid grid-cols-1 gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/40 p-4 sm:grid-cols-12"
        >
          <div className="space-y-1 sm:col-span-5">
            <label htmlFor={`${formId}-ttitle`} className="text-xs font-medium">
              {editingId ? "Edit Judul Tugas" : "Tugas Baru"}
            </label>
            <Input
              id={`${formId}-ttitle`}
              required
              value={todoTitle}
              onChange={(e) => setTodoTitle(e.target.value)}
              placeholder="Contoh: Kirim invoice klien bulan ini..."
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <label htmlFor={`${formId}-tcat`} className="text-xs font-medium">
              Kategori
            </label>
            <select
              id={`${formId}-tcat`}
              value={todoCategory}
              onChange={(e) => setTodoCategory(e.target.value)}
              className="min-h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-input)] px-2.5 py-1.5 text-sm"
            >
              {TODO_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <label htmlFor={`${formId}-tprio`} className="text-xs font-medium">
              Prioritas
            </label>
            <select
              id={`${formId}-tprio`}
              value={todoPriority}
              onChange={(e) => setTodoPriority(e.target.value as TodoPriority)}
              className="min-h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-input)] px-2.5 py-1.5 text-sm"
            >
              <option value="low">Rendah</option>
              <option value="medium">Sedang</option>
              <option value="high">Tinggi</option>
            </select>
          </div>
          <div className="space-y-1 sm:col-span-3">
            <label htmlFor={`${formId}-tdead`} className="text-xs font-medium">
              Deadline (opsional)
            </label>
            <Input
              id={`${formId}-tdead`}
              type="date"
              value={todoDeadline}
              onChange={(e) => setTodoDeadline(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2 sm:col-span-12">
            <Button type="submit">
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>{editingId ? "Simpan Perubahan" : "Tambah Tugas"}</span>
            </Button>
            {editingId && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEditingId(null);
                  setTodoTitle("");
                  setTodoDeadline("");
                }}
              >
                Batal Edit
              </Button>
            )}
          </div>
        </form>

        {/* Filter & Search Bar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <label htmlFor={`${formId}-tsearch`} className="visually-hidden">
              Cari tugas
            </label>
            <Search
              className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]"
              aria-hidden="true"
            />
            <Input
              id={`${formId}-tsearch`}
              type="search"
              value={todoSearch}
              onChange={(e) => setTodoSearch(e.target.value)}
              placeholder="Cari judul atau kategori tugas..."
              className="pl-8"
            />
          </div>

          <select
            aria-label="Filter status tugas"
            value={todoStatusFilter}
            onChange={(e) =>
              setTodoStatusFilter(e.target.value as "all" | "active" | "completed")
            }
            className="min-h-9 rounded-lg border border-[var(--border-default)] bg-[var(--surface-input)] px-3 py-1.5 text-xs"
          >
            <option value="all">Semua Status</option>
            <option value="active">Belum Selesai</option>
            <option value="completed">Selesai</option>
          </select>

          <select
            aria-label="Filter prioritas tugas"
            value={todoPriorityFilter}
            onChange={(e) =>
              setTodoPriorityFilter(e.target.value as TodoPriority | "all")
            }
            className="min-h-9 rounded-lg border border-[var(--border-default)] bg-[var(--surface-input)] px-3 py-1.5 text-xs"
          >
            <option value="all">Semua Prioritas</option>
            <option value="high">Prioritas Tinggi</option>
            <option value="medium">Prioritas Sedang</option>
            <option value="low">Prioritas Rendah</option>
          </select>

          <select
            aria-label="Filter kategori tugas"
            value={todoCategoryFilter}
            onChange={(e) => setTodoCategoryFilter(e.target.value)}
            className="min-h-9 rounded-lg border border-[var(--border-default)] bg-[var(--surface-input)] px-3 py-1.5 text-xs"
          >
            <option value="all">Semua Kategori</option>
            {TODO_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          {todoStats.completed > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={clearCompletedTodos}
            >
              Hapus Selesai ({todoStats.completed})
            </Button>
          )}

          {safeTodos.length > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                downloadCsvRows(
                  `ruangkerja-todo-${todayIso}.csv`,
                  ["Judul", "Kategori", "Prioritas", "Status", "Deadline"],
                  safeTodos.map((t) => [
                    t.title,
                    t.category,
                    t.priority,
                    t.completed ? "Selesai" : "Aktif",
                    t.deadline ?? "",
                  ])
                )
              }
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Ekspor CSV</span>
            </Button>
          )}
        </div>

        {/* Task List */}
        {filteredTodos.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border-subtle)] py-10 text-center text-xs text-[var(--text-muted)]">
            {safeTodos.length === 0
              ? "Belum ada tugas. Tambahkan tugas pertama Anda di atas — data tersimpan otomatis di browser."
              : "Tidak ada tugas yang cocok dengan filter saat ini."}
          </div>
        ) : (
          <ul className="space-y-2">
            {filteredTodos.map((item) => {
              const isOverdue =
                !item.completed && item.deadline !== null && item.deadline < todayIso;
              return (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-3"
                >
                  <button
                    type="button"
                    onClick={() => toggleTodo(item.id)}
                    aria-pressed={item.completed}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left cursor-pointer"
                  >
                    {item.completed ? (
                      <CheckCircle2
                        className="h-5 w-5 shrink-0 text-[var(--brand-primary)]"
                        aria-hidden="true"
                      />
                    ) : (
                      <Circle
                        className="h-5 w-5 shrink-0 text-[var(--text-muted)]"
                        aria-hidden="true"
                      />
                    )}
                    <div className="min-w-0">
                      <p
                        className={cn(
                          "truncate text-sm font-medium",
                          item.completed && "text-[var(--text-muted)] line-through"
                        )}
                      >
                        {item.title}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                        <Badge variant="outline">{item.category}</Badge>
                        {priorityBadge(item.priority)}
                        {item.deadline && (
                          <span
                            className={cn(
                              "font-mono text-[11px]",
                              isOverdue
                                ? "font-semibold text-[var(--danger-bg)]"
                                : "text-[var(--text-muted)]"
                            )}
                          >
                            Deadline: {item.deadline}
                            {isOverdue ? " (Terlewat)" : ""}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>

                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => beginEdit(item)}
                      aria-label={`Edit tugas ${item.title}`}
                    >
                      <Edit3 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteTodo(item.id)}
                      aria-label={`Hapus tugas ${item.title}`}
                    >
                      <Trash2 className="h-4 w-4 text-[var(--danger-bg)]" aria-hidden="true" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  }

  // =========================================================================
  // #47 POMODORO TIMER (Backed by Global Persistent Zustand Store)
  // =========================================================================
  if (tool.id === "pomodoro-timer") {
    const safeRuntime = mounted
      ? pomodoroRuntime
      : {
          mode: "focus" as PomodoroMode,
          running: false,
          secondsLeft: 25 * 60,
          endsAt: null,
          focusSessionsDone: 0,
          notice: null,
        };
    const pomoMode = safeRuntime.mode;
    const pomoRunning = safeRuntime.running;
    const secondsLeft = safeRuntime.secondsLeft;
    const focusSessionsDone = safeRuntime.focusSessionsDone;
    const pomoNotice = safeRuntime.notice;

    const mins = Math.floor(secondsLeft / 60);
    const secs = secondsLeft % 60;
    const totalModeSecs =
      (pomoMode === "focus"
        ? pomodoroSettings.focusMinutes
        : pomoMode === "shortBreak"
          ? pomodoroSettings.shortBreakMinutes
          : pomodoroSettings.longBreakMinutes) * 60;
    const progressPct =
      totalModeSecs > 0
        ? Math.round(((totalModeSecs - secondsLeft) / totalModeSecs) * 100)
        : 0;

    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["focus", "Focus Time"],
                ["shortBreak", "Short Break"],
                ["longBreak", "Long Break"],
              ] as [PomodoroMode, string][]
            ).map(([mode, lbl]) => (
              <button
                key={mode}
                type="button"
                onClick={() => switchPomodoroMode(mode)}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-xs font-medium cursor-pointer",
                  pomoMode === mode
                    ? "border-[var(--brand-primary)] bg-[var(--brand-subtle-bg)] text-[var(--brand-subtle-fg)]"
                    : "border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-secondary)]"
                )}
              >
                {lbl}
              </button>
            ))}
          </div>

          <Badge variant="default">Sesi Fokus Selesai: {focusSessionsDone}</Badge>
        </div>

        <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/50 p-8 text-center">
          <p className="text-xs font-semibold tracking-wider text-[var(--text-secondary)] uppercase">
            {pomoMode === "focus"
              ? "Waktu Fokus (Tetap Jalan Lintas Halaman)"
              : pomoMode === "shortBreak"
                ? "Istirahat Singkat"
                : "Istirahat Panjang"}
          </p>
          <p className="font-mono text-6xl font-bold tracking-tight tabular-nums text-[var(--brand-primary)] sm:text-7xl">
            {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
          </p>
          <div className="w-full max-w-sm">
            <Progress value={progressPct} max={100} label="Progres timer Pomodoro" />
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Button
              type="button"
              size="lg"
              onClick={() => {
                clearPomodoroNotice();
                requestPomodoroNotificationPermission();
                togglePomodoroRunning();
              }}
            >
              {pomoRunning ? (
                <Pause className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Play className="h-4 w-4" aria-hidden="true" />
              )}
              <span>{pomoRunning ? "Jeda" : "Mulai"}</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={() => switchPomodoroMode(pomoMode)}
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              <span>Reset</span>
            </Button>

            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                switchPomodoroMode(pomoMode === "focus" ? "shortBreak" : "focus")
              }
            >
              <SkipForward className="h-4 w-4" aria-hidden="true" />
              <span>Lewati Sesi</span>
            </Button>
          </div>
        </div>

        {pomoNotice && (
          <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-2 rounded-xl border border-[var(--success-border)] bg-[var(--success-bg)] px-4 py-3 text-sm font-medium text-[var(--success-fg)]"
          >
            <Bell className="h-4 w-4" aria-hidden="true" />
            <span>{pomoNotice}</span>
          </div>
        )}

        {/* Pengaturan Durasi */}
        <div className="grid grid-cols-1 gap-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/40 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <label htmlFor={`${formId}-pf`} className="text-xs font-medium">
              Durasi Focus (menit)
            </label>
            <Input
              id={`${formId}-pf`}
              type="number"
              min={1}
              max={120}
              value={pomodoroSettings.focusMinutes}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) {
                  updatePomodoroSettings({ focusMinutes: Math.max(1, Math.min(120, n)) });
                }
              }}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor={`${formId}-ps`} className="text-xs font-medium">
              Short Break (menit)
            </label>
            <Input
              id={`${formId}-ps`}
              type="number"
              min={1}
              max={60}
              value={pomodoroSettings.shortBreakMinutes}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) {
                  updatePomodoroSettings({ shortBreakMinutes: Math.max(1, Math.min(60, n)) });
                }
              }}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor={`${formId}-pl`} className="text-xs font-medium">
              Long Break (menit)
            </label>
            <Input
              id={`${formId}-pl`}
              type="number"
              min={1}
              max={90}
              value={pomodoroSettings.longBreakMinutes}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) {
                  updatePomodoroSettings({ longBreakMinutes: Math.max(1, Math.min(90, n)) });
                }
              }}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor={`${formId}-pi`} className="text-xs font-medium">
              Long Break Tiap (Sesi)
            </label>
            <Input
              id={`${formId}-pi`}
              type="number"
              min={1}
              max={12}
              value={pomodoroSettings.longBreakInterval}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) {
                  updatePomodoroSettings({ longBreakInterval: Math.max(1, Math.min(12, n)) });
                }
              }}
            />
          </div>
          <div className="flex items-center justify-between gap-2 sm:col-span-2 lg:col-span-4">
            <span className="text-xs text-[var(--text-muted)]">
              Notifikasi audio otomatis berbunyi saat sesi berakhir.
            </span>
            <Button type="button" variant="ghost" size="sm" onClick={playCompletionChime}>
              <Bell className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Uji Suara</span>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // #48 WORK LOG
  // =========================================================================
  if (tool.id === "work-log") {
    function handleSaveWorkLog(e: React.FormEvent) {
      e.preventDefault();
      if (!logActivity.trim()) return;
      addWorkLog({
        activity: logActivity,
        category: logCategory,
        startTime: logStart,
        endTime: logEnd,
        durationMinutes: computedWorkMinutes,
        notes: logNotes,
        date: logDate,
      });
      setLogActivity("");
      setLogNotes("");
    }

    return (
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/50 p-3">
            <p className="text-xs text-[var(--text-muted)]">Aktivitas Hari Ini</p>
            <p className="mt-1 font-mono text-2xl font-semibold">
              {todayLogs.length} sesi
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/50 p-3">
            <p className="text-xs text-[var(--text-muted)]">Total Durasi Hari Ini</p>
            <p className="mt-1 font-mono text-xl font-semibold text-[var(--brand-primary)]">
              {formatMinutesToDuration(todayTotalMinutes)}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/50 p-3">
            <p className="text-xs text-[var(--text-muted)]">Total Riwayat Tersimpan</p>
            <p className="mt-1 font-mono text-2xl font-semibold">{safeLogs.length}</p>
          </div>
        </div>

        <form
          onSubmit={handleSaveWorkLog}
          className="grid grid-cols-1 gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/40 p-4 sm:grid-cols-12"
        >
          <div className="space-y-1 sm:col-span-6">
            <label htmlFor={`${formId}-wact`} className="text-xs font-medium">
              Aktivitas Pekerjaan
            </label>
            <Input
              id={`${formId}-wact`}
              required
              value={logActivity}
              onChange={(e) => setLogActivity(e.target.value)}
              placeholder="Contoh: Rekap laporan PDF dan review CSV penjualan"
            />
          </div>
          <div className="space-y-1 sm:col-span-3">
            <label htmlFor={`${formId}-wcat`} className="text-xs font-medium">
              Kategori
            </label>
            <select
              id={`${formId}-wcat`}
              value={logCategory}
              onChange={(e) => setLogCategory(e.target.value)}
              className="min-h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-input)] px-3 py-1.5 text-sm"
            >
              {WORKLOG_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1 sm:col-span-3">
            <label htmlFor={`${formId}-wdate`} className="text-xs font-medium">
              Tanggal
            </label>
            <Input
              id={`${formId}-wdate`}
              type="date"
              value={logDate}
              onChange={(e) => setLogDate(e.target.value)}
            />
          </div>
          <div className="space-y-1 sm:col-span-3">
            <label htmlFor={`${formId}-wstart`} className="text-xs font-medium">
              Waktu Mulai
            </label>
            <Input
              id={`${formId}-wstart`}
              type="time"
              value={logStart}
              onChange={(e) => setLogStart(e.target.value)}
            />
          </div>
          <div className="space-y-1 sm:col-span-3">
            <label htmlFor={`${formId}-wend`} className="text-xs font-medium">
              Waktu Selesai
            </label>
            <Input
              id={`${formId}-wend`}
              type="time"
              value={logEnd}
              onChange={(e) => setLogEnd(e.target.value)}
            />
          </div>
          <div className="space-y-1 sm:col-span-6">
            <label htmlFor={`${formId}-wnote`} className="text-xs font-medium">
              Catatan Tambahan (opsional)
            </label>
            <Input
              id={`${formId}-wnote`}
              value={logNotes}
              onChange={(e) => setLogNotes(e.target.value)}
              placeholder="Hasil atau tindak lanjut..."
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-12">
            <span className="text-xs text-[var(--text-secondary)]">
              Durasi terhitung:{" "}
              <strong className="font-mono text-[var(--brand-primary)]">
                {formatMinutesToDuration(computedWorkMinutes)}
              </strong>
            </span>
            <div className="flex flex-wrap gap-2">
              {safeLogs.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    downloadCsvRows(
                      `ruangkerja-worklog-${todayIso}.csv`,
                      ["Tanggal", "Aktivitas", "Kategori", "Mulai", "Selesai", "Durasi (Menit)", "Catatan"],
                      safeLogs.map((entry) => [
                        entry.date,
                        entry.activity,
                        entry.category,
                        entry.startTime,
                        entry.endTime,
                        String(entry.durationMinutes),
                        entry.notes,
                      ])
                    )
                  }
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Ekspor CSV</span>
                </Button>
              )}
              <Button type="submit">
                <Plus className="h-4 w-4" aria-hidden="true" />
                <span>Catat Aktivitas</span>
              </Button>
            </div>
          </div>
        </form>

        {safeLogs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border-subtle)] py-10 text-center text-xs text-[var(--text-muted)]">
            Belum ada catatan kerja. Catat aktivitas di atas untuk melacak durasi kerja harian.
          </div>
        ) : (
          <ul className="space-y-2">
            {safeLogs.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-3"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-[var(--text-primary)]">
                      {entry.activity}
                    </span>
                    <Badge variant="outline">{entry.category}</Badge>
                    <Badge variant="default">
                      {formatMinutesToDuration(entry.durationMinutes)}
                    </Badge>
                  </div>
                  <p className="font-mono text-xs text-[var(--text-muted)]">
                    {entry.date} • {entry.startTime} – {entry.endTime}
                    {entry.notes ? ` • ${entry.notes}` : ""}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => deleteWorkLog(entry.id)}
                  aria-label={`Hapus catatan ${entry.activity}`}
                >
                  <Trash2 className="h-4 w-4 text-[var(--danger-bg)]" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  // =========================================================================
  // #49 TEXT FORMATTER
  // =========================================================================
  if (tool.id === "text-formatter") {
    const applyTransform = (fn: (input: string) => string) => {
      setPreviousText(textInput);
      setTextInput(fn(textInput));
    };

    async function handleCopyText() {
      if (!textInput) return;
      try {
        await navigator.clipboard.writeText(textInput);
        setTextCopied(true);
        window.setTimeout(() => setTextCopied(false), 1800);
      } catch {
        // Ignore clipboard errors
      }
    }

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => applyTransform(toUpperCaseText)}>
            UPPERCASE
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => applyTransform(toLowerCaseText)}>
            lowercase
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => applyTransform(toTitleCaseText)}>
            Title Case
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => applyTransform(removeExtraSpaces)}>
            Hapus Spasi Berlebih
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => applyTransform(removeEmptyLines)}>
            Hapus Baris Kosong
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => applyTransform((t) => removeDuplicateLines(t))}>
            Hapus Baris Duplikat
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => applyTransform((t) => sortTextLines(t, "asc"))}>
            Urutkan A–Z
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => applyTransform((t) => sortTextLines(t, "desc"))}>
            Urutkan Z–A
          </Button>
        </div>

        <div className="space-y-1.5">
          <label htmlFor={`${formId}-txt`} className="text-xs font-medium">
            Teks Input / Hasil
          </label>
          <textarea
            id={`${formId}-txt`}
            rows={10}
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="Tempel atau ketik teks di sini untuk diformat..."
            className="w-full rounded-xl border border-[var(--border-default)] bg-[var(--surface-input)] p-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
          />
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/50 p-3">
            <p className="text-xs text-[var(--text-muted)]">Kata</p>
            <p className="font-mono text-lg font-semibold">{textStats.words}</p>
          </div>
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/50 p-3">
            <p className="text-xs text-[var(--text-muted)]">Karakter</p>
            <p className="font-mono text-lg font-semibold">{textStats.characters}</p>
          </div>
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/50 p-3">
            <p className="text-xs text-[var(--text-muted)]">Tanpa Spasi</p>
            <p className="font-mono text-lg font-semibold">{textStats.charactersNoSpaces}</p>
          </div>
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/50 p-3">
            <p className="text-xs text-[var(--text-muted)]">Baris</p>
            <p className="font-mono text-lg font-semibold">{textStats.lines}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => void handleCopyText()} disabled={!textInput}>
            {textCopied ? (
              <Check className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Copy className="h-4 w-4" aria-hidden="true" />
            )}
            <span>{textCopied ? "Tersalin!" : "Salin Teks"}</span>
          </Button>
          {previousText !== null && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setTextInput(previousText);
                setPreviousText(null);
              }}
            >
              Urungkan (Undo)
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setTextInput("");
              setPreviousText(null);
            }}
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            <span>Reset</span>
          </Button>
        </div>
      </div>
    );
  }

  // =========================================================================
  // #50 QR CODE GENERATOR
  // =========================================================================
  async function handleGenerateQr(e: React.FormEvent) {
    e.preventDefault();
    setQrError(null);
    setQrLoading(true);
    try {
      const res = await generateQrCode({
        content_type: qrType,
        text: qrText,
        url: qrUrl,
        phone: qrPhone,
        email_to: qrEmailTo,
        email_subject: qrEmailSubj,
        email_body: qrEmailBody,
        wifi_ssid: qrWifiSsid,
        wifi_password: qrWifiPass,
        wifi_encryption: qrWifiEnc,
        wifi_hidden: qrWifiHidden,
        size_px: qrSize,
        border: 4,
        fill_color: qrFillColor,
        back_color: qrBackColor,
        output_format: qrFormat,
      });
      setQrResult((prev) => {
        if (prev) URL.revokeObjectURL(prev.objectUrl);
        return res;
      });
    } catch (err) {
      setQrError(err instanceof Error ? err.message : "Gagal membuat QR Code.");
    } finally {
      setQrLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={handleGenerateQr} className="space-y-4">
        <fieldset className="space-y-2">
          <legend className="text-xs font-medium text-[var(--text-primary)]">
            Jenis Konten QR Code
          </legend>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["url", "URL / Link"],
                ["text", "Teks Bebas"],
                ["phone", "Nomor Telepon"],
                ["email", "Email"],
                ["wifi", "Wi-Fi"],
              ] as [QrContentTypeOption, string][]
            ).map(([val, lbl]) => (
              <label
                key={val}
                className={cn(
                  "inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium",
                  qrType === val
                    ? "border-[var(--brand-primary)] bg-[var(--brand-subtle-bg)] text-[var(--brand-subtle-fg)]"
                    : "border-[var(--border-subtle)] bg-[var(--surface-card)]"
                )}
              >
                <input
                  type="radio"
                  name={`${formId}-qrtype`}
                  value={val}
                  checked={qrType === val}
                  onChange={() => setQrType(val)}
                />
                <span>{lbl}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/40 p-4 space-y-3">
          {qrType === "url" && (
            <div className="space-y-1">
              <label htmlFor={`${formId}-qurl`} className="text-xs font-medium">
                Alamat URL
              </label>
              <Input
                id={`${formId}-qurl`}
                value={qrUrl}
                onChange={(e) => setQrUrl(e.target.value)}
                placeholder="https://contoh.com"
              />
            </div>
          )}

          {qrType === "text" && (
            <div className="space-y-1">
              <label htmlFor={`${formId}-qtxt`} className="text-xs font-medium">
                Isi Teks
              </label>
              <textarea
                id={`${formId}-qtxt`}
                rows={3}
                value={qrText}
                onChange={(e) => setQrText(e.target.value)}
                placeholder="Masukkan teks apa saja..."
                className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-input)] p-2.5 text-sm"
              />
            </div>
          )}

          {qrType === "phone" && (
            <div className="space-y-1">
              <label htmlFor={`${formId}-qtel`} className="text-xs font-medium">
                Nomor Telepon / WhatsApp
              </label>
              <Input
                id={`${formId}-qtel`}
                type="tel"
                value={qrPhone}
                onChange={(e) => setQrPhone(e.target.value)}
                placeholder="+628123456789"
              />
            </div>
          )}

          {qrType === "email" && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label htmlFor={`${formId}-qmail`} className="text-xs font-medium">
                  Email Tujuan
                </label>
                <Input
                  id={`${formId}-qmail`}
                  type="email"
                  value={qrEmailTo}
                  onChange={(e) => setQrEmailTo(e.target.value)}
                  placeholder="nama@perusahaan.com"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor={`${formId}-qsubj`} className="text-xs font-medium">
                  Subjek (opsional)
                </label>
                <Input
                  id={`${formId}-qsubj`}
                  value={qrEmailSubj}
                  onChange={(e) => setQrEmailSubj(e.target.value)}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <label htmlFor={`${formId}-qbody`} className="text-xs font-medium">
                  Isi Pesan (opsional)
                </label>
                <Input
                  id={`${formId}-qbody`}
                  value={qrEmailBody}
                  onChange={(e) => setQrEmailBody(e.target.value)}
                />
              </div>
            </div>
          )}

          {qrType === "wifi" && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <label htmlFor={`${formId}-wssid`} className="text-xs font-medium">
                  Nama Wi-Fi (SSID)
                </label>
                <Input
                  id={`${formId}-wssid`}
                  value={qrWifiSsid}
                  onChange={(e) => setQrWifiSsid(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor={`${formId}-wpass`} className="text-xs font-medium">
                  Password Wi-Fi
                </label>
                <Input
                  id={`${formId}-wpass`}
                  value={qrWifiPass}
                  onChange={(e) => setQrWifiPass(e.target.value)}
                  disabled={qrWifiEnc === "nopass"}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor={`${formId}-wenc`} className="text-xs font-medium">
                  Keamanan
                </label>
                <select
                  id={`${formId}-wenc`}
                  value={qrWifiEnc}
                  onChange={(e) => setQrWifiEnc(e.target.value as WifiEncryptionOption)}
                  className="min-h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-input)] px-3 py-1.5 text-sm"
                >
                  <option value="WPA">WPA / WPA2 / WPA3</option>
                  <option value="WEP">WEP</option>
                  <option value="nopass">Tanpa Password</option>
                </select>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium sm:col-span-3">
                <input
                  type="checkbox"
                  checked={qrWifiHidden}
                  onChange={(e) => setQrWifiHidden(e.target.checked)}
                  className="h-4 w-4 cursor-pointer"
                />
                <span>Jaringan Wi-Fi tersembunyi (Hidden SSID)</span>
              </label>
            </div>
          )}

          {/* Ukuran, Warna, Format */}
          <div className="grid grid-cols-1 gap-4 border-t border-[var(--border-subtle)] pt-3 sm:grid-cols-4">
            <div className="space-y-1 sm:col-span-2">
              <label htmlFor={`${formId}-qsize`} className="text-xs font-medium">
                Ukuran: <span className="font-mono">{qrSize} × {qrSize} px</span>
              </label>
              <input
                id={`${formId}-qsize`}
                type="range"
                min={160}
                max={1024}
                step={32}
                value={qrSize}
                onChange={(e) => setQrSize(Number(e.target.value))}
                className="w-full cursor-pointer"
              />
            </div>
            <div className="flex items-center gap-3">
              <div className="space-y-1">
                <label htmlFor={`${formId}-qfg`} className="text-xs font-medium">
                  Warna QR
                </label>
                <input
                  id={`${formId}-qfg`}
                  type="color"
                  value={qrFillColor}
                  onChange={(e) => setQrFillColor(e.target.value)}
                  className="block h-9 w-12 cursor-pointer rounded border border-[var(--border-default)] bg-transparent p-0.5"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor={`${formId}-qbg`} className="text-xs font-medium">
                  Latar
                </label>
                <input
                  id={`${formId}-qbg`}
                  type="color"
                  value={qrBackColor}
                  onChange={(e) => setQrBackColor(e.target.value)}
                  className="block h-9 w-12 cursor-pointer rounded border border-[var(--border-default)] bg-transparent p-0.5"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label htmlFor={`${formId}-qfmt`} className="text-xs font-medium">
                Format Unduhan
              </label>
              <select
                id={`${formId}-qfmt`}
                value={qrFormat}
                onChange={(e) => setQrFormat(e.target.value as QrOutputFormatOption)}
                className="min-h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-input)] px-3 py-1.5 text-sm"
              >
                <option value="png">PNG (Raster)</option>
                <option value="svg">SVG (Vektor)</option>
              </select>
            </div>
          </div>

          {computeHexContrast(qrFillColor, qrBackColor) < 2.5 && (
            <p role="status" className="rounded-lg border border-[var(--warning-border)] bg-[var(--warning-bg)] px-3 py-2 text-xs text-[var(--warning-fg)]">
              Kontras warna QR dan latar terlalu rendah — pilih kombinasi warna lebih kontras agar QR Code mudah dipindai kamera.
            </p>
          )}
        </div>

        {qrError && (
          <p role="alert" className="text-xs font-medium text-[var(--danger-bg)]">
            {qrError}
          </p>
        )}

        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={qrLoading}>
            <Play className="h-4 w-4" aria-hidden="true" />
            <span>{qrLoading ? "Membuat QR..." : "Buat QR Code"}</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setQrError(null);
              setQrResult((prev) => {
                if (prev) URL.revokeObjectURL(prev.objectUrl);
                return null;
              });
            }}
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            <span>Reset</span>
          </Button>
        </div>
      </form>

      {qrResult && (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-[var(--brand-subtle-border)] bg-[var(--surface-card)] p-6 text-center">
          <img
            src={qrResult.objectUrl}
            alt="QR Code hasil RuangKerja"
            className="h-56 w-56 rounded-lg border border-[var(--border-subtle)] bg-white object-contain p-2 shadow-xs"
          />
          {qrResult.payloadText && (
            <p className="max-w-md break-all font-mono text-xs text-[var(--text-secondary)]">
              {qrResult.payloadText}
            </p>
          )}
          <a
            href={qrResult.objectUrl}
            download={qrResult.filename}
            className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-sm font-medium text-[var(--brand-primary-fg)] hover:bg-[var(--brand-primary-hover)]"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            <span>Download {qrResult.filename.toUpperCase()}</span>
          </a>
        </div>
      )}
    </div>
  );
}

