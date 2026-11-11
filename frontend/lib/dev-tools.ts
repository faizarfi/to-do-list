// Pure client-side helpers for Developer, Text Diff, Word Frequency, & Security tools.

export function sortJsonKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonKeys);
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort((a, b) =>
      a.localeCompare(b)
    )) {
      sorted[k] = sortJsonKeys((value as Record<string, unknown>)[k]);
    }
    return sorted;
  }
  return value;
}

export function formatJsonInput(
  raw: string,
  mode: "pretty" | "minify" | "sort_keys"
): { output: string; keysCount: number } {
  const parsed = JSON.parse(raw);
  const target = mode === "sort_keys" ? sortJsonKeys(parsed) : parsed;
  const output =
    mode === "minify" ? JSON.stringify(target) : JSON.stringify(target, null, 2);
  const keysCount =
    typeof parsed === "object" && parsed !== null
      ? Object.keys(parsed as Record<string, unknown>).length
      : 0;
  return { output, keysCount };
}

function decodeBase64UrlSegment(seg: string): string {
  const b64 = seg.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const binary = atob(b64 + pad);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}

export function decodeJwtToken(token: string) {
  const parts = token.trim().split(".");
  if (parts.length !== 3) {
    throw new Error("Token JWT harus memiliki tepat 3 bagian (header.payload.signature).");
  }
  const header = JSON.parse(decodeBase64UrlSegment(parts[0])) as Record<string, unknown>;
  const payload = JSON.parse(decodeBase64UrlSegment(parts[1])) as Record<string, unknown>;
  const exp = typeof payload.exp === "number" ? payload.exp : null;
  const iat = typeof payload.iat === "number" ? payload.iat : null;
  const nowSec = Math.floor(Date.now() / 1000);
  const isExpired = exp !== null ? exp < nowSec : null;
  return {
    header,
    payload,
    signature: parts[2],
    issuedAtIso: iat ? new Date(iat * 1000).toISOString() : null,
    expiresAtIso: exp ? new Date(exp * 1000).toISOString() : null,
    isExpired,
  };
}

export function encodeUtf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function decodeBase64ToUtf8(b64: string): string {
  const cleaned = b64.replace(/^data:[^;]+;base64,/, "").replace(/\s+/g, "");
  const binary = atob(cleaned);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export function formatSqlQuery(raw: string): string {
  const normalized = raw.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  const keywords = [
    "SELECT",
    "FROM",
    "INNER JOIN",
    "LEFT JOIN",
    "RIGHT JOIN",
    "FULL JOIN",
    "JOIN",
    "WHERE",
    "GROUP BY",
    "HAVING",
    "ORDER BY",
    "LIMIT",
    "OFFSET",
    "INSERT INTO",
    "VALUES",
    "UPDATE",
    "SET",
    "DELETE FROM",
    "UNION ALL",
    "UNION",
    "ON",
    "AND",
    "OR",
  ];
  let formatted = normalized;
  for (const kw of keywords) {
    const regex = new RegExp(`\\b${kw}\\b`, "gi");
    const prefix = kw === "AND" || kw === "OR" || kw === "ON" ? "\n  " : "\n";
    formatted = formatted.replace(regex, `${prefix}${kw}`);
  }
  return formatted.replace(/^\n+/, "").trim();
}

export function formatHtmlXml(raw: string, indentSize: number = 2): string {
  const cleaned = raw.trim().replace(/>\s+</g, "><");
  if (!cleaned) return "";
  const tokens = cleaned.split(/(<[^>]+>)/g).filter((t) => t.trim().length > 0);
  const pad = " ".repeat(indentSize);
  let level = 0;
  const lines: string[] = [];

  for (const token of tokens) {
    const trimmed = token.trim();
    if (/^<\/[^>]+>$/.test(trimmed)) {
      level = Math.max(0, level - 1);
      lines.push(`${pad.repeat(level)}${trimmed}`);
    } else if (/^<[^?!][^>]*[^/]>$/.test(trimmed) && !/^<(meta|link|br|hr|img|input)\b/i.test(trimmed)) {
      lines.push(`${pad.repeat(level)}${trimmed}`);
      level += 1;
    } else {
      lines.push(`${pad.repeat(level)}${trimmed}`);
    }
  }
  return lines.join("\n");
}

export function escapeHtmlEntities(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function unescapeHtmlEntities(raw: string): string {
  return raw
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

export interface DiffLineResult {
  type: "same" | "added" | "removed";
  lineNumberLeft: number | null;
  lineNumberRight: number | null;
  text: string;
}

export function computeLineDiff(leftText: string, rightText: string): DiffLineResult[] {
  const a = leftText.split(/\r?\n/);
  const b = rightText.split(/\r?\n/);
  const m = a.length;
  const n = b.length;
  // Use LCS DP table capped cleanly for interactive responsiveness
  if (m * n > 250_000) {
    const maxLen = Math.max(m, n);
    const out: DiffLineResult[] = [];
    for (let i = 0; i < maxLen; i += 1) {
      if (i < m && i < n && a[i] === b[i]) {
        out.push({ type: "same", lineNumberLeft: i + 1, lineNumberRight: i + 1, text: a[i] });
      } else {
        if (i < m) out.push({ type: "removed", lineNumberLeft: i + 1, lineNumberRight: null, text: a[i] });
        if (i < n) out.push({ type: "added", lineNumberLeft: null, lineNumberRight: i + 1, text: b[i] });
      }
    }
    return out;
  }

  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i -= 1) {
    for (let j = n - 1; j >= 0; j -= 1) {
      dp[i][j] =
        a[i] === b[j] ? 1 + dp[i + 1][j + 1] : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const result: DiffLineResult[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      result.push({ type: "same", lineNumberLeft: i + 1, lineNumberRight: j + 1, text: a[i] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      result.push({ type: "removed", lineNumberLeft: i + 1, lineNumberRight: null, text: a[i] });
      i += 1;
    } else {
      result.push({ type: "added", lineNumberLeft: null, lineNumberRight: j + 1, text: b[j] });
      j += 1;
    }
  }
  while (i < m) {
    result.push({ type: "removed", lineNumberLeft: i + 1, lineNumberRight: null, text: a[i] });
    i += 1;
  }
  while (j < n) {
    result.push({ type: "added", lineNumberLeft: null, lineNumberRight: j + 1, text: b[j] });
    j += 1;
  }
  return result;
}

export function analyzeWordFrequency(text: string) {
  const words = text
    .toLowerCase()
    .match(/[a-z0-9\u00C0-\u024F']+/gi) ?? [];
  const totalWords = words.length;
  const counts = new Map<string, number>();
  for (const w of words) {
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  const uniqueWords = counts.size;
  const sentences = text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter(Boolean).length;
  const topWords = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 15)
    .map(([word, count]) => ({
      word,
      count,
      pct: totalWords > 0 ? Number(((count / totalWords) * 100).toFixed(1)) : 0,
    }));

  return {
    totalWords,
    uniqueWords,
    sentences,
    avgWordsPerSentence:
      sentences > 0 ? Number((totalWords / sentences).toFixed(1)) : totalWords,
    readingMinutes: Number((totalWords / 200).toFixed(1)),
    speakingMinutes: Number((totalWords / 130).toFixed(1)),
    topWords,
  };
}

export function maskSensitiveText(
  text: string,
  options: { maskEmails: boolean; maskPhones: boolean; maskNumbers: boolean }
): { output: string; maskedCount: number } {
  let out = text;
  let maskedCount = 0;

  if (options.maskEmails) {
    out = out.replace(
      /([a-zA-Z0-9._%+-])([a-zA-Z0-9._%+-]*)(@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,
      (_m, first: string, rest: string, domain: string) => {
        maskedCount += 1;
        return `${first}${"*".repeat(Math.max(3, rest.length))}${domain}`;
      }
    );
  }
  if (options.maskPhones) {
    out = out.replace(
      /(?:\+?62|0)[\s-]?\d{2,4}[\s-]?\d{3,4}[\s-]?\d{2,5}/g,
      (match) => {
        const digitsOnly = match.replace(/\D/g, "");
        if (digitsOnly.length < 9 || digitsOnly.length > 15) return match;
        maskedCount += 1;
        return `${match.slice(0, 4)}****${match.slice(-2)}`;
      }
    );
  }
  if (options.maskNumbers) {
    out = out.replace(/\b\d{10,19}\b/g, (match) => {
      maskedCount += 1;
      return `${match.slice(0, 3)}${"*".repeat(match.length - 6)}${match.slice(-3)}`;
    });
  }

  return { output: out, maskedCount };
}

export function generateSecurePassword(options: {
  length: number;
  upper: boolean;
  lower: boolean;
  digits: boolean;
  symbols: boolean;
}): string {
  const pools: string[] = [];
  if (options.upper) pools.push("ABCDEFGHJKLMNPQRSTUVWXYZ");
  if (options.lower) pools.push("abcdefghijkmnopqrstuvwxyz");
  if (options.digits) pools.push("23456789");
  if (options.symbols) pools.push("!@#$%^&*()-_=+[]{}");
  if (pools.length === 0) pools.push("abcdefghijklmnopqrstuvwxyz");

  const combined = pools.join("");
  const targetLen = Math.max(6, Math.min(128, options.length));
  const randomBytes = new Uint32Array(targetLen);
  crypto.getRandomValues(randomBytes);

  const chars: string[] = [];
  for (let i = 0; i < targetLen; i += 1) {
    if (i < pools.length) {
      const pool = pools[i];
      chars.push(pool[randomBytes[i] % pool.length]);
    } else {
      chars.push(combined[randomBytes[i] % combined.length]);
    }
  }
  // Fisher-Yates shuffle
  const shuffleBytes = new Uint32Array(targetLen);
  crypto.getRandomValues(shuffleBytes);
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = shuffleBytes[i] % (i + 1);
    const tmp = chars[i];
    chars[i] = chars[j];
    chars[j] = tmp;
  }
  return chars.join("");
}

export function evaluatePasswordStrength(password: string) {
  let charset = 0;
  if (/[a-z]/.test(password)) charset += 26;
  if (/[A-Z]/.test(password)) charset += 26;
  if (/[0-9]/.test(password)) charset += 10;
  if (/[^a-zA-Z0-9]/.test(password)) charset += 32;
  const entropyBits =
    password.length > 0 && charset > 0
      ? Math.round(password.length * Math.log2(charset))
      : 0;
  const label =
    entropyBits >= 80
      ? "Sangat Kuat"
      : entropyBits >= 55
        ? "Kuat"
        : entropyBits >= 35
          ? "Sedang"
          : "Lemah";
  return { entropyBits, label };
}

function parseCronField(field: string, min: number, max: number): Set<number> {
  const values = new Set<number>();
  for (const part of field.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) throw new Error(`Field cron kosong pada '${field}'.`);
    const [rangePart, stepPart] = trimmed.split("/");
    const step = stepPart ? Number(stepPart) : 1;
    if (!Number.isInteger(step) || step < 1) {
      throw new Error(`Langkah cron tidak valid: '${trimmed}'.`);
    }
    let start = min;
    let end = max;
    if (rangePart !== "*") {
      if (rangePart.includes("-")) {
        const [s, e] = rangePart.split("-").map(Number);
        if (!Number.isInteger(s) || !Number.isInteger(e) || s < min || e > max || s > e) {
          throw new Error(`Rentang cron di luar batas (${min}–${max}): '${trimmed}'.`);
        }
        start = s;
        end = e;
      } else {
        const single = Number(rangePart);
        if (!Number.isInteger(single) || single < min || single > max) {
          throw new Error(`Nilai cron di luar batas (${min}–${max}): '${trimmed}'.`);
        }
        start = single;
        end = stepPart ? max : single;
      }
    }
    for (let v = start; v <= end; v += step) {
      values.add(v);
    }
  }
  return values;
}

export function parseCronSchedule(expr: string, count: number = 5) {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error("Ekspresi cron standar harus memiliki tepat 5 bagian: menit jam tanggal bulan hari.");
  }
  const [minF, hourF, domF, monF, dowF] = parts;
  const mins = parseCronField(minF, 0, 59);
  const hours = parseCronField(hourF, 0, 23);
  const doms = parseCronField(domF, 1, 31);
  const mons = parseCronField(monF, 1, 12);
  const dows = parseCronField(dowF.replace(/7/g, "0"), 0, 6);

  const descParts: string[] = [];
  descParts.push(minF === "*" ? "Setiap menit" : `Pada menit ${minF}`);
  descParts.push(hourF === "*" ? "setiap jam" : `jam ${hourF}`);
  if (domF !== "*") descParts.push(`tanggal ${domF}`);
  if (monF !== "*") descParts.push(`bulan ${monF}`);
  if (dowF !== "*") descParts.push(`hari minggu ke-(${dowF})`);

  const upcoming: string[] = [];
  const cursor = new Date();
  cursor.setSeconds(0, 0);
  cursor.setMinutes(cursor.getMinutes() + 1);

  let scanned = 0;
  while (upcoming.length < count && scanned < 60 * 24 * 45) {
    scanned += 1;
    if (
      mins.has(cursor.getMinutes()) &&
      hours.has(cursor.getHours()) &&
      doms.has(cursor.getDate()) &&
      mons.has(cursor.getMonth() + 1) &&
      dows.has(cursor.getDay())
    ) {
      upcoming.push(
        cursor.toLocaleString("id-ID", {
          weekday: "short",
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      );
    }
    cursor.setMinutes(cursor.getMinutes() + 1);
  }

  return {
    description: descParts.join(", ") + ".",
    upcoming,
  };
}

