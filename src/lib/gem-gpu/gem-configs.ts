import type { MaterialPresetId } from "@/stores/material-preset-store";

export type GemPresetId = Extract<
  MaterialPresetId,
  | "diamond"
  | "moissanite"
  | "zircon"
  | "ruby"
  | "sapphire"
  | "spinel"
  | "tanzanite"
  | "garnet-tsavorite"
  | "garnet-almandine"
  | "peridot"
  | "topaz-blue"
  | "tourmaline"
  | "aquamarine"
  | "emerald"
  | "morganite"
  | "amethyst"
  | "citrine"
  | "opal"
  | "jade"
  | "pearl"
  | "diamond-canary"
  | "diamond-pink"
  | "diamond-blue"
  | "diamond-cognac"
  | "diamond-champagne"
  | "diamond-black"
>;

export type GemConfig = {
  ior: number;
  dispersionBase: number;
  dispersionAmplitude: number;
  roughness: number;
  thickness: number;
  envMapIntensity: number;
  baseColor: string;
  attenuationColor: string;
  attenuationDistance: number;
  /** 0..1 — 1 is fully transmissive (glassy). Pearl/opal/jade reduce this. */
  transmission?: number;
  /** Optional iridescence (pearl, opal). */
  iridescence?: number;
  /** Optional clearcoat (high-polish gems). */
  clearcoat?: number;
};

/**
 * IOR and dispersion values are physically accurate per standard gemology references.
 * Dispersion `base` is bumped above the natural value for diamond/moissanite to give visible
 * spectral fire on screen (Three.js dispersion is an approximation; small natural values barely show).
 */
export const GEM_CONFIGS: Record<GemPresetId, GemConfig> = {
  diamond: {
    ior: 2.417,
    dispersionBase: 0.08,
    dispersionAmplitude: 0.035,
    roughness: 0.02,
    thickness: 0.55,
    envMapIntensity: 1.6,
    baseColor: "#ffffff",
    attenuationColor: "#ffffff",
    attenuationDistance: 0.4,
    clearcoat: 0.6,
  },
  moissanite: {
    ior: 2.65,
    dispersionBase: 0.12,
    dispersionAmplitude: 0.05,
    roughness: 0.02,
    thickness: 0.55,
    envMapIntensity: 1.7,
    baseColor: "#ffffff",
    attenuationColor: "#fbfaf5",
    attenuationDistance: 0.4,
    clearcoat: 0.7,
  },
  zircon: {
    ior: 1.93,
    dispersionBase: 0.045,
    dispersionAmplitude: 0.015,
    roughness: 0.02,
    thickness: 0.55,
    envMapIntensity: 1.5,
    baseColor: "#ffffff",
    attenuationColor: "#f0f4ff",
    attenuationDistance: 0.45,
  },
  ruby: {
    ior: 1.77,
    dispersionBase: 0.025,
    dispersionAmplitude: 0.01,
    roughness: 0.02,
    thickness: 0.55,
    envMapIntensity: 1.5,
    baseColor: "#E0115F",
    attenuationColor: "#FF1F5A",
    attenuationDistance: 0.45,
    clearcoat: 0.4,
  },
  sapphire: {
    ior: 1.77,
    dispersionBase: 0.025,
    dispersionAmplitude: 0.01,
    roughness: 0.02,
    thickness: 0.55,
    envMapIntensity: 1.5,
    baseColor: "#0F52BA",
    attenuationColor: "#1E3FFF",
    attenuationDistance: 0.45,
    clearcoat: 0.4,
  },
  spinel: {
    ior: 1.72,
    dispersionBase: 0.026,
    dispersionAmplitude: 0.01,
    roughness: 0.02,
    thickness: 0.55,
    envMapIntensity: 1.45,
    baseColor: "#FF3F4E",
    attenuationColor: "#FF5A6A",
    attenuationDistance: 0.5,
    clearcoat: 0.35,
  },
  tanzanite: {
    ior: 1.7,
    dispersionBase: 0.034,
    dispersionAmplitude: 0.012,
    roughness: 0.02,
    thickness: 0.55,
    envMapIntensity: 1.45,
    baseColor: "#4B3FA7",
    attenuationColor: "#7958FF",
    attenuationDistance: 0.5,
    clearcoat: 0.3,
  },
  "garnet-tsavorite": {
    ior: 1.74,
    dispersionBase: 0.031,
    dispersionAmplitude: 0.012,
    roughness: 0.02,
    thickness: 0.55,
    envMapIntensity: 1.45,
    baseColor: "#1FAE5A",
    attenuationColor: "#2BD16A",
    attenuationDistance: 0.5,
    clearcoat: 0.3,
  },
  "garnet-almandine": {
    ior: 1.79,
    dispersionBase: 0.028,
    dispersionAmplitude: 0.01,
    roughness: 0.02,
    thickness: 0.55,
    envMapIntensity: 1.45,
    baseColor: "#7A1F2D",
    attenuationColor: "#A82037",
    attenuationDistance: 0.5,
    clearcoat: 0.3,
  },
  peridot: {
    ior: 1.66,
    dispersionBase: 0.024,
    dispersionAmplitude: 0.009,
    roughness: 0.02,
    thickness: 0.55,
    envMapIntensity: 1.4,
    baseColor: "#9FCC2D",
    attenuationColor: "#C6E663",
    attenuationDistance: 0.55,
  },
  "topaz-blue": {
    ior: 1.62,
    dispersionBase: 0.018,
    dispersionAmplitude: 0.008,
    roughness: 0.02,
    thickness: 0.55,
    envMapIntensity: 1.4,
    baseColor: "#88D8E0",
    attenuationColor: "#B6ECF0",
    attenuationDistance: 0.6,
  },
  tourmaline: {
    ior: 1.62,
    dispersionBase: 0.021,
    dispersionAmplitude: 0.009,
    roughness: 0.02,
    thickness: 0.55,
    envMapIntensity: 1.4,
    baseColor: "#FF49A0",
    attenuationColor: "#FF6FB7",
    attenuationDistance: 0.55,
  },
  aquamarine: {
    ior: 1.58,
    dispersionBase: 0.017,
    dispersionAmplitude: 0.007,
    roughness: 0.02,
    thickness: 0.55,
    envMapIntensity: 1.4,
    baseColor: "#7FE0E8",
    attenuationColor: "#BFEFF3",
    attenuationDistance: 0.65,
  },
  emerald: {
    ior: 1.58,
    dispersionBase: 0.02,
    dispersionAmplitude: 0.008,
    roughness: 0.03,
    thickness: 0.55,
    envMapIntensity: 1.35,
    baseColor: "#1ABC57",
    attenuationColor: "#7FDBA7",
    attenuationDistance: 0.5,
  },
  morganite: {
    ior: 1.58,
    dispersionBase: 0.017,
    dispersionAmplitude: 0.007,
    roughness: 0.02,
    thickness: 0.55,
    envMapIntensity: 1.4,
    baseColor: "#FFCBC4",
    attenuationColor: "#FFE4DD",
    attenuationDistance: 0.7,
  },
  amethyst: {
    ior: 1.55,
    dispersionBase: 0.016,
    dispersionAmplitude: 0.007,
    roughness: 0.02,
    thickness: 0.55,
    envMapIntensity: 1.4,
    baseColor: "#9966CC",
    attenuationColor: "#B388E6",
    attenuationDistance: 0.55,
  },
  citrine: {
    ior: 1.55,
    dispersionBase: 0.016,
    dispersionAmplitude: 0.007,
    roughness: 0.02,
    thickness: 0.55,
    envMapIntensity: 1.4,
    baseColor: "#E4C04A",
    attenuationColor: "#FFE08A",
    attenuationDistance: 0.6,
  },
  opal: {
    ior: 1.45,
    dispersionBase: 0.025,
    dispersionAmplitude: 0.015,
    roughness: 0.18,
    thickness: 0.55,
    envMapIntensity: 1.3,
    baseColor: "#F5F0E6",
    attenuationColor: "#FFE9D6",
    attenuationDistance: 0.4,
    transmission: 0.5,
    iridescence: 0.9,
  },
  jade: {
    ior: 1.66,
    dispersionBase: 0.014,
    dispersionAmplitude: 0.006,
    roughness: 0.18,
    thickness: 0.55,
    envMapIntensity: 1.1,
    baseColor: "#52B788",
    attenuationColor: "#74C69D",
    attenuationDistance: 0.35,
    transmission: 0.55,
  },
  pearl: {
    ior: 1.53,
    dispersionBase: 0.012,
    dispersionAmplitude: 0.005,
    roughness: 0.35,
    thickness: 0.4,
    envMapIntensity: 1.0,
    baseColor: "#F8F1E6",
    attenuationColor: "#FFFAF0",
    attenuationDistance: 0.3,
    transmission: 0.0,
    iridescence: 0.7,
  },
  "diamond-canary": {
    ior: 2.417,
    dispersionBase: 0.08,
    dispersionAmplitude: 0.035,
    roughness: 0.02,
    thickness: 0.55,
    envMapIntensity: 1.6,
    baseColor: "#FFE066",
    attenuationColor: "#FFDB4D",
    attenuationDistance: 0.45,
    clearcoat: 0.6,
  },
  "diamond-pink": {
    ior: 2.417,
    dispersionBase: 0.08,
    dispersionAmplitude: 0.035,
    roughness: 0.02,
    thickness: 0.55,
    envMapIntensity: 1.6,
    baseColor: "#FFB1C8",
    attenuationColor: "#FF80AB",
    attenuationDistance: 0.5,
    clearcoat: 0.6,
  },
  "diamond-blue": {
    ior: 2.417,
    dispersionBase: 0.08,
    dispersionAmplitude: 0.035,
    roughness: 0.02,
    thickness: 0.55,
    envMapIntensity: 1.6,
    baseColor: "#88BFE0",
    attenuationColor: "#4FA3D1",
    attenuationDistance: 0.5,
    clearcoat: 0.6,
  },
  "diamond-cognac": {
    ior: 2.417,
    dispersionBase: 0.08,
    dispersionAmplitude: 0.035,
    roughness: 0.02,
    thickness: 0.55,
    envMapIntensity: 1.55,
    baseColor: "#8E5A2B",
    attenuationColor: "#6B3F1E",
    attenuationDistance: 0.35,
    clearcoat: 0.6,
  },
  "diamond-champagne": {
    ior: 2.417,
    dispersionBase: 0.08,
    dispersionAmplitude: 0.035,
    roughness: 0.02,
    thickness: 0.55,
    envMapIntensity: 1.6,
    baseColor: "#E8C68A",
    attenuationColor: "#D9B26E",
    attenuationDistance: 0.5,
    clearcoat: 0.6,
  },
  "diamond-black": {
    ior: 2.417,
    dispersionBase: 0.05,
    dispersionAmplitude: 0.02,
    roughness: 0.06,
    thickness: 0.55,
    envMapIntensity: 1.4,
    baseColor: "#1a1a1a",
    attenuationColor: "#0a0a0a",
    attenuationDistance: 0.15,
    clearcoat: 0.7,
  },
};

export const GEM_PRESET_IDS = Object.keys(GEM_CONFIGS) as GemPresetId[];

export function isGemPresetId(id: MaterialPresetId): id is GemPresetId {
  return (GEM_PRESET_IDS as MaterialPresetId[]).includes(id);
}
