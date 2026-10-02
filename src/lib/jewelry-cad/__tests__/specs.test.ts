import { describe, expect, it } from "vitest";
import { buildJewelry, CAD_METALS, getPreset, metalWeightGrams } from "@/lib/jewelry-cad";

describe("spec sheet", () => {
  it("weighs a 1 ct platinum solitaire like a real one (3–6 g)", () => {
    const specs = buildJewelry(getPreset("solitaire").design).specs;
    expect(specs.metalGrams).toBeGreaterThan(3);
    expect(specs.metalGrams).toBeLessThan(6);
    expect(specs.metalVolumeMm3).toBeGreaterThan(150);
  });

  it("estimates the weight in every alloy from the same volume", () => {
    const specs = buildJewelry(getPreset("band").design).specs;
    expect(specs.weightsByMetal.map((w) => w.metal)).toEqual(CAD_METALS.map((m) => m.id));
    const grams = Object.fromEntries(specs.weightsByMetal.map((w) => [w.metal, w.grams]));
    expect(grams.platinum! / grams["silver-sterling"]!).toBeCloseTo(20.7 / 10.36, 2);
    expect(grams["gold-18k-yellow"]).toBeCloseTo(metalWeightGrams(specs.metalVolumeMm3, "gold-18k-yellow"), 1);
    expect(grams["gold-24k"]!).toBeGreaterThan(grams["gold-18k-white"]!);
    expect(grams["gold-18k-white"]!).toBeGreaterThan(grams["gold-14k-yellow"]!);
  });

  it("splits a two-tone piece by slot", () => {
    const specs = buildJewelry(getPreset("pave").design).specs;
    const band = specs.metals.find((m) => m.slot === "Metal 1")!;
    const head = specs.metals.find((m) => m.slot === "Heads")!;
    expect(band.metal).toBe("gold-18k-yellow");
    expect(head.metal).toBe("gold-18k-white");
    expect(specs.metalGrams).toBeCloseTo(band.grams + head.grams, 1);
  });

  it("totals carats across the center and accents", () => {
    const specs = buildJewelry(getPreset("halo").design).specs;
    const [center, halo] = specs.stones;
    expect(center!.count).toBe(1);
    expect(center!.caratEach).toBe(1);
    expect(halo!.count).toBeGreaterThan(14);
    expect(specs.totalCarat).toBeCloseTo(1 + halo!.count * halo!.caratEach, 1);
    expect(specs.stoneCount).toBe(1 + halo!.count);
  });

  it("reports ring sizing and overall dimensions", () => {
    const specs = buildJewelry({ ...getPreset("solitaire").design, ringSize: 7 }).specs;
    expect(specs.ring!.innerDiameterMm).toBeCloseTo(17.32, 2);
    expect(specs.ring!.eu).toBe(54);
    expect(specs.sizeMm.x).toBeGreaterThan(17.32);
    expect(specs.sizeMm.y).toBeGreaterThan(specs.sizeMm.x);
  });
});
