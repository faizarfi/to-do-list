export type ToolCategoryId =
  | "pdf"
  | "image"
  | "excel"
  | "calculator"
  | "productivity"
  | "developer"
  | "security"
  | "business";

export type PhaseNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface ToolCategoryMeta {
  id: ToolCategoryId;
  label: string;
  shortLabel: string;
  description: string;
  route: string;
  accentLabel: string;
  phase: PhaseNumber;
  iconName: string;
}

export interface ToolDefinition {
  id: string;
  number: number;
  slug: string;
  name: string;
  shortDescription: string;
  category: ToolCategoryId;
  route: string;
  iconName: string;
  keywords: string[];
  phase: PhaseNumber;
  implemented: boolean;
  requiresBackend: boolean;
  apiEndpoint?: string;
}

export type TodoPriority = "low" | "medium" | "high";

export interface TodoItem {
  id: string;
  title: string;
  category: string;
  priority: TodoPriority;
  deadline: string | null;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WorkLogEntry {
  id: string;
  activity: string;
  category: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  notes: string;
  date: string;
}

export type ThemePreference = "system" | "light" | "dark";

export type PomodoroMode = "focus" | "shortBreak" | "longBreak";

export interface PomodoroSettings {
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  longBreakInterval: number;
}

export interface PomodoroRuntimeState {
  mode: PomodoroMode;
  running: boolean;
  secondsLeft: number;
  endsAt: number | null;
  focusSessionsDone: number;
  notice: string | null;
}

export interface RuangKerjaBackupData {
  version: 1;
  exportedAt: string;
  userName: string;
  themePreference: ThemePreference;
  sidebarCollapsed: boolean;
  favorites: string[];
  recentToolIds: string[];
  usageCounts: Record<string, number>;
  todos: TodoItem[];
  workLogs: WorkLogEntry[];
  pomodoroSettings: PomodoroSettings;
}

export interface EngineStatus {
  name: string;
  available: boolean;
  version: string | null;
  note: string | null;
}

export interface TempStorageStatus {
  path: string;
  writable: boolean;
  active_job_dirs: number;
  ttl_seconds: number;
}

export interface BackendHealthResponse {
  status: "healthy" | "degraded";
  app_name: string;
  version: string;
  environment: string;
  python_version: string;
  timestamp: string;
  max_upload_size_mb: number;
  temp_storage: TempStorageStatus;
  engines: EngineStatus[];
}

export interface CategoryReadiness {
  category: string;
  endpoint_prefix: string;
  ready_for_phase: number;
  phase_implemented: boolean;
  required_engines_ready: boolean;
  notes: string | null;
}

export interface CapabilitiesResponse {
  phase: number;
  categories: CategoryReadiness[];
}

