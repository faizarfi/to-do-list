"use client";

import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ArrowUpRight,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  Clock3,
  Plus,
  Trash2,
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
import { Progress } from "@/components/ui/progress";
import { useMounted } from "@/hooks/use-mounted";
import { getTodayIsoDate } from "@/lib/greeting";
import { useRuangKerjaStore } from "@/lib/storage-store";
import { cn, formatMinutesToDuration } from "@/lib/utils";

const quickTaskSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, "Tugas minimal 2 karakter.")
    .max(120, "Maksimal 120 karakter."),
});

type QuickTaskFormValues = z.infer<typeof quickTaskSchema>;

export function DailySummary() {
  const mounted = useMounted();
  const todos = useRuangKerjaStore((state) => state.todos);
  const workLogs = useRuangKerjaStore((state) => state.workLogs);
  const addQuickTodo = useRuangKerjaStore((state) => state.addQuickTodo);
  const toggleTodo = useRuangKerjaStore((state) => state.toggleTodo);
  const deleteTodo = useRuangKerjaStore((state) => state.deleteTodo);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<QuickTaskFormValues>({
    resolver: zodResolver(quickTaskSchema),
    defaultValues: { title: "" },
  });

  const safeTodos = mounted ? todos : [];
  const safeLogs = mounted ? workLogs : [];

  const totalTasks = safeTodos.length;
  const completedTasks = safeTodos.filter((item) => item.completed).length;
  const pendingTasks = totalTasks - completedTasks;
  const completionRate =
    totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const todayIso = getTodayIsoDate();
  const todayLogs = safeLogs.filter((entry) => entry.date === todayIso);
  const todayMinutes = todayLogs.reduce(
    (sum, entry) => sum + entry.durationMinutes,
    0
  );

  function onSubmit(values: QuickTaskFormValues) {
    addQuickTodo(values.title, "medium", "Harian");
    reset();
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      {/* 12. Ringkasan Pekerjaan Harian + Quick Task */}
      <Card className="lg:col-span-8">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 pb-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ClipboardCheck
                className="h-4 w-4 text-[var(--brand-primary)]"
                aria-hidden="true"
              />
              <span>Ringkasan Pekerjaan Harian</span>
            </CardTitle>
            <CardDescription className="mt-1">
              Pantau fokus hari ini dan catat tugas cepat yang tersimpan otomatis di browser Anda.
            </CardDescription>
          </div>
          <Link
            href="/productivity"
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-[var(--brand-primary)] hover:bg-[var(--brand-subtle-bg)]"
          >
            <span>Ruang Produktivitas</span>
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-3">
              <p className="text-xs text-[var(--text-secondary)]">Tugas Aktif</p>
              <p className="mt-1 font-mono text-xl font-semibold tabular-nums">
                {pendingTasks}
              </p>
            </div>
            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-3">
              <p className="text-xs text-[var(--text-secondary)]">Durasi Work Log Hari Ini</p>
              <p className="mt-1 flex items-center gap-1.5 font-mono text-xl font-semibold tabular-nums">
                <Clock3 className="h-4 w-4 text-[var(--brand-primary)]" aria-hidden="true" />
                <span>{formatMinutesToDuration(todayMinutes)}</span>
              </p>
            </div>
            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-3">
              <p className="text-xs text-[var(--text-secondary)]">Catatan Aktivitas</p>
              <p className="mt-1 font-mono text-xl font-semibold tabular-nums">
                {todayLogs.length} sesi
              </p>
            </div>
          </div>

          {/* Interactive Quick Task form backed by localStorage */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-1.5">
            <label htmlFor="quick-todo-input" className="text-xs font-medium text-[var(--text-secondary)]">
              Tambah tugas cepat hari ini
            </label>
            <div className="flex gap-2">
              <Input
                id="quick-todo-input"
                placeholder="Contoh: Gabungkan laporan PDF kuartal dan rapikan CSV..."
                aria-invalid={Boolean(errors.title)}
                aria-describedby={errors.title ? "quick-todo-error" : undefined}
                {...register("title")}
              />
              <Button type="submit" size="default">
                <Plus className="h-4 w-4" aria-hidden="true" />
                <span>Tambah</span>
              </Button>
            </div>
            {errors.title && (
              <p id="quick-todo-error" role="alert" className="text-xs text-[var(--danger-bg)]">
                {errors.title.message}
              </p>
            )}
          </form>

          {safeTodos.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--border-subtle)] px-4 py-4 text-center text-xs text-[var(--text-muted)]">
              Belum ada tugas tercatat. Tambahkan tugas di atas — data tersimpan otomatis meski halaman di-refresh.
            </div>
          ) : (
            <ul className="space-y-1.5">
              {safeTodos.slice(0, 4).map((todo) => (
                <li
                  key={todo.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-2"
                >
                  <button
                    type="button"
                    onClick={() => toggleTodo(todo.id)}
                    aria-pressed={todo.completed}
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-left cursor-pointer"
                  >
                    {todo.completed ? (
                      <CheckCircle2
                        className="h-4 w-4 shrink-0 text-[var(--brand-primary)]"
                        aria-hidden="true"
                      />
                    ) : (
                      <Circle
                        className="h-4 w-4 shrink-0 text-[var(--text-muted)]"
                        aria-hidden="true"
                      />
                    )}
                    <span
                      className={cn(
                        "truncate text-sm",
                        todo.completed && "text-[var(--text-muted)] line-through"
                      )}
                    >
                      {todo.title}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteTodo(todo.id)}
                    aria-label={`Hapus tugas ${todo.title}`}
                    className="inline-flex min-h-7 min-w-7 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--danger-bg)] cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </li>
              ))}
              {safeTodos.length > 4 && (
                <li className="pt-1 text-right text-xs text-[var(--text-muted)]">
                  +{safeTodos.length - 4} tugas lainnya tersimpan di workspace Produktivitas
                </li>
              )}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* 13. Jumlah Tugas Selesai */}
      <Card className="flex flex-col justify-between lg:col-span-4">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Jumlah Tugas Selesai</CardTitle>
            <Badge variant={completionRate === 100 && totalTasks > 0 ? "success" : "default"}>
              {completionRate}%
            </Badge>
          </div>
          <CardDescription>
            Progres penyelesaian tugas harian Anda saat ini.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-4xl font-semibold tracking-tight tabular-nums text-[var(--brand-primary)]">
              {completedTasks}
            </span>
            <span className="text-sm text-[var(--text-secondary)]">
              dari {totalTasks} tugas selesai
            </span>
          </div>

          <Progress
            value={completedTasks}
            max={Math.max(totalTasks, 1)}
            label="Persentase penyelesaian tugas harian"
          />

          <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-3 text-xs text-[var(--text-secondary)]">
            {totalTasks === 0 ? (
              <p>Tambahkan tugas harian untuk mulai memantau produktivitas Anda.</p>
            ) : completedTasks === totalTasks ? (
              <p className="font-medium text-[var(--brand-subtle-fg)]">
                Semua tugas hari ini telah selesai dikerjakan!
              </p>
            ) : (
              <p>
                Tersisa <strong className="font-semibold text-[var(--text-primary)]">{pendingTasks}</strong> tugas lagi untuk menuntaskan target hari ini.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

