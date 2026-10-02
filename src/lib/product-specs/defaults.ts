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

function normalizeStone(raw: unknown): StoneSpec | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id : crypto.randomUUID();
  return {
    id,
    gem_type: typeof row.gem_type === "string" ? row.gem_type : "",
    carat: typeof row.carat === "number" ? row.carat : null,
    clarity: (row.clarity as StoneSpec["clarity"]) ?? null,
    color: (row.color as StoneSpec["color"]) ?? null,
    fancy_color: typeof row.fancy_color === "string" ? row.fancy_color : "",
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
    metal_type: typeof data.metal_type === "string" ? data.metal_type : "",
    metal_purity: typeof data.metal_purity === "string" ? data.metal_purity : "",
    hallmark: typeof data.hallmark === "string" ? data.hallmark : "",
    finish: (data.finish as ProductSpecs["finish"]) ?? null,
    stone_count: typeof data.stone_count === "number" ? data.stone_count : null,
    total_carat: typeof data.total_carat === "number" ? data.total_carat : null,
    stones,
    setting_type: (data.setting_type as ProductSpecs["setting_type"]) ?? null,
    setting_type_other: typeof data.setting_type_other === "string" ? data.setting_type_other : "",
    head_style: (data.head_style as ProductSpecs["head_style"]) ?? null,
    head_style_other: typeof data.head_style_other === "string" ? data.head_style_other : "",
    shank_profile: (data.shank_profile as ProductSpecs["shank_profile"]) ?? null,
    shank_profile_other: typeof data.shank_profile_other === "string" ? data.shank_profile_other : "",
    ring_size: typeof data.ring_size === "string" ? data.ring_size : "",
    length_mm: typeof data.length_mm === "number" ? data.length_mm : null,
    width_mm: typeof data.width_mm === "number" ? data.width_mm : null,
    height_mm: typeof data.height_mm === "number" ? data.height_mm : null,
    metal_weight_g: typeof data.metal_weight_g === "number" ? data.metal_weight_g : null,
  };
}

export function productSpecsFromScene(scene: { product_specs?: unknown }): ProductSpecs {
  return normalizeProductSpecs(scene.product_specs);
}
