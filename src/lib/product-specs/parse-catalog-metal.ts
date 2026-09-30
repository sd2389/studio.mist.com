import type { FinishSpec } from "./types";

const FINISH_SUFFIXES: FinishSpec[] = ["polished", "brushed", "satin", "hammered", "sandblasted"];

const METAL_DISPLAY: Record<string, string> = {
  "gold-24k": "24K Yellow Gold",
  "gold-22k": "22K Yellow Gold",
  "gold-18k-yellow": "18K Yellow Gold",
  "gold-14k-yellow": "14K Yellow Gold",
  "gold-10k-yellow": "10K Yellow Gold",
  "gold-9k-yellow": "9K Yellow Gold",
  "gold-18k-white": "18K White Gold",
  "gold-14k-white": "14K White Gold",
  "gold-10k-white": "10K White Gold",
  "gold-18k-rose": "18K Rose Gold",
  "gold-14k-rose": "14K Rose Gold",
  platinum: "Platinum",
  "silver-sterling": "Sterling Silver",
  titanium: "Titanium",
  "rhodium-black": "Black Rhodium",
};

export function parseFinishFromSlug(slug: string): FinishSpec {
  for (const finish of FINISH_SUFFIXES) {
    if (slug.endsWith(`-${finish}`)) return finish;
  }
  return "polished";
}

export function parseBaseMetalSlug(slug: string): string {
  for (const finish of FINISH_SUFFIXES) {
    const suffix = `-${finish}`;
    if (slug.endsWith(suffix)) return slug.slice(0, -suffix.length);
  }
  return slug;
}

export function metalDisplayNameFromSlug(slug: string): string {
  const base = parseBaseMetalSlug(slug);
  return METAL_DISPLAY[base] ?? base.replace(/-/g, " ");
}
