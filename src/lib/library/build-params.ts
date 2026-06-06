import type { FinishId } from "@/stores/material-preset-store";
import type { GemItem, MetalItem } from "@/lib/catalog/types";

function darkenHex(hex: string, amount = 0.25): string {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) return hex;
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  const scale = 1 - amount;
  const toHex = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n * scale)))
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Build persisted PBR params for a custom metal from a picked color + nearest catalog row. */
export function buildCustomMetalParams(
  color: string,
  nearest: MetalItem,
  finish: FinishId = "polished",
): Record<string, unknown> {
  const base = nearest.params;
  return {
    kind: "metal",
    color,
    baseSlug: typeof base.baseSlug === "string" ? base.baseSlug : nearest.slug,
    finish,
    roughness: typeof base.roughness === "number" ? base.roughness : 0.15,
    envMapIntensity: typeof base.envMapIntensity === "number" ? base.envMapIntensity : 1.35,
    clearcoat: typeof base.clearcoat === "number" ? base.clearcoat : 0.4,
    clearcoatRoughness: typeof base.clearcoatRoughness === "number" ? base.clearcoatRoughness : 0.05,
    metalness: typeof base.metalness === "number" ? base.metalness : 1,
    category: nearest.category,
    family: nearest.family,
  };
}

/** Build persisted PBR params for a custom gem from a picked color + nearest catalog row. */
export function buildCustomGemParams(color: string, nearest: GemItem): Record<string, unknown> {
  const base = nearest.params;
  return {
    kind: "gem",
    baseColor: color,
    attenuationColor: darkenHex(color, 0.35),
    ior: typeof base.ior === "number" ? base.ior : 2.417,
    dispersionBase: typeof base.dispersionBase === "number" ? base.dispersionBase : 0.08,
    dispersionAmplitude:
      typeof base.dispersionAmplitude === "number" ? base.dispersionAmplitude : 0.035,
    roughness: typeof base.roughness === "number" ? base.roughness : 0.02,
    thickness: typeof base.thickness === "number" ? base.thickness : 0.55,
    envMapIntensity: typeof base.envMapIntensity === "number" ? base.envMapIntensity : 1.6,
    attenuationDistance:
      typeof base.attenuationDistance === "number" ? base.attenuationDistance : 0.45,
    clearcoat: typeof base.clearcoat === "number" ? base.clearcoat : 0.6,
    transmission: typeof base.transmission === "number" ? base.transmission : 1,
    gem_family: nearest.gem_family,
  };
}
