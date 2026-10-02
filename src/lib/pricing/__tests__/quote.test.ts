import { describe, expect, it } from "vitest";
import { buildJewelry, getPreset } from "@/lib/jewelry-cad";
import { DEFAULT_PRICING_RULES, metalCost, quoteDesign, stonePrice } from "@/lib/pricing/quote";

describe("price quote", () => {
  it("prices a solitaire as metal + centre stone + setting + bench, then marks it up", () => {
    const specs = buildJewelry(getPreset("solitaire").design).specs;
    const quote = quoteDesign(specs);
    expect(quote.lines.map((l) => l.label)).toEqual(expect.arrayContaining(["Metal", "Centre stone", "Stone setting", "Bench work"]));
    const sum = quote.lines.reduce((s, l) => s + l.amount, 0);
    expect(quote.cost).toBeCloseTo(sum, 1);
    expect(quote.retail).toBe(Math.round(quote.cost * DEFAULT_PRICING_RULES.markup));
  });

  it("charges more per carat for bigger stones, flat per carat for melee", () => {
    const perCarat = (carat: number) => stonePrice(DEFAULT_PRICING_RULES, "diamond", carat) / carat;
    expect(perCarat(2)).toBeGreaterThan(perCarat(1));
    expect(perCarat(1)).toBeGreaterThan(perCarat(0.5));
    expect(perCarat(0.01)).toBeCloseTo(perCarat(0.05), 6);
    expect(stonePrice(DEFAULT_PRICING_RULES, "diamond", 1)).toBeCloseTo(DEFAULT_PRICING_RULES.stonePerCarat.diamond, 6);
  });

  it("prices metal by its pure content: 18K costs more than 14K at the same weight", () => {
    expect(metalCost(DEFAULT_PRICING_RULES, "gold-18k-yellow", 5)).toBeGreaterThan(metalCost(DEFAULT_PRICING_RULES, "gold-14k-yellow", 5));
  });

  it("counts every halo stone as an accent setting", () => {
    const specs = buildJewelry(getPreset("halo").design).specs;
    const accents = specs.stones.filter((s) => s.count > 1).reduce((n, s) => n + s.count, 0);
    const setting = quoteDesign(specs).lines.find((l) => l.label === "Stone setting")!;
    expect(setting.amount).toBeCloseTo(DEFAULT_PRICING_RULES.settingCentre + accents * DEFAULT_PRICING_RULES.settingAccent, 2);
  });
});
