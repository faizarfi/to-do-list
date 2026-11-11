"use client";

import { useId, useMemo, useState } from "react";
import { Check, Copy, RotateCcw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  calculateAgeAndTenure,
  calculateBandwidthAndTransfer,
  calculateBmiAndCalorie,
  convertTypographyUnit,
} from "@/lib/business-calculators";
import { formatCalcNumber } from "@/lib/calculators";
import { getTodayIsoDate } from "@/lib/greeting";
import { cn } from "@/lib/utils";
import type { ToolDefinition } from "@/types/tools";

export const EXTRA_CALCULATOR_IDS = new Set([
  "age-tenure-calculator",
  "bandwidth-transfer-calculator",
  "typography-css-converter",
  "ratio-proportion-solver",
  "bmi-calorie-calculator",
]);

function CopyAction({ value, label = "Salin Hasil" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Ignore clipboard access failure
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={() => void handleCopy()}>
      {copied ? (
        <Check className="h-3.5 w-3.5 text-[var(--brand-primary)]" aria-hidden="true" />
      ) : (
        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      <span>{copied ? "Tersalin!" : label}</span>
    </Button>
  );
}

function gcdPositive(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y !== 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

export function CalculatorExtraWorkspace({ tool }: { tool: ToolDefinition }) {
  const formId = useId();
  const todayIso = getTodayIsoDate();

  // #67 Age & Tenure Calculator
  const [birthOrStartIso, setBirthOrStartIso] = useState("1998-08-17");
  const [refIso, setRefIso] = useState(todayIso);

  // #68 Bandwidth & Download Time Calculator
  const [transferSizeVal, setTransferSizeVal] = useState("10");
  const [transferSizeUnit, setTransferSizeUnit] = useState<"MB" | "GB" | "TB">("GB");
  const [speedMbps, setSpeedMbps] = useState("50");

  // #69 CSS Typography Unit Converter
  const [typoVal, setTypoVal] = useState("16");
  const [typoFrom, setTypoFrom] = useState<"px" | "rem" | "em" | "pt" | "percent">("px");
  const [typoBasePx, setTypoBasePx] = useState("16");

  // #70 Ratio & Proportion Solver (A : B = C : D)
  const [ratioA, setRatioA] = useState("16");
  const [ratioB, setRatioB] = useState("9");
  const [ratioKnownSide, setRatioKnownSide] = useState<"find_d" | "find_c">("find_d");
  const [ratioKnownVal, setRatioKnownVal] = useState("1920");

  // #71 BMI & Daily Calorie (TDEE)
  const [bmiGender, setBmiGender] = useState<"male" | "female">("male");
  const [bmiAge, setBmiAge] = useState("27");
  const [bmiWeight, setBmiWeight] = useState("68");
  const [bmiHeight, setBmiHeight] = useState("172");
  const [bmiActivity, setBmiActivity] = useState("1.55");

  const ageResult = useMemo(() => {
    try {
      return { data: calculateAgeAndTenure(birthOrStartIso, refIso), error: null };
    } catch (err) {
      return {
        data: null,
        error: err instanceof Error ? err.message : "Tanggal tidak valid.",
      };
    }
  }, [birthOrStartIso, refIso]);

  const bandwidthResult = useMemo(() => {
    const rawVal = Math.max(0, Number(transferSizeVal) || 0);
    const sizeInGb =
      transferSizeUnit === "MB"
        ? rawVal / 1024
        : transferSizeUnit === "TB"
          ? rawVal * 1024
          : rawVal;
    const mbps = Math.max(0.01, Number(speedMbps) || 0.01);
    return {
      sizeInGb,
      ...calculateBandwidthAndTransfer(sizeInGb, mbps),
    };
  }, [transferSizeVal, transferSizeUnit, speedMbps]);

  const typoResult = useMemo(() => {
    const val = Number(typoVal);
    const base = Math.max(1, Number(typoBasePx) || 16);
    if (!Number.isFinite(val)) return null;
    return convertTypographyUnit(val, typoFrom, base);
  }, [typoVal, typoFrom, typoBasePx]);

  const ratioResult = useMemo(() => {
    const a = Number(ratioA);
    const b = Number(ratioB);
    const k = Number(ratioKnownVal);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0 || !Number.isFinite(k)) {
      return null;
    }
    const g =
      Number.isInteger(a) && Number.isInteger(b) ? gcdPositive(a, b) : 1;
    const simpleA = Number((a / g).toFixed(3));
    const simpleB = Number((b / g).toFixed(3));
    const solvedC = ratioKnownSide === "find_d" ? k : (k * a) / b;
    const solvedD = ratioKnownSide === "find_d" ? (k * b) / a : k;
    return {
      simpleA,
      simpleB,
      decimalRatio: Number((a / b).toFixed(4)),
      solvedC: formatCalcNumber(solvedC),
      solvedD: formatCalcNumber(solvedD),
      solvedVal: ratioKnownSide === "find_d" ? solvedD : solvedC,
    };
  }, [ratioA, ratioB, ratioKnownSide, ratioKnownVal]);

  const bmiResult = useMemo(() => {
    const age = Math.max(10, Math.min(100, Number(bmiAge) || 25));
    const weight = Math.max(20, Math.min(350, Number(bmiWeight) || 60));
    const height = Math.max(80, Math.min(250, Number(bmiHeight) || 170));
    const activity = Number(bmiActivity) || 1.55;
    return calculateBmiAndCalorie({
      gender: bmiGender,
      ageYears: age,
      weightKg: weight,
      heightCm: height,
      activityFactor: activity,
    });
  }, [bmiGender, bmiAge, bmiWeight, bmiHeight, bmiActivity]);

  // #67 Kalkulator Usia & Masa Kerja
  if (tool.id === "age-tenure-calculator") {
    const summaryText = ageResult.data
      ? `${ageResult.data.years} tahun ${ageResult.data.months} bulan ${ageResult.data.days} hari (${ageResult.data.totalDays.toLocaleString("id-ID")} hari)`
      : "";

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={`${formId}-start`} className="block text-xs font-medium text-[var(--text-secondary)]">
              Tanggal Lahir / Mulai Kontrak / Proyek
            </label>
            <Input
              id={`${formId}-start`}
              type="date"
              value={birthOrStartIso}
              onChange={(e) => setBirthOrStartIso(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label htmlFor={`${formId}-ref`} className="block text-xs font-medium text-[var(--text-secondary)]">
                Tanggal Acuan Perhitungan
              </label>
              <button
                type="button"
                onClick={() => setRefIso(todayIso)}
                className="text-[11px] font-medium text-[var(--brand-primary)] hover:underline"
              >
                Hari Ini
              </button>
            </div>
            <Input
              id={`${formId}-ref`}
              type="date"
              value={refIso}
              onChange={(e) => setRefIso(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>

        {ageResult.error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
            {ageResult.error}
          </p>
        )}

        {ageResult.data && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-[var(--brand-primary)]/30 bg-[var(--brand-soft)]/50 p-4 sm:col-span-2">
              <p className="text-xs font-medium text-[var(--brand-primary)]">
                Usia / Masa Kerja Tepat
              </p>
              <p className="mt-1 text-2xl font-bold text-[var(--text-primary)]">
                {ageResult.data.years} Tahun {ageResult.data.months} Bulan {ageResult.data.days} Hari
              </p>
            </div>
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3">
              <p className="text-xs text-[var(--text-muted)]">Total Bulan / Total Hari</p>
              <p className="mt-1 text-base font-semibold text-[var(--text-primary)]">
                {ageResult.data.totalMonths.toLocaleString("id-ID")} bulan ({ageResult.data.totalDays.toLocaleString("id-ID")} hari)
              </p>
            </div>
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3">
              <p className="text-xs text-[var(--text-muted)]">Hitung Mundur Ulang Tahun / Anniversary</p>
              <p className="mt-1 text-base font-semibold text-[var(--text-primary)]">
                {ageResult.data.daysToNextAnniv === 0
                  ? "Hari Ini! 🎉"
                  : `${ageResult.data.daysToNextAnniv} hari lagi`}
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <CopyAction value={summaryText} />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setBirthOrStartIso("1998-08-17");
              setRefIso(todayIso);
            }}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Reset</span>
          </Button>
        </div>
      </div>
    );
  }

  // #68 Kalkulator Bandwidth & Waktu Unduh
  if (tool.id === "bandwidth-transfer-calculator") {
    const summaryText = `Ukuran: ${transferSizeVal} ${transferSizeUnit}, Kecepatan: ${speedMbps} Mbps (${bandwidthResult.mbPerSec} MB/s) -> Estimasi waktu: ${bandwidthResult.formattedDuration}`;

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor={`${formId}-fsize`} className="block text-xs font-medium text-[var(--text-secondary)]">
              Ukuran File / Data
            </label>
            <Input
              id={`${formId}-fsize`}
              type="number"
              min="0"
              step="any"
              value={transferSizeVal}
              onChange={(e) => setTransferSizeVal(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <label htmlFor={`${formId}-funit`} className="block text-xs font-medium text-[var(--text-secondary)]">
              Satuan File
            </label>
            <select
              id={`${formId}-funit`}
              value={transferSizeUnit}
              onChange={(e) => setTransferSizeUnit(e.target.value as "MB" | "GB" | "TB")}
              className="mt-1 h-10 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 text-sm text-[var(--text-primary)]"
            >
              <option value="MB">Megabyte (MB)</option>
              <option value="GB">Gigabyte (GB)</option>
              <option value="TB">Terabyte (TB)</option>
            </select>
          </div>
          <div>
            <label htmlFor={`${formId}-mbps`} className="block text-xs font-medium text-[var(--text-secondary)]">
              Kecepatan Koneksi (Mbps)
            </label>
            <Input
              id={`${formId}-mbps`}
              type="number"
              min="0.1"
              step="any"
              value={speedMbps}
              onChange={(e) => setSpeedMbps(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-[var(--text-muted)]">Preset Koneksi:</span>
          {[
            { label: "10 Mbps", val: "10" },
            { label: "30 Mbps", val: "30" },
            { label: "50 Mbps", val: "50" },
            { label: "100 Mbps", val: "100" },
            { label: "300 Mbps", val: "300" },
            { label: "1 Gbps", val: "1000" },
          ].map((preset) => (
            <button
              key={preset.val}
              type="button"
              onClick={() => setSpeedMbps(preset.val)}
              className={cn(
                "rounded-lg border px-2.5 py-1 text-xs transition-colors",
                speedMbps === preset.val
                  ? "border-[var(--brand-primary)] bg-[var(--brand-soft)] font-medium text-[var(--brand-primary)]"
                  : "border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]"
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-[var(--brand-primary)]/30 bg-[var(--brand-soft)]/50 p-4 sm:col-span-3">
            <p className="text-xs font-medium text-[var(--brand-primary)]">
              Estimasi Durasi Transfer
            </p>
            <p className="mt-1 text-2xl font-bold text-[var(--text-primary)]">
              {bandwidthResult.formattedDuration}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3">
            <p className="text-xs text-[var(--text-muted)]">Throughput Nyata</p>
            <p className="mt-1 font-mono text-base font-semibold text-[var(--text-primary)]">
              {bandwidthResult.mbPerSec} MB/detik
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3">
            <p className="text-xs text-[var(--text-muted)]">Kapasitas per Jam</p>
            <p className="mt-1 font-mono text-base font-semibold text-[var(--text-primary)]">
              {bandwidthResult.gbPerHour} GB/jam
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3">
            <p className="text-xs text-[var(--text-muted)]">Total Detik</p>
            <p className="mt-1 font-mono text-base font-semibold text-[var(--text-primary)]">
              {bandwidthResult.estimatedSeconds.toLocaleString("id-ID")} dtk
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <CopyAction value={summaryText} />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setTransferSizeVal("10");
              setTransferSizeUnit("GB");
              setSpeedMbps("50");
            }}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Reset</span>
          </Button>
        </div>
      </div>
    );
  }

  // #69 Konverter Satuan Tipografi CSS
  if (tool.id === "typography-css-converter") {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor={`${formId}-tval`} className="block text-xs font-medium text-[var(--text-secondary)]">
              Nilai Ukuran
            </label>
            <Input
              id={`${formId}-tval`}
              type="number"
              step="any"
              value={typoVal}
              onChange={(e) => setTypoVal(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <label htmlFor={`${formId}-tunit`} className="block text-xs font-medium text-[var(--text-secondary)]">
              Dari Satuan
            </label>
            <select
              id={`${formId}-tunit`}
              value={typoFrom}
              onChange={(e) =>
                setTypoFrom(e.target.value as "px" | "rem" | "em" | "pt" | "percent")
              }
              className="mt-1 h-10 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 text-sm text-[var(--text-primary)]"
            >
              <option value="px">Pixel (px)</option>
              <option value="rem">Root EM (rem)</option>
              <option value="em">Element EM (em)</option>
              <option value="pt">Point Cetak (pt)</option>
              <option value="percent">Persen (%)</option>
            </select>
          </div>
          <div>
            <label htmlFor={`${formId}-tbase`} className="block text-xs font-medium text-[var(--text-secondary)]">
              Base Root Font Size (px)
            </label>
            <Input
              id={`${formId}-tbase`}
              type="number"
              min="1"
              step="1"
              value={typoBasePx}
              onChange={(e) => setTypoBasePx(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>

        {typoResult && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {[
                { label: "px", val: `${typoResult.px}px` },
                { label: "rem", val: `${typoResult.rem}rem` },
                { label: "em", val: `${typoResult.em}em` },
                { label: "pt", val: `${typoResult.pt}pt` },
                { label: "%", val: `${typoResult.percent}%` },
              ].map((item) => (
                <div
                  key={item.label}
                  className="flex flex-col justify-between gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3"
                >
                  <div>
                    <p className="text-[11px] font-medium uppercase text-[var(--text-muted)]">
                      {item.label}
                    </p>
                    <p className="mt-0.5 font-mono text-base font-bold text-[var(--text-primary)]">
                      {item.val}
                    </p>
                  </div>
                  <CopyAction value={item.val} label="Salin" />
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/40 p-4">
              <div className="flex items-center justify-between gap-2 text-xs text-[var(--text-muted)]">
                <span>Pratinjau Skala Teks Langsung</span>
                <Badge variant="outline">
                  {Math.max(8, Math.min(96, typoResult.px))}px
                </Badge>
              </div>
              <p
                className="mt-2 truncate font-semibold text-[var(--text-primary)]"
                style={{ fontSize: `${Math.max(8, Math.min(96, typoResult.px))}px` }}
              >
                RuangKerja Tipografi Modern
              </p>
            </div>
          </>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setTypoVal("16");
            setTypoFrom("px");
            setTypoBasePx("16");
          }}
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Reset</span>
        </Button>
      </div>
    );
  }

  // #70 Kalkulator Proporsi & Skala Rasio
  if (tool.id === "ratio-proportion-solver") {
    const summaryText = ratioResult
      ? `${ratioA} : ${ratioB} = ${ratioResult.solvedC} : ${ratioResult.solvedD} (Sederhana ${ratioResult.simpleA}:${ratioResult.simpleB})`
      : "";

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor={`${formId}-ra`} className="block text-xs font-medium text-[var(--text-secondary)]">
              Rasio A (Lebar / Pembilang)
            </label>
            <Input
              id={`${formId}-ra`}
              type="number"
              min="0.01"
              step="any"
              value={ratioA}
              onChange={(e) => setRatioA(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <label htmlFor={`${formId}-rb`} className="block text-xs font-medium text-[var(--text-secondary)]">
              Rasio B (Tinggi / Penyebut)
            </label>
            <Input
              id={`${formId}-rb`}
              type="number"
              min="0.01"
              step="any"
              value={ratioB}
              onChange={(e) => setRatioB(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <label htmlFor={`${formId}-rmode`} className="block text-xs font-medium text-[var(--text-secondary)]">
              Nilai Target yang Diketahui
            </label>
            <select
              id={`${formId}-rmode`}
              value={ratioKnownSide}
              onChange={(e) => setRatioKnownSide(e.target.value as "find_d" | "find_c")}
              className="mt-1 h-10 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 text-sm text-[var(--text-primary)]"
            >
              <option value="find_d">Diketahui C → Cari D</option>
              <option value="find_c">Diketahui D → Cari C</option>
            </select>
          </div>
          <div>
            <label htmlFor={`${formId}-rk`} className="block text-xs font-medium text-[var(--text-secondary)]">
              Nilai {ratioKnownSide === "find_d" ? "C" : "D"}
            </label>
            <Input
              id={`${formId}-rk`}
              type="number"
              step="any"
              value={ratioKnownVal}
              onChange={(e) => setRatioKnownVal(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-[var(--text-muted)]">Rasio Populer:</span>
          {[
            { label: "16:9", a: "16", b: "9" },
            { label: "4:3", a: "4", b: "3" },
            { label: "1:1", a: "1", b: "1" },
            { label: "9:16", a: "9", b: "16" },
            { label: "21:9", a: "21", b: "9" },
          ].map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => {
                setRatioA(preset.a);
                setRatioB(preset.b);
              }}
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] px-2.5 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]"
            >
              {preset.label}
            </button>
          ))}
        </div>

        {ratioResult ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-[var(--brand-primary)]/30 bg-[var(--brand-soft)]/50 p-4 sm:col-span-3">
              <p className="text-xs font-medium text-[var(--brand-primary)]">
                Hasil Persamaan Proporsi (A : B = C : D)
              </p>
              <p className="mt-1 font-mono text-2xl font-bold text-[var(--text-primary)]">
                {ratioA} : {ratioB} = {ratioResult.solvedC} : {ratioResult.solvedD}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3">
              <p className="text-xs text-[var(--text-muted)]">
                Nilai {ratioKnownSide === "find_d" ? "D" : "C"}
              </p>
              <p className="mt-1 font-mono text-lg font-bold text-[var(--brand-primary)]">
                {ratioKnownSide === "find_d" ? ratioResult.solvedD : ratioResult.solvedC}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3">
              <p className="text-xs text-[var(--text-muted)]">Bentuk Paling Sederhana</p>
              <p className="mt-1 font-mono text-lg font-semibold text-[var(--text-primary)]">
                {ratioResult.simpleA} : {ratioResult.simpleB}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3">
              <p className="text-xs text-[var(--text-muted)]">Rasio Desimal (A / B)</p>
              <p className="mt-1 font-mono text-lg font-semibold text-[var(--text-primary)]">
                {ratioResult.decimalRatio}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-[var(--text-muted)]">
            Masukkan nilai rasio A dan B lebih besar dari 0 untuk menghitung proporsi.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <CopyAction value={summaryText} />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setRatioA("16");
              setRatioB("9");
              setRatioKnownSide("find_d");
              setRatioKnownVal("1920");
            }}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Reset</span>
          </Button>
        </div>
      </div>
    );
  }

  // #71 Kalkulator BMI & Kalori Harian (TDEE)
  const bmiSummaryText = `BMI: ${bmiResult.bmi} (${bmiResult.category}) | BMR: ${bmiResult.bmr} kkal/hari | TDEE: ${bmiResult.tdee} kkal/hari`;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <label htmlFor={`${formId}-bgender`} className="block text-xs font-medium text-[var(--text-secondary)]">
            Jenis Kelamin
          </label>
          <select
            id={`${formId}-bgender`}
            value={bmiGender}
            onChange={(e) => setBmiGender(e.target.value as "male" | "female")}
            className="mt-1 h-10 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 text-sm text-[var(--text-primary)]"
          >
            <option value="male">Laki-laki</option>
            <option value="female">Perempuan</option>
          </select>
        </div>
        <div>
          <label htmlFor={`${formId}-bage`} className="block text-xs font-medium text-[var(--text-secondary)]">
            Usia (tahun)
          </label>
          <Input
            id={`${formId}-bage`}
            type="number"
            min="10"
            max="100"
            value={bmiAge}
            onChange={(e) => setBmiAge(e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <label htmlFor={`${formId}-bwt`} className="block text-xs font-medium text-[var(--text-secondary)]">
            Berat Badan (kg)
          </label>
          <Input
            id={`${formId}-bwt`}
            type="number"
            min="20"
            max="350"
            step="0.5"
            value={bmiWeight}
            onChange={(e) => setBmiWeight(e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <label htmlFor={`${formId}-bht`} className="block text-xs font-medium text-[var(--text-secondary)]">
            Tinggi Badan (cm)
          </label>
          <Input
            id={`${formId}-bht`}
            type="number"
            min="80"
            max="250"
            step="0.5"
            value={bmiHeight}
            onChange={(e) => setBmiHeight(e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <label htmlFor={`${formId}-bact`} className="block text-xs font-medium text-[var(--text-secondary)]">
            Aktivitas Harian
          </label>
          <select
            id={`${formId}-bact`}
            value={bmiActivity}
            onChange={(e) => setBmiActivity(e.target.value)}
            className="mt-1 h-10 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 text-sm text-[var(--text-primary)]"
          >
            <option value="1.2">1.2 - Minim olahraga</option>
            <option value="1.375">1.375 - Ringan (1-3x/mg)</option>
            <option value="1.55">1.55 - Sedang (3-5x/mg)</option>
            <option value="1.725">1.725 - Aktif (6-7x/mg)</option>
            <option value="1.9">1.9 - Sangat berat</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-[var(--brand-primary)]/30 bg-[var(--brand-soft)]/50 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-[var(--brand-primary)]">Skor BMI</p>
            <Badge variant={bmiResult.bmi >= 18.5 && bmiResult.bmi < 25 ? "success" : "outline"}>
              {bmiResult.category}
            </Badge>
          </div>
          <p className="mt-1 text-2xl font-bold text-[var(--text-primary)]">
            {bmiResult.bmi}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4">
          <p className="text-xs text-[var(--text-muted)]">BMR (Metabolisme Basal)</p>
          <p className="mt-1 text-xl font-bold text-[var(--text-primary)]">
            {bmiResult.bmr.toLocaleString("id-ID")} <span className="text-xs font-normal">kkal</span>
          </p>
        </div>
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4">
          <p className="text-xs text-[var(--text-muted)]">TDEE (Kebutuhan Harian)</p>
          <p className="mt-1 text-xl font-bold text-[var(--brand-primary)]">
            {bmiResult.tdee.toLocaleString("id-ID")} <span className="text-xs font-normal">kkal</span>
          </p>
        </div>
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4">
          <p className="text-xs text-[var(--text-muted)]">Defisit / Surplus</p>
          <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
            Turun: {bmiResult.deficit500.toLocaleString("id-ID")} kkal
          </p>
          <p className="text-sm font-semibold text-[var(--text-secondary)]">
            Naik: {bmiResult.surplus300.toLocaleString("id-ID")} kkal
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <CopyAction value={bmiSummaryText} />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setBmiGender("male");
            setBmiAge("27");
            setBmiWeight("68");
            setBmiHeight("172");
            setBmiActivity("1.55");
          }}
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Reset</span>
        </Button>
      </div>
    </div>
  );
}
