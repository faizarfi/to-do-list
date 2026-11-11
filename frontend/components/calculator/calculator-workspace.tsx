"use client";

import { useId, useMemo, useState } from "react";
import { ArrowLeftRight, Check, Copy, Delete, RotateCcw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  UNIT_DEFINITIONS,
  addDaysToDate,
  calculateDateDifference,
  calculateImageRatioAndPrint,
  calculatePercentageSummary,
  calculateWorkDuration,
  convertFileSizeAll,
  convertMeasurementUnit,
  convertNumberBases,
  evaluateExpression,
  formatCalcNumber,
  type AngleMode,
  type FileSizeUnit,
  type UnitCategory,
} from "@/lib/calculators";
import {
  CalculatorExtraWorkspace,
  EXTRA_CALCULATOR_IDS,
} from "@/components/calculator/calculator-extra-workspace";
import { getTodayIsoDate } from "@/lib/greeting";
import { cn } from "@/lib/utils";
import type { ToolDefinition } from "@/types/tools";

interface CalculatorWorkspaceProps {
  tool: ToolDefinition;
}

function CopyButton({ value, label = "Salin Hasil" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Ignore clipboard failures
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

export function CalculatorWorkspace({ tool }: CalculatorWorkspaceProps) {
  if (EXTRA_CALCULATOR_IDS.has(tool.id)) {
    return <CalculatorExtraWorkspace tool={tool} />;
  }
  return <CoreCalculatorWorkspace tool={tool} />;
}

function CoreCalculatorWorkspace({ tool }: CalculatorWorkspaceProps) {
  const formId = useId();
  const todayIso = getTodayIsoDate();

  // #37 & #38 Basic & Scientific Calculator
  const [expr, setExpr] = useState("");
  const [calcOutput, setCalcOutput] = useState("0");
  const [calcError, setCalcError] = useState<string | null>(null);
  const [angleMode, setAngleMode] = useState<AngleMode>("deg");
  const [history, setHistory] = useState<{ expr: string; res: string }[]>([]);

  // #39 Percentage Calculator
  const [pctBase, setPctBase] = useState("250000");
  const [pctRate, setPctRate] = useState("15");
  const [pctDiscount, setPctDiscount] = useState("10");
  const [pctTax, setPctTax] = useState("11");

  // #40 Date Calculator
  const [startDate, setStartDate] = useState(todayIso);
  const [endDate, setEndDate] = useState(() => addDaysToDate(todayIso, 14));
  const [baseDate, setBaseDate] = useState(todayIso);
  const [deltaDays, setDeltaDays] = useState("30");

  // #41 Time Calculator
  const [startTime, setStartTime] = useState("08:30");
  const [endTime, setEndTime] = useState("17:00");
  const [breakMinutes, setBreakMinutes] = useState("60");
  const [addHours, setAddHours] = useState("2");
  const [addMins, setAddMins] = useState("45");

  // #42 Unit Converter
  const [unitCat, setUnitCat] = useState<UnitCategory>("length");
  const [unitVal, setUnitVal] = useState("1");
  const [fromUnit, setFromUnit] = useState("m");
  const [toUnit, setToUnit] = useState("cm");

  // #43 File Size Converter
  const [fileSizeInput, setFileSizeInput] = useState("1024");
  const [fileSizeUnit, setFileSizeUnit] = useState<FileSizeUnit>("MB");
  const [fileStandard, setFileStandard] = useState<"binary" | "decimal">("binary");

  // #44 Image Ratio Calculator
  const [imgW, setImgW] = useState("1920");
  const [imgH, setImgH] = useState("1080");
  const [imgDpi, setImgDpi] = useState("300");
  const [targetResizeW, setTargetResizeW] = useState("1280");

  // #45 Number Base Converter
  const [baseInput, setBaseInput] = useState("255");
  const [fromBase, setFromBase] = useState<2 | 8 | 10 | 16>(10);

  function handleEvaluateExpression() {
    setCalcError(null);
    if (!expr.trim()) return;
    try {
      const val = evaluateExpression(expr, angleMode);
      const formatted = formatCalcNumber(val);
      setCalcOutput(formatted);
      setHistory((prev) => [{ expr, res: formatted }, ...prev].slice(0, 8));
    } catch (err) {
      setCalcError(
        err instanceof Error ? err.message : "Ekspresi tidak valid."
      );
    }
  }

  function handleResetTool() {
    setExpr("");
    setCalcOutput("0");
    setCalcError(null);
    setHistory([]);
    setPctBase("0");
    setPctRate("0");
    setPctDiscount("0");
    setPctTax("0");
    setStartDate(todayIso);
    setEndDate(todayIso);
    setBaseDate(todayIso);
    setDeltaDays("0");
    setStartTime("08:00");
    setEndTime("17:00");
    setBreakMinutes("0");
    setAddHours("0");
    setAddMins("0");
    setUnitVal("1");
    setFileSizeInput("1");
    setImgW("1920");
    setImgH("1080");
    setImgDpi("300");
    setTargetResizeW("1280");
    setBaseInput("0");
  }

  // Computed outputs for reactive calculators
  const pctResult = useMemo(() => {
    const base = Number(pctBase) || 0;
    const rate = Number(pctRate) || 0;
    const disc = Number(pctDiscount) || 0;
    const tax = Number(pctTax) || 0;
    return calculatePercentageSummary(base, rate, disc, tax);
  }, [pctBase, pctRate, pctDiscount, pctTax]);

  const dateDiffResult = useMemo(() => {
    try {
      return { data: calculateDateDifference(startDate, endDate), error: null };
    } catch (err) {
      return {
        data: null,
        error: err instanceof Error ? err.message : "Tanggal tidak valid.",
      };
    }
  }, [startDate, endDate]);

  const addedDateResult = useMemo(() => {
    try {
      return addDaysToDate(baseDate, Number(deltaDays) || 0);
    } catch {
      return "—";
    }
  }, [baseDate, deltaDays]);

  const workTimeResult = useMemo(() => {
    try {
      return calculateWorkDuration(startTime, endTime, Number(breakMinutes) || 0);
    } catch {
      return null;
    }
  }, [startTime, endTime, breakMinutes]);

  const addedClockResult = useMemo(() => {
    const [h, m] = startTime.split(":").map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return "—";
    const total = h * 60 + m + (Number(addHours) || 0) * 60 + (Number(addMins) || 0);
    const wrapped = ((total % 1440) + 1440) % 1440;
    return `${String(Math.floor(wrapped / 60)).padStart(2, "0")}:${String(wrapped % 60).padStart(2, "0")}`;
  }, [startTime, addHours, addMins]);

  const unitResult = useMemo(() => {
    try {
      const val = Number(unitVal);
      if (!Number.isFinite(val)) return "—";
      return formatCalcNumber(convertMeasurementUnit(unitCat, val, fromUnit, toUnit));
    } catch {
      return "—";
    }
  }, [unitCat, unitVal, fromUnit, toUnit]);

  const fileSizeResult = useMemo(
    () => convertFileSizeAll(Number(fileSizeInput) || 0, fileSizeUnit, fileStandard),
    [fileSizeInput, fileSizeUnit, fileStandard]
  );

  const imageRatioResult = useMemo(() => {
    const w = Number(imgW) || 1;
    const h = Number(imgH) || 1;
    const d = Number(imgDpi) || 72;
    const info = calculateImageRatioAndPrint(w, h, d);
    const proportionalH = Math.max(1, Math.round(((Number(targetResizeW) || 1) * h) / w));
    return { ...info, proportionalH };
  }, [imgW, imgH, imgDpi, targetResizeW]);

  const numberBaseResult = useMemo(() => {
    try {
      return { data: convertNumberBases(baseInput, fromBase), error: null };
    } catch (err) {
      return {
        data: null,
        error: err instanceof Error ? err.message : "Angka tidak valid.",
      };
    }
  }, [baseInput, fromBase]);

  // #37 Basic & #38 Scientific Calculator UI
  if (tool.id === "basic-calculator" || tool.id === "scientific-calculator") {
    const isScientific = tool.id === "scientific-calculator";
    const appendToken = (t: string) => {
      setCalcError(null);
      setExpr((prev) => prev + t);
    };

    const basicKeys = [
      ["(", ")", "%", "÷"],
      ["7", "8", "9", "×"],
      ["4", "5", "6", "-"],
      ["1", "2", "3", "+"],
      ["0", ".", "^", "="],
    ];

    const sciKeys = [
      ["sin(", "cos(", "tan(", "sqrt("],
      ["asin(", "acos(", "atan(", "log("],
      ["ln(", "abs(", "pi", "e"],
      ["exp(", "!", "(", ")"],
    ];

    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/60 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {isScientific ? (
              <div className="flex items-center gap-1.5">
                {(["deg", "rad"] as AngleMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setAngleMode(mode)}
                    className={cn(
                      "rounded-md border px-2.5 py-1 font-mono text-xs font-semibold uppercase cursor-pointer",
                      angleMode === mode
                        ? "border-[var(--brand-primary)] bg-[var(--brand-subtle-bg)] text-[var(--brand-subtle-fg)]"
                        : "border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-secondary)]"
                    )}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            ) : (
              <span className="text-xs font-medium text-[var(--text-secondary)]">
                Ekspresi &amp; Hasil
              </span>
            )}
            <div className="flex items-center gap-2">
              <CopyButton value={calcOutput} />
              <Button type="button" variant="outline" size="sm" onClick={handleResetTool}>
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Reset</span>
              </Button>
            </div>
          </div>

          <label htmlFor={`${formId}-expr`} className="visually-hidden">
            Ekspresi matematika
          </label>
          <Input
            id={`${formId}-expr`}
            value={expr}
            onChange={(e) => setExpr(e.target.value)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing || e.keyCode === 229) return;
              if (e.key === "Enter") {
                e.preventDefault();
                handleEvaluateExpression();
              }
            }}
            placeholder={isScientific ? "Contoh: sin(30) + sqrt(144)" : "Contoh: (12500 * 4) - 5000"}
            className="font-mono text-base"
          />

          <div className="flex items-baseline justify-between gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-3">
            <span className="text-xs text-[var(--text-muted)]">Hasil</span>
            <output
              htmlFor={`${formId}-expr`}
              className="font-mono text-2xl font-semibold tabular-nums text-[var(--brand-primary)]"
            >
              {calcOutput}
            </output>
          </div>

          {calcError && (
            <p role="alert" className="text-xs font-medium text-[var(--danger-bg)]">
              {calcError}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
          {isScientific && (
            <div className="grid grid-cols-4 gap-2 md:col-span-5">
              {sciKeys.flat().map((key) => (
                <Button
                  key={key}
                  type="button"
                  variant="secondary"
                  onClick={() => appendToken(key)}
                  className="font-mono text-xs"
                >
                  {key}
                </Button>
              ))}
            </div>
          )}

          <div className={cn("space-y-2", isScientific ? "md:col-span-7" : "md:col-span-12")}>
            <div className="grid grid-cols-4 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setExpr("");
                  setCalcOutput("0");
                  setCalcError(null);
                }}
              >
                AC
              </Button>
              <Button
                type="button"
                variant="outline"
                aria-label="Hapus 1 karakter"
                onClick={() => setExpr((prev) => prev.slice(0, -1))}
              >
                <Delete className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => appendToken("(")}
              >
                (
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => appendToken(")")}
              >
                )
              </Button>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {basicKeys.flat().map((key) => (
                <Button
                  key={key}
                  type="button"
                  variant={key === "=" ? "default" : "+-×÷%^".includes(key) ? "secondary" : "outline"}
                  onClick={() => {
                    if (key === "=") handleEvaluateExpression();
                    else appendToken(key);
                  }}
                  className="min-h-11 font-mono text-base font-medium"
                >
                  {key}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {history.length > 0 && (
          <div className="rounded-xl border border-[var(--border-subtle)] p-3 space-y-2">
            <p className="text-xs font-semibold text-[var(--text-secondary)]">
              Riwayat Perhitungan
            </p>
            <ul className="space-y-1 text-xs font-mono">
              {history.map((item, idx) => (
                <li key={idx} className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setExpr(item.expr)}
                    className="truncate text-[var(--text-secondary)] hover:text-[var(--brand-primary)] cursor-pointer"
                  >
                    {item.expr}
                  </button>
                  <span className="font-semibold text-[var(--text-primary)]">= {item.res}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  // #39 Percentage Calculator
  if (tool.id === "percentage-calculator") {
    const fmtIdr = (n: number) =>
      new Intl.NumberFormat("id-ID", { maximumFractionDigits: 4 }).format(n);

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/40 p-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor={`${formId}-pbase`} className="text-xs font-medium">
              Nilai Awal / Harga Dasar
            </label>
            <Input
              id={`${formId}-pbase`}
              type="number"
              value={pctBase}
              onChange={(e) => setPctBase(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor={`${formId}-prate`} className="text-xs font-medium">
              Persentase Hitung (%)
            </label>
            <Input
              id={`${formId}-prate`}
              type="number"
              value={pctRate}
              onChange={(e) => setPctRate(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor={`${formId}-pdisc`} className="text-xs font-medium">
              Diskon (%)
            </label>
            <Input
              id={`${formId}-pdisc`}
              type="number"
              value={pctDiscount}
              onChange={(e) => setPctDiscount(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor={`${formId}-ptax`} className="text-xs font-medium">
              Pajak / PPN (%)
            </label>
            <Input
              id={`${formId}-ptax`}
              type="number"
              value={pctTax}
              onChange={(e) => setPctTax(e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-[var(--border-subtle)] p-3">
            <p className="text-xs text-[var(--text-muted)]">{pctRate || 0}% dari Nilai Dasar</p>
            <p className="mt-1 font-mono text-lg font-semibold">{fmtIdr(pctResult.percentAmount)}</p>
          </div>
          <div className="rounded-xl border border-[var(--border-subtle)] p-3">
            <p className="text-xs text-[var(--text-muted)]">Potongan Diskon</p>
            <p className="mt-1 font-mono text-lg font-semibold">{fmtIdr(pctResult.discountAmount)}</p>
          </div>
          <div className="rounded-xl border border-[var(--border-subtle)] p-3">
            <p className="text-xs text-[var(--text-muted)]">Nominal Pajak ({pctTax || 0}%)</p>
            <p className="mt-1 font-mono text-lg font-semibold">{fmtIdr(pctResult.taxAmount)}</p>
          </div>
          <div className="rounded-xl border border-[var(--brand-subtle-border)] bg-[var(--brand-subtle-bg)]/50 p-3">
            <p className="text-xs text-[var(--brand-subtle-fg)]">Total Akhir</p>
            <p className="mt-1 font-mono text-lg font-bold text-[var(--brand-primary)]">
              {fmtIdr(pctResult.finalPrice)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <CopyButton value={String(pctResult.finalPrice)} label="Copy Total Akhir" />
          <Button type="button" variant="outline" size="sm" onClick={handleResetTool}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Reset</span>
          </Button>
        </div>
      </div>
    );
  }

  // #40 Date Calculator
  if (tool.id === "date-calculator") {
    return (
      <div className="space-y-5">
        <div className="space-y-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/40 p-4">
          <p className="text-xs font-semibold text-[var(--text-primary)]">
            Hitung Selisih Antar Tanggal
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor={`${formId}-dstart`} className="text-xs font-medium">
                Tanggal Mulai
              </label>
              <Input
                id={`${formId}-dstart`}
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor={`${formId}-dend`} className="text-xs font-medium">
                Tanggal Selesai
              </label>
              <Input
                id={`${formId}-dend`}
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          {dateDiffResult.data && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3">
                <p className="text-xs text-[var(--text-muted)]">Total Selisih</p>
                <p className="font-mono text-lg font-semibold text-[var(--brand-primary)]">
                  {dateDiffResult.data.absDays} hari
                </p>
              </div>
              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3">
                <p className="text-xs text-[var(--text-muted)]">Minggu + Hari</p>
                <p className="font-mono text-sm font-semibold">
                  {dateDiffResult.data.weeks} mgg {dateDiffResult.data.remainderDays} hr
                </p>
              </div>
              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3">
                <p className="text-xs text-[var(--text-muted)]">Hari Kerja</p>
                <p className="font-mono text-lg font-semibold">
                  {dateDiffResult.data.weekdays}
                </p>
              </div>
              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3">
                <p className="text-xs text-[var(--text-muted)]">Akhir Pekan</p>
                <p className="font-mono text-lg font-semibold">
                  {dateDiffResult.data.weekends}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/40 p-4">
          <p className="text-xs font-semibold text-[var(--text-primary)]">
            Tambah / Kurangi Hari dari Tanggal
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor={`${formId}-dbase`} className="text-xs font-medium">
                Tanggal Awal
              </label>
              <Input
                id={`${formId}-dbase`}
                type="date"
                value={baseDate}
                onChange={(e) => setBaseDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor={`${formId}-ddelta`} className="text-xs font-medium">
                Tambah/Kurang Hari (pakai minus untuk mundur)
              </label>
              <Input
                id={`${formId}-ddelta`}
                type="number"
                value={deltaDays}
                onChange={(e) => setDeltaDays(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-3">
            <span className="text-xs text-[var(--text-secondary)]">Tanggal Hasil</span>
            <span className="font-mono text-base font-semibold text-[var(--brand-primary)]">
              {addedDateResult}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <CopyButton
            value={`${dateDiffResult.data?.absDays ?? 0} hari | Tanggal hasil: ${addedDateResult}`}
          />
          <Button type="button" variant="outline" size="sm" onClick={handleResetTool}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Reset</span>
          </Button>
        </div>
      </div>
    );
  }

  // #41 Time Calculator
  if (tool.id === "time-calculator") {
    return (
      <div className="space-y-5">
        <div className="space-y-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/40 p-4">
          <p className="text-xs font-semibold">Selisih Waktu &amp; Jam Kerja</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <label htmlFor={`${formId}-ts`} className="text-xs font-medium">
                Jam Mulai
              </label>
              <Input
                id={`${formId}-ts`}
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor={`${formId}-te`} className="text-xs font-medium">
                Jam Selesai
              </label>
              <Input
                id={`${formId}-te`}
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor={`${formId}-tb`} className="text-xs font-medium">
                Istirahat (menit)
              </label>
              <Input
                id={`${formId}-tb`}
                type="number"
                min={0}
                value={breakMinutes}
                onChange={(e) => setBreakMinutes(e.target.value)}
              />
            </div>
          </div>

          {workTimeResult && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3">
                <p className="text-xs text-[var(--text-muted)]">Durasi Bersih</p>
                <p className="font-mono text-lg font-semibold text-[var(--brand-primary)]">
                  {workTimeResult.hours} jam {workTimeResult.minutes} menit
                </p>
              </div>
              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3">
                <p className="text-xs text-[var(--text-muted)]">Total Menit</p>
                <p className="font-mono text-lg font-semibold">
                  {workTimeResult.netMinutes} menit
                </p>
              </div>
              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3">
                <p className="text-xs text-[var(--text-muted)]">Jam Desimal</p>
                <p className="font-mono text-lg font-semibold">
                  {workTimeResult.decimalHours} jam
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/40 p-4">
          <p className="text-xs font-semibold">
            Tambah Durasi ke Jam Mulai ({startTime})
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label htmlFor={`${formId}-ah`} className="text-xs font-medium">
                Jam (+ / -)
              </label>
              <Input
                id={`${formId}-ah`}
                type="number"
                value={addHours}
                onChange={(e) => setAddHours(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor={`${formId}-am`} className="text-xs font-medium">
                Menit (+ / -)
              </label>
              <Input
                id={`${formId}-am`}
                type="number"
                value={addMins}
                onChange={(e) => setAddMins(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-2.5">
            <span className="text-xs text-[var(--text-secondary)]">Waktu Hasil</span>
            <span className="font-mono text-base font-semibold text-[var(--brand-primary)]">
              {addedClockResult}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <CopyButton
            value={
              workTimeResult
                ? `${workTimeResult.hours} jam ${workTimeResult.minutes} menit (${workTimeResult.decimalHours} jam)`
                : addedClockResult
            }
          />
          <Button type="button" variant="outline" size="sm" onClick={handleResetTool}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Reset</span>
          </Button>
        </div>
      </div>
    );
  }

  // #42 Unit Converter
  if (tool.id === "unit-converter") {
    const units = UNIT_DEFINITIONS[unitCat].units;
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(UNIT_DEFINITIONS) as UnitCategory[]).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => {
                setUnitCat(cat);
                const list = UNIT_DEFINITIONS[cat].units;
                setFromUnit(list[0].id);
                setToUnit(list[1]?.id ?? list[0].id);
              }}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs font-medium cursor-pointer",
                unitCat === cat
                  ? "border-[var(--brand-primary)] bg-[var(--brand-subtle-bg)] text-[var(--brand-subtle-fg)]"
                  : "border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-secondary)]"
              )}
            >
              {UNIT_DEFINITIONS[cat].label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/40 p-4 md:grid-cols-11 md:items-end">
          <div className="space-y-1 md:col-span-3">
            <label htmlFor={`${formId}-uval`} className="text-xs font-medium">
              Nilai
            </label>
            <Input
              id={`${formId}-uval`}
              type="number"
              value={unitVal}
              onChange={(e) => setUnitVal(e.target.value)}
            />
          </div>
          <div className="space-y-1 md:col-span-3">
            <label htmlFor={`${formId}-ufrom`} className="text-xs font-medium">
              Dari Satuan
            </label>
            <select
              id={`${formId}-ufrom`}
              value={fromUnit}
              onChange={(e) => setFromUnit(e.target.value)}
              className="min-h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-input)] px-3 py-1.5 text-sm"
            >
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-center md:col-span-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Tukar satuan"
              onClick={() => {
                setFromUnit(toUnit);
                setToUnit(fromUnit);
              }}
            >
              <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
          <div className="space-y-1 md:col-span-4">
            <label htmlFor={`${formId}-uto`} className="text-xs font-medium">
              Ke Satuan
            </label>
            <select
              id={`${formId}-uto`}
              value={toUnit}
              onChange={(e) => setToUnit(e.target.value)}
              className="min-h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-input)] px-3 py-1.5 text-sm"
            >
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--brand-subtle-border)] bg-[var(--brand-subtle-bg)]/50 px-4 py-3">
          <span className="text-xs font-medium text-[var(--brand-subtle-fg)]">
            Hasil Konversi
          </span>
          <span className="font-mono text-2xl font-bold text-[var(--brand-primary)]">
            {unitResult} {toUnit}
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          <CopyButton value={`${unitResult} ${toUnit}`} />
          <Button type="button" variant="outline" size="sm" onClick={handleResetTool}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Reset</span>
          </Button>
        </div>
      </div>
    );
  }

  // #43 File Size Converter
  if (tool.id === "file-size-converter") {
    const units: FileSizeUnit[] = ["B", "KB", "MB", "GB", "TB"];
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/40 p-4 sm:grid-cols-3">
          <div className="space-y-1">
            <label htmlFor={`${formId}-fsval`} className="text-xs font-medium">
              Ukuran File
            </label>
            <Input
              id={`${formId}-fsval`}
              type="number"
              min={0}
              value={fileSizeInput}
              onChange={(e) => setFileSizeInput(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor={`${formId}-fsunit`} className="text-xs font-medium">
              Satuan Awal
            </label>
            <select
              id={`${formId}-fsunit`}
              value={fileSizeUnit}
              onChange={(e) => setFileSizeUnit(e.target.value as FileSizeUnit)}
              className="min-h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-input)] px-3 py-1.5 text-sm"
            >
              {units.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor={`${formId}-fsstd`} className="text-xs font-medium">
              Standar Basis
            </label>
            <select
              id={`${formId}-fsstd`}
              value={fileStandard}
              onChange={(e) => setFileStandard(e.target.value as "binary" | "decimal")}
              className="min-h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-input)] px-3 py-1.5 text-sm"
            >
              <option value="binary">Biner (1024 — OS/RAM)</option>
              <option value="decimal">Desimal (1000 — Storage)</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {units.map((u) => {
            const val = formatCalcNumber(fileSizeResult[u]);
            return (
              <div
                key={u}
                className="flex flex-col justify-between gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3"
              >
                <div>
                  <Badge variant="secondary">{u}</Badge>
                  <p className="mt-2 break-all font-mono text-sm font-semibold text-[var(--text-primary)]">
                    {val}
                  </p>
                </div>
                <CopyButton value={`${val} ${u}`} label="Salin" />
              </div>
            );
          })}
        </div>

        <Button type="button" variant="outline" size="sm" onClick={handleResetTool}>
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Reset</span>
        </Button>
      </div>
    );
  }

  // #44 Image Ratio Calculator
  if (tool.id === "image-ratio-calculator") {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/40 p-4 sm:grid-cols-4">
          <div className="space-y-1">
            <label htmlFor={`${formId}-irw`} className="text-xs font-medium">
              Lebar (px)
            </label>
            <Input
              id={`${formId}-irw`}
              type="number"
              min={1}
              value={imgW}
              onChange={(e) => setImgW(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor={`${formId}-irh`} className="text-xs font-medium">
              Tinggi (px)
            </label>
            <Input
              id={`${formId}-irh`}
              type="number"
              min={1}
              value={imgH}
              onChange={(e) => setImgH(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor={`${formId}-irdpi`} className="text-xs font-medium">
              DPI Cetak
            </label>
            <Input
              id={`${formId}-irdpi`}
              type="number"
              min={1}
              value={imgDpi}
              onChange={(e) => setImgDpi(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor={`${formId}-irtw`} className="text-xs font-medium">
              Skala Lebar Baru (px)
            </label>
            <Input
              id={`${formId}-irtw`}
              type="number"
              min={1}
              value={targetResizeW}
              onChange={(e) => setTargetResizeW(e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-[var(--border-subtle)] p-3">
            <p className="text-xs text-[var(--text-muted)]">Rasio Aspek</p>
            <p className="mt-1 font-mono text-xl font-bold text-[var(--brand-primary)]">
              {imageRatioResult.ratioLabel}
            </p>
            <p className="font-mono text-xs text-[var(--text-secondary)]">
              ({imageRatioResult.decimalRatio}:1)
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border-subtle)] p-3">
            <p className="text-xs text-[var(--text-muted)]">Resolusi Total</p>
            <p className="mt-1 font-mono text-lg font-semibold">
              {imageRatioResult.megapixels} MP
            </p>
            <p className="font-mono text-xs text-[var(--text-secondary)]">
              {imageRatioResult.totalPixels.toLocaleString("id-ID")} piksel
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border-subtle)] p-3">
            <p className="text-xs text-[var(--text-muted)]">Ukuran Cetak ({imgDpi} DPI)</p>
            <p className="mt-1 font-mono text-sm font-semibold">
              {imageRatioResult.widthCm} × {imageRatioResult.heightCm} cm
            </p>
            <p className="font-mono text-xs text-[var(--text-secondary)]">
              {imageRatioResult.widthInches} × {imageRatioResult.heightInches} in
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border-subtle)] p-3">
            <p className="text-xs text-[var(--text-muted)]">Dimensi Proporsional</p>
            <p className="mt-1 font-mono text-lg font-semibold">
              {targetResizeW} × {imageRatioResult.proportionalH} px
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <CopyButton
            value={`Rasio ${imageRatioResult.ratioLabel}, ${imageRatioResult.widthCm} x ${imageRatioResult.heightCm} cm @ ${imgDpi} DPI`}
          />
          <Button type="button" variant="outline" size="sm" onClick={handleResetTool}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Reset</span>
          </Button>
        </div>
      </div>
    );
  }

  // #45 Number Base Converter
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/40 p-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor={`${formId}-nbval`} className="text-xs font-medium">
            Nilai Bilangan
          </label>
          <Input
            id={`${formId}-nbval`}
            value={baseInput}
            onChange={(e) => setBaseInput(e.target.value)}
            className="font-mono"
            placeholder="Masukkan angka..."
          />
        </div>
        <div className="space-y-1">
          <label htmlFor={`${formId}-nbfrom`} className="text-xs font-medium">
            Basis Asal
          </label>
          <select
            id={`${formId}-nbfrom`}
            value={fromBase}
            onChange={(e) => setFromBase(Number(e.target.value) as 2 | 8 | 10 | 16)}
            className="min-h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-input)] px-3 py-1.5 text-sm"
          >
            <option value={10}>Desimal (Basis 10)</option>
            <option value={2}>Biner (Basis 2)</option>
            <option value={8}>Oktal (Basis 8)</option>
            <option value={16}>Heksadesimal (Basis 16)</option>
          </select>
        </div>
      </div>

      {numberBaseResult.error && (
        <p role="alert" className="text-xs font-medium text-[var(--danger-bg)]">
          {numberBaseResult.error}
        </p>
      )}

      {numberBaseResult.data && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(
            [
              ["Desimal (Base 10)", numberBaseResult.data.decimal],
              ["Biner (Base 2)", numberBaseResult.data.binary],
              ["Oktal (Base 8)", numberBaseResult.data.octal],
              ["Heksadesimal (Base 16)", numberBaseResult.data.hexadecimal],
            ] as const
          ).map(([title, val]) => (
            <div
              key={title}
              className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3"
            >
              <div className="min-w-0">
                <p className="text-xs text-[var(--text-muted)]">{title}</p>
                <p className="mt-1 break-all font-mono text-base font-semibold text-[var(--text-primary)]">
                  {val}
                </p>
              </div>
              <CopyButton value={val} label="Salin" />
            </div>
          ))}
        </div>
      )}

      <Button type="button" variant="outline" size="sm" onClick={handleResetTool}>
        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Reset</span>
      </Button>
    </div>
  );
}
