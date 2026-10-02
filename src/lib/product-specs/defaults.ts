import type { ProductSpecs, StoneSpec } from "./types";

export function createEmptyProductSpecs(): ProductSpecs {
  return {
    metal_type: "",
    metal_purity: "",
    hallmark: "",
    finish: null,
    stone_count: null,
    total_carat: null,
    stones: [],
    setting_type: null,
    setting_type_other: "",
    head_style: null,
    head_style_other: "",
    shank_profile: null,
    shank_profile_other: "",
    ring_size: "",
    length_mm: null,
    width_mm: null,
    height_mm: null,
    metal_weight_g: null,
  };
}

function stringOrEmpty(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function normalizeStone(raw: unknown): StoneSpec | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id : crypto.randomUUID();
  return {
    id,
    gem_type: stringOrEmpty(row.gem_type),
    carat: numberOrNull(row.carat),
    clarity: (row.clarity as StoneSpec["clarity"]) ?? null,
    color: (row.color as StoneSpec["color"]) ?? null,
    fancy_color: stringOrEmpty(row.fancy_color),
    cut: (row.cut as StoneSpec["cut"]) ?? null,
    quantity: typeof row.quantity === "number" && row.quantity >= 1 ? row.quantity : 1,
  };
}

export function normalizeProductSpecs(raw: unknown): ProductSpecs {
  const base = createEmptyProductSpecs();
  if (!raw || typeof raw !== "object") return base;
  const data = raw as Record<string, unknown>;
  const stones = Array.isArray(data.stones)
    ? data.stones.map(normalizeStone).filter((s): s is StoneSpec => s !== null)
    : [];

  return {
    ...base,
    metal_type: stringOrEmpty(data.metal_type),
    metal_purity: stringOrEmpty(data.metal_purity),
    hallmark: stringOrEmpty(data.hallmark),
    finish: (data.finish as ProductSpecs["finish"]) ?? null,
    stone_count: numberOrNull(data.stone_count),
    total_carat: numberOrNull(data.total_carat),
    stones,
    setting_type: (data.setting_type as ProductSpecs["setting_type"]) ?? null,
    setting_type_other: stringOrEmpty(data.setting_type_other),
    head_style: (data.head_style as ProductSpecs["head_style"]) ?? null,
    head_style_other: stringOrEmpty(data.head_style_other),
    shank_profile: (data.shank_profile as ProductSpecs["shank_profile"]) ?? null,
    shank_profile_other: stringOrEmpty(data.shank_profile_other),
    ring_size: stringOrEmpty(data.ring_size),
    length_mm: numberOrNull(data.length_mm),
    width_mm: numberOrNull(data.width_mm),
    height_mm: numberOrNull(data.height_mm),
    metal_weight_g: numberOrNull(data.metal_weight_g),
  };
}

export function productSpecsFromScene(scene: { product_specs?: unknown }): ProductSpecs {
  return normalizeProductSpecs(scene.product_specs);
}
