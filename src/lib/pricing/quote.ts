import { getCadCut, getCadGem, getCadMetal, type CadGemId, type CadMetalId, type JewelrySpecs } from "@/lib/jewelry-cad";

/**
 * Jewelry price quotes from a design's specs: metal by weight, stones by carat, setting and
 * bench labour, then the jeweler's markup. Pure — the same numbers in the designer, the embed
 * and an exported quote.
 */

export type MetalFamily = "gold" | "platinum" | "silver";

export type PricingRules = {
  /** Spot price of the pure metal, per gram. */
  spotPerGram: Record<MetalFamily, number>;
  /** Extra metal for sprues, casting loss and finishing, as a fraction of the piece's weight. */
  castingLoss: number;
  /** Price per carat of a 1 ct stone, by gem. */
  stonePerCarat: Record<CadGemId, number>;
  /** Bench labour per piece: casting, cleanup, polish. */
  benchLabour: number;
  /** Setting labour per stone: one centre stone, and each accent or side stone. */
  settingCentre: number;
  settingAccent: number;
  /** Retail price = cost × markup. */
  markup: number;
};

const PURITY: Record<CadMetalId, { family: MetalFamily; purity: number }> = {
  "gold-24k": { family: "gold", purity: 0.999 },
  "gold-18k-yellow": { family: "gold", purity: 0.75 },
  "gold-18k-white": { family: "gold", purity: 0.75 },
  "gold-18k-rose": { family: "gold", purity: 0.75 },
  "gold-14k-yellow": { family: "gold", purity: 0.585 },
  "gold-14k-white": { family: "gold", purity: 0.585 },
  "gold-14k-rose": { family: "gold", purity: 0.585 },
  platinum: { family: "platinum", purity: 0.95 },
  "silver-sterling": { family: "silver", purity: 0.925 },
};

/**
 * Starting rates so a quote is never empty. Jewelers replace them with their own costs; they
 * are indicative only, not a market price feed.
 */
export const DEFAULT_PRICING_RULES: PricingRules = {
  spotPerGram: { gold: 105, platinum: 45, silver: 1.3 },
  castingLoss: 0.12,
  stonePerCarat: {
    diamond: 6000,
    "lab-diamond": 600,
    moissanite: 400,
    sapphire: 1500,
    "sapphire-pink": 900,
    ruby: 2000,
    emerald: 1500,
    morganite: 90,
    aquamarine: 250,
    tanzanite: 450,
    "diamond-canary": 9000,
    "diamond-pink": 25000,
    "diamond-fancy-blue": 30000,
    "diamond-fancy-green": 15000,
    "diamond-fancy-orange": 12000,
    "diamond-fancy-purple": 20000,
    "diamond-fancy-red": 60000,
    "diamond-champagne": 2500,
    "diamond-cognac": 2000,
    "diamond-fancy-grey": 3000,
    "diamond-black": 300,
  },
  benchLabour: 180,
  settingCentre: 75,
  settingAccent: 4,
  markup: 2.2,
};

/** Smallest stones (melee) price flat per carat; above that, price per carat grows with size. */
const MELEE_CARAT = 0.1;
const SIZE_EXPONENT = 0.45;

/** Price of one stone: the 1 ct rate, scaled by size (bigger stones cost more per carat). */
export function stonePrice(rules: PricingRules, gem: CadGemId, carat: number): number {
  const perCarat = rules.stonePerCarat[gem] ?? 0;
  const sizeFactor = Math.pow(Math.max(carat, MELEE_CARAT), SIZE_EXPONENT);
  return perCarat * carat * sizeFactor;
}

export function metalCost(rules: PricingRules, metal: CadMetalId, grams: number): number {
  const { family, purity } = PURITY[metal];
  return grams * (1 + rules.castingLoss) * purity * rules.spotPerGram[family];
}

export type QuoteLine = { label: string; detail: string; amount: number };

export type PriceQuote = {
  lines: QuoteLine[];
  /** Sum of the lines: metal, stones and labour at cost. */
  cost: number;
  /** cost × markup, rounded to a whole currency unit. */
  retail: number;
};

const round2 = (value: number) => Math.round(value * 100) / 100;

export function quoteDesign(specs: JewelrySpecs, rules: PricingRules = DEFAULT_PRICING_RULES): PriceQuote {
  // One line per alloy: a band and head cast in the same metal are one cost.
  const gramsByMetal = new Map<CadMetalId, number>();
  for (const m of specs.metals) if (m.grams > 0) gramsByMetal.set(m.metal, (gramsByMetal.get(m.metal) ?? 0) + m.grams);
  const lines: QuoteLine[] = [...gramsByMetal].map(([metal, grams]) => ({
    label: "Metal",
    detail: `${grams.toFixed(2)} g ${getCadMetal(metal).shortLabel}`,
    amount: round2(metalCost(rules, metal, grams)),
  }));

  // The largest single stone is the centre; every other stone is set as an accent.
  const centre = [...specs.stones].filter((s) => s.count === 1).sort((a, b) => b.caratEach - a.caratEach)[0];
  let accents = 0;
  for (const group of specs.stones) {
    const each = stonePrice(rules, group.gem, group.caratEach);
    lines.push({
      label: group === centre ? "Centre stone" : group.label,
      detail: `${group.count} × ${group.caratEach.toFixed(group.caratEach < MELEE_CARAT ? 3 : 2)} ct ${getCadCut(group.cut).label} ${getCadGem(group.gem).label.toLowerCase()}`,
      amount: round2(each * group.count),
    });
    if (group !== centre) accents += group.count;
  }

  const setting = (centre ? rules.settingCentre : 0) + accents * rules.settingAccent;
  if (setting > 0) lines.push({ label: "Stone setting", detail: `${centre ? 1 : 0} centre, ${accents} accent`, amount: round2(setting) });
  lines.push({ label: "Bench work", detail: "Casting, cleanup and polish", amount: round2(rules.benchLabour) });

  const cost = round2(lines.reduce((sum, line) => sum + line.amount, 0));
  return { lines, cost, retail: Math.round(cost * rules.markup) };
}
