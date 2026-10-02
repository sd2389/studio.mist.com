import { describe, expect, it } from "vitest";
import { CAD_CUTS, roundCaratForDiameter, roundDiameterForCarat, stoneSizeForCarat } from "@/lib/jewelry-cad";
import { buildStoneModel } from "@/lib/jewelry-cad/stones/stone-model";
import { signedVolume } from "@/lib/jewelry-cad";

describe("carat → millimetres", () => {
  it("matches the round brilliant chart", () => {
    expect(roundDiameterForCarat(1)).toBeCloseTo(6.5, 2);
    expect(roundDiameterForCarat(0.5)).toBeCloseTo(5.2, 2);
    expect(roundDiameterForCarat(2)).toBeCloseTo(8.2, 2);
    expect(roundDiameterForCarat(0.01)).toBeCloseTo(1.3, 2);
  });

  it("matches standard fancy-shape sizes at 1 ct", () => {
    const oval = stoneSizeForCarat("oval", 1);
    expect(oval.length).toBeCloseTo(7.7, 1);
    expect(oval.width).toBeCloseTo(5.7, 1);
    expect(stoneSizeForCarat("emerald", 1)).toEqual({ length: 7, width: 5 });
    expect(stoneSizeForCarat("marquise", 1).length).toBeCloseTo(10, 5);
  });

  it("grows with the cube root of weight", () => {
    const one = stoneSizeForCarat("cushion", 1);
    const eight = stoneSizeForCarat("cushion", 8);
    expect(eight.length / one.length).toBeCloseTo(2, 6);
    for (const cut of CAD_CUTS) {
      let last = 0;
      for (const ct of [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 5]) {
        const size = stoneSizeForCarat(cut.id, ct).length;
        expect(size).toBeGreaterThan(last);
        last = size;
      }
    }
  });

  it("makes denser gems smaller for the same weight", () => {
    const diamond = stoneSizeForCarat("round", 1, 3.52).length;
    const sapphire = stoneSizeForCarat("round", 1, 4.0).length;
    const emerald = stoneSizeForCarat("round", 1, 2.72).length;
    expect(sapphire).toBeLessThan(diamond);
    expect(emerald).toBeGreaterThan(diamond);
  });

  it("weighs melee by inverting the chart", () => {
    expect(roundCaratForDiameter(6.5)).toBeCloseTo(1, 6);
    expect(roundCaratForDiameter(1.3)).toBeCloseTo(0.01, 6);
    expect(roundCaratForDiameter(roundDiameterForCarat(0.37))).toBeCloseTo(0.37, 6);
  });

  it("cuts stones whose own volume weighs close to the chart carat", () => {
    for (const cut of ["round", "oval", "emerald", "marquise", "heart"] as const) {
      const model = buildStoneModel(cut, 1, 3.52);
      const carat = signedVolume(model.geometry) * 3.52 * 0.005; // mm³ → g → ct
      expect(carat).toBeGreaterThan(0.85);
      expect(carat).toBeLessThan(1.15);
    }
  });
});
