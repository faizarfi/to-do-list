"use client";

import { useId, useMemo, useState } from "react";
import { Check, Copy, Download, RotateCcw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  calculateIndonesiaTax,
  calculateLoanSimulation,
  calculateProfitMargin,
} from "@/lib/business-calculators";
import { cn } from "@/lib/utils";
import type { ToolDefinition } from "@/types/tools";

function formatIdr(value: number): string {
  return `Rp ${Math.round(value).toLocaleString("id-ID")}`;
}

function downloadCsv(filename: string, lines: string[]): void {
  const blob = new Blob([`\uFEFF${lines.join("\r\n")}`], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function BusinessWorkspace({ tool }: { tool: ToolDefinition }) {
  const formId = useId();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // #96 Profit Margin Calculator
  const [costPrice, setCostPrice] = useState("65000");
  const [sellingPrice, setSellingPrice] = useState("115000");
  const [otherFeePct, setOtherFeePct] = useState("6.5");
  const [unitQty, setUnitQty] = useState("100");

  // #97 Loan / KPR Simulator
  const [loanPrincipal, setLoanPrincipal] = useState("350000000");
  const [loanRate, setLoanRate] = useState("7.5");
  const [loanMonths, setLoanMonths] = useState("120");
  const [loanMode, setLoanMode] = useState<"effective" | "flat">("effective");

  // #98 Indonesia Tax Calculator (PPN & PPh)
  const [taxAmount, setTaxAmount] = useState("10000000");
  const [ppnRate, setPpnRate] = useState("11");
  const [includesPpn, setIncludesPpn] = useState(false);
  const [pphRate, setPphRate] = useState("2");

  // #99 Break-Even Calculator
  const [bepFixed, setBepFixed] = useState("15000000");
  const [bepVariable, setBepVariable] = useState("45000");
  const [bepPrice, setBepPrice] = useState("95000");
  const [bepTargetProfit, setBepTargetProfit] = useState("10000000");

  // #100 Bill Splitter
  const [billBase, setBillBase] = useState("485000");
  const [billTaxPct, setBillTaxPct] = useState("10");
  const [billServicePct, setBillServicePct] = useState("5");
  const [billDiscount, setBillDiscount] = useState("0");
  const [billPeople, setBillPeople] = useState("4");
  const [billRound1k, setBillRound1k] = useState(true);

  async function copyText(key: string, val: string) {
    if (!val) return;
    try {
      await navigator.clipboard.writeText(val);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(null), 1800);
    } catch {
      // Ignore clipboard failures
    }
  }

  const marginResult = useMemo(
    () =>
      calculateProfitMargin({
        costPrice: Math.max(0, Number(costPrice) || 0),
        sellingPrice: Math.max(0, Number(sellingPrice) || 0),
        otherFeePercent: Math.max(0, Math.min(99, Number(otherFeePct) || 0)),
        units: Math.max(1, Number(unitQty) || 1),
      }),
    [costPrice, sellingPrice, otherFeePct, unitQty]
  );

  const loanResult = useMemo(
    () =>
      calculateLoanSimulation({
        principal: Math.max(0, Number(loanPrincipal) || 0),
        annualRatePercent: Math.max(0, Number(loanRate) || 0),
        months: Math.max(1, Math.min(480, Number(loanMonths) || 12)),
        mode: loanMode,
      }),
    [loanPrincipal, loanRate, loanMonths, loanMode]
  );

  const taxResult = useMemo(
    () =>
      calculateIndonesiaTax({
        amount: Math.max(0, Number(taxAmount) || 0),
        ppnRatePercent: Math.max(0, Number(ppnRate) || 0),
        priceIncludesPpn: includesPpn,
        pphRatePercent: Math.max(0, Number(pphRate) || 0),
      }),
    [taxAmount, ppnRate, includesPpn, pphRate]
  );

  const bepResult = useMemo(() => {
    const fixed = Math.max(0, Number(bepFixed) || 0);
    const variable = Math.max(0, Number(bepVariable) || 0);
    const price = Math.max(0, Number(bepPrice) || 0);
    const targetProfit = Math.max(0, Number(bepTargetProfit) || 0);
    const contribution = price - variable;
    if (contribution <= 0) {
      return { valid: false as const, contribution };
    }
    const bepUnits = Math.ceil(fixed / contribution);
    const bepRevenue = bepUnits * price;
    const contribRatio = price > 0 ? (contribution / price) * 100 : 0;
    const targetUnits = Math.ceil((fixed + targetProfit) / contribution);
    return {
      valid: true as const,
      contribution,
      contribRatio: Number(contribRatio.toFixed(1)),
      bepUnits,
      bepRevenue,
      targetUnits,
      targetRevenue: targetUnits * price,
    };
  }, [bepFixed, bepVariable, bepPrice, bepTargetProfit]);

  const billResult = useMemo(() => {
    const base = Math.max(0, Number(billBase) || 0);
    const disc = Math.max(0, Number(billDiscount) || 0);
    const afterDisc = Math.max(0, base - disc);
    const service = afterDisc * (Math.max(0, Number(billServicePct) || 0) / 100);
    const tax = (afterDisc + service) * (Math.max(0, Number(billTaxPct) || 0) / 100);
    const grandTotal = afterDisc + service + tax;
    const people = Math.max(1, Math.round(Number(billPeople) || 1));
    const exactPerPerson = grandTotal / people;
    const roundedPerPerson = billRound1k
      ? Math.ceil(exactPerPerson / 1000) * 1000
      : Math.round(exactPerPerson);
    return {
      afterDisc,
      service,
      tax,
      grandTotal,
      people,
      exactPerPerson,
      roundedPerPerson,
    };
  }, [billBase, billDiscount, billServicePct, billTaxPct, billPeople, billRound1k]);

  // =========================================================================
  // #96 KALKULATOR MARGIN, MARKUP & LABA USAHA
  // =========================================================================
  if (tool.id === "profit-margin-calculator") {
    const summaryText = `Harga Jual: ${formatIdr(
      Number(sellingPrice) || 0
    )} | HPP: ${formatIdr(Number(costPrice) || 0)} | Biaya Admin: ${otherFeePct}% -> Laba/Unit: ${formatIdr(
      marginResult.profitPerUnit
    )} (Margin ${marginResult.marginPct}%, Markup ${marginResult.markupPct}%) | Estimasi ${unitQty} unit: Laba ${formatIdr(
      marginResult.totalProfit
    )}`;

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor={`${formId}-cost`} className="block text-xs font-medium text-[var(--text-secondary)]">
              Modal / HPP per Unit (Rp)
            </label>
            <Input
              id={`${formId}-cost`}
              type="number"
              min="0"
              value={costPrice}
              onChange={(e) => setCostPrice(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <label htmlFor={`${formId}-sell`} className="block text-xs font-medium text-[var(--text-secondary)]">
              Harga Jual per Unit (Rp)
            </label>
            <Input
              id={`${formId}-sell`}
              type="number"
              min="0"
              value={sellingPrice}
              onChange={(e) => setSellingPrice(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <label htmlFor={`${formId}-fee`} className="block text-xs font-medium text-[var(--text-secondary)]">
              Biaya Platform / Admin (%)
            </label>
            <Input
              id={`${formId}-fee`}
              type="number"
              min="0"
              max="99"
              step="0.5"
              value={otherFeePct}
              onChange={(e) => setOtherFeePct(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <label htmlFor={`${formId}-units`} className="block text-xs font-medium text-[var(--text-secondary)]">
              Volume Penjualan (Unit)
            </label>
            <Input
              id={`${formId}-units`}
              type="number"
              min="1"
              value={unitQty}
              onChange={(e) => setUnitQty(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl border border-[var(--brand-primary)]/30 bg-[var(--brand-soft)]/50 p-4">
            <p className="text-xs font-medium text-[var(--brand-primary)]">Laba Bersih / Unit</p>
            <p
              className={cn(
                "mt-1 text-2xl font-bold",
                marginResult.profitPerUnit < 0
                  ? "text-red-600 dark:text-red-400"
                  : "text-[var(--text-primary)]"
              )}
            >
              {formatIdr(marginResult.profitPerUnit)}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4">
            <p className="text-xs text-[var(--text-muted)]">Margin Laba vs Markup</p>
            <p className="mt-1 text-lg font-bold text-[var(--text-primary)]">
              Margin {marginResult.marginPct}%{" "}
              <span className="text-xs font-normal text-[var(--text-secondary)]">
                (Markup {marginResult.markupPct}%)
              </span>
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4">
            <p className="text-xs text-[var(--text-muted)]">
              Total Laba ({unitQty} Unit)
            </p>
            <p className="mt-1 text-lg font-bold text-[var(--brand-primary)]">
              {formatIdr(marginResult.totalProfit)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void copyText("margin", summaryText)}
          >
            {copiedKey === "margin" ? (
              <Check className="h-3.5 w-3.5 text-[var(--brand-primary)]" aria-hidden="true" />
            ) : (
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            <span>{copiedKey === "margin" ? "Tersalin!" : "Salin Ringkasan"}</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setCostPrice("65000");
              setSellingPrice("115000");
              setOtherFeePct("6.5");
              setUnitQty("100");
            }}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Reset</span>
          </Button>
        </div>
      </div>
    );
  }

  // =========================================================================
  // #97 SIMULATOR CICILAN PINJAMAN & KPR
  // =========================================================================
  if (tool.id === "loan-kpr-simulator") {
    const csvLines = [
      "Bulan,Angsuran,Pokok,Bunga,Sisa Pokok",
      ...loanResult.schedule.map(
        (r) =>
          `${r.month},${r.payment},${r.principalPart},${r.interestPart},${r.remainingBalance}`
      ),
    ];

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor={`${formId}-lprin`} className="block text-xs font-medium text-[var(--text-secondary)]">
              Plafon Pinjaman (Rp)
            </label>
            <Input
              id={`${formId}-lprin`}
              type="number"
              min="0"
              step="1000000"
              value={loanPrincipal}
              onChange={(e) => setLoanPrincipal(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <label htmlFor={`${formId}-lrate`} className="block text-xs font-medium text-[var(--text-secondary)]">
              Suku Bunga / Tahun (%)
            </label>
            <Input
              id={`${formId}-lrate`}
              type="number"
              min="0"
              max="60"
              step="0.25"
              value={loanRate}
              onChange={(e) => setLoanRate(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <label htmlFor={`${formId}-lmon`} className="block text-xs font-medium text-[var(--text-secondary)]">
              Tenor (Bulan)
            </label>
            <Input
              id={`${formId}-lmon`}
              type="number"
              min="1"
              max="480"
              value={loanMonths}
              onChange={(e) => setLoanMonths(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <label htmlFor={`${formId}-lmode`} className="block text-xs font-medium text-[var(--text-secondary)]">
              Perhitungan Bunga
            </label>
            <select
              id={`${formId}-lmode`}
              value={loanMode}
              onChange={(e) => setLoanMode(e.target.value as "effective" | "flat")}
              className="mt-1 h-10 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 text-sm"
            >
              <option value="effective">Efektif / Anuitas (KPR)</option>
              <option value="flat">Bunga Flat</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-[var(--brand-primary)]/30 bg-[var(--brand-soft)]/50 p-4">
            <p className="text-xs font-medium text-[var(--brand-primary)]">Angsuran per Bulan</p>
            <p className="mt-1 text-2xl font-bold text-[var(--text-primary)]">
              {formatIdr(loanResult.monthlyPayment)}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4">
            <p className="text-xs text-[var(--text-muted)]">Total Bunga Dibayar</p>
            <p className="mt-1 text-lg font-bold text-[var(--text-primary)]">
              {formatIdr(loanResult.totalInterest)}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4">
            <p className="text-xs text-[var(--text-muted)]">Total Pengembalian</p>
            <p className="mt-1 text-lg font-bold text-[var(--text-primary)]">
              {formatIdr(loanResult.totalPayment)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold text-[var(--text-secondary)]">
            Jadwal Amortisasi ({loanResult.schedule.length} Bulan)
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => downloadCsv("simulasi-angsuran.csv", csvLines)}
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Unduh Jadwal CSV</span>
          </Button>
        </div>

        <div
          role="region"
          aria-label="Tabel jadwal cicilan pinjaman"
          tabIndex={0}
          className="max-h-64 overflow-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)]"
        >
          <table className="w-full text-left font-mono text-xs">
            <thead className="sticky top-0 border-b border-[var(--border-subtle)] bg-[var(--surface-muted)]">
              <tr>
                <th className="px-3 py-2">Bln</th>
                <th className="px-3 py-2">Angsuran</th>
                <th className="px-3 py-2">Pokok</th>
                <th className="px-3 py-2">Bunga</th>
                <th className="px-3 py-2">Sisa Pokok</th>
              </tr>
            </thead>
            <tbody>
              {loanResult.schedule.slice(0, 120).map((row) => (
                <tr key={row.month} className="border-b border-[var(--border-subtle)]/50 last:border-b-0">
                  <td className="px-3 py-1.5">{row.month}</td>
                  <td className="px-3 py-1.5 font-semibold">{formatIdr(row.payment)}</td>
                  <td className="px-3 py-1.5">{formatIdr(row.principalPart)}</td>
                  <td className="px-3 py-1.5 text-[var(--text-secondary)]">{formatIdr(row.interestPart)}</td>
                  <td className="px-3 py-1.5">{formatIdr(row.remainingBalance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // =========================================================================
  // #98 KALKULATOR PAJAK PPN & PPH INDONESIA
  // =========================================================================
  if (tool.id === "indonesia-tax-calculator") {
    const summaryText = `DPP: ${formatIdr(taxResult.dpp)} | PPN (${ppnRate}%): ${formatIdr(
      taxResult.ppnAmount
    )} | Total Bruto + PPN: ${formatIdr(taxResult.grossWithPpn)} | PPh Potong (${pphRate}%): ${formatIdr(
      taxResult.pphWithheld
    )} | Diterima Bersih: ${formatIdr(taxResult.netReceived)}`;

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor={`${formId}-tamt`} className="block text-xs font-medium text-[var(--text-secondary)]">
              Nominal Nilai Kontrak / Harga (Rp)
            </label>
            <Input
              id={`${formId}-tamt`}
              type="number"
              min="0"
              value={taxAmount}
              onChange={(e) => setTaxAmount(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <label htmlFor={`${formId}-tppn`} className="block text-xs font-medium text-[var(--text-secondary)]">
              Tarif PPN (%)
            </label>
            <select
              id={`${formId}-tppn`}
              value={ppnRate}
              onChange={(e) => setPpnRate(e.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 text-sm"
            >
              <option value="11">11% (PPN Umum)</option>
              <option value="12">12% (Tarif Barang Mewah/Khusus)</option>
              <option value="0">0% (Bebas PPN / Non-PKP)</option>
            </select>
          </div>
          <div>
            <label htmlFor={`${formId}-tpph`} className="block text-xs font-medium text-[var(--text-secondary)]">
              Tarif Pemotongan PPh (%)
            </label>
            <select
              id={`${formId}-tpph`}
              value={pphRate}
              onChange={(e) => setPphRate(e.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 text-sm"
            >
              <option value="2">2% (PPh 23 Jasa)</option>
              <option value="1.5">1.5% (PPh 22 Pengadaan)</option>
              <option value="0.5">0.5% (PP 55 UMKM Final)</option>
              <option value="10">10% (PPh 4(2) Sewa Tanah/Bangunan)</option>
              <option value="0">0% (Tanpa Potong PPh)</option>
            </select>
          </div>
          <label className="flex items-end gap-2 pb-2.5 text-xs font-medium text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={includesPpn}
              onChange={(e) => setIncludesPpn(e.target.checked)}
              className="h-4 w-4 rounded"
            />
            <span>Harga sudah termasuk PPN</span>
          </label>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            ["DPP (Dasar Pengenaan)", taxResult.dpp],
            [`PPN (${ppnRate}%)`, taxResult.ppnAmount],
            ["Total Bruto + PPN", taxResult.grossWithPpn],
            [`Potongan PPh (${pphRate}%)`, taxResult.pphWithheld],
            ["Diterima Bersih", taxResult.netReceived],
          ].map(([label, val], idx) => (
            <div
              key={String(label)}
              className={cn(
                "rounded-xl border p-3.5",
                idx === 4
                  ? "border-[var(--brand-primary)]/30 bg-[var(--brand-soft)]/50"
                  : "border-[var(--border-subtle)] bg-[var(--surface-card)]"
              )}
            >
              <p className="text-[11px] text-[var(--text-muted)]">{label}</p>
              <p className="mt-1 font-mono text-base font-bold text-[var(--text-primary)]">
                {formatIdr(Number(val))}
              </p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void copyText("tax", summaryText)}
          >
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{copiedKey === "tax" ? "Tersalin!" : "Salin Rincian Pajak"}</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setTaxAmount("10000000");
              setPpnRate("11");
              setIncludesPpn(false);
              setPphRate("2");
            }}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Reset</span>
          </Button>
        </div>
      </div>
    );
  }

  // =========================================================================
  // #99 KALKULATOR BREAK-EVEN POINT (BEP)
  // =========================================================================
  if (tool.id === "break-even-calculator") {
    const summaryText = bepResult.valid
      ? `BEP: ${bepResult.bepUnits} unit (${formatIdr(bepResult.bepRevenue)}) | Target Laba ${formatIdr(
          Number(bepTargetProfit) || 0
        )}: ${bepResult.targetUnits} unit`
      : "";

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor={`${formId}-bfix`} className="block text-xs font-medium text-[var(--text-secondary)]">
              Biaya Tetap / Bulan (Rp)
            </label>
            <Input
              id={`${formId}-bfix`}
              type="number"
              min="0"
              value={bepFixed}
              onChange={(e) => setBepFixed(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <label htmlFor={`${formId}-bvar`} className="block text-xs font-medium text-[var(--text-secondary)]">
              Biaya Variabel / Unit (Rp)
            </label>
            <Input
              id={`${formId}-bvar`}
              type="number"
              min="0"
              value={bepVariable}
              onChange={(e) => setBepVariable(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <label htmlFor={`${formId}-bprc`} className="block text-xs font-medium text-[var(--text-secondary)]">
              Harga Jual / Unit (Rp)
            </label>
            <Input
              id={`${formId}-bprc`}
              type="number"
              min="0"
              value={bepPrice}
              onChange={(e) => setBepPrice(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <label htmlFor={`${formId}-btgt`} className="block text-xs font-medium text-[var(--text-secondary)]">
              Target Laba Bulanan (Rp)
            </label>
            <Input
              id={`${formId}-btgt`}
              type="number"
              min="0"
              value={bepTargetProfit}
              onChange={(e) => setBepTargetProfit(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>

        {!bepResult.valid ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
            Harga jual per unit harus lebih besar daripada biaya variabel per unit agar usaha dapat mencapai titik impas (BEP).
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-[var(--brand-primary)]/30 bg-[var(--brand-soft)]/50 p-4">
              <p className="text-xs font-medium text-[var(--brand-primary)]">BEP (Titik Impas Unit)</p>
              <p className="mt-1 text-2xl font-bold text-[var(--text-primary)]">
                {bepResult.bepUnits.toLocaleString("id-ID")} unit
              </p>
            </div>
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4">
              <p className="text-xs text-[var(--text-muted)]">BEP Omzet Minimum</p>
              <p className="mt-1 text-lg font-bold text-[var(--text-primary)]">
                {formatIdr(bepResult.bepRevenue)}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4">
              <p className="text-xs text-[var(--text-muted)]">Margin Kontribusi / Unit</p>
              <p className="mt-1 text-lg font-bold text-[var(--text-primary)]">
                {formatIdr(bepResult.contribution)}{" "}
                <span className="text-xs font-normal">({bepResult.contribRatio}%)</span>
              </p>
            </div>
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4">
              <p className="text-xs text-[var(--text-muted)]">Unit untuk Target Laba</p>
              <p className="mt-1 text-lg font-bold text-[var(--brand-primary)]">
                {bepResult.targetUnits.toLocaleString("id-ID")} unit
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!bepResult.valid}
            onClick={() => void copyText("bep", summaryText)}
          >
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{copiedKey === "bep" ? "Tersalin!" : "Salin Hasil BEP"}</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setBepFixed("15000000");
              setBepVariable("45000");
              setBepPrice("95000");
              setBepTargetProfit("10000000");
            }}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Reset</span>
          </Button>
        </div>
      </div>
    );
  }

  // =========================================================================
  // #100 KALKULATOR PATUNGAN & BAGI TAGIHAN (BILL SPLITTER)
  // =========================================================================
  const billShareMessage = `Ringkasan Patungan Tagihan:
- Subtotal setelah diskon: ${formatIdr(billResult.afterDisc)}
- Service (${billServicePct}%): ${formatIdr(billResult.service)}
- Pajak/PB1 (${billTaxPct}%): ${formatIdr(billResult.tax)}
- Total Akhir: ${formatIdr(billResult.grandTotal)}
- Dibagi ${billResult.people} orang = *${formatIdr(billResult.roundedPerPerson)} / orang*`;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <label htmlFor={`${formId}-sbase`} className="block text-xs font-medium text-[var(--text-secondary)]">
            Total Struk Sebelum Pajak (Rp)
          </label>
          <Input
            id={`${formId}-sbase`}
            type="number"
            min="0"
            value={billBase}
            onChange={(e) => setBillBase(e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <label htmlFor={`${formId}-sdisc`} className="block text-xs font-medium text-[var(--text-secondary)]">
            Diskon / Promo (Rp)
          </label>
          <Input
            id={`${formId}-sdisc`}
            type="number"
            min="0"
            value={billDiscount}
            onChange={(e) => setBillDiscount(e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <label htmlFor={`${formId}-ssvc`} className="block text-xs font-medium text-[var(--text-secondary)]">
            Service / Tip (%)
          </label>
          <Input
            id={`${formId}-ssvc`}
            type="number"
            min="0"
            step="0.5"
            value={billServicePct}
            onChange={(e) => setBillServicePct(e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <label htmlFor={`${formId}-stax`} className="block text-xs font-medium text-[var(--text-secondary)]">
            Pajak / PB1 (%)
          </label>
          <Input
            id={`${formId}-stax`}
            type="number"
            min="0"
            step="0.5"
            value={billTaxPct}
            onChange={(e) => setBillTaxPct(e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <label htmlFor={`${formId}-sppl`} className="block text-xs font-medium text-[var(--text-secondary)]">
            Jumlah Orang
          </label>
          <Input
            id={`${formId}-sppl`}
            type="number"
            min="1"
            max="100"
            value={billPeople}
            onChange={(e) => setBillPeople(e.target.value)}
            className="mt-1"
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
        <input
          type="checkbox"
          checked={billRound1k}
          onChange={(e) => setBillRound1k(e.target.checked)}
          className="h-4 w-4 rounded"
        />
        <span>Bulatkan ke atas per Rp 1.000 agar mudah ditransfer</span>
      </label>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-[var(--brand-primary)]/30 bg-[var(--brand-soft)]/50 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-[var(--brand-primary)]">Patungan per Orang</p>
            <Badge variant="success">{billResult.people} Orang</Badge>
          </div>
          <p className="mt-1 text-2xl font-bold text-[var(--text-primary)]">
            {formatIdr(billResult.roundedPerPerson)}
          </p>
          {billRound1k && (
            <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
              Hitungan tepat: {formatIdr(billResult.exactPerPerson)}
            </p>
          )}
        </div>
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4">
          <p className="text-xs text-[var(--text-muted)]">Service + Pajak Total</p>
          <p className="mt-1 text-lg font-bold text-[var(--text-primary)]">
            {formatIdr(billResult.service + billResult.tax)}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4">
          <p className="text-xs text-[var(--text-muted)]">Grand Total Tagihan</p>
          <p className="mt-1 text-lg font-bold text-[var(--text-primary)]">
            {formatIdr(billResult.grandTotal)}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void copyText("bill", billShareMessage)}
        >
          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{copiedKey === "bill" ? "Siap Tempel di Chat!" : "Salin Info Patungan"}</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setBillBase("485000");
            setBillTaxPct("10");
            setBillServicePct("5");
            setBillDiscount("0");
            setBillPeople("4");
            setBillRound1k(true);
          }}
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Reset</span>
        </Button>
      </div>
    </div>
  );
}
