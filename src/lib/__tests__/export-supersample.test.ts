import { describe, expect, it } from "vitest";
import { jitterOffset, STILL_EXPORT_SAMPLES } from "@/lib/export-supersample";

describe("jitterOffset", () => {
  it("spreads distinct sub-pixel offsets inside the pixel", () => {
    const offsets = Array.from({ length: STILL_EXPORT_SAMPLES }, (_, i) => jitterOffset(i));
    for (const [dx, dy] of offsets) {
      expect(Math.abs(dx)).toBeLessThan(0.5);
      expect(Math.abs(dy)).toBeLessThan(0.5);
    }
    expect(new Set(offsets.map(([dx, dy]) => `${dx.toFixed(4)},${dy.toFixed(4)}`)).size).toBe(offsets.length);
  });
});
