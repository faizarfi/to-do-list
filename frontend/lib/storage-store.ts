"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type {
  PomodoroMode,
  PomodoroRuntimeState,
  PomodoroSettings,
  RuangKerjaBackupData,
  ThemePreference,
  TodoItem,
  TodoPriority,
  WorkLogEntry,
} from "@/types/tools";

export interface AddTodoInput {
  title: string;
  category: string;
  priority: TodoPriority;
  deadline: string | null;
}

export interface AddWorkLogInput {
  activity: string;
  category: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  notes: string;
  date: string;
}

export interface RuangKerjaState {
  userName: string;
  themePreference: ThemePreference;
  sidebarCollapsed: boolean;
  favorites: string[];
  recentToolIds: string[];
  usageCounts: Record<string, number>;
  todos: TodoItem[];
  workLogs: WorkLogEntry[];
  pomodoroSettings: PomodoroSettings;
  pomodoroRuntime: PomodoroRuntimeState;

  setUserName: (name: string) => void;
  setThemePreference: (theme: ThemePreference) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
  toggleFavorite: (toolId: string) => void;
  recordToolUsage: (toolId: string) => void;

  addQuickTodo: (title: string, priority?: TodoPriority, category?: string) => void;
  addTodo: (input: AddTodoInput) => void;
  updateTodo: (id: string, patch: Partial<AddTodoInput>) => void;
  toggleTodo: (id: string) => void;
  deleteTodo: (id: string) => void;
  clearCompletedTodos: () => void;

  addWorkLog: (input: AddWorkLogInput) => void;
  deleteWorkLog: (id: string) => void;
  updatePomodoroSettings: (patch: Partial<PomodoroSettings>) => void;
  togglePomodoroRunning: () => void;
  switchPomodoroMode: (mode: PomodoroMode) => void;
  setPomodoroSecondsLeft: (secondsLeft: number) => void;
  completePomodoroSession: () => { finishedMode: PomodoroMode; nextMode: PomodoroMode; message: string };
  clearPomodoroNotice: () => void;

  restoreBackupData: (backup: Omit<RuangKerjaBackupData, "version" | "exportedAt">) => void;
  clearUsageHistory: () => void;
  resetAllPreferences: () => void;
}

const DEFAULT_POMODORO: PomodoroSettings = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  longBreakInterval: 4,
};

function getModeSeconds(mode: PomodoroMode, settings: PomodoroSettings): number {
  if (mode === "focus") return Math.max(1, settings.focusMinutes) * 60;
  if (mode === "shortBreak") return Math.max(1, settings.shortBreakMinutes) * 60;
  return Math.max(1, settings.longBreakMinutes) * 60;
}

const DEFAULT_POMODORO_RUNTIME: PomodoroRuntimeState = {
  mode: "focus",
  running: false,
  secondsLeft: DEFAULT_POMODORO.focusMinutes * 60,
  endsAt: null,
  focusSessionsDone: 0,
  notice: null,
};

const DEFAULT_FAVORITES = [
  "merge-pdf",
  "image-converter",
  "excel-to-csv",
  "daily-todo-list",
];

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `rk-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export const useRuangKerjaStore = create<RuangKerjaState>()(
  persist(
    (set, get) => ({
      userName: "Rekan Kerja",
      themePreference: "system",
      sidebarCollapsed: false,
      favorites: DEFAULT_FAVORITES,
      recentToolIds: [],
      usageCounts: {},
      todos: [],
      workLogs: [],
      pomodoroSettings: DEFAULT_POMODORO,
      pomodoroRuntime: DEFAULT_POMODORO_RUNTIME,

      setUserName: (name) =>
        set({
          userName: name.trim() || "Rekan Kerja",
        }),

      setThemePreference: (themePreference) => set({ themePreference }),

      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),

      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

      toggleFavorite: (toolId) =>
        set((state) => {
          const exists = state.favorites.includes(toolId);
          return {
            favorites: exists
              ? state.favorites.filter((id) => id !== toolId)
              : [toolId, ...state.favorites],
          };
        }),

      recordToolUsage: (toolId) =>
        set((state) => {
          const nextRecent = [
            toolId,
            ...state.recentToolIds.filter((id) => id !== toolId),
          ].slice(0, 12);

          const nextCounts = {
            ...state.usageCounts,
            [toolId]: (state.usageCounts[toolId] ?? 0) + 1,
          };

          return {
            recentToolIds: nextRecent,
            usageCounts: nextCounts,
          };
        }),

      addQuickTodo: (title, priority = "medium", category = "Umum") =>
        set((state) => {
          const trimmed = title.trim();
          if (!trimmed) return state;
          const now = new Date().toISOString();
          const newTodo: TodoItem = {
            id: generateId(),
            title: trimmed,
            category,
            priority,
            deadline: null,
            completed: false,
            createdAt: now,
            updatedAt: now,
          };
          return {
            todos: [newTodo, ...state.todos],
          };
        }),

      addTodo: (input) =>
        set((state) => {
          const trimmed = input.title.trim();
          if (!trimmed) return state;
          const now = new Date().toISOString();
          const newTodo: TodoItem = {
            id: generateId(),
            title: trimmed,
            category: input.category.trim() || "Pekerjaan",
            priority: input.priority,
            deadline: input.deadline || null,
            completed: false,
            createdAt: now,
            updatedAt: now,
          };
          return {
            todos: [newTodo, ...state.todos],
          };
        }),

      updateTodo: (id, patch) =>
        set((state) => ({
          todos: state.todos.map((todo) =>
            todo.id === id
              ? {
                  ...todo,
                  title: patch.title !== undefined ? patch.title.trim() || todo.title : todo.title,
                  category:
                    patch.category !== undefined
                      ? patch.category.trim() || todo.category
                      : todo.category,
                  priority: patch.priority ?? todo.priority,
                  deadline: patch.deadline !== undefined ? patch.deadline : todo.deadline,
                  updatedAt: new Date().toISOString(),
                }
              : todo
          ),
        })),

      toggleTodo: (id) =>
        set((state) => ({
          todos: state.todos.map((todo) =>
            todo.id === id
              ? {
                  ...todo,
                  completed: !todo.completed,
                  updatedAt: new Date().toISOString(),
                }
              : todo
          ),
        })),

      deleteTodo: (id) =>
        set((state) => ({
          todos: state.todos.filter((todo) => todo.id !== id),
        })),

      clearCompletedTodos: () =>
        set((state) => ({
          todos: state.todos.filter((todo) => !todo.completed),
        })),

      addWorkLog: (input) =>
        set((state) => {
          const trimmed = input.activity.trim();
          if (!trimmed) return state;
          const entry: WorkLogEntry = {
            id: generateId(),
            activity: trimmed,
            category: input.category.trim() || "Pekerjaan",
            startTime: input.startTime,
            endTime: input.endTime,
            durationMinutes: Math.max(0, Math.round(input.durationMinutes)),
            notes: input.notes.trim(),
            date: input.date,
          };
          return {
            workLogs: [entry, ...state.workLogs],
          };
        }),

      deleteWorkLog: (id) =>
        set((state) => ({
          workLogs: state.workLogs.filter((entry) => entry.id !== id),
        })),

      updatePomodoroSettings: (patch) =>
        set((state) => {
          const nextSettings: PomodoroSettings = {
            ...state.pomodoroSettings,
            ...patch,
          };
          const nextRuntime = state.pomodoroRuntime.running
            ? state.pomodoroRuntime
            : {
                ...state.pomodoroRuntime,
                secondsLeft: getModeSeconds(state.pomodoroRuntime.mode, nextSettings),
              };
          return {
            pomodoroSettings: nextSettings,
            pomodoroRuntime: nextRuntime,
          };
        }),

      togglePomodoroRunning: () =>
        set((state) => {
          const rt = state.pomodoroRuntime;
          if (rt.running) {
            const remaining = rt.endsAt
              ? Math.max(0, Math.ceil((rt.endsAt - Date.now()) / 1000))
              : rt.secondsLeft;
            return {
              pomodoroRuntime: {
                ...rt,
                running: false,
                secondsLeft: remaining,
                endsAt: null,
              },
            };
          }
          const baseSeconds =
            rt.secondsLeft > 0
              ? rt.secondsLeft
              : getModeSeconds(rt.mode, state.pomodoroSettings);
          return {
            pomodoroRuntime: {
              ...rt,
              running: true,
              secondsLeft: baseSeconds,
              endsAt: Date.now() + baseSeconds * 1000,
              notice: null,
            },
          };
        }),

      switchPomodoroMode: (mode) =>
        set((state) => ({
          pomodoroRuntime: {
            ...state.pomodoroRuntime,
            mode,
            running: false,
            secondsLeft: getModeSeconds(mode, state.pomodoroSettings),
            endsAt: null,
            notice: null,
          },
        })),

      setPomodoroSecondsLeft: (secondsLeft) =>
        set((state) => ({
          pomodoroRuntime: {
            ...state.pomodoroRuntime,
            secondsLeft: Math.max(0, secondsLeft),
          },
        })),

      completePomodoroSession: () => {
        const state = get();
        const rt = state.pomodoroRuntime;
        const finishedMode = rt.mode;
        let nextMode: PomodoroMode = "focus";
        let nextSessions = rt.focusSessionsDone;
        let message = "Waktu istirahat selesai! Siap kembali fokus.";

        if (finishedMode === "focus") {
          nextSessions = rt.focusSessionsDone + 1;
          const takeLong =
            nextSessions % Math.max(1, state.pomodoroSettings.longBreakInterval) === 0;
          nextMode = takeLong ? "longBreak" : "shortBreak";
          message = takeLong
            ? "Sesi fokus selesai! Saatnya istirahat panjang."
            : "Sesi fokus selesai! Saatnya istirahat singkat.";
        }

        const nextSeconds = getModeSeconds(nextMode, state.pomodoroSettings);
        set({
          pomodoroRuntime: {
            mode: nextMode,
            running: false,
            secondsLeft: nextSeconds,
            endsAt: null,
            focusSessionsDone: nextSessions,
            notice: message,
          },
        });
        return { finishedMode, nextMode, message };
      },

      clearPomodoroNotice: () =>
        set((state) => ({
          pomodoroRuntime: {
            ...state.pomodoroRuntime,
            notice: null,
          },
        })),

      restoreBackupData: (backup) =>
        set(() => {
          const settings = backup.pomodoroSettings;
          return {
            userName: backup.userName.trim() || "Rekan Kerja",
            themePreference: backup.themePreference,
            sidebarCollapsed: backup.sidebarCollapsed,
            favorites: backup.favorites,
            recentToolIds: backup.recentToolIds,
            usageCounts: backup.usageCounts,
            todos: backup.todos,
            workLogs: backup.workLogs,
            pomodoroSettings: settings,
            pomodoroRuntime: {
              ...DEFAULT_POMODORO_RUNTIME,
              secondsLeft: getModeSeconds("focus", settings),
            },
          };
        }),

      clearUsageHistory: () =>
        set({
          recentToolIds: [],
          usageCounts: {},
        }),

      resetAllPreferences: () =>
        set({
          userName: "Rekan Kerja",
          themePreference: "system",
          sidebarCollapsed: false,
          favorites: DEFAULT_FAVORITES,
          recentToolIds: [],
          usageCounts: {},
          todos: [],
          workLogs: [],
          pomodoroSettings: DEFAULT_POMODORO,
          pomodoroRuntime: DEFAULT_POMODORO_RUNTIME,
        }),
    }),
    {
      name: "ruangkerja-storage-v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        userName: state.userName,
        themePreference: state.themePreference,
        sidebarCollapsed: state.sidebarCollapsed,
        favorites: state.favorites,
        recentToolIds: state.recentToolIds,
        usageCounts: state.usageCounts,
        todos: state.todos,
        workLogs: state.workLogs,
        pomodoroSettings: state.pomodoroSettings,
        pomodoroRuntime: state.pomodoroRuntime,
      }),
    }
  )
);
