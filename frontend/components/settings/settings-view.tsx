"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  CheckCircle2,
  Download,
  Laptop,
  Moon,
  RefreshCw,
  Server,
  Sun,
  Trash2,
  Upload,
  User,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useBackendHealth } from "@/hooks/use-backend-health";
import { useMounted } from "@/hooks/use-mounted";
import { useRuangKerjaStore } from "@/lib/storage-store";
import { cn } from "@/lib/utils";
import type { ThemePreference } from "@/types/tools";

const profileSchema = z.object({
  userName: z
    .string()
    .trim()
    .min(2, "Nama minimal 2 karakter.")
    .max(50, "Nama maksimal 50 karakter."),
});

const backupFileSchema = z.object({
  version: z.literal(1).optional(),
  userName: z.string().min(1).max(60),
  themePreference: z.enum(["system", "light", "dark"]),
  sidebarCollapsed: z.boolean().default(false),
  favorites: z.array(z.string()).max(200),
  recentToolIds: z.array(z.string()).max(100),
  usageCounts: z.record(z.string(), z.number().nonnegative()),
  todos: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      category: z.string(),
      priority: z.enum(["low", "medium", "high"]),
      deadline: z.string().nullable(),
      completed: z.boolean(),
      createdAt: z.string(),
      updatedAt: z.string(),
    })
  ),
  workLogs: z.array(
    z.object({
      id: z.string(),
      activity: z.string(),
      category: z.string(),
      startTime: z.string(),
      endTime: z.string(),
      durationMinutes: z.number().nonnegative(),
      notes: z.string(),
      date: z.string(),
    })
  ),
  pomodoroSettings: z.object({
    focusMinutes: z.number().min(1).max(120),
    shortBreakMinutes: z.number().min(1).max(60),
    longBreakMinutes: z.number().min(1).max(90),
    longBreakInterval: z.number().min(1).max(12),
  }),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

export function SettingsView() {
  const mounted = useMounted();
  const userName = useRuangKerjaStore((state) => state.userName);
  const themePreference = useRuangKerjaStore((state) => state.themePreference);
  const sidebarCollapsed = useRuangKerjaStore((state) => state.sidebarCollapsed);
  const setUserName = useRuangKerjaStore((state) => state.setUserName);
  const setThemePreference = useRuangKerjaStore((state) => state.setThemePreference);
  const setSidebarCollapsed = useRuangKerjaStore((state) => state.setSidebarCollapsed);
  const clearUsageHistory = useRuangKerjaStore((state) => state.clearUsageHistory);
  const resetAllPreferences = useRuangKerjaStore((state) => state.resetAllPreferences);
  const restoreBackupData = useRuangKerjaStore((state) => state.restoreBackupData);

  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [systemPrefersDark, setSystemPrefersDark] = useState(false);
  const backupInputRef = useRef<HTMLInputElement>(null);

  const {
    health,
    loading: healthLoading,
    error: healthError,
    latencyMs,
    refresh: refreshHealth,
  } = useBackendHealth(true);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { userName: "Rekan Kerja" },
  });

  useEffect(() => {
    if (mounted) {
      reset({ userName });
    }
  }, [mounted, userName, reset]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setSystemPrefersDark(mq.matches);
    const handler = (event: MediaQueryListEvent) => setSystemPrefersDark(event.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  function onSaveProfile(values: ProfileFormValues) {
    setUserName(values.userName);
    setSavedMessage("Nama pengguna berhasil diperbarui.");
    window.setTimeout(() => setSavedMessage(null), 3500);
  }

  function handleClearHistory() {
    clearUsageHistory();
    setSavedMessage("Riwayat penggunaan dan statistik frekuensi telah dibersihkan.");
    window.setTimeout(() => setSavedMessage(null), 3500);
  }

  function handleResetAll() {
    resetAllPreferences();
    setConfirmReset(false);
    setSavedMessage("Seluruh preferensi dan data lokal berhasil diatur ulang.");
    window.setTimeout(() => setSavedMessage(null), 3500);
  }

  function handleExportBackup() {
    const state = useRuangKerjaStore.getState();
    const payload = {
      version: 1 as const,
      exportedAt: new Date().toISOString(),
      userName: state.userName,
      themePreference: state.themePreference,
      sidebarCollapsed: state.sidebarCollapsed,
      favorites: state.favorites,
      recentToolIds: state.recentToolIds,
      usageCounts: state.usageCounts,
      todos: state.todos,
      workLogs: state.workLogs,
      pomodoroSettings: state.pomodoroSettings,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ruangkerja-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setBackupError(null);
    setSavedMessage("Backup JSON lengkap berhasil diunduh.");
    window.setTimeout(() => setSavedMessage(null), 3500);
  }

  async function handleImportBackup(file: File | undefined) {
    if (!file) return;
    setBackupError(null);
    try {
      const text = await file.text();
      const raw = JSON.parse(text);
      const parsed = backupFileSchema.safeParse(raw);
      if (!parsed.success) {
        setBackupError(
          "Struktur file backup JSON tidak valid. Pastikan file berasal dari ekspor RuangKerja."
        );
        return;
      }
      restoreBackupData(parsed.data);
      setSavedMessage(
        `Backup dipulihkan: ${parsed.data.todos.length} tugas dan ${parsed.data.workLogs.length} catatan kerja.`
      );
      window.setTimeout(() => setSavedMessage(null), 4000);
    } catch {
      setBackupError("Gagal membaca file backup JSON. Pastikan format JSON valid.");
    } finally {
      if (backupInputRef.current) backupInputRef.current.value = "";
    }
  }

  const themeOptions: {
    value: ThemePreference;
    label: string;
    description: string;
    icon: typeof Laptop;
  }[] = [
    {
      value: "system",
      label: `Sistem (${systemPrefersDark ? "Saat ini Gelap" : "Saat ini Terang"})`,
      description: "Mengikuti pengaturan mode gelap/terang perangkat Anda secara otomatis.",
      icon: Laptop,
    },
    {
      value: "light",
      label: "Mode Terang",
      description: "Tampilan cerah bersih untuk penggunaan siang hari.",
      icon: Sun,
    },
    {
      value: "dark",
      label: "Mode Gelap",
      description: "Latar gelap nyaman untuk mata pada kondisi minim cahaya.",
      icon: Moon,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1
          id="main-heading"
          tabIndex={-1}
          className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]"
        >
          Pengaturan &amp; Diagnostik
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Sesuaikan profil dashboard, preferensi tema, serta pantau koneksi backend FastAPI.
        </p>
      </div>

      <div aria-live="polite" className="min-h-6">
        {savedMessage && (
          <div className="inline-flex items-center gap-2 rounded-lg border border-[var(--success-border)] bg-[var(--success-bg)] px-3 py-1.5 text-xs font-medium text-[var(--success-fg)]">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{savedMessage}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Profil Sapaan */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-4 w-4 text-[var(--brand-primary)]" aria-hidden="true" />
              <span>Profil Pengguna</span>
            </CardTitle>
            <CardDescription>
              Nama yang tampil pada sapaan otomatis di halaman Dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSaveProfile)} className="space-y-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="settings-user-name"
                  className="text-xs font-medium text-[var(--text-secondary)]"
                >
                  Nama Tampilan
                </label>
                <Input
                  id="settings-user-name"
                  placeholder="Masukkan nama Anda"
                  aria-invalid={Boolean(errors.userName)}
                  aria-describedby={errors.userName ? "settings-name-error" : undefined}
                  {...register("userName")}
                />
                {errors.userName && (
                  <p id="settings-name-error" role="alert" className="text-xs text-[var(--danger-bg)]">
                    {errors.userName.message}
                  </p>
                )}
              </div>

              <Button type="submit">Simpan Nama</Button>
            </form>
          </CardContent>
        </Card>

        {/* Tema & Tata Letak */}
        <Card>
          <CardHeader>
            <CardTitle>Tema &amp; Tata Letak</CardTitle>
            <CardDescription>
              Pilih skema warna dan perilaku sidebar RuangKerja.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <fieldset className="space-y-2">
              <legend className="text-xs font-medium text-[var(--text-secondary)]">
                Skema Warna
              </legend>
              <div className="space-y-2 pt-1">
                {themeOptions.map((option) => {
                  const Icon = option.icon;
                  const active = (mounted ? themePreference : "system") === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setThemePreference(option.value)}
                      aria-pressed={active}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors cursor-pointer",
                        active
                          ? "border-[var(--brand-primary)] bg-[var(--brand-subtle-bg)]"
                          : "border-[var(--border-subtle)] hover:bg-[var(--surface-muted)]"
                      )}
                    >
                      <Icon
                        className={cn(
                          "mt-0.5 h-4 w-4 shrink-0",
                          active ? "text-[var(--brand-primary)]" : "text-[var(--text-muted)]"
                        )}
                        aria-hidden="true"
                      />
                      <div>
                        <p className="text-sm font-medium text-[var(--text-primary)]">
                          {option.label}
                        </p>
                        <p className="text-xs text-[var(--text-secondary)]">
                          {option.description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div className="flex items-center justify-between rounded-xl border border-[var(--border-subtle)] px-3.5 py-3">
              <div>
                <p className="text-sm font-medium">Sidebar Ringkas (Collapsed)</p>
                <p className="text-xs text-[var(--text-secondary)]">
                  Tampilkan hanya ikon pada sidebar desktop untuk ruang kerja lebih lebar.
                </p>
              </div>
              <input
                id="sidebar-collapsed-toggle"
                type="checkbox"
                checked={mounted ? sidebarCollapsed : false}
                onChange={(e) => setSidebarCollapsed(e.target.checked)}
                aria-label="Aktifkan sidebar ringkas"
                className="h-4 w-4 cursor-pointer"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Status Backend FastAPI */}
      <Card id="backend-status">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-4 w-4 text-[var(--brand-primary)]" aria-hidden="true" />
              <span>Status Backend FastAPI &amp; Pustaka Pemrosesan</span>
            </CardTitle>
            <CardDescription className="mt-1">
              Memeriksa koneksi langsung ke endpoint <code>/api/health</code>.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refreshHealth()}
            disabled={healthLoading}
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", healthLoading && "animate-spin")}
              aria-hidden="true"
            />
            <span>Periksa Ulang</span>
          </Button>
        </CardHeader>

        <CardContent className="space-y-4">
          {healthError ? (
            <div
              role="alert"
              className="rounded-xl border border-[var(--warning-border)] bg-[var(--warning-bg)] p-4 text-sm text-[var(--warning-fg)]"
            >
              <p className="font-semibold">Backend FastAPI tidak terhubung</p>
              <p className="mt-1 text-xs">{healthError}</p>
            </div>
          ) : health ? (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-3">
                  <p className="text-xs text-[var(--text-secondary)]">Status Server</p>
                  <div className="mt-1 flex items-center gap-2">
                    <Badge variant={health.status === "healthy" ? "success" : "warning"}>
                      {health.status === "healthy" ? "Healthy" : "Degraded"}
                    </Badge>
                    {latencyMs !== null && (
                      <span className="font-mono text-xs text-[var(--text-muted)]">
                        {latencyMs} ms
                      </span>
                    )}
                  </div>
                </div>
                <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-3">
                  <p className="text-xs text-[var(--text-secondary)]">Versi Python</p>
                  <p className="mt-1 font-mono text-sm font-semibold">
                    {health.python_version}
                  </p>
                </div>
                <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-3">
                  <p className="text-xs text-[var(--text-secondary)]">Batas Upload</p>
                  <p className="mt-1 font-mono text-sm font-semibold">
                    {health.max_upload_size_mb} MB / file
                  </p>
                </div>
                <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-3">
                  <p className="text-xs text-[var(--text-secondary)]">Folder Temp</p>
                  <p className="mt-1 font-mono text-sm font-semibold">
                    {health.temp_storage.writable ? "Writable" : "Read-only"} ({health.temp_storage.active_job_dirs} aktif)
                  </p>
                </div>
              </div>

              <div
                tabIndex={0}
                role="region"
                aria-labelledby="engine-table-cap"
                className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]"
              >
                <table className="w-full border-collapse text-left text-sm">
                  <caption id="engine-table-cap" className="visually-hidden">
                    Daftar kesiapan pustaka Python pemrosesan file di backend FastAPI
                  </caption>
                  <thead className="border-b border-[var(--border-subtle)] bg-[var(--surface-muted)] text-xs text-[var(--text-secondary)]">
                    <tr>
                      <th scope="col" className="px-4 py-2.5 font-medium">Komponen / Library</th>
                      <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                      <th scope="col" className="px-4 py-2.5 font-medium">Versi</th>
                      <th scope="col" className="px-4 py-2.5 font-medium">Catatan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]">
                    {health.engines.map((engine) => (
                      <tr key={engine.name}>
                        <td className="px-4 py-2.5 font-medium">{engine.name}</td>
                        <td className="px-4 py-2.5">
                          <Badge variant={engine.available ? "success" : "warning"}>
                            {engine.available ? "Siap" : "Belum Ada"}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs text-[var(--text-secondary)]">
                          {engine.version ?? "—"}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-[var(--text-muted)]">
                          {engine.note ?? "Terpasang dengan baik"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">Memuat diagnostik backend...</p>
          )}
        </CardContent>
      </Card>

      {/* Manajemen Data Lokal */}
      <Card>
        <CardHeader>
          <CardTitle>Manajemen Data Browser (localStorage) &amp; Backup</CardTitle>
          <CardDescription>
            Preferensi, favorit, riwayat tools, catatan kerja, dan tugas Anda disimpan lokal di browser. Ekspor ke JSON kapan saja sebagai cadangan.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="default" onClick={handleExportBackup}>
              <Download className="h-4 w-4" aria-hidden="true" />
              <span>Ekspor Backup (JSON)</span>
            </Button>

            <input
              ref={backupInputRef}
              type="file"
              accept=".json,application/json"
              tabIndex={-1}
              className="visually-hidden"
              onChange={(e) => void handleImportBackup(e.target.files?.[0])}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => backupInputRef.current?.click()}
            >
              <Upload className="h-4 w-4" aria-hidden="true" />
              <span>Impor Backup (JSON)</span>
            </Button>

            <Button variant="outline" onClick={handleClearHistory}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              <span>Hapus Riwayat Penggunaan</span>
            </Button>

            {!confirmReset ? (
              <Button variant="destructive" onClick={() => setConfirmReset(true)}>
                Reset Semua Preferensi
              </Button>
            ) : (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-1.5">
                <span className="text-xs text-[var(--text-primary)]">
                  Yakin hapus semua tugas, favorit, dan preferensi?
                </span>
                <Button variant="destructive" size="sm" onClick={handleResetAll}>
                  Ya, Reset
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmReset(false)}>
                  Batal
                </Button>
              </div>
            )}
          </div>

          {backupError && (
            <p role="alert" className="text-xs font-medium text-[var(--danger-bg)]">
              {backupError}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

