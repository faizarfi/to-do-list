import { describe, expect, it } from "vitest";

import {
  calculateAgeAndTenure,
  calculateBandwidthAndTransfer,
  calculateBmiAndCalorie,
  calculateIndonesiaTax,
  calculateLoanSimulation,
  calculateProfitMargin,
  convertTypographyUnit,
} from "@/lib/business-calculators";
import {
  analyzeWordFrequency,
  computeLineDiff,
  decodeBase64ToUtf8,
  decodeJwtToken,
  encodeUtf8ToBase64,
  escapeHtmlEntities,
  evaluatePasswordStrength,
  formatHtmlXml,
  formatJsonInput,
  formatSqlQuery,
  generateSecurePassword,
  maskSensitiveText,
  parseCronSchedule,
  unescapeHtmlEntities,
} from "@/lib/dev-tools";

describe("Developer & Security Helpers (#77–#95)", () => {
  it("formats, minifies, and sorts JSON keys accurately", () => {
    const sorted = formatJsonInput('{"z":1,"a":{"d":4,"b":2}}', "sort_keys");
    expect(sorted.keysCount).toBe(2);
    expect(sorted.output.indexOf('"a"')).toBeLessThan(sorted.output.indexOf('"z"'));
    expect(sorted.output.indexOf('"b"')).toBeLessThan(sorted.output.indexOf('"d"'));

    const min = formatJsonInput('{ "hello": "world" }', "minify");
    expect(min.output).toBe('{"hello":"world"}');
  });

  it("decodes JWT headers, payload, and timestamps cleanly", () => {
    const token =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMiLCJuYW1lIjoiQnVkaSIsImlhdCI6MTcwMDAwMDAwMCwiZXhwIjoyMDAwMDAwMDAwfQ.sig";
    const decoded = decodeJwtToken(token);
    expect(decoded.header.alg).toBe("HS256");
    expect(decoded.payload.name).toBe("Budi");
    expect(decoded.isExpired).toBe(false);
    expect(() => decodeJwtToken("invalid.token")).toThrow();
  });

  it("encodes and decodes UTF-8 strings cleanly with Base64", () => {
    const text = "RuangKerja — Indonesia 2026 🚀";
    const encoded = encodeUtf8ToBase64(text);
    expect(decodeBase64ToUtf8(encoded)).toBe(text);
  });

  it("formats SQL, HTML/XML, and escapes HTML entities", () => {
    const sql = formatSqlQuery("select id, nama from users where aktif = 1 order by id");
    expect(sql).toContain("SELECT id, nama");
    expect(sql).toContain("\nFROM users");
    expect(sql).toContain("\nWHERE aktif = 1");

    const html = formatHtmlXml("<div><p>Halo</p></div>", 2);
    expect(html).toContain("  <p>");

    const escaped = escapeHtmlEntities(`<script>"x" & 'y'</script>`);
    expect(escaped).toBe("&lt;script&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/script&gt;");
    expect(unescapeHtmlEntities(escaped)).toBe(`<script>"x" & 'y'</script>`);
  });

  it("computes line diffs and analyzes word frequency", () => {
    const diff = computeLineDiff("baris A\nbaris B", "baris A\nbaris C\nbaris D");
    expect(diff.some((r) => r.type === "same" && r.text === "baris A")).toBe(true);
    expect(diff.some((r) => r.type === "removed" && r.text === "baris B")).toBe(true);
    expect(diff.some((r) => r.type === "added" && r.text === "baris C")).toBe(true);

    const freq = analyzeWordFrequency("Kerja cepat kerja cerdas. Hasil kerja nyata!");
    expect(freq.totalWords).toBe(7);
    expect(freq.sentences).toBe(2);
    expect(freq.topWords[0]).toMatchObject({ word: "kerja", count: 3 });
  });

  it("masks sensitive emails, phones, and long IDs and generates strong passwords", () => {
    const masked = maskSensitiveText(
      "Email: andi@contoh.id, Telp: 081234567890, NIK: 3201011234560001",
      { maskEmails: true, maskPhones: true, maskNumbers: true }
    );
    expect(masked.maskedCount).toBe(3);
    expect(masked.output).not.toContain("andi@contoh.id");
    expect(masked.output).not.toContain("081234567890");
    expect(masked.output).not.toContain("3201011234560001");

    const pw = generateSecurePassword({
      length: 20,
      upper: true,
      lower: true,
      digits: true,
      symbols: true,
    });
    expect(pw).toHaveLength(20);
    const strength = evaluatePasswordStrength(pw);
    expect(strength.entropyBits).toBeGreaterThanOrEqual(80);
  });

  it("parses standard 5-field cron schedules into descriptions and upcoming runs", () => {
    const cron = parseCronSchedule("*/15 9-17 * * 1-5", 5);
    expect(cron.description).toContain("menit */15");
    expect(cron.upcoming).toHaveLength(5);
    expect(() => parseCronSchedule("invalid cron")).toThrow();
  });
});

describe("Business & Extra Calculator Helpers (#67–#71, #96–#98)", () => {
  it("calculates exact age/tenure, bandwidth, typography, and BMI", () => {
    const age = calculateAgeAndTenure("2020-01-15", "2026-11-11");
    expect(age.years).toBe(6);
    expect(age.months).toBe(9);
    expect(age.totalDays).toBeGreaterThan(2400);

    const bw = calculateBandwidthAndTransfer(1, 80); // 1 GB = 1024 MB = 8192 Mb -> ~102.4s
    expect(bw.mbPerSec).toBe(10);
    expect(bw.estimatedSeconds).toBe(102);

    const typo = convertTypographyUnit(24, "px", 16);
    expect(typo.rem).toBe(1.5);
    expect(typo.percent).toBe(150);

    const bmi = calculateBmiAndCalorie({
      gender: "male",
      ageYears: 30,
      weightKg: 70,
      heightCm: 175,
      activityFactor: 1.55,
    });
    expect(bmi.bmi).toBe(22.9);
    expect(bmi.category).toBe("Ideal / Normal");
    expect(bmi.tdee).toBeGreaterThan(2200);
  });

  it("calculates profit margin, KPR effective vs flat loans, and Indonesia PPN/PPh", () => {
    const margin = calculateProfitMargin({
      costPrice: 50000,
      sellingPrice: 100000,
      otherFeePercent: 10,
      units: 10,
    });
    expect(margin.netRevenuePerUnit).toBe(90000);
    expect(margin.profitPerUnit).toBe(40000);
    expect(margin.totalProfit).toBe(400000);

    const effLoan = calculateLoanSimulation({
      principal: 120_000_000,
      annualRatePercent: 12,
      months: 12,
      mode: "effective",
    });
    expect(effLoan.schedule).toHaveLength(12);
    expect(effLoan.schedule[11].remainingBalance).toBe(0);
    expect(effLoan.totalPayment).toBeGreaterThan(120_000_000);

    const taxExcl = calculateIndonesiaTax({
      amount: 10_000_000,
      ppnRatePercent: 11,
      priceIncludesPpn: false,
      pphRatePercent: 2,
    });
    expect(taxExcl.dpp).toBe(10_000_000);
    expect(taxExcl.ppnAmount).toBe(1_100_000);
    expect(taxExcl.pphWithheld).toBe(200_000);
    expect(taxExcl.netReceived).toBe(10_900_000);

    const taxIncl = calculateIndonesiaTax({
      amount: 11_100_000,
      ppnRatePercent: 11,
      priceIncludesPpn: true,
      pphRatePercent: 0,
    });
    expect(taxIncl.dpp).toBe(10_000_000);
    expect(taxIncl.ppnAmount).toBe(1_100_000);
  });
});

