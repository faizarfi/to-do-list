import { describe, expect, it } from "vitest";

import {
  addDaysToDate,
  calculateDateDifference,
  calculateImageRatioAndPrint,
  calculatePercentageSummary,
  calculateWorkDuration,
  convertFileSizeAll,
  convertMeasurementUnit,
  convertNumberBases,
  evaluateExpression,
} from "@/lib/calculators";

describe("Calculator & Converter Engines (#37-#45)", () => {
  it("evaluates basic and scientific expressions accurately", () => {
    expect(evaluateExpression("(25 + 15) * 2 / 4")).toBe(20);
    expect(evaluateExpression("2 ^ 10")).toBe(1024);
    expect(evaluateExpression("sin(30) + cos(0)", "deg")).toBe(1.5);
    expect(evaluateExpression("sqrt(144) + log(1000)")).toBe(15);
    expect(evaluateExpression("5!")).toBe(120);
    expect(() => evaluateExpression("10 / 0")).toThrow();
  });

  it("calculates percentage, discount, and tax correctly", () => {
    const res = calculatePercentageSummary(200000, 15, 25, 11);
    expect(res.percentAmount).toBe(30000);
    expect(res.discountAmount).toBe(50000);
    expect(res.afterDiscount).toBe(150000);
    expect(res.taxAmount).toBe(16500);
    expect(res.finalPrice).toBe(166500);
  });

  it("calculates date differences, weekdays, and date addition", () => {
    const diff = calculateDateDifference("2026-11-02", "2026-11-09");
    expect(diff.absDays).toBe(7);
    expect(diff.weeks).toBe(1);
    expect(diff.weekdays).toBe(5);
    expect(diff.weekends).toBe(2);
    expect(addDaysToDate("2026-11-11", 10)).toBe("2026-11-21");
  });

  it("calculates time duration including break deduction and overnight shift", () => {
    const dayShift = calculateWorkDuration("08:30", "17:30", 60);
    expect(dayShift.hours).toBe(8);
    expect(dayShift.minutes).toBe(0);
    expect(dayShift.decimalHours).toBe(8);

    const nightShift = calculateWorkDuration("22:00", "06:00", 30);
    expect(nightShift.netMinutes).toBe(450);
    expect(nightShift.decimalHours).toBe(7.5);
  });

  it("converts units, file sizes, image ratios, and number bases accurately", () => {
    expect(convertMeasurementUnit("length", 2.5, "km", "m")).toBe(2500);
    expect(convertMeasurementUnit("temperature", 100, "C", "F")).toBe(212);
    expect(convertMeasurementUnit("weight", 1, "kg", "g")).toBe(1000);
    expect(convertMeasurementUnit("volume", 1, "floz", "ml")).toBeCloseTo(29.5735, 3);

    const fs = convertFileSizeAll(2, "GB", "binary");
    expect(fs.MB).toBe(2048);

    const ratio = calculateImageRatioAndPrint(1920, 1080, 300);
    expect(ratio.ratioLabel).toBe("16:9");
    expect(ratio.megapixels).toBe(2.07);

    const bases = convertNumberBases("FF", 16);
    expect(bases.decimal).toBe("255");
    expect(bases.binary).toBe("11111111");
    expect(bases.octal).toBe("377");
  });
});

