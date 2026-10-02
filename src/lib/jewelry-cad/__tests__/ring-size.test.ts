import { describe, expect, it } from "vitest";
import {
  HALF_RING_SIZES,
  RING_SIZE_TABLE,
  clampUsSize,
  formatUsSize,
  ringSizeRow,
  usSizeToInnerDiameterMm,
} from "@/lib/jewelry-cad";

describe("US ring sizes", () => {
  it("follows the ANSI scale: 11.63 mm + 0.8128 mm per size", () => {
    expect(usSizeToInnerDiameterMm(6)).toBeCloseTo(16.51, 2);
    expect(usSizeToInnerDiameterMm(3)).toBeCloseTo(14.07, 2);
    expect(usSizeToInnerDiameterMm(7)).toBeCloseTo(17.32, 2);
    expect(usSizeToInnerDiameterMm(13)).toBeCloseTo(22.2, 2);
  });

  it("tabulates US 3–13 in quarter sizes", () => {
    expect(RING_SIZE_TABLE).toHaveLength(41);
    expect(RING_SIZE_TABLE[0]!.us).toBe(3);
    expect(RING_SIZE_TABLE.at(-1)!.us).toBe(13);
    for (let i = 1; i < RING_SIZE_TABLE.length; i++) {
      expect(RING_SIZE_TABLE[i]!.us - RING_SIZE_TABLE[i - 1]!.us).toBeCloseTo(0.25, 9);
      expect(RING_SIZE_TABLE[i]!.diameterMm).toBeGreaterThan(RING_SIZE_TABLE[i - 1]!.diameterMm);
    }
  });

  it("derives circumference and the ISO/EU size from the diameter", () => {
    const six = ringSizeRow(6);
    expect(six.circumferenceMm).toBeCloseTo(Math.PI * 16.5068, 1);
    expect(six.eu).toBe(52);
    expect(ringSizeRow(9).eu).toBe(Math.round(Math.PI * usSizeToInnerDiameterMm(9)));
  });

  it("ships half sizes 3–13 in the size pack", () => {
    expect(HALF_RING_SIZES).toHaveLength(21);
    expect(HALF_RING_SIZES[0]).toBe(3);
    expect(HALF_RING_SIZES).toContain(6.5);
    expect(HALF_RING_SIZES.at(-1)).toBe(13);
  });

  it("snaps and clamps to the supported range", () => {
    expect(clampUsSize(6.1)).toBe(6);
    expect(clampUsSize(6.13)).toBe(6.25);
    expect(clampUsSize(1)).toBe(3);
    expect(clampUsSize(15)).toBe(13);
    expect(formatUsSize(6.75)).toBe("6¾");
  });
});
