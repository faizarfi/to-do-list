// Pure calculations for Business & Finance Tools (#96-#100) + Calculator extensions (#67-#71).

export function calculateAgeAndTenure(startIso: string, referenceIso: string) {
  const start = new Date(`${startIso}T00:00:00`);
  const ref = new Date(`${referenceIso}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(ref.getTime())) {
    throw new Error("Tanggal tidak valid.");
  }
  if (ref < start) {
    throw new Error("Tanggal acuan harus lebih besar atau sama dengan tanggal mulai.");
  }

  let years = ref.getFullYear() - start.getFullYear();
  let months = ref.getMonth() - start.getMonth();
  let days = ref.getDate() - start.getDate();

  if (days < 0) {
    months -= 1;
    const prevMonthLastDay = new Date(ref.getFullYear(), ref.getMonth(), 0).getDate();
    days += prevMonthLastDay;
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  const totalDays = Math.round((ref.getTime() - start.getTime()) / 86_400_000);
  const nextAnniversary = new Date(ref.getFullYear(), start.getMonth(), start.getDate());
  if (nextAnniversary <= ref) {
    nextAnniversary.setFullYear(ref.getFullYear() + 1);
  }
  const daysToNextAnniv = Math.round(
    (nextAnniversary.getTime() - ref.getTime()) / 86_400_000
  );

  return {
    years,
    months,
    days,
    totalMonths: years * 12 + months,
    totalDays,
    daysToNextAnniv,
  };
}

export function calculateBandwidthAndTransfer(
  fileSizeGb: number,
  speedMbps: number
) {
  const safeSizeGb = Math.max(0, fileSizeGb);
  const safeMbps = Math.max(0.01, speedMbps);
  const megaBytesPerSec = safeMbps / 8;
  const totalMegabits = safeSizeGb * 1024 * 8;
  const seconds = totalMegabits / safeMbps;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remSecs = Math.round(seconds % 60);
  return {
    mbps: safeMbps,
    mbPerSec: Number(megaBytesPerSec.toFixed(2)),
    gbPerHour: Number(((megaBytesPerSec * 3600) / 1024).toFixed(2)),
    estimatedSeconds: Math.round(seconds),
    formattedDuration:
      hours > 0
        ? `${hours} jam ${minutes} menit ${remSecs} detik`
        : minutes > 0
          ? `${minutes} menit ${remSecs} detik`
          : `${remSecs} detik`,
  };
}

export function convertTypographyUnit(
  value: number,
  fromUnit: "px" | "rem" | "em" | "pt" | "percent",
  basePx: number = 16
) {
  const safeBase = Math.max(1, basePx);
  const px =
    fromUnit === "px"
      ? value
      : fromUnit === "rem" || fromUnit === "em"
        ? value * safeBase
        : fromUnit === "pt"
          ? value * (96 / 72)
          : (value / 100) * safeBase;

  return {
    px: Number(px.toFixed(3)),
    rem: Number((px / safeBase).toFixed(4)),
    em: Number((px / safeBase).toFixed(4)),
    pt: Number((px * (72 / 96)).toFixed(3)),
    percent: Number(((px / safeBase) * 100).toFixed(2)),
  };
}

export function calculateBmiAndCalorie(params: {
  gender: "male" | "female";
  ageYears: number;
  weightKg: number;
  heightCm: number;
  activityFactor: number;
}) {
  const hMeters = Math.max(0.5, params.heightCm / 100);
  const bmi = params.weightKg / (hMeters * hMeters);
  const category =
    bmi < 18.5
      ? "Berat Badan Kurang"
      : bmi < 25
        ? "Ideal / Normal"
        : bmi < 30
          ? "Berat Badan Berlebih"
          : "Obesitas";
  // Mifflin-St Jeor equation
  const s = params.gender === "male" ? 5 : -161;
  const bmr = 10 * params.weightKg + 6.25 * params.heightCm - 5 * params.ageYears + s;
  const tdee = bmr * params.activityFactor;
  return {
    bmi: Number(bmi.toFixed(1)),
    category,
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    deficit500: Math.max(1200, Math.round(tdee - 500)),
    surplus300: Math.round(tdee + 300),
  };
}

export function calculateProfitMargin(params: {
  costPrice: number;
  sellingPrice: number;
  otherFeePercent: number;
  units: number;
}) {
  const netRevenuePerUnit = params.sellingPrice * (1 - params.otherFeePercent / 100);
  const profitPerUnit = netRevenuePerUnit - params.costPrice;
  const marginPct =
    params.sellingPrice > 0 ? (profitPerUnit / params.sellingPrice) * 100 : 0;
  const markupPct = params.costPrice > 0 ? (profitPerUnit / params.costPrice) * 100 : 0;
  return {
    netRevenuePerUnit: Math.round(netRevenuePerUnit),
    profitPerUnit: Math.round(profitPerUnit),
    marginPct: Number(marginPct.toFixed(2)),
    markupPct: Number(markupPct.toFixed(2)),
    totalRevenue: Math.round(params.sellingPrice * params.units),
    totalProfit: Math.round(profitPerUnit * params.units),
  };
}

export function calculateLoanSimulation(params: {
  principal: number;
  annualRatePercent: number;
  months: number;
  mode: "effective" | "flat";
}) {
  const p = Math.max(0, params.principal);
  const n = Math.max(1, Math.round(params.months));
  const r = Math.max(0, params.annualRatePercent) / 100 / 12;

  const schedule: {
    month: number;
    payment: number;
    principalPart: number;
    interestPart: number;
    remainingBalance: number;
  }[] = [];

  if (params.mode === "flat" || r === 0) {
    const monthlyPrincipal = p / n;
    const monthlyInterest = p * r;
    const monthlyPayment = monthlyPrincipal + monthlyInterest;
    let balance = p;
    for (let m = 1; m <= n; m += 1) {
      balance = Math.max(0, balance - monthlyPrincipal);
      schedule.push({
        month: m,
        payment: Math.round(monthlyPayment),
        principalPart: Math.round(monthlyPrincipal),
        interestPart: Math.round(monthlyInterest),
        remainingBalance: Math.round(balance),
      });
    }
    return {
      monthlyPayment: Math.round(monthlyPayment),
      totalInterest: Math.round(monthlyInterest * n),
      totalPayment: Math.round(monthlyPayment * n),
      schedule,
    };
  }

  // Annuity (effective declining balance)
  const factor = Math.pow(1 + r, n);
  const monthlyPayment = (p * r * factor) / (factor - 1);
  let balance = p;
  let totalInterest = 0;

  for (let m = 1; m <= n; m += 1) {
    const interestPart = balance * r;
    const principalPart = Math.min(balance, monthlyPayment - interestPart);
    balance = Math.max(0, balance - principalPart);
    totalInterest += interestPart;
    schedule.push({
      month: m,
      payment: Math.round(monthlyPayment),
      principalPart: Math.round(principalPart),
      interestPart: Math.round(interestPart),
      remainingBalance: Math.round(balance),
    });
  }

  return {
    monthlyPayment: Math.round(monthlyPayment),
    totalInterest: Math.round(totalInterest),
    totalPayment: Math.round(monthlyPayment * n),
    schedule,
  };
}

export function calculateIndonesiaTax(params: {
  amount: number;
  ppnRatePercent: number;
  priceIncludesPpn: boolean;
  pphRatePercent: number;
}) {
  const ratePpn = params.ppnRatePercent / 100;
  const dpp = params.priceIncludesPpn
    ? params.amount / (1 + ratePpn)
    : params.amount;
  const ppnAmount = dpp * ratePpn;
  const grossWithPpn = dpp + ppnAmount;
  const pphWithheld = dpp * (params.pphRatePercent / 100);
  const netReceived = grossWithPpn - pphWithheld;
  return {
    dpp: Math.round(dpp),
    ppnAmount: Math.round(ppnAmount),
    grossWithPpn: Math.round(grossWithPpn),
    pphWithheld: Math.round(pphWithheld),
    netReceived: Math.round(netReceived),
  };
}

