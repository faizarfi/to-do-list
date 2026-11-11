"use client";

import { useEffect, useState } from "react";
import { Calendar, Clock } from "lucide-react";

import { useMounted } from "@/hooks/use-mounted";
import {
  formatIndonesianDate,
  formatIndonesianTime,
  getGreetingForHour,
} from "@/lib/greeting";
import { useRuangKerjaStore } from "@/lib/storage-store";

export function GreetingClock() {
  const mounted = useMounted();
  const userName = useRuangKerjaStore((state) => state.userName);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const greeting = now ? getGreetingForHour(now.getHours()) : "Selamat datang";
  const displayName = mounted ? userName : "Rekan Kerja";
  const dateText = now ? formatIndonesianDate(now) : "Memuat tanggal...";
  const timeText = now ? formatIndonesianTime(now) : "--:--:--";

  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
      <div>
        <p className="text-xs font-semibold tracking-wider text-[var(--brand-primary)] uppercase">
          Workspace Produktivitas Harian
        </p>
        <h1
          id="main-heading"
          tabIndex={-1}
          className="mt-1 text-2xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-3xl"
        >
          {greeting}, {displayName}
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Semua alat dokumen, gambar, spreadsheet, kalkulator, dan pekerjaan harian dalam satu ruang kerja.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
        <div className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-1.5">
          <Calendar className="h-3.5 w-3.5 text-[var(--brand-primary)]" aria-hidden="true" />
          <span>{dateText}</span>
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-1.5 font-mono tabular-nums">
          <Clock className="h-3.5 w-3.5 text-[var(--brand-primary)]" aria-hidden="true" />
          <span>{timeText}</span>
        </div>
      </div>
    </div>
  );
}

