export type AngleMode = "deg" | "rad";
export type UnitCategory = "length" | "weight" | "temperature" | "area" | "volume";

interface Token {
  type: "num" | "op" | "fn" | "lparen" | "rparen";
  value: string;
}

const PRECEDENCE: Record<string, number> = {
  "+": 1,
  "-": 1,
  "*": 2,
  "/": 2,
  "%": 2,
  "u-": 3,
  "^": 4,
};

const RIGHT_ASSOC = new Set(["^", "u-"]);

const FUNCTIONS = new Set([
  "sin",
  "cos",
  "tan",
  "asin",
  "acos",
  "atan",
  "sqrt",
  "log",
  "ln",
  "abs",
  "exp",
  "fact",
]);

function factorial(n: number): number {
  if (!Number.isInteger(n) || n < 0 || n > 170) {
    throw new Error("Faktorial hanya mendukung bilangan bulat 0 hingga 170.");
  }
  let acc = 1;
  for (let i = 2; i <= n; i += 1) acc *= i;
  return acc;
}

function tokenizeExpression(raw: string): Token[] {
  const expr = raw
    .replace(/\s+/g, "")
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/−/g, "-")
    .replace(/π/g, "pi");

  if (!expr) throw new Error("Ekspresi kosong.");

  const tokens: Token[] = [];
  let i = 0;

  while (i < expr.length) {
    const ch = expr[i];

    if (/[0-9.]/.test(ch)) {
      let numStr = "";
      let dotCount = 0;
      while (i < expr.length && /[0-9.]/.test(expr[i])) {
        if (expr[i] === ".") dotCount += 1;
        if (dotCount > 1) throw new Error("Format angka desimal tidak valid.");
        numStr += expr[i];
        i += 1;
      }
      tokens.push({ type: "num", value: numStr });
      continue;
    }

    if (/[a-zA-Z]/.test(ch)) {
      let ident = "";
      while (i < expr.length && /[a-zA-Z0-9]/.test(expr[i])) {
        ident += expr[i];
        i += 1;
      }
      const lower = ident.toLowerCase();
      if (lower === "pi") {
        tokens.push({ type: "num", value: String(Math.PI) });
      } else if (lower === "e") {
        tokens.push({ type: "num", value: String(Math.E) });
      } else if (FUNCTIONS.has(lower)) {
        tokens.push({ type: "fn", value: lower });
      } else {
        throw new Error(`Fungsi atau simbol '${ident}' tidak dikenali.`);
      }
      continue;
    }

    if (ch === "(") {
      tokens.push({ type: "lparen", value: "(" });
      i += 1;
      continue;
    }
    if (ch === ")") {
      tokens.push({ type: "rparen", value: ")" });
      i += 1;
      continue;
    }
    if (ch === "!") {
      tokens.push({ type: "fn", value: "fact" });
      i += 1;
      continue;
    }
    if ("+-*/%^".includes(ch)) {
      const prev = tokens[tokens.length - 1];
      const isUnaryMinus =
        ch === "-" && (!prev || prev.type === "op" || prev.type === "lparen" || prev.type === "fn");
      tokens.push({ type: "op", value: isUnaryMinus ? "u-" : ch });
      i += 1;
      continue;
    }

    throw new Error(`Karakter '${ch}' tidak didukung.`);
  }

  return tokens;
}

export function evaluateExpression(
  expression: string,
  angleMode: AngleMode = "deg"
): number {
  const tokens = tokenizeExpression(expression);
  const output: Token[] = [];
  const ops: Token[] = [];

  for (const token of tokens) {
    if (token.type === "num") {
      output.push(token);
    } else if (token.type === "fn") {
      if (token.value === "fact" && output.length > 0 && ops[ops.length - 1]?.type !== "fn") {
        // Postfix factorial binds immediately when following a number or ')'
        output.push(token);
      } else {
        ops.push(token);
      }
    } else if (token.type === "op") {
      while (ops.length > 0) {
        const top = ops[ops.length - 1];
        if (top.type === "fn") {
          output.push(ops.pop()!);
          continue;
        }
        if (
          top.type === "op" &&
          ((RIGHT_ASSOC.has(token.value) && PRECEDENCE[token.value] < PRECEDENCE[top.value]) ||
            (!RIGHT_ASSOC.has(token.value) && PRECEDENCE[token.value] <= PRECEDENCE[top.value]))
        ) {
          output.push(ops.pop()!);
          continue;
        }
        break;
      }
      ops.push(token);
    } else if (token.type === "lparen") {
      ops.push(token);
    } else if (token.type === "rparen") {
      while (ops.length > 0 && ops[ops.length - 1].type !== "lparen") {
        output.push(ops.pop()!);
      }
      if (ops.length === 0 || ops[ops.length - 1].type !== "lparen") {
        throw new Error("Tanda kurung tidak seimbang.");
      }
      ops.pop();
      if (ops.length > 0 && ops[ops.length - 1].type === "fn") {
        output.push(ops.pop()!);
      }
    }
  }

  while (ops.length > 0) {
    const top = ops.pop()!;
    if (top.type === "lparen") throw new Error("Tanda kurung tidak seimbang.");
    output.push(top);
  }

  const stack: number[] = [];
  const toRad = (v: number) => (angleMode === "deg" ? (v * Math.PI) / 180 : v);
  const fromRad = (v: number) => (angleMode === "deg" ? (v * 180) / Math.PI : v);

  for (const token of output) {
    if (token.type === "num") {
      const val = Number(token.value);
      if (!Number.isFinite(val)) throw new Error("Angka tidak valid.");
      stack.push(val);
    } else if (token.type === "op") {
      if (token.value === "u-") {
        if (stack.length < 1) throw new Error("Ekspresi tidak lengkap.");
        stack.push(-stack.pop()!);
      } else {
        if (stack.length < 2) throw new Error("Ekspresi tidak lengkap.");
        const b = stack.pop()!;
        const a = stack.pop()!;
        switch (token.value) {
          case "+":
            stack.push(a + b);
            break;
          case "-":
            stack.push(a - b);
            break;
          case "*":
            stack.push(a * b);
            break;
          case "/":
            if (b === 0) throw new Error("Tidak dapat membagi dengan nol.");
            stack.push(a / b);
            break;
          case "%":
            if (b === 0) throw new Error("Modulo nol tidak valid.");
            stack.push(a % b);
            break;
          case "^":
            stack.push(Math.pow(a, b));
            break;
        }
      }
    } else if (token.type === "fn") {
      if (stack.length < 1) throw new Error("Argumen fungsi kurang.");
      const x = stack.pop()!;
      switch (token.value) {
        case "sin":
          stack.push(Math.sin(toRad(x)));
          break;
        case "cos":
          stack.push(Math.cos(toRad(x)));
          break;
        case "tan":
          stack.push(Math.tan(toRad(x)));
          break;
        case "asin":
          stack.push(fromRad(Math.asin(x)));
          break;
        case "acos":
          stack.push(fromRad(Math.acos(x)));
          break;
        case "atan":
          stack.push(fromRad(Math.atan(x)));
          break;
        case "sqrt":
          if (x < 0) throw new Error("Akar kuadrat bilangan negatif tidak terdefinisi.");
          stack.push(Math.sqrt(x));
          break;
        case "log":
          if (x <= 0) throw new Error("Logaritma memerlukan nilai > 0.");
          stack.push(Math.log10(x));
          break;
        case "ln":
          if (x <= 0) throw new Error("Logaritma natural memerlukan nilai > 0.");
          stack.push(Math.log(x));
          break;
        case "abs":
          stack.push(Math.abs(x));
          break;
        case "exp":
          stack.push(Math.exp(x));
          break;
        case "fact":
          stack.push(factorial(x));
          break;
      }
    }
  }

  if (stack.length !== 1 || !Number.isFinite(stack[0])) {
    throw new Error("Hasil perhitungan tidak valid.");
  }
  return Number(stack[0].toPrecision(12));
}

export function formatCalcNumber(num: number): string {
  if (!Number.isFinite(num)) return "Error";
  return Number(num.toPrecision(12)).toString();
}

export function calculatePercentageSummary(
  baseValue: number,
  ratePercent: number,
  discountPercent: number,
  taxPercent: number
) {
  const percentAmount = baseValue * (ratePercent / 100);
  const discountAmount = baseValue * (discountPercent / 100);
  const afterDiscount = baseValue - discountAmount;
  const taxAmount = afterDiscount * (taxPercent / 100);
  const finalPrice = afterDiscount + taxAmount;
  return {
    percentAmount,
    discountAmount,
    afterDiscount,
    taxAmount,
    finalPrice,
  };
}

export function calculateDateDifference(startIso: string, endIso: string) {
  const start = new Date(`${startIso}T00:00:00`);
  const end = new Date(`${endIso}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error("Tanggal tidak valid.");
  }
  const diffDays = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  const absDays = Math.abs(diffDays);
  const low = start <= end ? start : end;
  let weekdays = 0;
  let weekends = 0;
  for (let i = 0; i < absDays; i += 1) {
    const d = new Date(low.getTime() + i * 86_400_000);
    const day = d.getDay();
    if (day === 0 || day === 6) weekends += 1;
    else weekdays += 1;
  }
  return {
    diffDays,
    absDays,
    weeks: Math.floor(absDays / 7),
    remainderDays: absDays % 7,
    weekdays,
    weekends,
  };
}

export function addDaysToDate(baseIso: string, deltaDays: number): string {
  const base = new Date(`${baseIso}T00:00:00`);
  if (Number.isNaN(base.getTime())) throw new Error("Tanggal dasar tidak valid.");
  base.setDate(base.getDate() + deltaDays);
  const y = base.getFullYear();
  const m = String(base.getMonth() + 1).padStart(2, "0");
  const d = String(base.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function calculateWorkDuration(
  startHHMM: string,
  endHHMM: string,
  breakMinutes: number = 0
) {
  const [sh, sm] = startHHMM.split(":").map(Number);
  const [eh, em] = endHHMM.split(":").map(Number);
  if (
    !Number.isFinite(sh) ||
    !Number.isFinite(sm) ||
    !Number.isFinite(eh) ||
    !Number.isFinite(em)
  ) {
    throw new Error("Format waktu tidak valid.");
  }
  let totalMinutes = eh * 60 + em - (sh * 60 + sm);
  if (totalMinutes < 0) totalMinutes += 24 * 60; // overnight shift support
  const netMinutes = Math.max(0, totalMinutes - Math.max(0, breakMinutes));
  return {
    grossMinutes: totalMinutes,
    netMinutes,
    hours: Math.floor(netMinutes / 60),
    minutes: netMinutes % 60,
    decimalHours: Number((netMinutes / 60).toFixed(2)),
  };
}

export const UNIT_DEFINITIONS: Record<
  UnitCategory,
  { label: string; units: { id: string; label: string; factorToBase: number }[] }
> = {
  length: {
    label: "Panjang",
    units: [
      { id: "mm", label: "Milimeter (mm)", factorToBase: 0.001 },
      { id: "cm", label: "Sentimeter (cm)", factorToBase: 0.01 },
      { id: "m", label: "Meter (m)", factorToBase: 1 },
      { id: "km", label: "Kilometer (km)", factorToBase: 1000 },
      { id: "inch", label: "Inci (in)", factorToBase: 0.0254 },
      { id: "ft", label: "Kaki (ft)", factorToBase: 0.3048 },
      { id: "yd", label: "Yard (yd)", factorToBase: 0.9144 },
      { id: "mile", label: "Mil (mi)", factorToBase: 1609.344 },
    ],
  },
  weight: {
    label: "Berat",
    units: [
      { id: "mg", label: "Miligram (mg)", factorToBase: 0.001 },
      { id: "g", label: "Gram (g)", factorToBase: 1 },
      { id: "kg", label: "Kilogram (kg)", factorToBase: 1000 },
      { id: "ton", label: "Ton Metrik (t)", factorToBase: 1_000_000 },
      { id: "oz", label: "Ounce (oz)", factorToBase: 28.349523125 },
      { id: "lb", label: "Pound (lb)", factorToBase: 453.59237 },
    ],
  },
  temperature: {
    label: "Suhu",
    units: [
      { id: "C", label: "Celsius (°C)", factorToBase: 1 },
      { id: "F", label: "Fahrenheit (°F)", factorToBase: 1 },
      { id: "K", label: "Kelvin (K)", factorToBase: 1 },
    ],
  },
  area: {
    label: "Luas",
    units: [
      { id: "mm2", label: "mm²", factorToBase: 1e-6 },
      { id: "cm2", label: "cm²", factorToBase: 1e-4 },
      { id: "m2", label: "m²", factorToBase: 1 },
      { id: "ha", label: "Hektar (ha)", factorToBase: 10_000 },
      { id: "km2", label: "km²", factorToBase: 1_000_000 },
      { id: "ft2", label: "ft²", factorToBase: 0.09290304 },
      { id: "acre", label: "Acre", factorToBase: 4046.8564224 },
    ],
  },
  volume: {
    label: "Volume",
    units: [
      { id: "ml", label: "Mililiter (mL)", factorToBase: 0.001 },
      { id: "l", label: "Liter (L)", factorToBase: 1 },
      { id: "m3", label: "Meter Kubik (m³)", factorToBase: 1000 },
      { id: "tsp", label: "Sendok Teh (tsp)", factorToBase: 0.00492892159375 },
      { id: "tbsp", label: "Sendok Makan (tbsp)", factorToBase: 0.01478676478125 },
      { id: "floz", label: "Fluid Ounce (fl oz)", factorToBase: 0.0295735295625 },
      { id: "gal", label: "Galon US (gal)", factorToBase: 3.785411784 },
    ],
  },
};

export function convertMeasurementUnit(
  category: UnitCategory,
  value: number,
  fromId: string,
  toId: string
): number {
  if (!Number.isFinite(value)) throw new Error("Nilai input tidak valid.");
  if (category === "temperature") {
    const celsius =
      fromId === "C"
        ? value
        : fromId === "F"
          ? ((value - 32) * 5) / 9
          : value - 273.15;
    if (toId === "C") return Number(celsius.toFixed(6));
    if (toId === "F") return Number(((celsius * 9) / 5 + 32).toFixed(6));
    return Number((celsius + 273.15).toFixed(6));
  }

  const list = UNIT_DEFINITIONS[category].units;
  const fromUnit = list.find((u) => u.id === fromId);
  const toUnit = list.find((u) => u.id === toId);
  if (!fromUnit || !toUnit) throw new Error("Satuan tidak valid.");

  const base = value * fromUnit.factorToBase;
  return Number((base / toUnit.factorToBase).toPrecision(10));
}

export type FileSizeUnit = "B" | "KB" | "MB" | "GB" | "TB";

export function convertFileSizeAll(
  value: number,
  unit: FileSizeUnit,
  standard: "binary" | "decimal" = "binary"
): Record<FileSizeUnit, number> {
  const step = standard === "binary" ? 1024 : 1000;
  const powers: Record<FileSizeUnit, number> = {
    B: 0,
    KB: 1,
    MB: 2,
    GB: 3,
    TB: 4,
  };
  const bytes = Math.max(0, value) * Math.pow(step, powers[unit]);
  return {
    B: bytes,
    KB: bytes / step,
    MB: bytes / Math.pow(step, 2),
    GB: bytes / Math.pow(step, 3),
    TB: bytes / Math.pow(step, 4),
  };
}

function gcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y !== 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

export function calculateImageRatioAndPrint(
  widthPx: number,
  heightPx: number,
  dpi: number
) {
  const safeW = Math.max(1, Math.round(widthPx));
  const safeH = Math.max(1, Math.round(heightPx));
  const safeDpi = Math.max(1, dpi);
  const divisor = gcd(safeW, safeH);
  const ratioW = safeW / divisor;
  const ratioH = safeH / divisor;
  const megapixels = Number(((safeW * safeH) / 1_000_000).toFixed(2));
  const widthInches = Number((safeW / safeDpi).toFixed(2));
  const heightInches = Number((safeH / safeDpi).toFixed(2));
  const widthCm = Number((widthInches * 2.54).toFixed(2));
  const heightCm = Number((heightInches * 2.54).toFixed(2));

  return {
    ratioLabel: `${ratioW}:${ratioH}`,
    decimalRatio: Number((safeW / safeH).toFixed(4)),
    megapixels,
    totalPixels: safeW * safeH,
    widthInches,
    heightInches,
    widthCm,
    heightCm,
  };
}

export function convertNumberBases(
  rawValue: string,
  fromBase: 2 | 8 | 10 | 16
): { decimal: string; binary: string; octal: string; hexadecimal: string } {
  const trimmed = rawValue.trim();
  if (!trimmed) throw new Error("Masukkan nilai angka.");

  const isNegative = trimmed.startsWith("-");
  const body = isNegative ? trimmed.slice(1) : trimmed;
  if (!body) throw new Error("Angka belum lengkap.");

  const validators: Record<2 | 8 | 10 | 16, RegExp> = {
    2: /^[01]+$/,
    8: /^[0-7]+$/,
    10: /^[0-9]+$/,
    16: /^[0-9a-fA-F]+$/,
  };
  if (!validators[fromBase].test(body)) {
    throw new Error(`Input '${trimmed}' tidak valid untuk basis ${fromBase}.`);
  }

  const prefixMap: Record<2 | 8 | 10 | 16, string> = {
    2: "0b",
    8: "0o",
    10: "",
    16: "0x",
  };
  const bigVal = BigInt(`${prefixMap[fromBase]}${body}`);
  const sign = isNegative && bigVal !== BigInt(0) ? "-" : "";
  return {
    decimal: `${sign}${bigVal.toString(10)}`,
    binary: `${sign}${bigVal.toString(2)}`,
    octal: `${sign}${bigVal.toString(8)}`,
    hexadecimal: `${sign}${bigVal.toString(16).toUpperCase()}`,
  };
}

